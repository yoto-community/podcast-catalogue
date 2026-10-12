/**
 * Validation du dépôt — 3 niveaux (plan §7).
 *
 *   Niveau 1 — structure   S1…S9   (< 5 s, synchrone)
 *   Niveau 2 — doublons    D1…D4   (< 5 s, synchrone, tout le dépôt)
 *   Niveau 3 — flux RSS    réseau   (uniquement les flux ciblés)
 *
 * Usage :
 *   pnpm validate                     structure + doublons
 *   pnpm validate --fix               + répare le tri/format des fichiers source
 *   pnpm validate:changed             + niveau 3 sur les flux modifiés vs origin/main
 *   pnpm validate:all                 + niveau 3 sur les 198 flux
 *   pnpm validate:dist                + S8 (artefacts dist/)
 *   options : --no-network (bypass `ci:skip-network`) · --report <fichier.md> · --json · --limit <n>
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  FORBIDDEN_SOURCE_FIELDS,
  LIMITS,
  MIN_AGE,
  OPTIONAL_SOURCE_FIELDS,
  REQUIRED_SOURCE_FIELDS,
  SCHEMA_VERSION,
  SHARD_MIN_ENTRIES,
  paths,
} from "./lib/config.ts";
import { readJson, writeJson } from "./lib/io.ts";
import { normalizeName, normalizeUrl, slugify } from "./lib/norm.ts";
import {
  groupById,
  loadCategories,
  loadEntries,
  loadGroups,
  loadLanguages,
  loadPublishers,
  loadTags,
} from "./lib/catalog.ts";
import { FeedFetchError, fetchFeed, parseFeed } from "./lib/rss.ts";
import { mapConcurrent } from "./lib/concurrent.ts";
import { renderSchemas } from "./lib/schema.ts";
import { urlProblem } from "./lib/url.ts";
import type { Finding, GroupDef, LoadedEntry, SourceEntry } from "./lib/types.ts";

const RSS_CONCURRENCY = 8;
const KNOWN_FIELDS = new Set<string>([...REQUIRED_SOURCE_FIELDS, ...OPTIONAL_SOURCE_FIELDS]);

type Options = {
  fix: boolean;
  rss: boolean;
  all: boolean;
  changed: boolean;
  dist: boolean;
  network: boolean;
  json: boolean;
  report?: string;
  limit?: number;
};

function parseArgs(argv: string[]): Options {
  const opt: Options = {
    fix: false,
    rss: false,
    all: false,
    changed: false,
    dist: false,
    network: true,
    json: false,
    limit: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--fix":
        opt.fix = true;
        break;
      case "--rss":
        opt.rss = true;
        break;
      case "--all":
        opt.all = true;
        opt.rss = true;
        break;
      case "--changed":
        opt.changed = true;
        opt.rss = true;
        break;
      case "--dist":
        opt.dist = true;
        break;
      case "--no-network":
        opt.network = false;
        break;
      case "--json":
        opt.json = true;
        break;
      case "--report":
        opt.report = argv[++i];
        break;
      case "--limit":
        opt.limit = Number(argv[++i]);
        break;
      default:
        console.error(`option inconnue : ${arg}`);
        process.exit(2);
    }
  }
  return opt;
}

const findings: Finding[] = [];
function add(finding: Finding): void {
  findings.push(finding);
}

/* ======================================================== niveau 1 — structure */

/** Comparaison insensible à l'ordre des clés (les objets sont reconstruits à chaque appel). */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) out[key] = canonical(source[key]);
    return out;
  }
  return value;
}

/**
 * S9 — les schéma publiés (`schema/*.json`, `schema/entry.schema.d.ts`) doivent être
 * exactement ceux que le code calcule : toute édition manuelle est une dérive.
 */
function checkSchemaDrift(): void {
  const expected = renderSchemas();
  const jsonFiles: Array<[string, unknown]> = [
    [path.join(paths.schema, "entry.schema.json"), expected.entry],
    [path.join(paths.schema, "source-file.schema.json"), expected.sourceFile],
    [path.join(paths.schema, "artifact.schema.json"), expected.artifact],
  ];
  const regenerate = "lancez `pnpm gen:types` et committez le résultat";

  for (const [file, want] of jsonFiles) {
    const rel = path.relative(paths.root, file);
    let got: unknown;
    try {
      got = readJson<unknown>(file);
    } catch {
      add({ severity: "error", rule: "S9", file: rel, message: `schéma absent — ${regenerate}` });
      continue;
    }
    if (JSON.stringify(canonical(got)) !== JSON.stringify(canonical(want))) {
      add({
        severity: "error",
        rule: "S9",
        file: rel,
        message: `schéma dérivé du code — ${regenerate}`,
      });
    }
  }

  const dtsFile = path.join(paths.schema, "entry.schema.d.ts");
  const relDts = path.relative(paths.root, dtsFile);
  let gotDts = "";
  try {
    gotDts = fs.readFileSync(dtsFile, "utf8");
  } catch {
    add({
      severity: "error",
      rule: "S9",
      file: relDts,
      message: `types générés absents — ${regenerate}`,
    });
    return;
  }
  if (gotDts !== `${expected.dts}\n`) {
    add({
      severity: "error",
      rule: "S9",
      file: relDts,
      message: `types générés dérivés — ${regenerate}`,
    });
  }
}

