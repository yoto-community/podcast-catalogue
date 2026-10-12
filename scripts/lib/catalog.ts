import fs from "node:fs";
import path from "node:path";
import { paths, LIMITS } from "./config.ts";
import { readJson, readJsonIfExists } from "./io.ts";
import { slugify } from "./norm.ts";
import type {
  CategoryDef,
  GroupDef,
  GroupId,
  LanguageCode,
  LanguageDef,
  LoadedEntry,
  SourceEntry,
  TagDef,
} from "./types.ts";

export function loadGroups(): GroupDef[] {
  return readJson<GroupDef[]>(paths.groups);
}

export function loadCategories(): CategoryDef[] {
  return readJson<CategoryDef[]>(path.join(paths.reference, "categories.json"));
}

export function loadLanguages(): LanguageDef[] {
  return readJson<LanguageDef[]>(path.join(paths.reference, "languages.json"));
}

export function loadPublishers(): string[] {
  return readJsonIfExists<string[]>(path.join(paths.reference, "publishers.json")) ?? [];
}

export function loadTags(): TagDef[] {
  return readJson<TagDef[]>(path.join(paths.reference, "tags.json"));
}

/** Libellés d'une tranche dans une langue (repli sur le français). */
export function resolveGroupLabel(
  group: GroupDef,
  language: string,
): { label: string; ageRange: string } {
  const translated = group.translations?.[language];
  return translated ?? { label: group.label, ageRange: group.ageRange };
}

export function groupById(groups: GroupDef[], id: string): GroupDef | undefined {
  return groups.find((g) => g.id === id);
}

/**
 * Résout une valeur brute (id, slug d'URL ou ancien id) vers le groupe.
 * Sert au `?age=` de l'API et au formulaire d'issue, qui emploient des libellés
 * ou d'anciens identifiants.
 */
export function groupBySlugOrAlias(groups: GroupDef[], raw: string): GroupDef | undefined {
  const needle = raw.trim().toLowerCase();
  if (!needle) return undefined;
  return groups.find(
    (group) =>
      group.id.toLowerCase() === needle ||
      group.slug.toLowerCase() === needle ||
      (group.aliases ?? []).some((alias) => alias.toLowerCase() === needle),
  );
}

/**
 * Lit tous les fichiers `entries/<langue>/<tranche>.json`.
 * La langue vient du répertoire et la tranche du nom de fichier (champs dérivés interdits).
 */
export function loadEntries(): { entries: LoadedEntry[]; errors: string[] } {
  const groups = new Set(loadGroups().map((g) => g.id));
  const languages = new Set(loadLanguages().map((l) => l.code));
  const entries: LoadedEntry[] = [];
  const errors: string[] = [];

  let files: string[];
  try {
    files = listEntryFiles();
  } catch (err) {
    return {
      entries,
      errors: [`entries/ illisible : ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  for (const rel of files) {
    const language = path.dirname(rel);
    const groupId = path.basename(rel).replace(/\.json$/, "");
    const abs = path.join(paths.entries, rel);

    if (!languages.has(language)) {
      errors.push(`${rel} : langue « ${language} » inconnue (reference/languages.json)`);
      continue;
    }
    if (!groups.has(groupId)) {
      errors.push(`${rel} : tranche « ${groupId} » inconnue (groups/groups.json)`);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = readJson<unknown>(abs);
    } catch (err) {
      errors.push(`${rel} : JSON invalide — ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (!Array.isArray(parsed)) {
      errors.push(`${rel} : doit être un tableau d'entrées`);
      continue;
    }

    parsed.forEach((raw, index) => {
      const entry = raw as SourceEntry;
      const name = typeof entry?.name === "string" ? entry.name.trim() : "";
      entries.push({
        source: entry,
        file: `entries/${rel}`,
        line: index + 1,
        // validés ci-dessus : les unions viennent de schema/artifact.schema.json (même source)
        language: language as LanguageCode,
        groupId: groupId as GroupId,
        slug: slugify(name || `ligne-${index + 1}`),
      });
    });
  }
  return { entries, errors };
}

function listEntryFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const dirent of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = prefix ? `${prefix}/${dirent.name}` : dirent.name;
      if (dirent.isDirectory()) walk(path.join(dir, dirent.name), rel);
      else if (dirent.name.endsWith(".json")) out.push(rel);
    }
  };
  walk(paths.entries, "");
  return out.sort();
}

/** Tronque proprement une description à la limite de caractères. */
export function truncate(text: string, max: number = LIMITS.description): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : cut.length)}…`;
}
