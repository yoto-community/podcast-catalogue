import type { CatalogEntry, PublishedEntry } from "../../schema/entry.schema.d.ts";

/**
 * Types partagés des scripts (source, artefacts, références).
 * Le contrat (`SourceEntry` / `DistEntry`) est **généré** depuis les JSON Schema du dossier
 * `schema/` par `pnpm gen:types` : le schéma JSON est la source de vérité, la CI détecte la dérive.
 */

/**
 * Entrée telle qu'écrite dans `entries/<langue>/<tranche>.json` (champs dérivés interdits).
 */
export type SourceEntry = CatalogEntry;

/** Entrée telle que publiée dans `dist/` (toujours complète). */
export type DistEntry = PublishedEntry;

export type { SourceCategory } from "../../schema/entry.schema.d.ts";

/** Codes de langue du dépôt (`reference/languages.json` → `schema/artifact.schema.json`). */
export type LanguageCode = PublishedEntry["language"];

/** Tranches d'âge du dépôt (`groups/groups.json` → `schema/artifact.schema.json`). */
export type GroupId = PublishedEntry["groupId"];

export interface GroupTranslation {
  label: string;
  ageRange: string;
}

export interface GroupDef {
  id: string;
  order: number;
  /** Libellés français (langue de référence). */
  label: string;
  ageRange: string;
  /** Premier âge couvert (inclus), entier ≥ 2 — validé par `validate.ts` (S10). */
  ageMin: number;
  /** Dernier âge couvert (inclus), ou `null` = ouvert vers le haut (dernière tranche). */
  ageMax: number | null;
  /** Traductions optionnelles, ex. `{ "en": { "label": "Toddlers", "ageRange": "2–5 years" } }`. */
  translations?: Record<string, GroupTranslation>;
}

export interface LanguageDef {
  code: string;
  label: string;
}

export interface CategoryDef {
  id: string;
  label: string;
  translations?: Record<string, { label: string }>;
}

export interface TagDef {
  id: string;
  label: string;
  description: string;
  translations?: Record<string, { label: string; description: string }>;
}

/** Entrée enrichie interne (source + métadonnées de chemin + compléments réseau). */
export interface LoadedEntry {
  source: SourceEntry;
  /** Fichier source relatif à la racine, ex. `entries/fr/tout-petits.json`. */
  file: string;
  /** 1-based dans le fichier (après tri) — pour les messages d'erreur. */
  line: number;
  /** Dérivée du chemin `entries/<langue>/` (validée contre `reference/languages.json`). */
  language: LanguageCode;
  /** Dérivée du nom de fichier (validée contre `groups/groups.json`). */
  groupId: GroupId;
  slug: string;
}

export interface ManifestShard {
  path: string;
  language: string;
  group: string | null;
  count: number;
  bytes: number;
  sha256: string;
}

export interface Manifest {
  schemaVersion: number;
  catalogVersion: string;
  commit: string;
  updatedAt: string;
  counts: {
    total: number;
    byLanguage: Record<string, number>;
    byGroup: Record<string, number>;
    byCategory: Record<string, number>;
  };
  groups: Array<{
    id: string;
    order: number;
    label: string;
    ageRange: string;
    /** Premier âge couvert (inclus). */
    ageMin: number;
    /** Dernier âge couvert (inclus), `null` = ouvert (11 ans et plus). */
    ageMax: number | null;
    translations?: Record<string, GroupTranslation>;
  }>;
  languages: LanguageDef[];
  shards: ManifestShard[];
  full: { path: string; count: number; bytes: number; sha256: string };
}

/** Épisode normalisé publié dans `dist/episodes/<slug>.json`. */
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
  /** Présent si l'URL audio est `http://` (mixed content) : le lecteur n'essaie pas. */
  insecure?: true;
}

export interface DistEpisodesFile {
  schemaVersion: number;
  catalogVersion: string;
  slug: string;
  fetchedAt: string;
  feedTitle?: string;
  count: number;
  episodes: DistEpisode[];
}

/** Métadonnées de canal extraites d'un flux RSS/Atom. */
export interface ParsedFeed {
  title?: string;
  description?: string;
  link?: string;
  language?: string;
  imageUrl?: string;
  author?: string;
  categories: string[];
  selfUrl?: string;
  lastBuildDate?: string;
  items: ParsedItem[];
}

export interface ParsedItem {
  title?: string;
  description?: string;
  link?: string;
  pubDate?: string;
  durationSec?: number;
  audioUrl?: string;
  audioType?: string;
  imageUrl?: string;
  episodeNumber?: number;
  seasonNumber?: number;
  guid?: string;
}

/** Résultat d'un fetch de flux (réseau + cache). */
export interface FeedResult {
  url: string;
  xml: string;
  fetchedAt: string;
  fromCache: boolean;
  /** Vrai quand le cache périmé a servi de secours à un tiers injoignable (5xx/timeout). */
  stale?: true;
  finalUrl?: string;
}

export type Severity = "error" | "warning" | "info";

export interface Finding {
  severity: Severity;
  rule: string;
  message: string;
  file?: string;
  entry?: string;
}