/**
 * S10 — tranches d'âge (`groups/groups.json`) : bornes `ageMin` / `ageMax` cohérentes.
 *
 * Le site filtre par **âge exact** en prenant l'union des tranches qui couvrent chaque
 * âge sélectionné. Il faut donc :
 *   - des bornes inclusives valides (`ageMin ≥ MIN_AGE`, `ageMax ≥ ageMin` ou `null`) ;
 *   - une couverture **continue** : aucun âge ne doit rester orphelin entre deux tranches ;
 *   - un seul repli ouvert (`ageMax: null`), sur la dernière tranche (`order`) ;
 *   - un `ageRange` affiché qui reflète les bornes — c'est lui que lisent les parents.
 *
 * Une borne **partagée** (5 ans, 7 ans) est voulue : un âge de frontière appartient aux
 * deux tranches, le filtre en union gère le chevauchement.
 */
function checkGroups(): void {
  const at = path.relative(paths.root, paths.groups);
  const groups = [...loadGroups()].sort((a, b) => a.order - b.order);
  if (groups.length === 0) {
    add({ severity: "error", rule: "S10", file: at, message: "aucune tranche définie" });
    return;
  }

  const openEnded: GroupDef[] = [];
  const bounds = new Map<string, GroupDef>();
  /** Plage lisible d'une tranche, ex. `5 – 7 ans` ou `11 ans et plus`. */
  const span = (group: GroupDef): string =>
    group.ageMax === null ? `${group.ageMin} ans et plus` : `${group.ageMin} – ${group.ageMax} ans`;

  for (const group of groups) {
    const where = `« ${group.id} »`;
    if (!Number.isInteger(group.ageMin) || (group.ageMin as number) < MIN_AGE) {
      add({
        severity: "error",
        rule: "S10",
        file: at,
        message: `${where} : ageMin invalide (${JSON.stringify(group.ageMin)}) — entier ≥ ${MIN_AGE} attendu`,
      });
    }
    if (group.ageMax === null) {
      openEnded.push(group);
    } else if (!Number.isInteger(group.ageMax) || (group.ageMax as number) < group.ageMin) {
      add({
        severity: "error",
        rule: "S10",
        file: at,
        message: `${where} : ageMax invalide (${JSON.stringify(group.ageMax)}) — entier ≥ ageMin, ou null pour une tranche ouverte`,
      });
    }

    // Le libellé affiché doit dire exactement ce que disent les bornes.
    const expected = span(group);
    if (group.ageRange !== expected) {
      add({
        severity: "warning",
        rule: "S10",
        file: at,
        message: `${where} : ageRange « ${group.ageRange} » ≠ bornes « ${expected} » — l'affichage et les bornes divergent`,
      });
    }

    const key = `${group.ageMin}-${group.ageMax}`;
    const twin = bounds.get(key);
    if (twin) {
      add({
        severity: "warning",
        rule: "S10",
        file: at,
        message: `${where} et « ${twin.id} » couvrent la même plage (${key})`,
      });
    } else {
      bounds.set(key, group);
    }
  }

  if (openEnded.length > 1) {
    add({
      severity: "error",
      rule: "S10",
      file: at,
      message: `tranches ouvertes (ageMax null) : ${openEnded.map((g) => `« ${g.id} »`).join(", ")} — une seule est admise`,
    });
  } else if (openEnded.length === 1) {
    const open = openEnded[0] as GroupDef;
    const last = groups[groups.length - 1] as GroupDef;
    if (open !== last) {
      add({
        severity: "error",
        rule: "S10",
        file: at,
        message: `« ${open.id} » est ouverte (ageMax null) mais n'est pas la dernière tranche (order)`,
      });
    }
  }

  const pairs = groups.slice(1).map((next, index) => ({ prev: groups[index] as GroupDef, next }));
  for (const { prev, next } of pairs) {
    if (prev.ageMax === null || !Number.isInteger(prev.ageMax) || !Number.isInteger(next.ageMin)) {
      continue;
    }
    const prevMax: number = prev.ageMax;
    if (next.ageMin > prevMax + 1) {
      add({
        severity: "error",
        rule: "S10",
        file: at,
        message: `trou : « ${prev.id} » s'arrête à ${prevMax} ans et « ${next.id} » commence à ${next.ageMin} — l'âge ${prevMax + 1} ne relève d'aucune tranche`,
      });
    } else if (next.ageMin < prevMax) {
      add({
        severity: "warning",
        rule: "S10",
        file: at,
        message: `« ${next.id} » (${span(next)}) recouvre « ${prev.id} » (${span(prev)}) de plus d'un an — seules les bornes partagées sont attendues`,
      });
    }
  }
}

/**
 * S11 — identifiants de tranches : neutres, explicites, uniques.
 *
 * Un identifiant ne peut pas désigner une classe d'un pays : le catalogue est
 * international. Sous-règles :
 *   - S11a : `id` au format `age-<ageMin>-<ageMax>` (`age-<n>-plus` si ouvert) —
 *     un identifiant ne ment jamais sur les bornes ;
 *   - S11b : `id`, `slug` et `aliases` en minuscules ASCII kebab (≥ 3) et
 *     **globalement uniques** : aucune valeur ne peut désigner deux tranches ;
 *   - S11c : ni id ni slug n'est un code de langue (sinon `/fr/en/…`) ;
 *   - S11d : une langue du catalogue sans libellés traduits ferait retomber ses
 *     pages sur le français.
 *
 * Renommer une tranche exige donc d'ajouter l'ancienne valeur dans `aliases` :
 * c'est elle qui alimente les redirections du site et le `?age=` rétrocompatible.
 */
