/**
 * Issue « Ajouter un podcast » → entrée dans `entries/<langue>/<tranche>.json`.
 *
 * Lit le corps de l'issue (env `ISSUE_BODY`), contrôle les champs obligatoires (nom, flux https,
 * catégorie, langue, tranche), détecte les doublons, complète l'entrée depuis le flux RSS
 * (`description`, `publisher`, `imageUrl`, `websiteUrl`, `author` — `--no-network` pour sauter) et propose
 * des `tags`, puis écrit l'entrée **triée** dans le fichier dérivé. La CI revalide ensuite le
 * résultat comme n'importe quelle contribution (`pnpm validate:changed`).
 *
 * Usage :
 *   ISSUE_BODY='…' pnpm issue-to-entry [--dry-run] [--json]
 *   ISSUE_TITLE='…' sert de nom par défaut si le corps ne le contient pas.
 */
import path from "node:path";
import { LIMITS, paths } from "./lib/config.ts";
import { loadCategories, loadEntries, loadGroups, loadLanguages } from "./lib/catalog.ts";
import { readJsonIfExists, writeJson } from "./lib/io.ts";
import { enrichFromFeed } from "./lib/enrich.ts";
import { parseIssueFields, resolveId, resolveLanguage } from "./lib/issue.ts";
import { normalizeUrl, slugify } from "./lib/norm.ts";
import { suggestTags } from "./lib/tag.ts";
import { urlProblem } from "./lib/url.ts";
import type { SourceCategory, SourceEntry } from "./lib/types.ts";

type Field =
  | "name"
  | "rssUrl"
  | "category"
  | "language"
  | "groupId"
  | "publisher"
  | "description"
  | "imageUrl"
  | "websiteUrl";

/** Clé normalisée de l'issue → champ de l'entrée. */
const FIELD_ALIASES: Record<string, Field> = {
  nom: "name",
  "nom du podcast": "name",
  titre: "name",
  podcast: "name",
  rss: "rssUrl",
  feed: "rssUrl",
  "flux rss": "rssUrl",
  "url rss": "rssUrl",
  "url du flux": "rssUrl",
  "url du flux rss": "rssUrl",
  categorie: "category",
  "categorie du podcast": "category",
  langue: "language",
  tranche: "groupId",
  "tranche d'age": "groupId",
  age: "groupId",
  editeur: "publisher",
  production: "publisher",
  description: "description",
  resume: "description",
  image: "imageUrl",
  couverture: "imageUrl",
  "url de l'image": "imageUrl",
  site: "websiteUrl",
  "site web": "websiteUrl",
  "url du site": "websiteUrl",
  "site de l'editeur": "websiteUrl",
};

function fieldValue(fields: Record<string, string>, field: Field): string | undefined {
  const key = Object.keys(FIELD_ALIASES).find(
    (alias) => FIELD_ALIASES[alias] === field && alias in fields,
  );
  return key ? fields[key] : undefined;
}

