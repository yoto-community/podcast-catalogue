/**
 * Adaptateur `dist/` → modèle du site.
 *
 * Tout est lu sur disque **au moment du build** : aucun fetch réseau pendant
 * `astro build`, aucune dépendance runtime. Chemins résolus par candidature
 * (cwd du binaire Astro ou emplacement du module) pour rester robuste quel
 * que soit le répertoire depuis lequel le build est lancé.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CategoryDef,
  DistEntry,
  DistEpisodesFile,
  FilterOption,
  Manifest,
  ManifestGroup,
  ManifestLanguage,
  TagDef,
} from "./types";
import { normalizeText } from "./text";
import { ageChoices, coversAge } from "./ages";
import type { AgeChoice } from "./ages";
import { slugifyPublisher } from "./url";

const MISSING_DIST_MESSAGE = [
  "Données du catalogue introuvable : aucun `dist/index.json` valide.",
  "Lancez `pnpm build --allow-incomplete` à la racine du dépôt pour régénérer `dist/`,",
  "puis relancez `pnpm site:build`.",
].join("\n");

const FALLBACK_CATEGORIES: CategoryDef[] = [
  { id: "histoire", label: "Histoire", translations: { en: { label: "History" } } },
  { id: "education", label: "Éducation", translations: { en: { label: "Education" } } },
  { id: "fiction", label: "Fiction", translations: { en: { label: "Fiction" } } },
  { id: "documentaire", label: "Documentaire", translations: { en: { label: "Documentary" } } },
  { id: "musique", label: "Musique", translations: { en: { label: "Music" } } },
  { id: "science", label: "Science", translations: { en: { label: "Science" } } },
];

function moduleDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

/** Racine du dépôt (parent de `site/`), déduite des positions candidates. */
function candidates(): string[] {
  return [
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd()),
    path.resolve(moduleDir(), "../../.."),
    path.resolve(moduleDir(), "../../../.."),
    path.resolve(moduleDir(), "../../../../.."),
  ];
}

function findDir(predicate: (root: string) => boolean): string | undefined {
  return candidates().find(predicate);
}

let rootCache: string | undefined;

function repoRoot(): string {
  if (rootCache) return rootCache;
  const found = findDir((candidate) => fs.existsSync(path.join(candidate, "dist", "index.json")));
  if (!found) {
    throw new Error(
      `${MISSING_DIST_MESSAGE}\nChemins testés : ${candidates()
        .map((c) => path.join(c, "dist", "index.json"))
        .join(" · ")}`,
    );
  }
  rootCache = found;
  return found;
}

