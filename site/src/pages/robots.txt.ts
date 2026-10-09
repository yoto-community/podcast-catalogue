import type { APIContext } from "astro";

export async function GET({ site }: APIContext) {
  if (!site) {
    return new Response("Site URL not configured", { status: 500 });
  }

  const sitemapUrl = new URL("sitemap-index.xml", site).href;

  const robots = `# robots.txt pour Annuaire de podcasts pour enfants
User-agent: *
Allow: /

Sitemap: ${sitemapUrl}
`;

  return new Response(robots, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}