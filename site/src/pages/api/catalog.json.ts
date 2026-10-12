import { getManifest } from "../../lib/catalog";
import type { APIContext } from "astro";

export async function GET({ request, site }: APIContext) {
  const manifest = getManifest();

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: apiHeaders(3600, 86400),
  });
}

export async function OPTIONS() {
  return new Response(null, { headers: corsHeaders() });
}

function apiHeaders(maxAge: number, staleWhileRevalidate: number) {
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
