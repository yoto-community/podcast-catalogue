import { getManifest, getEntries, getLanguages } from "../../../lib/catalog";
import type { APIContext } from "astro";

export async function GET({ params }: APIContext) {
  const lang = params.lang as string;
  const manifest = getManifest();
  const entries = getEntries().filter((e) => e.language === lang);

  if (entries.length === 0) {
    return new Response(JSON.stringify({ error: `Language "${lang}" not found` }), {
      status: 404,
      headers: apiHeaders(),
    });
  }

  // Reconstruct shard format similar to dist/<lang>.json or dist/<lang>/<group>.json
  const groups = [...new Set(entries.map((e) => e.groupId))];
  const shards = groups.map((groupId) => {
    const group = manifest.groups.find((g) => g.id === groupId);
    const groupEntries = entries.filter((e) => e.groupId === groupId);
    return {
      language: lang,
      group: groupId,
      groupLabel: group?.label,
      groupSlug: group?.slug,
      groupAgeRange: group?.ageRange,
      groupTranslations: group?.translations,
      count: groupEntries.length,
      entries: groupEntries,
    };
  });

  const response = {
    schemaVersion: manifest.schemaVersion,
    catalogVersion: manifest.catalogVersion,
    language: lang,
    count: entries.length,
    shards,
  };

  return new Response(JSON.stringify(response, null, 2), {
    headers: apiHeaders(3600, 86400),
  });
}

export async function OPTIONS() {
  return new Response(null, { headers: corsHeaders() });
}

export function getStaticPaths(): Array<{ params: Record<string, string> }> {
  return getLanguages().map((language) => ({
    params: { lang: language.code },
  }));
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