function checkGroupNames(entries: LoadedEntry[]): void {
  const at = path.relative(paths.root, paths.groups);
  const groups = loadGroups();
  const languageCodes = new Set(loadLanguages().map((l) => l.code));
  const TOKEN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  /** Valeur déjà employée → groupe propriétaire (id, slug ou alias). */
  const taken = new Map<string, string>();

  const claim = (value: string | undefined, owner: string, field: string): void => {
    if (value === undefined || value === "") {
      add({
        severity: "error",
        rule: "S11b",
        file: at,
        message: `${owner} : champ « ${field} » manquant`,
      });
      return;
    }
    const key = value.toLowerCase();
    const holder = taken.get(key);
    if (holder !== undefined && holder !== owner) {
      add({
        severity: "error",
        rule: "S11b",
        file: at,
        message: `${field} « ${value} » déjà employé par ${holder} — id, slug et aliases doivent être uniques`,
      });
      return;
    }
    taken.set(key, owner);
    if (!TOKEN.test(value) || value.length < 3) {
      add({
        severity: "error",
        rule: "S11b",
        file: at,
        message: `${owner} : ${field} « ${value} » invalide — minuscules ASCII, chiffres et tirets attendus (≥ 3 caractères)`,
      });
    }
    if (languageCodes.has(value)) {
      add({
        severity: "error",
        rule: "S11c",
        file: at,
        message: `${owner} : ${field} « ${value} » est aussi un code de langue (reference/languages.json) — segment d'URL ambigu`,
      });
    }
  };

  for (const group of groups) {
    const where = `« ${group.id} »`;
    const span =
      group.ageMax === null
        ? `${group.ageMin} ans et plus`
        : `${group.ageMin} – ${group.ageMax} ans`;
    const expected =
      group.ageMax === null ? `age-${group.ageMin}-plus` : `age-${group.ageMin}-${group.ageMax}`;
    if (group.id !== expected) {
      add({
        severity: "error",
        rule: "S11a",
        file: at,
        message: `${where} : id ≠ bornes attendu « ${expected} » — l'identifiant doit décrire la plage (${span})`,
      });
    }
    claim(group.slug, where, "slug");
    for (const alias of group.aliases ?? []) claim(alias, where, "alias");
  }

  // S11d — chaque langue qui a des entrées doit avoir ses libellés de tranche.
  const translated = new Set(entries.map((entry) => entry.language));
  for (const language of translated) {
    if (language === "fr") continue; // langue de référence : champs de tête
    for (const group of groups) {
      const label = group.translations?.[language]?.label;
      const ageRange = group.translations?.[language]?.ageRange;
      if (!label || !ageRange) {
        add({
          severity: "error",
          rule: "S11d",
          file: at,
          message: `« ${group.id} » (${group.label}) : traductions « ${language} » incomplètes (label${label ? "" : ", ageRange"}) — la page retomberait sur le français`,
        });
      }
    }
  }
}

