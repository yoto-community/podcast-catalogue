/**
 * Construction des liens internes en tenant compte du `base` Astro
 * (GitHub Pages sert un projet sous `/nom-du-depot/`).
 */

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/+$/, "");

/** `/fr/age-7-10/` → `/<base>/fr/age-7-10/` (fonctionne aussi côté client). */
export function pageUrl(path: string): string {
  const clean = path.replace(/^\/+/, "");
  return BASE === "" ? `/${clean}` : `${BASE}/${clean}`;
}

/** URL absolue (Open Graph, JSON-LD) — `undefined` si le site n'est pas configuré. */
export function absoluteUrl(path: string, site?: URL | string): string | undefined {
  if (!site) return undefined;
  return new URL(pageUrl(path), site).href;
}

/** Slug stable pour éditeur : `Radio France` → `radio-france`. */
export function slugifyPublisher(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Slug stable pour auteur : `Myriam de Beaurepaire` → `myriam-de-beaurepaire`. */
export function slugifyAuthor(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
