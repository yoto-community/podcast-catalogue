/**
 * Types des données lues dans `dist/` au moment du build (aucun fetch réseau).
 * Les champs correspondent aux artefacts produits par `scripts/build.ts`.
 */

export interface GroupTranslation {
  label: string;
  ageRange: string;
  /** Segment d'URL localisé (optionnel) — à défaut, `ManifestGroup.slug` sert toutes les langues. */
  slug?: string;
}

export interface ManifestGroup {
  id: string;
  order: number;
  label: string;
  ageRange: string;
  /** Premier âge couvert (inclus) — bornes inclusives, deux tranches peuvent partager une borne. */
  ageMin: number;
  /** Dernier âge couvert (inclus), `null` = ouvert vers le haut (11 ans et plus). */
  ageMax: number | null;
  /** Segment d'URL (neutre, identique en toutes langues) — voir `groupSlug()`. */
  slug: string;
  /** Anciens ids/segments : acceptés en query (`?age=`) et redirigés côté site. */
  aliases: string[];
  translations?: Record<string, GroupTranslation>;
}

export interface ManifestLanguage {
  code: string;
  label: string;
}

export interface ManifestShard {
  path: string;
  language: string;
  group: string | null;
  count: number;
  bytes: number;
  sha256: string;
}

export interface ManifestCounts {
  total: number;
  byLanguage: Record<string, number>;
  byGroup: Record<string, number>;
  byCategory: Record<string, number>;
}

export interface Manifest {
  schemaVersion: number;
  catalogVersion: string;
  commit: string;
  updatedAt: string;
  counts: ManifestCounts;
  groups: ManifestGroup[];
  languages: ManifestLanguage[];
  shards: ManifestShard[];
  full: { path: string; count: number; bytes: number; sha256: string };
}

/** Entrée publiée dans `dist/` (éclat ou bundle complet). */
export interface DistEntry {
  slug: string;
  name: string;
  language: string;
  groupId: string;
  ageRange: string;
  category: string;
  tags: string[];
  publisher: string;
  rssUrl: string;
  /** Peut manquer sur un build `--allow-incomplete` : le site affiche un placeholder. */
  imageUrl?: string;
  websiteUrl?: string;
  description: string;
}

export interface DistEpisode {
  id: string;
  title: string;
  pubDate?: string;
  durationSec?: number;
  description?: string;
  audioUrl: string;
  audioType?: string;
  imageUrl?: string;
  episodeNumber?: number;
  seasonNumber?: number;
  /** Présent si l'URL audio est `http://` : le lecteur n'essaie pas de lire. */
  insecure?: true;
}

export interface DistEpisodesFile {
  schemaVersion?: number;
  catalogVersion?: string;
  slug: string;
  fetchedAt?: string;
  feedTitle?: string;
  count: number;
  episodes: DistEpisode[];
}

export interface CategoryTranslation {
  label: string;
}

export interface TagTranslation {
  label: string;
  description: string;
}

export interface TagDef {
  id: string;
  label: string;
  description: string;
  translations?: Record<string, TagTranslation>;
}

export interface CategoryDef {
  id: string;
  label: string;
  translations?: Record<string, CategoryTranslation>;
}

/** Option de filtre prête à afficher (libellé localisé + compteur). */
export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

/** Élément renvoyé par `getStaticPaths()` (Astro) — type nommé pour rester lisible. */
export interface StaticPath<TProps> {
  params: Record<string, string>;
  props: TProps;
}

/** Lien de navigation (bandeau de langues / tranches). */
export interface NavItem {
  href: string;
  label: string;
  count: number;
  active: boolean;
}
