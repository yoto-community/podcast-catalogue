/**
 * `entries/` → `dist/` (règle adaptative, auto-complétion depuis les flux).
 *
 * Découpage :
 *   - une tranche avec ≥ SHARD_MIN entrées → `dist/<langue>/<tranche>.json` ;
 *   - les tranches sous le seuil d'une langue sont regroupées dans `dist/<langue>.json`
 *     (une langue entière sous le seuil produit un seul fichier, ex. `en.json`).
 *
 * Auto-complétion (sauf `--no-network`) : `imageUrl`, `publisher`, `description`,
 * `websiteUrl` sont complétés depuis le flux quand le contributeur les a laissés vides.
 * La source gagne toujours : rien n'est écrasé.
 *
 * Usage : pnpm build [--no-network] [--allow-incomplete] [--refresh]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { paths, SCHEMA_VERSION, SHARD_MIN_ENTRIES, SHARD_MAX_BYTES } from "./lib/config.ts";
import { writeJson } from "./lib/io.ts";
import {
  groupById,
  loadCategories,
  loadEntries,
  loadGroups,
  loadLanguages,
  resolveGroupLabel,
} from "./lib/catalog.ts";
import { enrichFromFeed, type FeedFill } from "./lib/enrich.ts";
import { mapConcurrent } from "./lib/concurrent.ts";
import { catalogVersion, gitInfo } from "./lib/version.ts";
import type {
  DistEntry,
  Finding,
  GroupDef,
  Manifest,
  ManifestShard,
  SourceEntry,
} from "./lib/types.ts";

const CONCURRENCY = 8;

interface Options {
  network: boolean;
  allowIncomplete: boolean;
  refresh: boolean;
}

function parseArgs(argv: string[]): Options {
  return {
    network: !argv.includes("--no-network"),
    allowIncomplete: argv.includes("--allow-incomplete"),
    refresh: argv.includes("--refresh"),
  };
}

function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** Écrit un fichier dans dist/ et renvoie ses métriques. */
function emit(file: string, data: unknown): { bytes: number; sha256: string } {
  const json = `${JSON.stringify(data, null, 2)}\n`;
  const buffer = Buffer.from(json, "utf8");
  const full = path.join(paths.dist, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, buffer);
  return { bytes: buffer.byteLength, sha256: sha256(buffer) };
}

function cleanDist(): void {
  if (!fs.existsSync(paths.dist)) return;
  for (const name of fs.readdirSync(paths.dist)) {
    if (name === "episodes") continue; // produits par build:episodes, indépendants
    fs.rmSync(path.join(paths.dist, name), { recursive: true, force: true });
  }
}

