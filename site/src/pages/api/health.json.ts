import { getEntries, getEpisodes } from "../../lib/catalog";
import type { APIContext } from "astro";

export async function GET({ request }: APIContext) {
  const entries = getEntries();
  const results = entries.map((entry) => {
    const episodes = getEpisodes(entry.slug);
    let status: "healthy" | "stale" | "unhealthy" | "unknown" = "unknown";
    let lastFetch = episodes?.fetchedAt ?? null;
    let episodeCount = episodes?.count ?? episodes?.episodes.length ?? 0;

    if (episodes) {
      const hoursSinceFetch = (Date.now() - new Date(episodes.fetchedAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceFetch < 24) status = "healthy";
      else if (hoursSinceFetch < 72) status = "stale";
      else status = "unhealthy";
    }

    return {
      slug: entry.slug,
      name: entry.name,
      language: entry.language,
      groupId: entry.groupId,
      ageRange: entry.ageRange,
      category: entry.category,
      publisher: entry.publisher,
      status,
      lastFetch,
      episodeCount,
    };
  });

  const stats = {
    total: results.length,
    healthy: results.filter((r) => r.status === "healthy").length,
    stale: results.filter((r) => r.status === "stale").length,
    unhealthy: results.filter((r) => r.status === "unhealthy").length,
    unknown: results.filter((r) => r.status === "unknown").length,
  };

  const response = {
    generatedAt: new Date().toISOString(),
    stats,
    podcasts: results,
  };

  return new Response(JSON.stringify(response, null, 2), {
    headers: apiHeaders(3600, 86400),
  });
}

export async function OPTIONS() {
  return new Response(null, { headers: corsHeaders() });
}

function apiHeaders(maxAge = 3600, staleWhileRevalidate = 86400) {
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