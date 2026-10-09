/**
 * `dist/episodes/<slug>.json` — extraction des derniers épisodes de chaque podcast.
 *
 * Les navigateurs ne peuvent pas récupérer un flux RSS tiers (pas de CORS) et GitHub Pages
 * ne peut pas proxyer : les épisodes sont donc normalisés en CI (toutes les 6 h via
 * pages.yml + à chaque merge), puis le site les lit en JSON statique. La lecture audio
 * (`<audio src>`) ne nécessite aucun CORS.
 *
 * Politique de robustesse : un flux en erreur ne supprime pas ses épisodes déjà publiés
 * (on garde le dernier état connu) ; seuls les slugs retirés du catalogue sont purgés.
 *
 * Usage : pnpm build:episodes [--limit <n>] [--only <slug,slug>] [--refresh] [--no-network]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EPISODES_PER_PODCAST, LIMITS, SCHEMA_VERSION, USER_AGENT, paths } from "./lib/config.ts";
import { loadEntries, truncate } from "./lib/catalog.ts";
import { fetchFeed, parseFeed, stripHtml } from "./lib/rss.ts";
import { mapConcurrent } from "./lib/concurrent.ts";
import { catalogVersion, gitInfo } from "./lib/version.ts";
import { writeJson } from "./lib/io.ts";
import type { DistEpisode, DistEpisodesFile, LoadedEntry, ParsedItem } from "./lib/types.ts";

const CONCURRENCY = 8;

interface Options {
  limit: number;
  only?: Set<string>;
  refresh: boolean;
  network: boolean;
}

function parseArgs(argv: string[]): Options {
  const onlyIndex = argv.indexOf("--only");
  const limitIndex = argv.indexOf("--limit");
  const only = onlyIndex >= 0 ? argv[onlyIndex + 1] : undefined;
  return {
    limit: limitIndex >= 0 ? Number(argv[limitIndex + 1]) : EPISODES_PER_PODCAST,
    only: only
      ? new Set(
          only
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        )
      : undefined,
    refresh: argv.includes("--refresh"),
    network: !argv.includes("--no-network"),
  };
}

function episodeId(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

function toDistEpisode(item: ParsedItem & { audioUrl: string }, fallbackKey: string): DistEpisode {
  const audioUrl = item.audioUrl;
  return {
    id: episodeId(
      item.guid ?? item.link ?? `${fallbackKey}:${item.title ?? ""}:${item.pubDate ?? ""}`,
    ),
    title: (item.title ?? "(sans titre)").trim(),
    ...(item.pubDate ? { pubDate: item.pubDate } : {}),
    ...(item.durationSec !== undefined ? { durationSec: item.durationSec } : {}),
    ...(item.description
      ? { description: truncate(stripHtml(item.description), LIMITS.episodeDescription) }
      : {}),
    audioUrl,
    ...(item.audioType ? { audioType: item.audioType } : {}),
    ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
    ...(item.episodeNumber !== undefined ? { episodeNumber: item.episodeNumber } : {}),
    ...(item.seasonNumber !== undefined ? { seasonNumber: item.seasonNumber } : {}),
    ...(audioUrl.startsWith("http:") ? { insecure: true as const } : {}),
  };
}

async function processEntry(entry: LoadedEntry, opts: Options): Promise<"ok" | "kept" | "failed"> {
  const outFile = path.join(paths.dist, "episodes", `${entry.slug}.json`);
  try {
    const feed = await fetchFeed(entry.source.rssUrl, {
      cacheDir: paths.cache,
      refresh: opts.refresh,
      offline: !opts.network,
    });
    const parsed = parseFeed(feed.xml);
    const episodes = parsed.items
      .filter((item): item is ParsedItem & { audioUrl: string } => Boolean(item.audioUrl))
      .sort((a, b) => (b.pubDate ?? "").localeCompare(a.pubDate ?? ""))
      .slice(0, opts.limit)
      .map((item) => toDistEpisode(item, entry.slug));

    const data: DistEpisodesFile = {
      schemaVersion: SCHEMA_VERSION,
      catalogVersion: catalogVersion(),
      slug: entry.slug,
      fetchedAt: new Date().toISOString(),
      ...(parsed.title ? { feedTitle: parsed.title } : {}),
      count: episodes.length,
      episodes,
    };
    writeJson(outFile, data);
    return "ok";
  } catch (err) {
    // On conserve le dernier état connu plutôt que de vider la page du site.
    const kept = fs.existsSync(outFile);
    console.warn(
      `  ⚠️ ${entry.source.name} — ${err instanceof Error ? err.message : String(err)}${kept ? " (épisodes précédents conservés)" : ""}`,
    );
    return kept ? "kept" : "failed";
  }
}

function purgeOrphans(validSlugs: Set<string>): number {
  const dir = path.join(paths.dist, "episodes");
  if (!fs.existsSync(dir)) return 0;
  let purged = 0;
  for (const file of fs.readdirSync(dir)) {
    if (file === "index.json") continue;
    const slug = file.replace(/\.json$/, "");
    if (!validSlugs.has(slug)) {
      fs.unlinkSync(path.join(dir, file));
      purged++;
    }
  }
  return purged;
}

function writeIndex(version: string): number {
  const dir = path.join(paths.dist, "episodes");
  const items: Array<{ slug: string; count: number; fetchedAt: string }> = [];
  for (const file of fs.readdirSync(dir).sort()) {
    if (file === "index.json") continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as DistEpisodesFile;
      items.push({ slug: data.slug, count: data.count, fetchedAt: data.fetchedAt });
    } catch {
      console.warn(`  ⚠️ ${file} illisible — ignoré de l'index`);
    }
  }
  writeJson(path.join(dir, "index.json"), {
    schemaVersion: SCHEMA_VERSION,
    catalogVersion: version,
    updatedAt: new Date().toISOString(),
    count: items.length,
    items,
  });
  return items.length;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const { entries, errors } = loadEntries();
  if (errors.length > 0) {
    for (const e of errors) console.error(`❌ ${e}`);
    process.exit(1);
  }

  const targets = opts.only ? entries.filter((e) => opts.only?.has(e.slug)) : entries;
  if (opts.only && targets.length === 0) {
    console.error(`❌ --only : aucun slug ne correspond (${[...opts.only].join(", ")})`);
    process.exit(1);
  }

  fs.mkdirSync(path.join(paths.dist, "episodes"), { recursive: true });
  console.log(`🎧 extraction des épisodes — ${targets.length} podcast(s)`);

  const results = await mapConcurrent(targets, CONCURRENCY, (entry) => processEntry(entry, opts));
  const ok = results.filter((r) => r === "ok").length;
  const kept = results.filter((r) => r === "kept").length;
  const failed = results.filter((r) => r === "failed").length;
  const purged = purgeOrphans(new Set(entries.map((e) => e.slug)));
  const version = catalogVersion(gitInfo());
  const indexed = writeIndex(version);

  console.log(`\n${version} · ${indexed} fichier(s) d'épisodes dans dist/episodes/`);
  console.log(
    `  · ${ok} extraits · ${kept} conservés (erreur réseau) · ${failed} en échec${purged ? ` · ${purged} purgé(s)` : ""}`,
  );
  if (failed > 0) {
    console.warn(
      `  ⚠️ ${failed} flux sans épisodes publiés — « pnpm check-feeds » donnera le détail`,
    );
  }
}

main().catch((err: unknown) => {
  console.error("❌ build:episodes échoué :", err instanceof Error ? err.stack : err);
  process.exit(1);
});
