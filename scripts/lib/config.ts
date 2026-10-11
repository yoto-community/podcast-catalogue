import { fileURLToPath } from "node:url";
import path from "node:path";

/** Racine du dépôt (résolue depuis l'emplacement de ce fichier, indépendante du cwd). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const paths = {
  root: ROOT,
  entries: path.join(ROOT, "entries"),
  groups: path.join(ROOT, "groups", "groups.json"),
  categories: path.join(ROOT, "reference", "languages.json"),
  reference: path.join(ROOT, "reference"),
  schema: path.join(ROOT, "schema"),
  dist: path.join(ROOT, "dist"),
  cache: path.join(ROOT, ".cache", "feeds"),
  site: path.join(ROOT, "site"),
};

/** Âge minimum du catalogue (une tranche ne peut pas commencer en dessous). */
export const MIN_AGE = 2;

/** Seuil d'entrée pour découper une tranche (≥ → fichier par tranche, sinon fichier par langue). */
export const SHARD_MIN_ENTRIES = 15;
/** Seuil de re-découpage à la hausse : un éclat plus gros doit être re-fractionné. */
export const SHARD_MAX_BYTES = 500 * 1024;
/** Nombre d'épisodes publiés par podcast. */
export const EPISODES_PER_PODCAST = 10;
/** TTL du cache disque des flux. */
export const FEED_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Version de format (incrémentée à chaque break). */
export const SCHEMA_VERSION = 1;

/**
 * Dépôt public cible (`<owner>/<name>`), utilisé dans les `$id` des schémas, l'User-Agent
 * et les badges de la doc. À ajuster d'une ligne + `pnpm gen:types` si le dépôt change de compte.
 */
export const REPOSITORY = "yoto-community/podcast-catalogue";

export const USER_AGENT = `yoto-podcast-catalog/1.0 (+https://github.com/${REPOSITORY})`;

export const LIMITS = {
  name: 200,
  description: 1000,
  publisher: 120,
  episodeDescription: 300,
  tags: 10,
} as const;

export const FORBIDDEN_SOURCE_FIELDS = [
  "language",
  "groupId",
  "ageRange",
  "isActive",
  "createdBy",
  "id",
  "slug",
] as const;

export const REQUIRED_SOURCE_FIELDS = ["name", "category", "rssUrl"] as const;

export const OPTIONAL_SOURCE_FIELDS = [
  "publisher",
  "description",
  "imageUrl",
  "websiteUrl",
  "tags",
] as const;