function checkStructure(entries: LoadedEntry[], fix: boolean): LoadedEntry[] {
  const categories = new Set(loadCategories().map((c) => c.id));
  const languages = new Set(loadLanguages().map((l) => l.code));
  const groups = new Set(loadGroups().map((g) => g.id));

  for (const entry of entries) {
    const src = entry.source as unknown as Record<string, unknown>;
    const at = `${entry.file}`;

    // S3 — champs dérivés interdits
    for (const field of FORBIDDEN_SOURCE_FIELDS) {
      if (field in src) {
        add({
          severity: "error",
          rule: "S3",
          file: at,
          entry: String(src["name"] ?? ""),
          message: `champ interdit « ${field} » — il est dérivé du chemin (language, tranche) ou de l'état applicatif`,
        });
      }
    }

    // S1 — champs inconnus (fautes de frappe) + obligatoires
    for (const key of Object.keys(src)) {
      if (!KNOWN_FIELDS.has(key)) {
        add({
          severity: "error",
          rule: "S1",
          file: at,
          entry: String(src["name"] ?? `ligne ${entry.line}`),
          message: `champ inconnu « ${key} » (autorisés : ${[...KNOWN_FIELDS].join(", ")})`,
        });
      }
    }
    for (const field of REQUIRED_SOURCE_FIELDS) {
      const value = src[field];
      if (typeof value !== "string" || !value.trim()) {
        add({
          severity: "error",
          rule: "S1",
          file: at,
          entry: String(src["name"] ?? `ligne ${entry.line}`),
          message: `champ obligatoire manquant ou vide : « ${field} »`,
        });
      }
    }
    for (const field of OPTIONAL_SOURCE_FIELDS) {
      const value = src[field];
      if (value !== undefined) {
        if (field === "tags") {
          if (!Array.isArray(value)) {
            add({
              severity: "error",
              rule: "S1",
              file: at,
              entry: String(src["name"] ?? ""),
              message: `« ${field} » doit être un tableau`,
            });
          }
        } else if (typeof value !== "string") {
          add({
            severity: "error",
            rule: "S1",
            file: at,
            entry: String(src["name"] ?? ""),
            message: `« ${field} » doit être une chaîne`,
          });
        }
      }
    }

    // S4 — emplacement (langue du dossier, tranche du fichier)
    if (!languages.has(entry.language)) {
      add({
        severity: "error",
        rule: "S4",
        file: at,
        message: `répertoire « ${entry.language} » inconnu (reference/languages.json)`,
      });
    }
    if (!groups.has(entry.groupId)) {
      add({
        severity: "error",
        rule: "S4",
        file: at,
        message: `tranche « ${entry.groupId} » inconnue (groups/groups.json)`,
      });
    }

    // S5 — longueurs
    const name = typeof src["name"] === "string" ? src["name"] : "";
    const description = typeof src["description"] === "string" ? src["description"] : "";
    const publisher = typeof src["publisher"] === "string" ? src["publisher"] : "";
    if (name.length > LIMITS.name) {
      add({
        severity: "error",
        rule: "S5",
        file: at,
        entry: name,
        message: `name : ${name.length} caractères (> ${LIMITS.name})`,
      });
    }
    if (description.length > LIMITS.description) {
      add({
        severity: "error",
        rule: "S5",
        file: at,
        entry: name,
        message: `description : ${description.length} caractères (> ${LIMITS.description}) — tronquez à un mot complet`,
      });
    }
    if (publisher.length > LIMITS.publisher) {
      add({
        severity: "error",
        rule: "S5",
        file: at,
        entry: name,
        message: `publisher : ${publisher.length} caractères (> ${LIMITS.publisher})`,
      });
    }
    const tags = Array.isArray(src["tags"]) ? src["tags"] : [];
    if (tags.length > LIMITS.tags) {
      add({
        severity: "error",
        rule: "S5",
        file: at,
        entry: name,
        message: `tags : ${tags.length} éléments (> ${LIMITS.tags})`,
      });
    }

    // S2 — enums
    const category = typeof src["category"] === "string" ? src["category"] : "";
    if (category && !categories.has(category)) {
      add({
        severity: "error",
        rule: "S2",
        file: at,
        entry: name,
        message: `catégorie « ${category} » inconnue (reference/categories.json)`,
      });
    }

    // S2b — tags (enum)
    const knownTags = new Set(loadTags().map((t) => t.id));
    for (const tag of tags) {
      if (typeof tag === "string" && !knownTags.has(tag)) {
        add({
          severity: "error",
          rule: "S2",
          file: at,
          entry: name,
          message: `tag « ${tag} » inconnu (reference/tags.json)`,
        });
      }
    }

    // S6 — sécurité URL (SSRF + https)
    const rssUrl = typeof src["rssUrl"] === "string" ? src["rssUrl"] : "";
    if (rssUrl) {
      const problem = urlProblem(rssUrl);
      if (problem)
        add({
          severity: "error",
          rule: "S6",
          file: at,
          entry: name,
          message: `rssUrl : ${problem}`,
        });
    }
    for (const field of ["imageUrl", "websiteUrl"] as const) {
      const value = src[field];
      if (typeof value === "string" && value) {
        const problem = urlProblem(value, { allowHttp: true });
        if (problem)
          add({
            severity: "error",
            rule: "S6",
            file: at,
            entry: name,
            message: `${field} : ${problem}`,
          });
        else if (value.startsWith("http://")) {
          add({
            severity: "warning",
            rule: "S6",
            file: at,
            entry: name,
            message: `${field} en http:// → bloqué comme mixed content sur le site, préférez https://`,
          });
        }
      }
    }

    // Éditeur inconnu → simple anti-typos (avertissement)
    const knownPublishers = KNOWN_PUBLISHERS;
    if (publisher && knownPublishers.length > 0 && !knownPublishers.includes(publisher)) {
      const near = knownPublishers.find((p) => normalizeName(p) === normalizeName(publisher));
      if (near) {
        add({
          severity: "warning",
          rule: "TYPO",
          file: at,
          entry: name,
          message: `« ${publisher} » ressemble à « ${near} » (reference/publishers.json)`,
        });
      }
    }
  }

  // S7 — tri par slug (auto-fixable)
  const byFile = new Map<string, LoadedEntry[]>();
  for (const entry of entries) {
    const list = byFile.get(entry.file) ?? [];
    list.push(entry);
    byFile.set(entry.file, list);
  }
  for (const [file, list] of byFile) {
    const slugs = list.map((e) => e.slug);
    const sorted = [...slugs].sort((a, b) => a.localeCompare(b));
    const wrongAt = slugs.findIndex((s, i) => s !== sorted[i]);
    if (wrongAt !== -1) {
      add({
        severity: "error",
        rule: "S7",
        file,
        entry: list[wrongAt]?.source.name,
        message: `entrées non triées par slug (attendu : ${sorted.slice(wrongAt, wrongAt + 3).join(", ")}…) — réparez avec « pnpm validate --fix »`,
      });
    }
  }

  if (fix) applyFix(byFile);
  return entries;
}

const KNOWN_PUBLISHERS = loadPublishers();

