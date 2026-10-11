/**
 * Auto-taggage des entrées existantes basé sur nom + description + catégorie.
 *
 * ⚠️ Recalcul **complet** : les tags d'une entrée sont remplacés par la proposition.
 * Préférez `--dry-run` d'abord, et lancez `pnpm enrich` avant `--write` pour que
 * les descriptions lues dans les flux alimentent la détection de mots-clés.
 *
 * Usage : pnpm auto-tag [--dry-run] [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { paths } from "./lib/config.ts";
import { slugify } from "./lib/norm.ts";
import { suggestTags } from "./lib/tag.ts";
import type { SourceEntry } from "./lib/types.ts";

const DRY_RUN = process.argv.includes("--dry-run");
const WRITE = process.argv.includes("--write") && !DRY_RUN;

type TaggableEntry = SourceEntry & { description?: string };

function autoTagEntries(): void {
  const files = fs
    .readdirSync(paths.entries, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((langDir) =>
      fs
        .readdirSync(path.join(paths.entries, langDir.name), { withFileTypes: true })
        .filter((f) => f.isFile() && f.name.endsWith(".json"))
        .map((f) => ({
          lang: langDir.name,
          file: f.name,
          path: path.join(paths.entries, langDir.name, f.name),
        })),
    );

  let totalChanged = 0;
  let totalEntries = 0;

  for (const { lang, file, path: filePath } of files) {
    const raw = fs.readFileSync(filePath, "utf8");
    let entries: TaggableEntry[];
    try {
      entries = JSON.parse(raw);
    } catch {
      console.error(`❌ ${lang}/${file} : JSON invalide`);
      continue;
    }

    let fileChanged = false;
    for (const entry of entries) {
      totalEntries++;
      const validTags = suggestTags(entry);
      const previous = entry.tags;
      // `undefined` et `[]` expriment la même chose : on normalise toujours vers l'absence de champ.
      const unchanged =
        JSON.stringify(previous ?? []) === JSON.stringify(validTags) &&
        (validTags.length > 0 || previous === undefined);
      if (unchanged) continue;

      if (validTags.length > 0) entry.tags = validTags;
      else delete entry.tags;
      fileChanged = true;
      totalChanged++;
    }

    if (fileChanged) {
      entries.sort((a, b) => slugify(a.name).localeCompare(slugify(b.name)));

      const output = `${JSON.stringify(entries, null, 2)}\n`;
      if (WRITE) {
        fs.writeFileSync(filePath, output, "utf8");
        console.log(`✏️  ${lang}/${file} : ${entries.length} entrées, tags mis à jour`);
      } else if (DRY_RUN) {
        console.log(
          `🔍 ${lang}/${file} : ${entries.length} entrées, ${entries.filter((e) => (e.tags ?? []).length > 0).length} auraient des tags`,
        );
      }
    }
  }

  if (WRITE) {
    console.log(
      `\n✅ ${totalChanged}/${totalEntries} entrées taggées dans ${files.length} fichiers`,
    );
  } else if (DRY_RUN) {
    console.log(`\n🔍 Dry-run : ${totalChanged}/${totalEntries} entrée(s) changeraient`);
  } else if (totalChanged > 0) {
    console.log(
      `\n🔍 ${totalChanged}/${totalEntries} entrée(s) divergente(s) — ajoutez --write pour écrire, --dry-run pour le détail`,
    );
  } else {
    console.log(`\n✅ aucun changement (${totalEntries} entrées analysées)`);
  }
}

autoTagEntries();
