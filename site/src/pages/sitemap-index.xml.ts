import {
  entriesOfAuthor,
  entriesOfPublisher,
  entriesOfTag,
  getAuthors,
  getEntries,
  getGroups,
  getPublishers,
  getTags,
} from "../lib/catalog";
import { LOCALES, type Locale } from "../lib/i18n";
import {
  authorPath,
  authorsPath,
  entryPath,
  favoritesPath,
  groupPath as groupRoutePath,
  homePath,
  newReleasesPath,
  publisherPath,
  publishersPath,
  searchPath,
  themePath,
  themesPath,
} from "../lib/routes";
import { pageUrl } from "../lib/url";
import type { APIContext } from "astro";

interface SitemapPage {
  path: string;
  alternates?: Record<Locale, string>;
  priority: string;
}

export async function GET({ site }: APIContext) {
  if (!site) {
    return new Response("Site URL not configured", { status: 500 });
  }

  const entries = getEntries();
  const groups = getGroups();
  const tags = getTags();
  const authors = getAuthors();
  const publishers = getPublishers();

  const pages = new Map<string, SitemapPage>();

  function add(path: string, priority: string, alternates?: Record<Locale, string>): void {
    pages.set(path, { path, priority, alternates });
  }

  /** Ajoute la même page dans les deux interfaces, avec les alternates croisés. */
  function addLocalized(build: (locale: Locale) => string, priority: string): void {
    const paths = { fr: build("fr"), en: build("en") } as Record<Locale, string>;
    for (const locale of LOCALES) add(paths[locale], priority, paths);
  }

  // Accueil et pages de sections
  addLocalized(homePath, "1.0");
  addLocalized(searchPath, "0.7");
  addLocalized(themesPath, "0.7");
  addLocalized(authorsPath, "0.7");
  addLocalized(publishersPath, "0.7");
  addLocalized(newReleasesPath, "0.7");
  addLocalized(favoritesPath, "0.5");

  // Tranches d'âge (toutes langues de contenu confondues)
  for (const group of groups) {
    if (!entries.some((entry) => entry.groupId === group.id)) continue;
    addLocalized((locale) => groupRoutePath(locale, group), "0.9");
  }

  // Fiches podcast : une URL par interface
  for (const entry of entries) {
    addLocalized((locale) => entryPath(entry, locale), "0.8");
  }

  // Thèmes
  for (const tag of tags) {
    if (!entriesOfTag(tag.id).length) continue;
    addLocalized((locale) => themePath(locale, tag.id), "0.6");
  }

  // Auteurs
  for (const author of authors) {
    if (!entriesOfAuthor(author.slug).length) continue;
    addLocalized((locale) => authorPath(locale, author.slug), "0.6");
  }

  // Éditeurs
  for (const publisher of publishers) {
    if (!entriesOfPublisher(publisher.slug).length) continue;
    addLocalized((locale) => publisherPath(locale, publisher.slug), "0.6");
  }

  // Pages hors périmètre, en français uniquement
  add("/contribuer/", "0.4");
  add("/developers/", "0.4");
  add("/health/", "0.4");

  // Endpoints publics (non HTML)
  add("/api/catalog.json", "0.3");
  add("/api/search.json", "0.3");
  add("/api/health.json", "0.3");

  const urls = [...pages.values()].map((page) => {
    const loc = new URL(pageUrl(page.path), site).href;
    const alternates = page.alternates
      ? `\n${LOCALES.map(
          (locale) =>
            `    <xhtml:link rel="alternate" hreflang="${locale}" href="${
              new URL(pageUrl(page.alternates![locale]), site).href
            }"/>`,
        ).join("\n")}\n    <xhtml:link rel="alternate" hreflang="x-default" href="${
          new URL(pageUrl(page.alternates.fr), site).href
        }"/>`
      : "";
    return `  <url>
    <loc>${loc}</loc>${alternates}
    <changefreq>weekly</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
  });

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
