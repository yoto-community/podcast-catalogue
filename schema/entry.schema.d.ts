/**
 * Généré par `pnpm gen:types` à partir des JSON Schema du dossier `schema/`.
 * Ne pas éditer à la main : la CI détecte toute dérive.
 */

/** Catégories autorisées (source : reference/categories.json). */
export type SourceCategory = "histoire" | "education" | "fiction" | "documentaire" | "musique" | "science";

/** Tags autorisés (source : reference/tags.json). */
export type SourceTag = "animaux" | "dinosaures" | "espace" | "sciences" | "histoires-soir" | "contes-classiques" | "histoires-originales" | "enquetes-mysteres" | "personnages-recurrents" | "musique" | "histoire-france" | "geographie-voyages" | "emotions-bienetre" | "apprentissages" | "nature-environnement" | "philosophie" | "arts-culture" | "langues" | "heros-filles" | "humour" | "sante-corps" | "technologie" | "politique-societe" | "cuisine-alimentation";

/**
 * Entrée telle qu'écrite dans entries/<langue>/<tranche>.json.
 * Champs dérivés (language, groupId, ageRange) interdits dans la source.
 */
export interface CatalogEntry {
  /** Nom public du podcast (≤ 200 caractères). */
  name: string;
  /** Éditeur / production. Auto-complété depuis `itunes:author` au build s’il est absent (défaut : « Indépendant »). */
  publisher?: string;
  /** Catégorie — doit exister dans `reference/categories.json`. */
  category: SourceCategory;
  /** Tags thématiques — doivent exister dans `reference/tags.json`. */
  tags?: ("animaux" | "dinosaures" | "espace" | "sciences" | "histoires-soir" | "contes-classiques" | "histoires-originales" | "enquetes-mysteres" | "personnages-recurrents" | "musique" | "histoire-france" | "geographie-voyages" | "emotions-bienetre" | "apprentissages" | "nature-environnement" | "philosophie" | "arts-culture" | "langues" | "heros-filles" | "humour" | "sante-corps" | "technologie" | "politique-societe" | "cuisine-alimentation")[];
  /** URL du flux RSS/Atom (https, hôte public — règles anti-SSRF). */
  rssUrl: string;
  /** Description éditoriale (≤ 1000 caractères). Auto-proposée depuis `<description>` du flux si absente. */
  description?: string;
  /** URL https de la couverture (auto-complétée depuis `itunes:image` / `<image>` si absente). */
  imageUrl?: string;
  /** URL https du site de l’éditeur (auto-complétée depuis `<link>` du canal si absente). */
  websiteUrl?: string;
}

/**
 * Entrée telle que publiée dans dist/ (toujours complète).
 */
export interface PublishedEntry {
  /** Identifiant URL stable (slug du nom). */
  slug: string;
  /** name */
  name: string;
  /** Langue dérivée du chemin entries/<langue>/. */
  language: "fr" | "en";
  /** Tranche dérivée du nom de fichier. */
  groupId: "tout-petits" | "maternelle-cp" | "primaire" | "college-plus";
  /** Tranche d'âge affichable, dérivée de groups/groups.json (traduite). */
  ageRange: string;
  /** category */
  category: SourceCategory;
  /** Tags thématiques. */
  tags?: ("animaux" | "dinosaures" | "espace" | "sciences" | "histoires-soir" | "contes-classiques" | "histoires-originales" | "enquetes-mysteres" | "personnages-recurrents" | "musique" | "histoire-france" | "geographie-voyages" | "emotions-bienetre" | "apprentissages" | "nature-environnement" | "philosophie" | "arts-culture" | "langues" | "heros-filles" | "humour" | "sante-corps" | "technologie" | "politique-societe" | "cuisine-alimentation")[];
  /** publisher */
  publisher: string;
  /** rssUrl */
  rssUrl: string;
  /** imageUrl */
  imageUrl: string;
  /** websiteUrl */
  websiteUrl?: string;
  /** description */
  description: string;
}

