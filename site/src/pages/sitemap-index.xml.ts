import {
  getEntries,
  getLanguages,
  getGroups,
  getTags,
  getPublishers,
  entryPath,
  groupPath,
} from "../lib/catalog";
import { pageUrl } from "../lib/url";
import type { APIContext } from "astro";

export async function GET({ site }: APIContext) {
  if (!site) {
    return new Response("Site URL not configured", { status: 500 });
  }

  const entries = getEntries();
  const languages = getLanguages();
  const groups = getGroups();
  const tags = getTags();
  const publishers = getPublishers();

  const urls: string[] = [];

  // Pages statiques
  urls.push(new URL(pageUrl("/"), site).href);
  urls.push(new URL(pageUrl("/health/"), site).href);
  urls.push(new URL(pageUrl("/favoris/"), site).href);
  urls.push(new URL(pageUrl("/developers/"), site).href);
  urls.push(new URL(pageUrl("/contribuer/"), site).href);
  urls.push(new URL(pageUrl("/api/catalog.json"), site).href);
  urls.push(new URL(pageUrl("/api/search.json"), site).href);
  urls.push(new URL(pageUrl("/api/health.json"), site).href);

  // Pages par langue
  for (const language of languages) {
    urls.push(new URL(pageUrl(`/${language.code}/`), site).href);
  }

  // Pages par langue + tranche
  for (const language of languages) {
    for (const group of groups) {
      const count = entries.filter(
        (e) => e.language === language.code && e.groupId === group.id,
      ).length;
      if (count > 0) {
        urls.push(new URL(pageUrl(groupPath(language.code, group)), site).href);
      }
    }
  }

  // Pages détail podcasts
  for (const entry of entries) {
    urls.push(new URL(pageUrl(entryPath(entry)), site).href);
  }

  // Pages thèmes
  urls.push(new URL(pageUrl("/themes/"), site).href);
  for (const tag of tags) {
    const count = entries.filter((e) => e.tags?.includes(tag.id)).length;
    if (count > 0) {
      urls.push(new URL(pageUrl(`/themes/${tag.id}/`), site).href);
    }
  }

  // Pages éditeurs
  urls.push(new URL(pageUrl("/editeurs/"), site).href);
  for (const publisher of publishers) {
    const count = entries.filter((e) => e.publisher === publisher.name).length;
    if (count > 0) {
      urls.push(new URL(pageUrl(`/editeurs/${publisher.slug}/`), site).href);
    }
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls
  .map(
    (url) => `  <url>
    <loc>${url}</loc>
    <changefreq>weekly</changefreq>
    <priority>${url === new URL(pageUrl("/"), site).href ? "1.0" : "0.8"}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