/** Réécrit les fichiers source : tri par slug, format imposé (S7 --fix). */
function applyFix(byFile: Map<string, LoadedEntry[]>): void {
  const fixed: string[] = [];
  for (const [file, list] of byFile) {
    const abs = path.join(paths.root, file);
    const before = fs.readFileSync(abs, "utf8");
    const sorted = [...list].sort((a, b) => a.slug.localeCompare(b.slug));
    const data = sorted.map((e) => e.source);
    writeJson(abs, data);
    const after = fs.readFileSync(abs, "utf8");
    if (before !== after) fixed.push(file);
  }
  if (fixed.length > 0)
    console.log(`🔧 --fix : ${fixed.length} fichier(s) réécrit(s) → ${fixed.join(", ")}`);
  else console.log("🔧 --fix : rien à réparer");
}

/* ========================================================== niveau 2 — doublons */

function checkDuplicates(entries: LoadedEntry[]): void {
  const byUrl = new Map<string, LoadedEntry>();
  const byName = new Map<string, LoadedEntry>();
  const bySlug = new Map<string, LoadedEntry>();

  for (const entry of entries) {
    const rssUrl = entry.source.rssUrl ?? "";
    const url = normalizeUrl(rssUrl);
    const existingUrl = byUrl.get(url);
    if (existingUrl) {
      add({
        severity: "error",
        rule: "D1",
        file: entry.file,
        entry: entry.source.name,
        message: `Doublon RSS : ${rssUrl} est déjà référencé par ${existingUrl.file} (ligne ${existingUrl.line}) → « ${existingUrl.source.name} » — modifier l'existant, ou fermer cette contribution si le flux a changé d'URL.`,
      });
    } else byUrl.set(url, entry);

    const name = normalizeName(entry.source.name);
    const existingName = byName.get(name);
    if (existingName) {
      add({
        severity: "error",
        rule: "D2",
        file: entry.file,
        entry: entry.source.name,
        message: `Doublon de nom : « ${entry.source.name} » existe déjà dans ${existingName.file} (ligne ${existingName.line}) → « ${existingName.source.name} ».`,
      });
    } else byName.set(name, entry);

    const existingSlug = bySlug.get(entry.slug);
    if (existingSlug) {
      add({
        severity: "error",
        rule: "D4",
        file: entry.file,
        entry: entry.source.name,
        message: `Slug en collision : « ${entry.slug} » est produit par deux noms différents (${existingSlug.source.name} / ${entry.source.name}) — les slugs doivent être uniques.`,
      });
    } else bySlug.set(entry.slug, entry);
  }
}

/* ============================================================ niveau 3 — flux */

interface FeedCheck {
  entry: LoadedEntry;
  status: "ok" | "warn" | "error" | "skipped";
}

async function checkFeeds(entries: LoadedEntry[], opts: Options): Promise<FeedCheck[]> {
  if (!opts.network) {
    console.warn("⛔ niveau 3 sauté (--no-network, équivalent label ci:skip-network)");
    return entries.map((entry) => ({ entry, status: "skipped" as const }));
  }
  const targets = opts.limit ? entries.slice(0, opts.limit) : entries;

  const results = await mapConcurrent(
    targets,
    RSS_CONCURRENCY,
    async (entry): Promise<FeedCheck> => {
      // Chaque worker écrit dans son propre collecteur : les statuts ne se mélangent pas.
      const local: Finding[] = [];
      await checkOneFeed(entry, local);
      findings.push(...local);
      const status = local.some((f) => f.severity === "error")
        ? "error"
        : local.some((f) => f.severity === "warning")
          ? "warn"
          : "ok";
      return { entry, status };
    },
  );

  // D3 — même flux sous deux URL (self-link identique)
  await checkSelfLinkDuplicates(targets);
  return results;
}

