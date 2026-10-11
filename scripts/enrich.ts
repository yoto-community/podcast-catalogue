/**
 * Complète `entries/` depuis les flux RSS : `description`, `publisher`, `imageUrl`,
 * `websiteUrl` — uniquement les champs **absents** (la source gagne toujours).
 *
 * Sélection (obligatoire, pour éviter une réécriture accidentelle du dépôt entier) :
 *   --new            entrées absentes de `HEAD` (une contribution non commitée)
 *   --file <chemin>  un fichier d'entrée, ex. `entries/fr/tout-petits.json`
 *   --slug <slug>    une entrée, recherchée dans tout `entries/`
 *   --all            toutes les entrées incomplètes du dépôt
 *
 * Usage : pnpm enrich --new --write      (sans --write : dry-run)
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { paths } from "./lib/config.ts";
import { enrichFromFeed, type FeedFill } from "./lib/enrich.ts";
import { listJsonFiles, readJson, writeJson } from "./lib/io.ts";
import { mapConcurrent } from "./lib/concurrent.ts";
import { slugify } from "./lib/norm.ts";
import { urlProblem } from "./lib/url.ts";
import type { SourceEntry } from "./lib/types.ts";

const FILLABLE = ["description", "publisher", "imageUrl", "websiteUrl"] as const;
type FillableField = (typeof FILLABLE)[number];

interface Options {
  write: boolean;
  selection: "new" | "file" | "slug" | "all";
  /** `--file` : chemin relatif à la racine · `--slug` : slug ou nom, normalisé à l'usage. */
  target?: string;
}

function parseArgs(argv: string[]): Options | undefined {
  const valueOf = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    const value = argv[i + 1];
    return value && !value.startsWith("--") ? value : undefined;
  };
  const selection = (["new", "file", "slug", "all"] as const).find((s) => argv.includes(`--${s}`));
  if (!selection) return undefined;

  let target: string | undefined;
  if (selection === "file") {
    const raw = valueOf("--file");
    if (!raw) return undefined;
    const rel = path.isAbsolute(raw)
      ? path.relative(paths.root, path.resolve(raw))
      : path.normalize(raw);
    if (!fs.existsSync(path.join(paths.root, rel))) return undefined;
    target = rel;
  } else if (selection === "slug") {
    target = valueOf("--slug");
    if (!target) return undefined;
  }
  return { write: argv.includes("--write"), selection, target };
}

/** Slugs présents dans `HEAD` pour un fichier source (vide si le fichier est nouveau). */
function slugsAtHead(rel: string): Set<string> {
  let raw: string;
  try {
    raw = execSync(`git show HEAD:${rel}`, { cwd: paths.root, encoding: "utf8" });
  } catch {
    // fichier absent de HEAD (ou git indisponible) → tout est « nouveau »
    return new Set<string>();
  }
  const entries = JSON.parse(raw) as SourceEntry[];
  return new Set(entries.map((e) => slugify(e.name)));
}

function missingFields(entry: SourceEntry): FillableField[] {
  return FILLABLE.filter((field) => !entry[field]);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts) {
    console.error(
      "❌ sélection invalide — usage : pnpm enrich (--new | --file entries/<langue>/<tranche>.json | --slug <slug> | --all) [--write]",
    );
    process.exit(2);
  }

  const relFiles = listJsonFiles(paths.entries).map((f) => path.join("entries", f));
  const files =
    opts.selection === "file" ? relFiles.filter((rel) => rel === opts.target) : relFiles;
  if (files.length === 0) {
    console.error(`❌ aucun fichier d'entrée ne correspond à « ${opts.target ?? opts.selection} »`);
    process.exit(2);
  }

  type Candidate = { file: string; name: string; entry: SourceEntry };
  const candidates: Candidate[] = [];
  for (const file of files) {
    let entries: SourceEntry[];
    try {
      entries = readJson<SourceEntry[]>(path.join(paths.root, file));
    } catch (err) {
      console.error(
        `❌ ${file} : JSON invalide — ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }
    const head = opts.selection === "new" ? slugsAtHead(file) : undefined;
    const wantedSlug = opts.selection === "slug" ? slugify(opts.target as string) : undefined;
    for (const entry of entries) {
      const selected =
        opts.selection === "all" ||
        opts.selection === "file" ||
        (opts.selection === "new" && !head?.has(slugify(entry.name))) ||
        (opts.selection === "slug" && slugify(entry.name) === wantedSlug);
      if (!selected || missingFields(entry).length === 0) continue;
      // Anti-SSRF : on ne va jamais interroger un flux que la validation refuserait.
      const problem = urlProblem(entry.rssUrl);
      if (problem) {
        console.warn(`  ⚠️ ${entry.name} — flux ignoré : ${problem}`);
        continue;
      }
      candidates.push({ file, name: entry.name, entry });
    }
  }

  if (candidates.length === 0) {
    console.log("✅ rien à compléter pour cette sélection.");
    return;
  }

  // 1. Réseau (concurrençé), écriture aucune : on collecte les compléments.
  const results = await mapConcurrent(candidates, 8, async (candidate) => {
    try {
      const fill = await enrichFromFeed(candidate.entry);
      const applied = missingFields(candidate.entry)
        .map((field) => [field, fill[field]] as [FillableField, string | undefined])
        .filter((pair): pair is [FillableField, string] => Boolean(pair[1]));
      return { ...candidate, applied, unreachable: false };
    } catch (err) {
      console.warn(
        `  ⚠️ ${candidate.name} — flux injoignable : ${err instanceof Error ? err.message : String(err)}`,
      );
      return { ...candidate, applied: [] as Array<[FillableField, string]>, unreachable: true };
    }
  });

  // 2. Écriture : on relit le fichier au dernier moment (la phase réseau a pu être longue)
  //    et on n'y reporte que les champs calculés, par slug.
  const byFile = new Map<string, Array<[string, Array<[FillableField, string]>]>>();
  for (const result of results) {
    if (result.applied.length === 0) continue;
    const list = byFile.get(result.file) ?? [];
    list.push([slugify(result.name), result.applied]);
    byFile.set(result.file, list);
  }

  let filled = 0;
  for (const [file, fills] of byFile) {
    const abs = path.join(paths.root, file);
    const current = readJson<SourceEntry[]>(abs);
    const pending = new Map(fills);
    for (const entry of current) {
      const applied = pending.get(slugify(entry.name));
      if (!applied) continue;
      filled++;
      for (const [field, value] of applied) {
        console.log(`  ${opts.write ? "✏️ " : "🔍"} ${entry.name} · ${field} ← ${value}`);
        if (opts.write) Object.assign(entry, { [field]: value });
      }
    }
    if (opts.write) writeJson(abs, current);
  }

  const unreachable = results.filter((r) => r.unreachable).length;
  console.log(
    `\n✅ ${filled} entrée(s) ${opts.write ? "complétée(s)" : "complétable(s)"} · ${unreachable} flux injoignable(s)`,
  );
  if (!opts.write) console.log("→ relancez avec --write pour écrire.");
}

void main().catch((err: unknown) => {
  console.error("❌ enrich : ", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