async function main(): Promise<void> {
  const body = process.env.ISSUE_BODY ?? "";
  const dryRun = process.argv.includes("--dry-run");
  const asJson = process.argv.includes("--json");
  const errors: string[] = [];

  if (!body.trim()) {
    console.error('❌ ISSUE_BODY manquant — usage : ISSUE_BODY="$(…)" pnpm issue-to-entry');
    process.exit(2);
  }

  const fields = parseIssueFields(body);
  const name = (fieldValue(fields, "name") ?? process.env.ISSUE_TITLE)?.trim();
  if (!name) errors.push("**Nom du podcast** manquant (clé `Nom du podcast : …`)");
  else if (name.length > LIMITS.name)
    errors.push(`nom trop long : ${name.length} caractères (max ${LIMITS.name})`);

  const rssUrl = fieldValue(fields, "rssUrl")?.trim();
  if (!rssUrl) errors.push("**URL du flux RSS** manquante");
  else {
    const problem = urlProblem(rssUrl);
    if (problem) errors.push(`flux RSS : ${problem}`);
  }

  const categories = loadCategories();
  const groups = loadGroups();
  const languages = loadLanguages();

  const rawCategory = fieldValue(fields, "category");
  const category = rawCategory ? resolveId(rawCategory, categories) : undefined;
  if (!rawCategory)
    errors.push(`**Catégorie** manquante — valeurs : ${categories.map((c) => c.id).join(", ")}`);
  else if (!category)
    errors.push(
      `catégorie inconnue « ${rawCategory} » — valeurs : ${categories.map((c) => c.id).join(", ")}`,
    );

  const rawLanguage = fieldValue(fields, "language");
  const language = rawLanguage ? resolveLanguage(rawLanguage, languages) : undefined;
  const languageCodes = languages.map((l) => l.code);
  if (!rawLanguage) errors.push(`**Langue** manquante — valeurs : ${languageCodes.join(", ")}`);
  else if (!language)
    errors.push(`langue inconnue « ${rawLanguage} » — valeurs : ${languageCodes.join(", ")}`);

  const rawGroup = fieldValue(fields, "groupId");
  const groupId = rawGroup ? resolveId(rawGroup, groups) : undefined;
  if (!rawGroup)
    errors.push(`**Tranche d'âge** manquante — valeurs : ${groups.map((g) => g.id).join(", ")}`);
  else if (!groupId)
    errors.push(
      `tranche inconnue « ${rawGroup} » — valeurs : ${groups.map((g) => g.id).join(", ")}`,
    );

  const entry: SourceEntry = {
    name: name ?? "",
    // l'union vient du schéma généré ; la valeur a été résolue par `resolveId` ci-dessus
    category: (category ?? "histoire") as SourceCategory,
    rssUrl: rssUrl ?? "",
  };

  type OptionalField = "publisher" | "description" | "imageUrl" | "websiteUrl";
  const optional: Array<[OptionalField, number]> = [
    ["publisher", LIMITS.publisher],
    ["description", LIMITS.description],
    ["imageUrl", 0],
    ["websiteUrl", 0],
  ];
  for (const [field, limit] of optional) {
    const value = fieldValue(fields, field)?.trim();
    if (!value) continue;
    if ((field === "imageUrl" || field === "websiteUrl") && urlProblem(value)) {
      errors.push(`${field} : ${urlProblem(value) ?? "URL invalide"}`);
      continue;
    }
    if (limit && value.length > limit) {
      errors.push(`${field} trop long : ${value.length} caractères (max ${limit})`);
      continue;
    }
    entry[field] = value;
  }

  // Doublons : même slug ou même flux déjà référencé quelque part.
  const { entries, errors: loadErrors } = loadEntries();
  errors.push(...loadErrors);
  const slug = name ? slugify(name) : "";
  const normalizedFeed = rssUrl ? normalizeUrl(rssUrl) : "";
  for (const existing of entries) {
    if (slug && existing.slug === slug)
      errors.push(`déjà présent : « ${existing.source.name} » (${existing.file})`);
    else if (normalizedFeed && normalizeUrl(existing.source.rssUrl) === normalizedFeed) {
      errors.push(`flux déjà référencé : « ${existing.source.name} » (${existing.file})`);
    }
  }

  if (errors.length > 0) {
    console.error(`❌ ${errors.length} problème(s) dans l'issue :`);
    for (const error of errors) console.error(`   · ${error}`);
    console.error("\nCorrigez l’issue puis relancez le workflow (label podcast:ajout).");
    process.exit(1);
  }

  // Auto-complétion depuis le flux : la source gagne, seuls les champs absents sont remplis.
  // Un flux injoignable ne bloque pas la PR — le niveau 3 de la CI le signalera.
  if (!process.argv.includes("--no-network")) {
    try {
      const fill = await enrichFromFeed(entry);
      Object.assign(entry, fill);
    } catch (err) {
      console.warn(
        `⚠️ auto-complétion impossible (${err instanceof Error ? err.message : String(err)}) — entrée créée sans description/site/auteur.`,
      );
    }
  }

  // Tags : mot-clés sur nom + description (flux) + catégorie.
  const proposed = suggestTags(entry);
  if (proposed.length > 0) entry.tags = proposed;

  const file = path.join("entries", language ?? "", `${groupId}.json`);
  const abs = path.join(paths.root, file);
  const existing = readJsonIfExists<SourceEntry[]>(abs) ?? [];
  const merged = [...existing.filter((e) => slugify(e.name) !== slug), entry].sort((a, b) =>
    slugify(a.name).localeCompare(slugify(b.name)),
  );

  if (asJson) {
    // sortie machine : le JSON seul sur stdout (l'écriture reste possible hors --dry-run)
    if (!dryRun) writeJson(abs, merged);
    console.log(JSON.stringify({ file, slug, entry }, null, 2));
    return;
  }
  if (dryRun) {
    console.log(`dry-run : ${file} · ${merged.length} entrée(s) · slug « ${slug} » (non écrit)`);
    return;
  }

  writeJson(abs, merged);
  console.log(`✅ ${file} (${merged.length} entrée(s)) — slug « ${slug} »`);
  console.log("→ La CI validera (structure + doublons + flux) avant ouverture de la PR.");
}

main().catch((err: unknown) => {
  console.error("❌ échec de la génération :", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
