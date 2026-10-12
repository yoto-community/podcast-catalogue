#!/usr/bin/env tsx
/**
 * Met à jour les entrées source avec publisher/author depuis les flux RSS.
 * Usage: pnpm tsx scripts/update-publisher-author.ts [--dry-run]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchFeed, parseFeed } from "./lib/rss.ts";
import { paths } from "./lib/config.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENTRIES_DIR = path.join(ROOT, "entries");

const DRY_RUN = process.argv.includes("--dry-run");

interface SourceEntry {
  name: string;
  category: string;
  rssUrl: string;
  description: string;
  publisher?: string;
  author?: string;
  imageUrl?: string;
  websiteUrl?: string;
  tags?: string[];
}

async function updateEntryFile(filePath: string): Promise<number> {
  const content = fs.readFileSync(filePath, "utf8");
  const entries: SourceEntry[] = JSON.parse(content);
  let updated = 0;

  for (const entry of entries) {
    if (!entry.rssUrl) continue;

    try {
      const feed = await fetchFeed(entry.rssUrl, { cacheDir: paths.cache, refresh: true });
      const parsed = parseFeed(feed.xml);

      // Publisher: owner → copyright → itunes:author
      const publisher = parsed.owner ?? parsed.copyright ?? parsed.author;
      // Author: itunes:author (channel)
      const author = parsed.podcastAuthor;

      let changed = false;
      if (publisher && entry.publisher !== publisher) {
        console.log(
          `  📝 ${entry.name}: publisher "${entry.publisher || "(vide)"}" → "${publisher}"`,
        );
        if (!DRY_RUN) entry.publisher = publisher;
        changed = true;
      }
      if (author && entry.author !== author) {
        console.log(`  📝 ${entry.name}: author "${entry.author || "(vide)"}" → "${author}"`);
        if (!DRY_RUN) entry.author = author;
        changed = true;
      }
      if (changed) updated++;
    } catch (err) {
      console.warn(`  ⚠️ ${entry.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!DRY_RUN && updated > 0) {
    fs.writeFileSync(filePath, JSON.stringify(entries, null, 2) + "\n");
  }
  return updated;
}

async function main(): Promise<void> {
  const files: string[] = [];
  for (const langDir of fs.readdirSync(ENTRIES_DIR)) {
    const langPath = path.join(ENTRIES_DIR, langDir);
    if (!fs.statSync(langPath).isDirectory()) continue;
    for (const file of fs.readdirSync(langPath)) {
      if (file.endsWith(".json")) {
        files.push(path.join(langPath, file));
      }
    }
  }

  console.log(`${DRY_RUN ? "[DRY-RUN] " : ""}Traitement de ${files.length} fichiers...\n`);

  let total = 0;
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    console.log(`📁 ${rel}`);
    const n = await updateEntryFile(file);
    if (n > 0) console.log(`  ✅ ${n} entrée(s) mise(s) à jour`);
    total += n;
  }

  console.log(`\n${DRY_RUN ? "[DRY-RUN] " : ""}Total: ${total} entrée(s) mise(s) à jour.`);
}

main().catch((err) => {
  console.error("❌ Erreur:", err);
  process.exit(1);
});