function distDir(): string {
  return path.join(repoRoot(), "dist");
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

/* ------------------------------------------------------------------ manifeste */

let manifestCache: Manifest | undefined;

export function getManifest(): Manifest {
  if (manifestCache) return manifestCache;
  const manifest = readJson<Manifest>(path.join(distDir(), "index.json"));
  if (!Array.isArray(manifest.shards) || manifest.shards.length === 0) {
    throw new Error(
      "`dist/index.json` invalide : aucun éclat (`shards`) — relancez `pnpm build --allow-incomplete`.",
    );
  }
  if (!Array.isArray(manifest.groups) || !Array.isArray(manifest.languages)) {
    throw new Error("`dist/index.json` invalide : `groups` / `languages` absents.");
  }
  manifestCache = manifest;
  return manifest;
}

/* -------------------------------------------------------------------- entrées */

let entriesCache: DistEntry[] | undefined;

/** Toutes les entrées du catalogue, en concaténant les éclats du manifeste. */
export function getEntries(): DistEntry[] {
  if (entriesCache) return entriesCache;
  const manifest = getManifest();
  const dir = distDir();
  const bySlug = new Map<string, DistEntry>();
  for (const shard of manifest.shards) {
    const file = path.join(dir, shard.path);
    if (!fs.existsSync(file)) continue;
    const payload = readJson<{ entries?: DistEntry[] }>(file);
    for (const entry of payload.entries ?? []) bySlug.set(entry.slug, entry);
  }
  if (bySlug.size === 0) {
    throw new Error(
      "Aucune entrée lue dans `dist/` — les éclats sont vides ou illisibles : relancez `pnpm build --allow-incomplete`.",
    );
  }
  entriesCache = [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  return entriesCache;
}

export function getGroups(): ManifestGroup[] {
  return [...getManifest().groups].sort((a, b) => a.order - b.order);
}

export function getLanguages(): ManifestLanguage[] {
  const manifest = getManifest();
  return manifest.languages
    .filter((language) => getEntries().some((entry) => entry.language === language.code))
    .sort((a, b) => a.code.localeCompare(b.code));
}

let categoriesCache: CategoryDef[] | undefined;
let tagsCache: TagDef[] | undefined;

function readCategories(): CategoryDef[] {
  if (categoriesCache) return categoriesCache;
  const file = path.join(repoRoot(), "reference", "categories.json");
  if (fs.existsSync(file)) {
    try {
      categoriesCache = readJson<CategoryDef[]>(file);
      return categoriesCache;
    } catch {
      categoriesCache = FALLBACK_CATEGORIES;
      return categoriesCache;
    }
  }
  categoriesCache = FALLBACK_CATEGORIES;
  return categoriesCache;
}

function readTags(): TagDef[] {
  if (tagsCache) return tagsCache;
  const file = path.join(repoRoot(), "reference", "tags.json");
  if (fs.existsSync(file)) {
    try {
      tagsCache = readJson<TagDef[]>(file);
      return tagsCache;
    } catch {
      tagsCache = [];
      return tagsCache;
    }
  }
  tagsCache = [];
  return tagsCache;
}

export function getCategories(): CategoryDef[] {
  const present = new Set(getEntries().map((entry) => entry.category));
  return readCategories().filter((category) => present.has(category.id));
}

export function getTags(): TagDef[] {
  const present = new Set(getEntries().flatMap((entry) => entry.tags ?? []));
  return readTags().filter((tag) => present.has(tag.id));
}

/* --------------------------------------------------------------- localisation */

/** Libellé d'une tranche dans la langue de la page (`en` → traduction si dispo). */
export function groupLabel(group: ManifestGroup, language?: string): string {
  if (language && language !== "fr") {
    const translation = group.translations?.[language];
    if (translation) return translation.label;
  }
  return group.label;
}

/** Tranche d'âge dans la langue de la page. */
export function groupAgeRange(group: ManifestGroup, language?: string): string {
  if (language && language !== "fr") {
    const translation = group.translations?.[language];
    if (translation) return translation.ageRange;
  }
  return group.ageRange;
}

/**
 * Segment d'URL d'une tranche : le slug **neutre** (`age-2-5`) sert toutes les
 * langues, sauf si la locale en définit un sien (`translations.<lang>.slug`).
 * Ne jamais concaténer `group.id` à la main : c'est cette fonction qui décide
 * du segment — l'id reste la clé de données.
 */
export function groupSlug(group: ManifestGroup, language?: string): string {
  if (language) {
    const translated = group.translations?.[language];
    if (translated?.slug) return translated.slug;
  }
  return group.slug;
}

/** `/fr/age-2-5/` — chemin d'une tranche (à passer à `pageUrl()`). */
export function groupPath(language: string, group: ManifestGroup): string {
  return `/${language}/${groupSlug(group, language)}/`;
}

/** Groupe identifié par son id (clé de données `groupId`). */
export function groupOfId(id: string): ManifestGroup | undefined {
  return getGroups().find((candidate) => candidate.id === id);
}

/**
 * Résout une valeur brute vers l'**id** d'une tranche : id actuel, segment
 * d'URL (`slug`) ou ancien id (`aliases`). Sert au `?age=` rétrocompatible —
 * un lien partagé avec l'ancien identifiant reste valable.
 */
export function groupIdOf(raw: string): string | undefined {
  const needle = raw.trim().toLowerCase();
  if (!needle) return undefined;
  return getGroups().find(
    (group) =>
      group.id.toLowerCase() === needle ||
      group.slug.toLowerCase() === needle ||
      (group.aliases ?? []).some((alias) => alias.toLowerCase() === needle),
  )?.id;
}

/** Segment d'URL d'un groupe identifié par son id (repli sur l'id si inconnu). */
export function groupSlugOfId(id: string, language?: string): string {
  const group = groupOfId(id);
  return group ? groupSlug(group, language) : id;
}

/** `/fr/age-2-5/` — tranche d'une entrée, dans la langue de l'entrée. */
export function entryGroupPath(entry: DistEntry): string {
  return `/${entry.language}/${groupSlugOfId(entry.groupId, entry.language)}/`;
}

/** `/fr/age-2-5/animalite/` — chemin canonique d'une entrée. */
export function entryPath(entry: DistEntry): string {
  return `${entryGroupPath(entry)}${entry.slug}/`;
}

export function categoryLabel(id: string, language?: string): string {
  const category = readCategories().find((candidate) => candidate.id === id);
  if (!category) return id.charAt(0).toUpperCase() + id.slice(1);
  if (language && language !== "fr") {
    const translation = category.translations?.[language];
    if (translation) return translation.label;
  }
  return category.label;
}

export function tagLabel(id: string, language?: string): string {
  const tag = readTags().find((candidate) => candidate.id === id);
  if (!tag) return id.charAt(0).toUpperCase() + id.slice(1);
  if (language && language !== "fr") {
    const translation = tag.translations?.[language];
    if (translation) return translation.label;
  }
  return tag.label;
}

export function languageLabel(code: string): string {
  return (
    getManifest().languages.find((language) => language.code === code)?.label ?? code.toUpperCase()
  );
}

/** « Français », « English »… selon la langue de la page. */
export function languageLabelFor(code: string, pageLanguage?: string): string {
  if (pageLanguage === "en") return code === "en" ? "English" : "Français";
  return languageLabel(code);
}

const FRENCH_LANGUAGE_NAMES: Record<string, string> = { fr: "français", en: "anglais" };

/** Nom de la langue en français (interface du site) : « podcasts en anglais ». */
export function languageFrenchName(code: string): string {
  return FRENCH_LANGUAGE_NAMES[code] ?? languageLabel(code).toLowerCase();
}

/* ----------------------------------------------------------------- sélections */

export function entriesOfLanguage(language: string): DistEntry[] {
  return getEntries().filter((entry) => entry.language === language);
}

export function entriesOf(language: string, group: string): DistEntry[] {
  return getEntries().filter((entry) => entry.language === language && entry.groupId === group);
}

export function findEntry(language: string, group: string, slug: string): DistEntry | undefined {
  return getEntries().find(
    (entry) => entry.language === language && entry.groupId === group && entry.slug === slug,
  );
}

export function entriesOfTag(tagId: string): DistEntry[] {
  return getEntries().filter((entry) => entry.tags?.includes(tagId));
}

/** Tri par nom localisé (ordre d'affichage par défaut). */
export function sortByName(entries: DistEntry[]): DistEntry[] {
  return [...entries].sort((a, b) =>
    normalizeText(a.name).localeCompare(normalizeText(b.name), "fr", { sensitivity: "base" }),
  );
}

function optionCount(entries: DistEntry[], test: (entry: DistEntry) => boolean): number {
  return entries.reduce((total, entry) => (test(entry) ? total + 1 : total), 0);
}

export function languageOptions(entries: DistEntry[]): FilterOption[] {
  return getLanguages()
    .map((language) => ({
      value: language.code,
      label: languageLabel(language.code),
      count: optionCount(entries, (entry) => entry.language === language.code),
    }))
    .filter((option) => option.count > 0);
}

export function groupOptions(entries: DistEntry[], language?: string): FilterOption[] {
  return getGroups()
    .map((group) => ({
      value: group.id,
      label: groupLabel(group, language),
      count: optionCount(entries, (entry) => entry.groupId === group.id),
    }))
    .filter((option) => option.count > 0);
}

/** Case à cocher du filtre « âge », avec son compteur. */
export type AgeOption = AgeChoice & { count: number };

/**
 * Pastilles d'âge exact à afficher : chaque âge compte les podcasts des tranches
 * qui le couvrent (bornes inclusives → les âges de frontière comptent deux fois).
 * Les âges sans podcast dans la page sont masqués, comme pour les autres filtres.
 */
export function ageOptions(entries: DistEntry[]): AgeOption[] {
  const groups = getGroups();
  const byId = new Map(groups.map((group) => [group.id, group]));
  return ageChoices(groups)
    .map((choice) => ({
      ...choice,
      count: optionCount(entries, (entry) => {
        const group = byId.get(entry.groupId);
        return group ? coversAge(group, choice.age) : false;
      }),
    }))
    .filter((option) => option.count > 0);
}

export function categoryOptions(entries: DistEntry[], language?: string): FilterOption[] {
  const options = getCategories().map((category) => ({
    value: category.id,
    label: categoryLabel(category.id, language),
    count: optionCount(entries, (entry) => entry.category === category.id),
  }));
  return options
    .filter((option) => option.count > 0)
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
}

/* ------------------------------------------------------------------ épisodes */

let episodesDirCache: boolean | undefined;

/** `dist/episodes/` existe-t-il (build `build-episodes` déjà exécuté) ? */
export function episodesAvailable(): boolean {
  if (episodesDirCache !== undefined) return episodesDirCache;
  episodesDirCache = fs.existsSync(path.join(distDir(), "episodes"));
  return episodesDirCache;
}

const episodesCache = new Map<string, DistEpisodesFile | null>();

/** Épisodes d'un podcast — `null` si le fichier n'est pas encore indexé. */
export function getEpisodes(slug: string): DistEpisodesFile | null {
  if (episodesCache.has(slug)) return episodesCache.get(slug) ?? null;
  let result: DistEpisodesFile | null = null;
  if (episodesAvailable()) {
    const file = path.join(distDir(), "episodes", `${slug}.json`);
    if (fs.existsSync(file)) {
      const payload = readJson<DistEpisodesFile>(file);
      if (payload && Array.isArray(payload.episodes)) {
        result = { ...payload, slug: payload.slug || slug };
      }
    }
  }
  episodesCache.set(slug, result);
  return result;
}

/** URL vers laquelle rediriger l'écoute quand la lecture locale est impossible. */
export function externalUrl(entry: DistEntry): string {
  return entry.websiteUrl || entry.rssUrl;
}

/* ------------------------------------------------------------------ éditeurs */

export function getPublishers(): Array<{ name: string; slug: string; count: number }> {
  const entries = getEntries();
  const byPublisher = new Map<string, number>();
  for (const entry of entries) {
    byPublisher.set(entry.publisher, (byPublisher.get(entry.publisher) ?? 0) + 1);
  }
  return [...byPublisher.entries()]
    .map(([name, count]) => ({ name, slug: slugifyPublisher(name), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr"));
}

export function entriesOfPublisher(publisherSlug: string): DistEntry[] {
  return getEntries().filter((entry) => slugifyPublisher(entry.publisher) === publisherSlug);
}
