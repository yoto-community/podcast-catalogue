/**
 * Auto-complétion d'une entrée depuis son flux RSS — la source gagne toujours :
 * seuls les champs **absents** de l'entrée sont proposés.
 *
 * Utilisé par :
 *   - `scripts/build.ts`          → complétion à la construction de `dist/` ;
 *   - `scripts/issue-to-entry.ts` → entrée complète dès l'ouverture de la PR ;
 *   - `scripts/enrich.ts`         → rattrapage manuel sur `entries/`.
 */
import { LIMITS, paths } from "./config.ts";
import { truncate } from "./catalog.ts";
import { fetchFeed, parseFeed, stripHtml } from "./rss.ts";
import { urlProblem } from "./url.ts";
import type { SourceEntry } from "./types.ts";

/** Champs que le flux peut venir renseigner quand la source les a laissés vides. */
export interface FeedFill {
  imageUrl?: string;
  publisher?: string;
  description?: string;
  websiteUrl?: string;
}

/**
 * Renvoie les champs manquants lus dans le flux. Une URL non https (certains flux
 * déclarent `<link>http://…`) est ignorée : le schéma n'accepte que https.
 */
export async function enrichFromFeed(
  entry: Pick<SourceEntry, "rssUrl" | "imageUrl" | "publisher" | "description" | "websiteUrl">,
  opts: { refresh?: boolean } = {},
): Promise<FeedFill> {
  const feed = await fetchFeed(entry.rssUrl, { cacheDir: paths.cache, refresh: opts.refresh });
  const parsed = parseFeed(feed.xml);
  const fill: FeedFill = {};

  if (!entry.imageUrl && parsed.imageUrl && !urlProblem(parsed.imageUrl)) {
    fill.imageUrl = parsed.imageUrl.trim();
  }
  if (!entry.publisher && parsed.author) {
    fill.publisher = truncate(parsed.author, LIMITS.publisher);
  }
  if (!entry.description && parsed.description) {
    const description = stripHtml(parsed.description).trim();
    if (description) fill.description = truncate(description);
  }
  if (!entry.websiteUrl && parsed.link && !urlProblem(parsed.link)) {
    fill.websiteUrl = parsed.link.trim();
  }
  return fill;
}
