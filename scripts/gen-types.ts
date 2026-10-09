/**
 * Écrit les JSON Schema + le `.d.ts` générés :
 *
 *   schema/entry.schema.json       → une entrée source (entries/<langue>/<tranche>.json)
 *   schema/source-file.schema.json → le tableau d'un fichier source
 *   schema/artifact.schema.json    → une entrée publiée dans dist/
 *   schema/entry.schema.d.ts       → CatalogEntry / PublishedEntry (importés par scripts/lib/types.ts)
 *
 * Le calcul vit dans `scripts/lib/schema.ts` (limites/champs de config + enums de reference/).
 * La CI vérifie l'absence de dérive : `pnpm gen:types && git diff --exit-code schema/`.
 *
 * Usage : pnpm gen:types
 */
import fs from "node:fs";
import path from "node:path";
import { paths } from "./lib/config.ts";
import { writeJson } from "./lib/io.ts";
import { renderSchemas } from "./lib/schema.ts";

function main(): void {
  const { entry, sourceFile, artifact, dts } = renderSchemas();

  writeJson(path.join(paths.schema, "entry.schema.json"), entry);
  writeJson(path.join(paths.schema, "source-file.schema.json"), sourceFile);
  writeJson(path.join(paths.schema, "artifact.schema.json"), artifact);
  fs.writeFileSync(path.join(paths.schema, "entry.schema.d.ts"), `${dts}\n`, "utf8");

  console.log(
    "schema/ → entry.schema.json, source-file.schema.json, artifact.schema.json, entry.schema.d.ts",
  );
}

main();
