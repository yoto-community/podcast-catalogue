import { getEntries, getEpisodes } from "../../lib/catalog";
import type { APIContext } from "astro";

export async function GET({ url, request }: APIContext) {
  const q = url.searchParams.get("q")?.toLowerCase().trim() ?? "";
  const lang = url.searchParams.get("lang") ?? "";
  const cat = url.searchParams.get("cat") ?? "";
  const age = url.searchParams.get("age") ?? "";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
  const includeEpisodes = url.searchParams.get("episodes") === "true";

  if (!q && !lang && !cat && !age) {
    return new Response(
      JSON.stringify({ error: "At least one query parameter required (q, lang, cat, age)" }),
      {
        status: 400,
        headers: apiHeaders(),
      },
    );
  }

  let entries = getEntries();

  if (lang) entries = entries.filter((e) => e.language === lang);
  if (cat) entries = entries.filter((e) => e.category === cat);
  if (age) entries = entries.filter((e) => e.groupId === age);

  if (q) {
    const terms = q.split(/\s+/).filter((t) => t.length >= 2);
    entries = entries.filter((e) => {
      const haystack =
        `${e.name} ${e.publisher} ${e.description ?? ""} ${e.category}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }

  const results = entries.slice(0, limit).map((entry) => {
    const base = {
      slug: entry.slug,
      name: entry.name,
      language: entry.language,
      groupId: entry.groupId,
      ageRange: entry.ageRange,
      category: entry.category,
      tags: entry.tags,
      publisher: entry.publisher,
      rssUrl: entry.rssUrl,
      imageUrl: entry.imageUrl,
      websiteUrl: entry.websiteUrl,
      description: entry.description,
    };

    if (!includeEpisodes) return base;

    const eps = getEpisodes(entry.slug);
    return {
      ...base,
      latestEpisodes:
        eps?.episodes.slice(0, 5).map((ep) => ({
          id: ep.id,
          title: ep.title,
          pubDate: ep.pubDate,
          durationSec: ep.durationSec,
          audioUrl: ep.audioUrl,
          audioType: ep.audioType,
          imageUrl: ep.imageUrl,
          episodeNumber: ep.episodeNumber,
          seasonNumber: ep.seasonNumber,
        })) ?? [],
    };
  });

  const response = {
    query: { q, lang, cat, age, limit, includeEpisodes },
    count: results.length,
    results,
  };

  return new Response(JSON.stringify(response, null, 2), {
    headers: apiHeaders(300, 600),
  });
}

export async function OPTIONS() {
  return new Response(null, { headers: corsHeaders() });
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
