import { defineConfig } from "astro/config";

/**
 * Site statique du catalogue — aucun framework client, aucun backend.
 *
 * Variables d'environnement (optionnelles, pour GitHub Pages) :
 *   SITE_URL  ex. `https://<user>.github.io/yoto-podcast-catalog`
 *             → origin utilisée pour les URL canoniques et Open Graph.
 *   BASE_PATH ex. `/yoto-podcast-catalog/`
 *             → préfixe des liens internes ; déduit de SITE_URL si absent.
 */
const site = process.env.SITE_URL || undefined;
const base = process.env.BASE_PATH || (site ? new URL(site).pathname : "/");

export default defineConfig({
  site,
  base,
  output: "static",
  trailingSlash: "always",
  build: {
    format: "directory",
  },
});
