import { getEntries, getManifest, groupIdOf } from "../../lib/catalog";
import type { APIContext } from "astro";

export async function GET({ url }: APIContext) {
  const manifest = getManifest();
  let entries = getEntries();

  // Filtres
  const lang = url.searchParams.get("lang") ?? "";
  const cat = url.searchParams.get("cat") ?? "";
  const age = url.searchParams.get("age") ?? "";
  const publisher = url.searchParams.get("publisher") ?? "";

  if (lang) entries = entries.filter((e) => e.language === lang);
  if (cat) entries = entries.filter((e) => e.category === cat);
  if (age) entries = entries.filter((e) => e.groupId === (groupIdOf(age) ?? age));
  if (publisher) entries = entries.filter((e) => e.publisher === publisher);

  // Tri
  const sort = url.searchParams.get("sort") ?? "name";
  const order = url.searchParams.get("order") ?? "asc";

  const sortFn = (a: (typeof entries)[0], b: (typeof entries)[0]) => {
    let aVal: string | number = "";
    let bVal: string | number = "";
    switch (sort) {
      case "name":
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
        break;
      case "publisher":
        aVal = a.publisher.toLowerCase();
        bVal = b.publisher.toLowerCase();
        break;
      case "language":
        aVal = a.language;
        bVal = b.language;
        break;
      case "group":
        aVal = a.groupId;
        bVal = b.groupId;
        break;
      case "updated":
        aVal = a.rssUrl; // fallback, no updated field in DistEntry
        bVal = b.rssUrl;
        break;
      default:
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
    }
    if (aVal < bVal) return order === "asc" ? -1 : 1;
    if (aVal > bVal) return order === "asc" ? 1 : -1;
    return 0;
  };
  entries.sort(sortFn);

  // Pagination
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const perPage = Math.min(Math.max(1, Number(url.searchParams.get("per_page") ?? "50")), 200);
  const total = entries.length;
  const totalPages = Math.ceil(total / perPage);
  const offset = (page - 1) * perPage;
  const paginatedEntries = entries.slice(offset, offset + perPage);

  // Enrichissement avec métadonnées de groupe
  const results = paginatedEntries.map((entry) => {
    const group = manifest.groups.find((g) => g.id === entry.groupId);
    return {
      slug: entry.slug,
      name: entry.name,
      language: entry.language,
      groupId: entry.groupId,
      groupLabel: group?.label,
      groupSlug: group?.slug,
      groupAgeRange: group?.ageRange,
      groupTranslations: group?.translations,
      ageRange: entry.ageRange,
      category: entry.category,
      tags: entry.tags,
      publisher: entry.publisher,
      rssUrl: entry.rssUrl,
      imageUrl: entry.imageUrl,
      websiteUrl: entry.websiteUrl,
      description: entry.description,
    };
  });

  const response = {
    meta: {
      total,
      page,
      perPage,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
    links: {
      first: `/api/podcasts.json?page=1&per_page=${perPage}${buildQueryString({ lang, cat, age, publisher, sort, order })}`,
      prev:
        page > 1
          ? `/api/podcasts.json?page=${page - 1}&per_page=${perPage}${buildQueryString({ lang, cat, age, publisher, sort, order })}`
          : null,
      next:
        page < totalPages
          ? `/api/podcasts.json?page=${page + 1}&per_page=${perPage}${buildQueryString({ lang, cat, age, publisher, sort, order })}`
          : null,
      last: `/api/podcasts.json?page=${totalPages}&per_page=${perPage}${buildQueryString({ lang, cat, age, publisher, sort, order })}`,
    },
    catalogVersion: manifest.catalogVersion,
    schemaVersion: manifest.schemaVersion,
    results,
  };

  return new Response(JSON.stringify(response, null, 2), {
    headers: apiHeaders(300, 600),
  });
}

export async function OPTIONS() {
  return new Response(null, { headers: corsHeaders() });
}

function buildQueryString(params: Record<string, string | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value) parts.push(`${key}=${encodeURIComponent(value)}`);
  }
  return parts.length > 0 ? `&${parts.join("&")}` : "";
}

function apiHeaders(maxAge = 300, staleWhileRevalidate = 600) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": `public, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
    ...corsHeaders(),
  };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
  };
}
