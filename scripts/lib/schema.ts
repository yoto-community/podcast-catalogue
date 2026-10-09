/**
 * Construction des JSON Schema publiés (`schema/*.json`) et des types TypeScript générés.
 *
 * Source de vérité : `scripts/lib/config.ts` (limites, champs) + `reference/*.json` (enums).
 * `scripts/gen-types.ts` écrit ces fichiers, `scripts/validate.ts` les compare au résultat
 * calculé ici pour empêcher toute dérive manuelle (`pnpm validate` + CI `git diff --exit-code`).
 */
import {
  LIMITS,
  OPTIONAL_SOURCE_FIELDS,
  REPOSITORY,
  REQUIRED_SOURCE_FIELDS,
  SCHEMA_VERSION,
} from "./config.ts";
import { loadCategories, loadGroups, loadLanguages, loadTags } from "./catalog.ts";

export interface SchemaProperty {
  type?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: string[];
  description?: string;
  items?: SchemaProperty;
  $ref?: string;
}

export interface Schema {
  $schema: string;
  $id: string;
  title: string;
  description?: string;
  type?: string;
  additionalProperties?: boolean;
  required?: string[];
  properties?: Record<string, SchemaProperty>;
  items?: unknown;
}

export interface RenderedSchemas {
  entry: Schema;
  sourceFile: Schema;
  artifact: Schema;
  /** Contenu exact de `schema/entry.schema.d.ts` (sans la nouvelle ligne finale). */
  dts: string;
}

const BASE_URL = `https://github.com/${REPOSITORY}/blob/main/schema`;

const DOC = {
  name: "Nom public du podcast (≤ {name} caractères).",
  publisher:
    "Éditeur / production. Auto-complété depuis `itunes:author` au build s’il est absent (défaut : « Indépendant »).",
  category: "Catégorie — doit exister dans `reference/categories.json`.",
  rssUrl: "URL du flux RSS/Atom (https, hôte public — règles anti-SSRF).",
  description:
    "Description éditoriale (≤ {description} caractères). Auto-proposée depuis `<description>` du flux si absente.",
  imageUrl:
    "URL https de la couverture (auto-complétée depuis `itunes:image` / `<image>` si absente).",
  websiteUrl:
    "URL https du site de l’éditeur (auto-complétée depuis `<link>` du canal si absente).",
} as const;

function buildEntrySchema(): Schema {
  const categories = loadCategories().map((c) => c.id);
  const tags = loadTags().map((t) => t.id);
  const properties: Record<string, SchemaProperty> = {
    name: {
      type: "string",
      minLength: 1,
      maxLength: LIMITS.name,
      description: DOC.name.replace("{name}", String(LIMITS.name)),
    },
    publisher: {
      type: "string",
      minLength: 1,
      maxLength: LIMITS.publisher,
      description: DOC.publisher,
    },
    category: { type: "string", enum: categories, description: DOC.category },
    tags: {
      type: "array",
      items: { type: "string", enum: tags },
      description: "Tags thématiques — doivent exister dans `reference/tags.json`.",
    },
    rssUrl: { type: "string", pattern: "^https://", description: DOC.rssUrl },
    description: {
      type: "string",
      maxLength: LIMITS.description,
      description: DOC.description.replace("{description}", String(LIMITS.description)),
    },
    imageUrl: { type: "string", pattern: "^https://", description: DOC.imageUrl },
    websiteUrl: { type: "string", pattern: "^https://", description: DOC.websiteUrl },
  };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${BASE_URL}/entry.schema.json`,
    title: "Entrée du catalogue de podcasts",
    description:
      "Contribution humaine dans entries/<langue>/<tranche>.json. Les champs `language`, `groupId` et `ageRange` " +
      "sont interdits : ils sont dérivés du chemin du fichier. Tri par slug obligatoire.",
    type: "object",
    additionalProperties: false,
    required: [...REQUIRED_SOURCE_FIELDS],
    properties,
  };
}

function buildSourceFileSchema(): Schema {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${BASE_URL}/source-file.schema.json`,
    title: "Fichier source entries/<langue>/<tranche>.json",
    description: "Tableau d’entrées triées par slug (croissant). Un fichier vide n’existe pas.",
    type: "array",
    items: { $ref: "entry.schema.json" },
  };
}

