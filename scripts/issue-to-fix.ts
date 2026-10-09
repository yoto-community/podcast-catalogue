/**
 * Issue « Signaler un flux défaillant » → PR de correction sur `entries/`.
 *
 * Localise l'entrée (par nom ou par URL actuelle), applique la nouvelle URL de flux
 * et/ou la nouvelle couverture, contrôle l'unicité du flux, puis réécrit le fichier
 * (l'entrée garde son slug → sa position dans le tri).
 *
 * Usage :
 *   ISSUE_BODY='…' pnpm issue-to-fix [--dry-run] [--json]
 */
import fs from "node:fs";
import path from "node:path";
import { paths } from "./lib/config.ts";
import { loadEntries } from "./lib/catalog.ts";
import { readJson, writeJson } from "./lib/io.ts";
import { parseIssueFields } from "./lib/issue.ts";
import { normalizeUrl, slugify } from "./lib/norm.ts";
import { urlProblem } from "./lib/url.ts";
import type { SourceEntry } from "./lib/types.ts";

type Fix = "name" | "currentUrl" | "newUrl" | "newImage";

/** Clé normalisée de l'issue → rôle. */
const FIELD_ALIASES: Record<string, Fix> = {
  podcast: "name",
  nom: "name",
  "nom du podcast": "name",
  "podcast concerne": "name",
  flux: "currentUrl",
  "url actuelle": "currentUrl",
  "url actuelle du flux": "currentUrl",
  "flux actuel": "currentUrl",
  "url du flux": "currentUrl",
  "url du flux actuel": "currentUrl",
  "nouvelle url": "newUrl",
  "nouvelle url du flux": "newUrl",
  "nouvelle url rss": "newUrl",
  "nouveau flux": "newUrl",
  "flux corrige": "newUrl",
  "url corrigee": "newUrl",
  "nouvelle image": "newImage",
  "nouvelle couverture": "newImage",
  couverture: "newImage",
  image: "newImage",
};

function fieldValue(fields: Record<string, string>, role: Fix): string | undefined {
  const key = Object.keys(FIELD_ALIASES).find(
    (alias) => FIELD_ALIASES[alias] === role && alias in fields,
  );
  return key ? fields[key] : undefined;
}

function locate(
  fields: Record<string, string>,
  entries: ReturnType<typeof loadEntries>["entries"],
): { entry: (typeof entries)[number]; file: string } | undefined {
  const name = fieldValue(fields, "name");
  const currentUrl = fieldValue(fields, "currentUrl");
  const byName = name ? entries.filter((e) => e.slug === slugify(name)) : [];
  const byUrl = currentUrl
    ? entries.filter((e) => normalizeUrl(e.source.rssUrl) === normalizeUrl(currentUrl))
    : [];
  const matches = byName.length > 0 ? byName : byUrl;
  const [first] = matches;
  if (!first || matches.length !== 1) return undefined;
  return { entry: first, file: first.file };
}

function main(): void {
  const body = process.env.ISSUE_BODY ?? "";
  const dryRun = process.argv.includes("--dry-run");
  const asJson = process.argv.includes("--json");
  const errors: string[] = [];

  if (!body.trim()) {
    console.error('❌ ISSUE_BODY manquant — usage : ISSUE_BODY="$(…)" pnpm issue-to-fix');
    process.exit(2);
  }

  const fields = parseIssueFields(body);
  const { entries, errors: loadErrors } = loadEntries();
  errors.push(...loadErrors);

  const target = locate(fields, entries);
  if (!target) {
    const name = fieldValue(fields, "name");
    const currentUrl = fieldValue(fields, "currentUrl");
    errors.push(
      `podcast introuvable${name ? ` : « ${name} »` : ""}${currentUrl ? ` / flux « ${currentUrl} »` : ""}` +
        ` — précisez le nom exact du podcast ou l'URL actuelle du flux`,
    );
  }

  const newUrl = fieldValue(fields, "newUrl")?.trim();
  const newImage = fieldValue(fields, "newImage")?.trim();

  if (target && !newUrl && !newImage) {
    errors.push(
      "aucune correction fournie — indiquez `Nouvelle URL du flux` et/ou `Nouvelle image`",
    );
  }
  if (newUrl) {
    const problem = urlProblem(newUrl);
    if (problem) errors.push(`nouvelle URL : ${problem}`);
    else if (target) {
      const clash = entries.find(
        (e) =>
          e.slug !== target.entry.slug && normalizeUrl(e.source.rssUrl) === normalizeUrl(newUrl),
      );
      if (clash)
        errors.push(`cette URL est déjà utilisée par « ${clash.source.name} » (${clash.file})`);
    }
  }
  if (newImage) {
    const problem = urlProblem(newImage);
    if (problem) errors.push(`nouvelle image : ${problem}`);
  }

  if (errors.length > 0) {
    console.error(`❌ ${errors.length} problème(s) dans l'issue :`);
    for (const error of errors) console.error(`   · ${error}`);
    process.exit(1);
  }

  const { entry, file } = target as NonNullable<typeof target>;
  const updated: SourceEntry = { ...entry.source };
  const trace = (message: string): void => {
    if (!asJson) console.log(message);
  };
  if (newUrl && normalizeUrl(newUrl) !== normalizeUrl(updated.rssUrl)) {
    trace(`  🔧 rssUrl\n       ${updated.rssUrl}\n    →  ${newUrl}`);
    updated.rssUrl = newUrl;
  }
  if (newImage) {
    trace(
      updated.imageUrl
        ? `  🔧 imageUrl\n       ${updated.imageUrl}\n    →  ${newImage}`
        : "  🔧 imageUrl (renseignée)",
    );
    updated.imageUrl = newImage;
  }

  const abs = path.join(paths.root, file);
  const list = readJson<SourceEntry[]>(abs).map((e) =>
    slugify(e.name) === entry.slug ? updated : e,
  );

  if (asJson) {
    if (!dryRun) writeJson(abs, list);
    console.log(JSON.stringify({ file, slug: entry.slug, entry: updated }, null, 2));
    return;
  }
  if (dryRun) {
    console.log(`dry-run : ${file} · « ${entry.source.name} » (non écrit)`);
    return;
  }

  if (!fs.existsSync(path.dirname(abs))) fs.mkdirSync(path.dirname(abs), { recursive: true });
  writeJson(abs, list);
  console.log(`✅ ${file} — « ${entry.source.name} » corrigée`);
  console.log("→ La CI revalidera le flux avant ouverture de la PR.");
}

main();