async function checkOneFeed(entry: LoadedEntry, sink: Finding[]): Promise<void> {
  const add = (f: Finding): void => {
    sink.push(f);
  };
  const src = entry.source;
  const at = entry.file;
  const name = src.name;

  let feed: Awaited<ReturnType<typeof fetchFeed>>;
  try {
    feed = await fetchFeed(src.rssUrl, { cacheDir: paths.cache });
  } catch (err) {
    if (err instanceof FeedFetchError) {
      add({
        severity: err.transient ? "warning" : "error",
        rule: err.transient ? "FEED_TRANSIENT" : "FEED_UNREACHABLE",
        file: at,
        entry: name,
        message: err.transient
          ? `réseau indisponible (${err.message}) — non vérifié, ni bloqué ni comptabilisé comme valide`
          : `flux injoignable : ${err.message}`,
      });
      return;
    }
    add({
      severity: "error",
      rule: "FEED_UNREACHABLE",
      file: at,
      entry: name,
      message: String(err),
    });
    return;
  }

  if (feed.stale) {
    add({
      severity: "warning",
      rule: "FEED_STALE_CACHE",
      file: at,
      entry: name,
      message: `tiers injoignable — vérification servie depuis le cache du ${feed.fetchedAt}`,
    });
  }

  let parsed;
  try {
    parsed = parseFeed(feed.xml);
  } catch (err) {
    add({
      severity: "error",
      rule: "FEED_INVALID",
      file: at,
      entry: name,
      message: `le document n'est pas un flux RSS/Atom exploitable — ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }

  if (feed.finalUrl?.startsWith("http://")) {
    add({
      severity: "warning",
      rule: "FEED_REDIRECT",
      file: at,
      entry: name,
      message: `le flux redirige vers ${feed.finalUrl} (http)`,
    });
  }

  // name ↔ <title>
  if (!parsed.title?.trim()) {
    add({
      severity: "error",
      rule: "FEED_NO_TITLE",
      file: at,
      entry: name,
      message: "flux sans <title> de canal",
    });
  } else if (!titleMatches(name, parsed.title)) {
    add({
      severity: "warning",
      rule: "NAME_MISMATCH",
      file: at,
      entry: name,
      message: `titre du flux « ${parsed.title.trim()} » ≠ nom de l'entrée (titres curés/localisés : vérifiez que c'est bien le même podcast)`,
    });
  }

  // épisodes audio
  const audioItems = parsed.items.filter((i) => i.audioUrl);
  if (audioItems.length === 0) {
    add({
      severity: "error",
      rule: "FEED_NO_AUDIO",
      file: at,
      entry: name,
      message: "aucun <item> avec enclosure audio — ce n’est pas un flux podcast",
    });
    return;
  }

  // https pour la fenêtre publiée (10 derniers) — règle de lecture du site §5.3
  const newest = audioItems.slice(0, 10);
  const newestHttps = newest.filter((i) => i.audioUrl!.startsWith("https://"));
  const anyHttps = audioItems.some((i) => i.audioUrl!.startsWith("https://"));
  if (newestHttps.length === 0) {
    add({
      severity: "error",
      rule: "AUDIO_HTTP",
      file: at,
      entry: name,
      message: `aucune des ${newest.length} dernières enclosures en https — l'écoute serait impossible sur le site (mixed content)`,
    });
  } else if (!anyHttps || newestHttps.length < newest.length) {
    const count = newest.length - newestHttps.length;
    add({
      severity: "warning",
      rule: "AUDIO_HTTP",
      file: at,
      entry: name,
      message: `${count} enclosure(s) récente(s) en http:// — lecture impossible pour ces épisodes`,
    });
  }

  // language ↔ dossier
  const declared = primaryLanguage(parsed.language);
  if (declared && declared !== entry.language) {
    add({
      severity: "error",
      rule: "LANG_MISMATCH",
      file: at,
      entry: name,
      message: `le flux déclare « ${parsed.language} » mais l'entrée est dans entries/${entry.language}/`,
    });
  } else if (!declared) {
    add({
      severity: "warning",
      rule: "LANG_UNDECLARED",
      file: at,
      entry: name,
      message: "flux sans <language> déclaré",
    });
  }

  // description : entrée ET flux vides → bloquant
  if (!src.description?.trim() && !parsed.description?.trim()) {
    add({
      severity: "error",
      rule: "DESCRIPTION_MISSING",
      file: at,
      entry: name,
      message: "ni description dans la source, ni description dans le flux",
    });
  }

  // imageUrl : idem
  const feedImage = parsed.imageUrl;
  if (!src.imageUrl && !feedImage) {
    add({
      severity: "error",
      rule: "IMAGE_MISSING",
      file: at,
      entry: name,
      message: "aucune image (source ni flux) — impossible d'afficher la carte",
    });
  }

  // publisher ↔ itunes:author
  if (
    src.publisher &&
    parsed.author &&
    normalizeName(src.publisher) !== normalizeName(parsed.author)
  ) {
    add({
      severity: "warning",
      rule: "PUBLISHER_MISMATCH",
      file: at,
      entry: name,
      message: `éditeur « ${src.publisher} » ≠ itunes:author « ${parsed.author} »`,
    });
  }

  // websiteUrl
  if (src.websiteUrl) {
    const ok = await headOk(src.websiteUrl);
    if (ok === false)
      add({
        severity: "warning",
        rule: "WEBSITE_DEAD",
        file: at,
        entry: name,
        message: `site en échec (4xx/5xx) : ${src.websiteUrl}`,
      });
  } else if (!parsed.link) {
    add({
      severity: "warning",
      rule: "WEBSITE_MISSING",
      file: at,
      entry: name,
      message: "aucun site web (source ni <link> du canal)",
    });
  }

  // image en échec
  const imageUrl = src.imageUrl ?? feedImage;
  if (imageUrl) {
    const ok = await headOk(imageUrl);
    if (ok === false)
      add({
        severity: "warning",
        rule: "IMAGE_DEAD",
        file: at,
        entry: name,
        message: `image en échec (4xx/5xx) : ${imageUrl}`,
      });
  }

  // fraîcheur
  const lastDate = newest[0]?.pubDate ? new Date(newest[0].pubDate) : undefined;
  if (lastDate && Date.now() - lastDate.getTime() > 24 * 30 * 24 * 3600 * 1000) {
    add({
      severity: "warning",
      rule: "FEED_STALE",
      file: at,
      entry: name,
      message: `dernier épisode du ${lastDate.toISOString().slice(0, 10)} (> 24 mois) — flux probablement abandonné`,
    });
  }
}