function buildArtifactSchema(): Schema {
  const languages = loadLanguages().map((l) => l.code);
  const groups = loadGroups().map((g) => g.id);
  const categories = loadCategories().map((c) => c.id);
  const tags = loadTags().map((t) => t.id);
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${BASE_URL}/artifact.schema.json`,
    title: "Entrée publiée dans dist/",
    description: `Contrat de sortie du build (schemaVersion ${SCHEMA_VERSION}) : toujours complet (imageUrl, description, publisher obligatoires).`,
    type: "object",
    additionalProperties: false,
    required: [
      "slug",
      "name",
      "language",
      "groupId",
      "ageRange",
      "category",
      "publisher",
      "rssUrl",
      "imageUrl",
      "description",
    ],
    properties: {
      slug: {
        type: "string",
        pattern: "^[a-z0-9]+(-[a-z0-9]+)*$",
        description: "Identifiant URL stable (slug du nom).",
      },
      name: { type: "string", minLength: 1, maxLength: LIMITS.name },
      language: {
        type: "string",
        enum: languages,
        description: "Langue dérivée du chemin entries/<langue>/.",
      },
      groupId: { type: "string", enum: groups, description: "Tranche dérivée du nom de fichier." },
      ageRange: {
        type: "string",
        description: "Tranche d'âge affichable, dérivée de groups/groups.json (traduite).",
      },
      category: { type: "string", enum: categories },
      tags: {
        type: "array",
        items: { type: "string", enum: tags },
        description: "Tags thématiques.",
      },
      publisher: { type: "string", minLength: 1, maxLength: LIMITS.publisher },
      rssUrl: { type: "string", pattern: "^https://" },
      imageUrl: { type: "string", pattern: "^https://" },
      websiteUrl: { type: "string", pattern: "^https://" },
      description: { type: "string", minLength: 1, maxLength: LIMITS.description },
    },
  };
}

function tsType(prop: SchemaProperty): string {
  if (
    prop.type === "array" &&
    prop.items &&
    typeof prop.items === "object" &&
    "enum" in prop.items
  ) {
    const itemsEnum = (prop.items as { enum: string[] }).enum;
    const union = itemsEnum.map((v) => JSON.stringify(v)).join(" | ");
    // Parenthèses obligatoires : sans elles `A | B[]` signifie `A | (B[])`.
    return itemsEnum.length > 1 ? `(${union})[]` : `${union}[]`;
  }
  if (prop.enum) return prop.enum.map((v) => JSON.stringify(v)).join(" | ");
  return "string";
}

function generateDts(entrySchema: Schema, artifactSchema: Schema): string {
  const lines: string[] = [
    "/**",
    " * Généré par `pnpm gen:types` à partir des JSON Schema du dossier `schema/`.",
    " * Ne pas éditer à la main : la CI détecte toute dérive.",
    " */",
    "",
  ];

  const categoryEnum = entrySchema.properties?.category?.enum ?? [];
  lines.push("/** Catégories autorisées (source : reference/categories.json). */");
  lines.push(
    `export type SourceCategory = ${categoryEnum.map((v) => JSON.stringify(v)).join(" | ")};`,
  );
  lines.push("");

  const tagEnum = entrySchema.properties?.tags?.items?.enum ?? [];
  lines.push("/** Tags autorisés (source : reference/tags.json). */");
  lines.push(`export type SourceTag = ${tagEnum.map((v) => JSON.stringify(v)).join(" | ")};`);
  lines.push("");

  const emitInterface = (name: string, schema: Schema, doc: string): void => {
    lines.push("/**", ` * ${doc.split("\n").join("\n * ")}`, " */");
    lines.push(`export interface ${name} {`);
    const required = new Set(schema.required ?? []);
    for (const [field, prop] of Object.entries(schema.properties ?? {})) {
      lines.push(`  /** ${prop.description ?? field} */`);
      const optional = required.has(field) ? "" : "?";
      const type = field === "category" ? "SourceCategory" : tsType(prop);
      lines.push(`  ${field}${optional}: ${type};`);
    }
    lines.push("}");
    lines.push("");
  };

  emitInterface(
    "CatalogEntry",
    entrySchema,
    "Entrée telle qu'écrite dans entries/<langue>/<tranche>.json.\nChamps dérivés (language, groupId, ageRange) interdits dans la source.",
  );
  emitInterface(
    "PublishedEntry",
    artifactSchema,
    "Entrée telle que publiée dans dist/ (toujours complète).",
  );

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

/** Calcule les schémas + le `.d.ts` à partir du code (utilisé par gen-types ET validate). */
export function renderSchemas(): RenderedSchemas {
  const entry = buildEntrySchema();
  const sourceFile = buildSourceFileSchema();
  const artifact = buildArtifactSchema();
  return { entry, sourceFile, artifact, dts: generateDts(entry, artifact) };
}
