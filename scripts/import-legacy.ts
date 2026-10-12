/**
 * Import initial (une seule fois) : `podcast-catalog.json` exporté par l'application
 * → `entries/<langue>/<tranche>.json`.
 *
 * Usage : pnpm import-legacy <chemin/podcast-catalog.json> [--write-publishers]
 *
 * Les champs dérivés (`language`, `groupId`, `ageRange`) sont **supprimés** :
 * ils viennent du chemin des fichiers. Les compteurs servent de rapport de review.
 */
import fs from "node:fs";
import path from "node:path";
import { LIMITS, paths } from "./lib/config.ts";
import { writeJson } from "./lib/io.ts";
import { loadCategories, loadGroups, truncate } from "./lib/catalog.ts";
import { slugify } from "./lib/norm.ts";
import type { SourceCategory, SourceEntry } from "./lib/types.ts";

/** Éditeurs non informatifs récupérés de l'export Apple → on laisse le flux les compléter. */
const JUNK_PUBLISHERS = new Set(
  ["inconnu", "unknown", "shows", "show", "podcasts", "podcast", "feed", "n/a", "na", "-"].map(
    (s) => s.toLowerCase(),
  ),
);

interface LegacyEntry {
  name: string;
  publisher?: string;
  ageRange?: string;
  description?: string;
  rssUrl: string;
  category: string;
  websiteUrl?: string;
  language?: string;
  groupId?: string;
}

interface LegacyExport {
  catalog?: Array<{ id: string; podcasts: LegacyEntry[] }>;
  flatList?: LegacyEntry[];
}

function main(): void {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const writePublishers = args.includes("--write-publishers");
  if (!file) {
    console.error("usage: pnpm import-legacy <chemin/podcast-catalog.json> [--write-publishers]");
    process.exit(2);
  }

  const exported = JSON.parse(readFile(path.resolve(file))) as LegacyExport;
  const flat = exported.flatList ?? exported.catalog?.flatMap((g) => g.podcasts) ?? [];
  if (flat.length === 0) {
    console.error(`aucune entrée trouvée dans ${file}`);
    process.exit(1);
  }

  const groups = new Set(loadGroups().map((g) => g.id));
  const categories = new Set(loadCategories().map((c) => c.id));
  const byTarget = new Map<string, SourceEntry[]>();
  const warnings: string[] = [];
  const publishers = new Set<string>();
  let truncated = 0;
  let droppedPublisher = 0;
  let unknownCategory = 0;

  for (const legacy of flat) {
    const language = (legacy.language ?? "fr").trim().toLowerCase();
    const groupId = (legacy.groupId ?? "age-2-5").trim();
    if (!groups.has(groupId)) {
      warnings.push(`${legacy.name} : tranche « ${groupId} » inconnue → déplacée dans age-2-5`);
    }
    const targetGroup = groups.has(groupId) ? groupId : "age-2-5";

    let description = (legacy.description ?? "").replace(/\s+/g, " ").trim();
    if (description.length > LIMITS.description) {
      description = truncate(description);
      truncated++;
    }

    let publisher = (legacy.publisher ?? "").trim();
    if (!publisher || JUNK_PUBLISHERS.has(publisher.toLowerCase())) {
      publisher = "";
      droppedPublisher++;
    } else {
      publishers.add(publisher);
    }

    const category = legacy.category.trim() as SourceCategory;
    if (!categories.has(category)) {
      unknownCategory++;
      console.warn(
        `  ⚠️ catégorie inconnue « ${legacy.category} » pour ${legacy.name} → « histoire »`,
      );
    }

    const entry: SourceEntry = {
      name: legacy.name.trim(),
      ...(publisher ? { publisher } : {}),
      category: categories.has(category) ? category : "histoire",
      rssUrl: legacy.rssUrl.trim(),
      ...(description ? { description } : {}),
      ...(legacy.websiteUrl?.trim() ? { websiteUrl: legacy.websiteUrl.trim() } : {}),
    };

    const key = `${language}/${targetGroup}`;
    if (!byTarget.has(key)) byTarget.set(key, []);
    byTarget.get(key)!.push(entry);
  }

  let files = 0;
  let written = 0;
  for (const [key, list] of [...byTarget.entries()].sort()) {
    list.sort((a, b) => slugify(a.name).localeCompare(slugify(b.name)));
    writeJson(path.join(paths.entries, `${key}.json`), list);
    files++;
    written += list.length;
    console.log(`  entries/${key}.json  →  ${list.length} entrées`);
  }

  if (writePublishers) {
    writeJson(
      path.join(paths.reference, "publishers.json"),
      [...publishers].sort((a, b) => a.localeCompare(b, "fr")),
    );
    console.log(`  reference/publishers.json → ${publishers.size} éditeurs connus`);
  }

  console.log(`\nImport : ${written} entrées dans ${files} fichiers`);
  console.log(`  · ${droppedPublisher} éditeurs non informatifs retirés (auto-complétés au build)`);
  console.log(`  · ${truncated} descriptions tronquées à ${LIMITS.description} caractères`);
  if (unknownCategory > 0)
    console.log(`  · ${unknownCategory} catégories inconnues → « histoire »`);
  for (const w of warnings) console.warn(`  ⚠️ ${w}`);
}

function readFile(file: string): string {
  return fs.readFileSync(file, "utf8");
}

main();