async function checkSelfLinkDuplicates(entries: LoadedEntry[]): Promise<void> {
  const bySelf = new Map<string, LoadedEntry>();
  await Promise.all(
    entries.map(async (entry) => {
      try {
        const feed = await fetchFeed(entry.source.rssUrl, { cacheDir: paths.cache });
        const self = parseFeed(feed.xml).selfUrl;
        if (!self) return;
        const key = normalizeUrl(self);
        const existing = bySelf.get(key);
        if (existing && existing.file !== entry.file) {
          add({
            severity: "error",
            rule: "D3",
            file: entry.file,
            entry: entry.source.name,
            message: `Doublon D3 : ce flux est aussi publié sous ${existing.file} → « ${existing.source.name} » (même <atom:link rel="self"> : ${self})`,
          });
        } else if (!existing) {
          bySelf.set(key, entry);
        }
      } catch {
        // injoignable : déjà signalé par checkOneFeed
      }
    }),
  );
}

function primaryLanguage(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const primary = raw.trim().split(/[-_]/)[0]?.toLowerCase();
  return primary && /^[a-z]{2,3}$/.test(primary) ? primary : undefined;
}

function titleMatches(name: string, title: string): boolean {
  const a = normalizeName(name);
  const b = normalizeName(title);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

/** HEAD rapide (5 s) — `undefined` si le serveur refuse HEAD mais répond. */
async function headOk(url: string): Promise<boolean | undefined> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    clearTimeout(timer);
    if (res.status === 405 || res.status === 501) return undefined;
    return res.ok;
  } catch {
    return undefined;
  }
}

/* ============================================================== ciblage --changed */