async function enrich(
  entries: Awaited<ReturnType<typeof loadEntries>>["entries"],
  opts: Options,
): Promise<{ fills: Map<string, FeedFill>; findings: Finding[] }> {
  const fills = new Map<string, FeedFill>();
  const findings: Finding[] = [];
  if (!opts.network) return { fills, findings };

  const missing = entries.filter(
    (e) =>
      !e.source.imageUrl || !e.source.publisher || !e.source.description || !e.source.websiteUrl,
  );

  await mapConcurrent(missing, CONCURRENCY, async (entry) => {
    try {
      const fill = await enrichFromFeed(entry.source, { refresh: opts.refresh });
      fills.set(entry.slug, fill);
    } catch (err) {
      findings.push({
        severity: "warning",
        rule: "ENRICH",
        entry: entry.source.name,
        file: entry.file,
        message: `flux non complété : ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  return { fills, findings };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const groups = loadGroups();
  const categories = new Set(loadCategories().map((c) => c.id));
  const languages = loadLanguages();
  const { entries, errors } = loadEntries();

  if (errors.length > 0) {
    for (const e of errors) console.error(`❌ ${e}`);
    process.exit(1);
  }

  const findings: Finding[] = [];

  // Invariants bloquants (D4 + enums) — validate les refait de façon exhaustive.
  const seenSlug = new Map<string, string>();
  for (const entry of entries) {
    const dup = seenSlug.get(entry.slug);
    if (dup) {
      errors.push(`${entry.file} : slug « ${entry.slug} » déjà utilisé par « ${dup} » (D4)`);
    }
    seenSlug.set(entry.slug, entry.source.name);
    if (!categories.has(entry.source.category)) {
      errors.push(`${entry.file} : catégorie « ${entry.source.category} » inconnue (S2)`);
    }
    if (!groupById(groups, entry.groupId)) errors.push(`${entry.file} : tranche inconnue (S4)`);
    if (!languages.some((l) => l.code === entry.language))
      errors.push(`${entry.file} : langue inconnue (S4)`);
  }
  if (errors.length > 0) {
    for (const e of errors) console.error(`❌ ${e}`);
    process.exit(1);
  }

  const { fills, findings: enrichFindings } = await enrich(entries, opts);
  findings.push(...enrichFindings);

  // Assemblage des entrées publiées (imageUrl/description peuvent être absents
  // uniquement avec --allow-incomplete ; S8 les exige dans un dist publiable).
  type BuiltEntry = Omit<DistEntry, "imageUrl" | "description"> & {
    imageUrl?: string;
    description?: string;
  };
  const distEntries: BuiltEntry[] = entries.map((entry) => {
    const src: SourceEntry = entry.source;
    const fill = fills.get(entry.slug) ?? {};
    const group = groupById(groups, entry.groupId) as GroupDef;
    const labels = resolveGroupLabel(group, entry.language);

    const imageUrl = src.imageUrl ?? fill.imageUrl;
    const description = src.description ?? fill.description;
    const publisher = src.publisher ?? fill.publisher ?? "Indépendant";

    if (!src.publisher && !fill.publisher) {
      findings.push({
        severity: "warning",
        rule: "PUBLISHER",
        entry: src.name,
        file: entry.file,
        message: "aucun éditeur dans le flux → défaut « Indépendant »",
      });
    }
    for (const [field, value] of [
      ["imageUrl", imageUrl],
      ["description", description],
    ] as const) {
      if (!value) {
        findings.push({
          severity: opts.allowIncomplete ? "warning" : "error",
          rule: field === "imageUrl" ? "IMAGE" : "DESCRIPTION",
          entry: src.name,
          file: entry.file,
          message: `absent de la source et du flux — dist incomplet${opts.allowIncomplete ? " (toléré --allow-incomplete)" : ""}`,
        });
      }
    }

    return {
      slug: entry.slug,
      name: src.name,
      language: entry.language,
      groupId: entry.groupId,
      ageRange: labels.ageRange,
      category: src.category,
      tags: src.tags ?? [],
      publisher,
      rssUrl: src.rssUrl,
      ...(imageUrl ? { imageUrl } : {}),
      ...((src.websiteUrl ?? fill.websiteUrl)
        ? { websiteUrl: (src.websiteUrl ?? fill.websiteUrl) as string }
        : {}),
      description: description ?? "",
    };
  });

  const blocking = findings.filter((f) => f.severity === "error");
  if (blocking.length > 0) {
    for (const f of blocking) console.error(`❌ [${f.rule}] ${f.entry} (${f.file}) — ${f.message}`);
    console.error(`\n${blocking.length} erreur(s) — dist non publié.`);
    process.exit(1);
  }

  distEntries.sort((a, b) => a.slug.localeCompare(b.slug));

  // ---------------- découpage adaptatif ----------------
  cleanDist();
  const info = gitInfo();
  const version = catalogVersion(info);
  const updatedAt = new Date().toISOString();

  const byLanguage = new Map<string, BuiltEntry[]>();
  for (const entry of distEntries) {
    const list = byLanguage.get(entry.language) ?? [];
    list.push(entry);
    byLanguage.set(entry.language, list);
  }

  const shards: ManifestShard[] = [];
  for (const [language, list] of [...byLanguage.entries()].sort()) {
    const byGroup = new Map<string, BuiltEntry[]>();
    for (const entry of list) {
      const group = byGroup.get(entry.groupId) ?? [];
      group.push(entry);
      byGroup.set(entry.groupId, group);
    }

    const bigGroups = [...byGroup.entries()].filter(
      ([, items]) => items.length >= SHARD_MIN_ENTRIES,
    );
    const smallGroups = [...byGroup.entries()].filter(
      ([, items]) => items.length < SHARD_MIN_ENTRIES,
    );

    for (const [groupId, items] of bigGroups.sort()) {
      const group = groupById(groups, groupId) as GroupDef;
      const metrics = emit(`${language}/${groupId}.json`, {
        schemaVersion: SCHEMA_VERSION,
        catalogVersion: version,
        language,
        group: {
          id: group.id,
          order: group.order,
          label: group.label,
          ageRange: group.ageRange,
          ageMin: group.ageMin,
          ageMax: group.ageMax,
        },
        count: items.length,
        entries: items,
      });
      shards.push({
        path: `${language}/${groupId}.json`,
        language,
        group: groupId,
        count: items.length,
        ...metrics,
      });
    }

    if (smallGroups.length > 0) {
      const items = smallGroups
        .flatMap(([, entriesOfGroup]) => entriesOfGroup)
        .sort((a, b) => a.slug.localeCompare(b.slug));
      const metrics = emit(`${language}.json`, {
        schemaVersion: SCHEMA_VERSION,
        catalogVersion: version,
        language,
        group: null,
        count: items.length,
        entries: items,
      });
      shards.push({
        path: `${language}.json`,
        language,
        group: null,
        count: items.length,
        ...metrics,
      });
    }
  }

  const fullMetrics = emit("catalog.json", {
    schemaVersion: SCHEMA_VERSION,
    catalogVersion: version,
    updatedAt,
    count: distEntries.length,
    entries: distEntries,
  });

  const countBy = <K extends string>(
    items: BuiltEntry[],
    key: (e: BuiltEntry) => K,
  ): Record<K, number> => {
    const out = {} as Record<K, number>;
    for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
    return out;
  };

  const manifest: Manifest = {
    schemaVersion: SCHEMA_VERSION,
    catalogVersion: version,
    commit: info.commit,
    updatedAt,
    counts: {
      total: distEntries.length,
      byLanguage: countBy(distEntries, (e) => e.language),
      byGroup: countBy(distEntries, (e) => e.groupId),
      byCategory: countBy(distEntries, (e) => e.category),
    },
    groups: [...groups]
      .sort((a, b) => a.order - b.order)
      .map((g) => ({
        id: g.id,
        order: g.order,
        label: g.label,
        ageRange: g.ageRange,
        ageMin: g.ageMin,
        ageMax: g.ageMax,
        slug: g.slug,
        aliases: g.aliases ?? [],
        translations: g.translations,
      })),
    languages,
    shards: shards.sort((a, b) => a.path.localeCompare(b.path)),
    full: { path: "catalog.json", count: distEntries.length, ...fullMetrics },
  };
  emit("index.json", manifest);

  // Contrôle post-écriture : tailles et empreintes.
  const oversized = shards.filter((s) => s.bytes > SHARD_MAX_BYTES);
  for (const shard of oversized) {
    console.warn(
      `⚠️ ${shard.path} fait ${(shard.bytes / 1024).toFixed(0)} Ko (> ${SHARD_MAX_BYTES / 1024} Ko) — à re-fractionner`,
    );
  }

  const enriched = [...fills.values()].filter((f) => Object.keys(f).length > 0).length;
  console.log(`dist/ → ${version} (${info.commit})`);
  console.log(
    `  · ${distEntries.length} entrées · ${shards.length} éclat(s) · catalog.json ${(fullMetrics.bytes / 1024).toFixed(0)} Ko`,
  );
  for (const shard of shards)
    console.log(
      `  · ${shard.path} — ${shard.count} entrées · ${(shard.bytes / 1024).toFixed(1)} Ko`,
    );
  if (opts.network)
    console.log(
      `  · ${enriched} flux consultés pour auto-compléter (cache ${paths.cache.replace(paths.root, ".")})`,
    );
  const warnings = findings.filter((f) => f.severity === "warning");
  for (const w of warnings.slice(0, 20)) console.warn(`  ⚠️ [${w.rule}] ${w.entry} — ${w.message}`);
  if (warnings.length > 20) console.warn(`  ⚠️ … et ${warnings.length - 20} avertissements`);
}

main().catch((err: unknown) => {
  console.error("❌ build échoué :", err instanceof Error ? err.message : err);
  process.exit(1);
});
