import { defineConfig } from "astro/config";
import pwa from "@vite-pwa/astro";

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
  integrations: [
    pwa({
      manifest: {
        name: "Annuaire de podcasts pour enfants",
        short_name: "Podcasts Enfants",
        description:
          "Catalogue de podcasts validés, classés par âge et thème — prêts pour cartes MYO Yoto.",
        start_url: "/",
        display: "standalone",
        background_color: "#f6f6f4",
        theme_color: "#FF6B00",
        orientation: "portrait-primary",
        scope: "/",
        lang: "fr",
        icons: [
          { src: "/icons/icon-72.png", sizes: "72x72", type: "image/png", purpose: "any maskable" },
          { src: "/icons/icon-96.png", sizes: "96x96", type: "image/png", purpose: "any maskable" },
          {
            src: "/icons/icon-128.png",
            sizes: "128x128",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/icons/icon-144.png",
            sizes: "144x144",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/icons/icon-152.png",
            sizes: "152x152",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/icons/icon-384.png",
            sizes: "384x384",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
        categories: ["education", "entertainment", "kids"],
        screenshots: [],
        shortcuts: [
          {
            name: "Catalogue complet",
            short_name: "Catalogue",
            description: "Voir tous les podcasts par langue et âge",
            url: "/fr/",
            icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
          },
          {
            name: "Mes favoris",
            short_name: "Favoris",
            description: "Accéder à mes podcasts favoris",
            url: "/favoris/",
            icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,json,webmanifest,ico}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.json$/,
            handler: "NetworkFirst",
            options: {
              cacheName: "podcast-data",
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 3600 },
              networkTimeoutSeconds: 10,
            },
          },
          {
            urlPattern: /^https:\/\/.*\.(mp3|m4a|ogg)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "podcast-audio",
              expiration: { maxEntries: 50, maxAgeSeconds: 30 * 24 * 3600 },
              rangeRequests: true,
            },
          },
        ],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
      devOptions: { enabled: true },
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "placeholder.svg"],
    }),
  ],
});
