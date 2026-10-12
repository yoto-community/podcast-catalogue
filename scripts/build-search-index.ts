/**
 * `dist/search-index.json` — index de recherche full-text sur les épisodes.
 *
 * Généré à la construction (après build:episodes), chargé côté client pour
 * recherche instantanée sans backend. ~2000 épisodes = ~200 Ko JSON gzip.
 *
 * Usage : pnpm build:search-index
 */
import fs from "node:fs";
import path from "node:path";
import { paths, SCHEMA_VERSION } from "./lib/config.ts";
import { loadEntries } from "./lib/catalog.ts";
import { catalogVersion, gitInfo } from "./lib/version.ts";
import { writeJson } from "./lib/io.ts";
import type { DistEpisode, DistEpisodesFile } from "./lib/types.ts";

interface SearchIndexEntry {
  /** ID unique de l'épisode (hash court) */
  id: string;
  /** Slug du podcast parent */
  podcastSlug: string;
  /** Nom du podcast */
  podcastName: string;
  /** Langue du podcast */
  language: string;
  /** Tranche d'âge */
  groupId: string;
  /** Catégorie */
  category: string;
  /** Titre de l'épisode */
  title: string;
  /** Description (tronquée, sans HTML) */
  description: string;
  /** Date de publication ISO */
  pubDate: string;
  /** Durée en secondes */
  durationSec?: number;
  /** URL audio (https seulement pour lecture) */
  audioUrl?: string;
  /** Numéro d'épisode */
  episodeNumber?: number;
  /** Numéro de saison */
  seasonNumber?: number;
  /** Image de l'épisode */
  imageUrl?: string;
}

interface SearchIndexFile {
  schemaVersion: number;
  catalogVersion: string;
  updatedAt: string;
  count: number;
  episodes: SearchIndexEntry[];
}

/** Normalise pour recherche : minuscules, sans accents, sans ponctuation. */
function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // accents
    .replace(/[^\w\s]/g, " ") // ponctuation → espace
    .replace(/\s+/g, " ") // espaces multiples
    .trim();
}

/** Extrait les mots-clés significatifs (longueur ≥ 3, pas stop-words fr/en basiques). */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "et", "ou", "de", "la", "le", "les", "un", "une", "des", "du", "au", "aux",
    "pour", "sur", "dans", "avec", "sans", "par", "est", "sont", "cette", "ce",
    "the", "and", "or", "of", "a", "an", "in", "on", "for", "to", "with", "by",
    "from", "as", "is", "are", "this", "that", "it", "be", "have", "has", "had",
    "but", "not", "you", "your", "we", "our", "they", "their,", "he", "she", "his", "her",
  ]);
  return normalizeForSearch(text)
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));
}

async function main(): Promise<void> {
  const { entries } = loadEntries();
  const episodesDir = path.join(paths.dist, "episodes");

  if (!fs.existsSync(episodesDir)) {
    console.error("❌ dist/episodes/ introuvable — lancez « pnpm build:episodes » d'abord");
    process.exit(1);
  }

  console.log(`🔍 Construction de l'index de recherche — ${entries.length} podcasts`);

  const allEpisodes: SearchIndexEntry[] = [];
  let processed = 0;
  let skipped = 0;

  for (const entry of entries) {
    const episodeFile = path.join(episodesDir, `${entry.slug}.json`);
    if (!fs.existsSync(episodeFile)) {
      skipped++;
      continue;
    }

    try {
      const data = JSON.parse(fs.readFileSync(episodeFile, "utf8")) as DistEpisodesFile;
      if (!data.episodes || !Array.isArray(data.episodes)) {
        skipped++;
        continue;
      }

      for (const ep of data.episodes) {
        // Ne garder que les épisodes avec audio HTTPS (jouables sur le site)
        if (!ep.audioUrl || !ep.audioUrl.startsWith("https://")) continue;

        allEpisodes.push({
          id: ep.id,
          podcastSlug: entry.slug,
          podcastName: entry.name,
          language: entry.language,
          groupId: entry.groupId,
          category: entry.category,
          title: ep.title ?? "",
          description: ep.description ?? "",
          pubDate: ep.pubDate ?? "",
          durationSec: ep.durationSec,
          audioUrl: ep.audioUrl,
          episodeNumber: ep.episodeNumber,
          seasonNumber: ep.seasonNumber,
          imageUrl: ep.imageUrl,
        });
      }
      processed++;
    } catch (err) {
      console.warn(`  ⚠️ ${entry.slug} : lecture impossible — ${err}`);
      skipped++;
    }
  }

  // Tri par date décroissante (plus récents en premier)
  allEpisodes.sort((a, b) => (b.pubDate ?? "").localeCompare(a.pubDate ?? ""));

  const version = catalogVersion(gitInfo());
  const index: SearchIndexFile = {
    schemaVersion: SCHEMA_VERSION,
    catalogVersion: version,
    updatedAt: new Date().toISOString(),
    count: allEpisodes.length,
    episodes: allEpisodes,
  };

  const outFile = path.join(paths.dist, "search-index.json");
  writeJson(outFile, index);

  const sizeKb = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(`\n✅ Index créé : ${outFile}`);
  console.log(`   · ${allEpisodes.length} épisodes indexés (${processed} podcasts, ${skipped} ignorés)`);
  console.log(`   · ${sizeKb} Ko (${(fs.statSync(outFile).size / 1024 / 1024).toFixed(2)} Mo)`);
}

main().catch((err) => {
  console.error("❌ build:search-index échoué :", err instanceof Error ? err.stack : err);
  process.exit(1);
});