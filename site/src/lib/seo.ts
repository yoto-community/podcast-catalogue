import { absoluteUrl, pageUrl } from "./url";
import type { DistEntry } from "./types";

/** Construit une URL absolue pour les métadonnées (relative si `site` absent). */
function resolve(path: string, site?: URL | string): string {
  return absoluteUrl(path, site) ?? pageUrl(path);
}

/**
 * `ItemList` du catalogue (SEO) — une entrée par podcast, dans l'ordre affiché.
 */
export function itemListJsonLd(
  name: string,
  items: Array<{ name: string; path: string }>,
  site?: URL | string,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: resolve(item.path, site),
    })),
  };
}

/** `PodcastSeries` de la page détail d'un podcast. */
export function podcastSeriesJsonLd(
  entry: DistEntry,
  options: { path: string; episodeCount?: number; site?: URL | string },
): Record<string, unknown> {
  const url = resolve(options.path, options.site);
  const series: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "PodcastSeries",
    name: entry.name,
    description: entry.description,
    url,
    inLanguage: entry.language,
    webFeed: entry.rssUrl,
    publisher: {
      "@type": "Organization",
      name: entry.publisher,
    },
  };
  if (entry.imageUrl) series.image = entry.imageUrl;
  if (entry.websiteUrl) series.sameAs = entry.websiteUrl;
  if (options.episodeCount !== undefined) {
    series.numberOfEpisodes = options.episodeCount;
  }
  return series;
}

/** Sérialisation JSON-LD sûre pour une balise `<script>` (pas de fermeture anticipée). */
export function serializeJsonLd(
  value: Record<string, unknown> | Array<Record<string, unknown>>,
): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