function changedEntries(entries: LoadedEntry[]): { targets: LoadedEntry[]; fallback: boolean } {
  let diff = "";
  for (const base of ["origin/main", "main"]) {
    try {
      diff = execSync(`git diff --name-only --diff-filter=ACMR ${base}...HEAD -- entries/`, {
        stdio: ["ignore", "pipe", "ignore"],
      }).toString();
      break;
    } catch {
      // base absente → on essaie la suivante
    }
  }
  if (!diff) return { targets: [], fallback: false };

  const files = new Set(
    diff
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );
  let addedUrls = "";
  try {
    addedUrls = execSync(`git diff -U0 --diff-filter=ACMR origin/main...HEAD -- entries/`, {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .split("\n")
      .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
      .map((line) => line.slice(1))
      .join("\n");
  } catch {
    // pas de diff détaillé → on retombe sur les fichiers entiers
  }

  const urls = new Set(
    [...addedUrls.matchAll(/"rssUrl"\s*:\s*"([^"]+)"/g)].map((m) => normalizeUrl(m[1] ?? "")),
  );
  if (urls.size > 0) {
    const targets = entries.filter((e) => urls.has(normalizeUrl(e.source.rssUrl)));
    return { targets, fallback: false };
  }
  return { targets: entries.filter((e) => files.has(e.file)), fallback: true };
}

/* ================================================================== niveau S8 */

function checkDist(): void {
  const indexPath = path.join(paths.dist, "index.json");
  if (!fs.existsSync(indexPath)) {
    add({
      severity: "error",
      rule: "S8",
      message: "dist/index.json absent — lancez « pnpm build »",
    });
    return;
  }
  const manifest = readJson<{
    schemaVersion: number;
    catalogVersion: string;
    counts: { total: number; byLanguage: Record<string, number> };
    shards: Array<{
      path: string;
      count: number;
      bytes: number;
      sha256: string;
      group: string | null;
    }>;
    full: { path: string; count: number; bytes: number; sha256: string };
  }>(indexPath);

  if (manifest.schemaVersion !== SCHEMA_VERSION) {
    add({
      severity: "error",
      rule: "S8",
      message: `schemaVersion ${manifest.schemaVersion} ≠ ${SCHEMA_VERSION}`,
    });
  }

  interface ArtifactEntry {
    slug: string;
    name: string;
    language: string;
    groupId: string;
    ageRange: string;
    category: string;
    publisher: string;
    rssUrl: string;
    imageUrl?: string;
    description?: string;
  }
  interface Artifact {
    count: number;
    entries: ArtifactEntry[];
  }

  const readArtifact = (rel: string): Artifact => {
    const abs = path.join(paths.dist, rel);
    const raw = fs.readFileSync(abs);
    const data = JSON.parse(raw.toString("utf8")) as Artifact;
    const sha = crypto.createHash("sha256").update(raw).digest("hex");
    const meta =
      rel === manifest.full.path ? manifest.full : manifest.shards.find((s) => s.path === rel);
    if (meta) {
      if (meta.bytes !== raw.byteLength)
        add({
          severity: "error",
          rule: "S8",
          message: `${rel} : bytes annoncés ${meta.bytes} ≠ réel ${raw.byteLength}`,
        });
      if (meta.sha256 !== sha)
        add({ severity: "error", rule: "S8", message: `${rel} : sha256 annoncé ≠ réel` });
    }
    if (data.count !== data.entries.length) {
      add({
        severity: "error",
        rule: "S8",
        message: `${rel} : count ${data.count} ≠ ${data.entries.length} entrées réelles`,
      });
    }
    return data;
  };

  const full = readArtifact(manifest.full.path);
  if (full.count !== manifest.counts.total) {
    add({
      severity: "error",
      rule: "S8",
      message: `catalog.json (${full.count}) ≠ manifest.counts.total (${manifest.counts.total})`,
    });
  }
  for (const shard of manifest.shards) {
    const data = readArtifact(shard.path);
    if (shard.group && data.count < SHARD_MIN_ENTRIES) {
      add({
        severity: "error",
        rule: "S8",
        message: `${shard.path} : éclat de tranche avec ${data.count} entrées (< seuil ${SHARD_MIN_ENTRIES})`,
      });
    }
    if (!shard.group && data.count >= SHARD_MIN_ENTRIES && manifest.shards.some((s) => s.group)) {
      add({
        severity: "error",
        rule: "S8",
        message: `${shard.path} : regroupement contenant ${data.count} entrées alors que des éclats par tranche existent (règle adaptative inversée)`,
      });
    }
    for (const e of data.entries) {
      for (const field of [
        "slug",
        "name",
        "language",
        "groupId",
        "ageRange",
        "category",
        "publisher",
        "rssUrl",
        "description",
      ] as const) {
        if (!e[field])
          add({
            severity: "error",
            rule: "S8",
            message: `${shard.path} → « ${e.name} » : champ de sortie manquant « ${field} » (dist doit être complet)`,
          });
      }
      if (!e.imageUrl)
        add({
          severity: "error",
          rule: "S8",
          message: `${shard.path} → « ${e.name} » : imageUrl manquante dans dist/`,
        });
    }
  }
}

/* ===================================================================== rapport */

function printFindings(): void {
  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  for (const f of [...errors, ...warnings]) {
    const icon = f.severity === "error" ? "❌" : "⚠️";
    const where = f.file ? `${f.file}${f.entry ? ` → « ${f.entry} »` : ""}` : "dist/";
    console.log(`${icon} [${f.rule}] ${where}\n    ${f.message}`);
  }
}

function summary(results: FeedCheck[]): string {
  const ok = results.filter((r) => r.status === "ok").length;
  const warn = results.filter((r) => r.status === "warn").length;
  const error = results.filter((r) => r.status === "error").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  const parts = [
    `${results.length} flux ciblés`,
    `${ok} ✅`,
    `${warn} ⚠️`,
    `${error} ❌`,
    ...(skipped ? [`${skipped} non vérifiés`] : []),
    `— global : ${errors} erreur(s), ${warnings} avertissement(s)`,
  ];
  return parts.join(" · ");
}

function writeReport(file: string, results: FeedCheck[]): void {
  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  const ok = results.filter((r) => r.status === "ok").length;
  const lines: string[] = [
    "## Validation du catalogue",
    "",
    `**${results.length} flux ciblés** · ${ok} ✅ · ${results.filter((r) => r.status === "warn").length} ⚠️ · ${results.filter((r) => r.status === "error").length} ❌ · ${errors.length} erreur(s) globale(s) · ${warnings.length} avertissement(s)`,
    "",
  ];
  if (errors.length > 0) {
    lines.push("### ❌ Bloquant", "");
    for (const f of errors)
      lines.push(
        `- **[${f.rule}]** ${f.file ?? "dist/"}${f.entry ? ` → « ${f.entry} »` : ""} — ${f.message}`,
      );
    lines.push("");
  }
  if (warnings.length > 0) {
    lines.push("### ⚠️ Avertissements", "");
    for (const f of warnings)
      lines.push(
        `- **[${f.rule}]** ${f.file ?? "dist/"}${f.entry ? ` → « ${f.entry} »` : ""} — ${f.message}`,
      );
    lines.push("");
  }
  if (errors.length === 0 && warnings.length === 0) lines.push("Tout est vert. ✅", "");
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, lines.join("\n"), "utf8");
  console.log(`📝 rapport → ${file}`);
}

/* ======================================================================= main */

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const { entries, errors: loadErrors } = loadEntries();
  for (const message of loadErrors) add({ severity: "error", rule: "S4", message });

  checkSchemaDrift();
  checkGroups();
  checkGroupNames(entries);
  checkStructure(entries, opts.fix);
  checkDuplicates(entries);

  let results: FeedCheck[] = [];
  if (opts.rss && opts.network) {
    let targets = entries;
    let label = `${entries.length} entrées`;
    if (opts.changed) {
      const changed = changedEntries(entries);
      targets = changed.targets;
      label = changed.fallback
        ? `${targets.length} entrées (fichiers modifiés, diff de lignes indisponible)`
        : `${targets.length} entrée(s) ajoutée(s)/modifiée(s)`;
    }
    console.log(`🔎 niveau 3 : ${label}`);
    results = await checkFeeds(targets, opts);
  } else if (opts.rss && !opts.network) {
    results = await checkFeeds(entries, opts);
  }

  if (opts.dist) checkDist();

  printFindings();
  if (opts.rss) console.log(`\n${summary(results)}`);
  if (opts.json)
    console.log(
      JSON.stringify(
        { findings, results: results.map((r) => ({ slug: r.entry.slug, status: r.status })) },
        null,
        2,
      ),
    );
  if (opts.report) writeReport(opts.report, results);

  const errorCount = findings.filter((f) => f.severity === "error").length;
  if (errorCount > 0) {
    console.error(`\n❌ ${errorCount} erreur(s) bloquante(s).`);
    process.exit(1);
  }
  const warnCount = findings.filter((f) => f.severity === "warning").length;
  console.log(`\n✅ structure + doublons OK${warnCount ? ` · ${warnCount} avertissement(s)` : ""}`);
}

main().catch((err: unknown) => {
  console.error("❌ validate échoué :", err instanceof Error ? err.stack : err);
  process.exit(1);
});
