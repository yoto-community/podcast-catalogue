import { getManifest, getEpisodes, episodesAvailable } from "../../../../lib/catalog";

export async function GET() {
  if (!episodesAvailable()) {
    return new Response(
      JSON.stringify({
        error: "Episodes not yet indexed",
        message: "Run 'pnpm build:episodes' to generate episode data",
      }),
      { status: 503, headers: apiHeaders() },
    );
  }

  const manifest = getManifest();
  const items: Array<{ slug: string; count: number; fetchedAt: string }> = [];

  for (const entry of manifest.shards) {
    const eps = getEpisodes(
      entry.path
        .replace(/\.json$/, "")
        .split("/")
        .pop()!,
    );
    if (eps) {
      items.push({ slug: eps.slug, count: eps.count, fetchedAt: eps.fetchedAt ?? "" });
    }
  }

  const response = {
    schemaVersion: manifest.schemaVersion,
    catalogVersion: manifest.catalogVersion,
    updatedAt: new Date().toISOString(),
    count: items.length,
    items,
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
