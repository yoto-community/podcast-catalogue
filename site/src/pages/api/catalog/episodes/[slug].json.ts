import { getEpisodes, episodesAvailable, getEntries } from "../../../../lib/catalog";
import type { APIContext } from "astro";

export async function GET({ params }: APIContext) {
  const slug = params.slug as string;

  if (!episodesAvailable()) {
    return new Response(
      JSON.stringify({
        error: "Episodes not yet indexed",
        message: "Run 'pnpm build:episodes' to generate episode data",
      }),
      { status: 503, headers: apiHeaders() },
    );
  }

  const data = getEpisodes(slug);

  if (!data) {
    return new Response(JSON.stringify({ error: `Podcast "${slug}" not found` }), {
      status: 404,
      headers: apiHeaders(),
    });
  }

  return new Response(JSON.stringify(data, null, 2), {
    headers: apiHeaders(3600, 86400),
  });
}

export async function OPTIONS() {
  return new Response(null, { headers: corsHeaders() });
}

export function getStaticPaths(): Array<{ params: Record<string, string> }> {
  return getEntries().map((entry) => ({
    params: { slug: entry.slug },
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
