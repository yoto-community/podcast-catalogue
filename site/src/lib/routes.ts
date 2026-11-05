/**
 * Construction des chemins internes localisés.
 *
 * Tous les chemins sont renvoyés **sans** le `base` Astro : ils doivent être
 * passés à `pageUrl()` avant d'être rendus dans une page.
 */
import { routeSegments, type Locale } from "./i18n";
import { groupSlug, groupSlugOfId } from "./catalog";
import type { DistEntry, ManifestGroup } from "./types";

/** `/fr/` */
export function homePath(locale: Locale): string {
  return `/${locale}/`;
}

/** `/fr/age-2-5/` */
export function groupPath(locale: Locale, group: ManifestGroup): string {
  return `/${locale}/${groupSlug(group, locale)}/`;
}

/** `/fr/age-2-5/animalite/` — locale = langue de l'interface. */
export function entryPath(entry: DistEntry, locale: Locale): string {
  return `/${locale}/${groupSlugOfId(entry.groupId, locale)}/${entry.slug}/`;
}

export function searchPath(locale: Locale): string {
  return `/${locale}/${routeSegments[locale].search}/`;
}

export function themesPath(locale: Locale): string {
  return `/${locale}/${routeSegments[locale].themes}/`;
}

export function themePath(locale: Locale, tagId: string): string {
  return `/${locale}/${routeSegments[locale].themes}/${tagId}/`;
}

export function authorsPath(locale: Locale): string {
  return `/${locale}/${routeSegments[locale].authors}/`;
}

export function authorPath(locale: Locale, authorSlug: string): string {
  return `/${locale}/${routeSegments[locale].authors}/${authorSlug}/`;
}

export function publishersPath(locale: Locale): string {
  return `/${locale}/${routeSegments[locale].publishers}/`;
}

export function publisherPath(locale: Locale, publisherSlug: string): string {
  return `/${locale}/${routeSegments[locale].publishers}/${publisherSlug}/`;
}

export function newReleasesPath(locale: Locale): string {
  return `/${locale}/${routeSegments[locale].newReleases}/`;
}

export function favoritesPath(locale: Locale): string {
  return `/${locale}/${routeSegments[locale].favorites}/`;
}

/** Chemins équivalents FR/EN d'une même page (hreflang, sélecteur de langue). */
export function alternates(build: (locale: Locale) => string): { fr: string; en: string } {
  return { fr: build("fr"), en: build("en") };
}
