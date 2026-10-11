/**
 * Filtre « âge » : un ou plusieurs **âges exacts** (2, 3, …, 11 ans et plus).
 *
 * Chaque tranche couvre une plage **inclusive** (`ageMin`–`ageMax`, lus dans
 * `groups/groups.json` via `dist/index.json`). Une borne partagée — 5 ans, 7 ans —
 * appartient aux **deux** tranches : le filtre fait donc l'**union** des tranches
 * qui couvrent les âges cochés, jamais l'intersection. Aucun podcast de frontière
 * n'est ainsi caché à tort.
 */
import type { ManifestGroup } from "./types";

/** Case à cocher du filtre (sans compteur, qui dépend du contexte de la page). */
export interface AgeChoice {
  /** Valeur brute (`data-age`, paramètre `?ages=`) : `2` … `11`. */
  age: number;
  /** Libellé court affiché sur la pastille : `5` ou `11+`. */
  shortLabel: string;
  /** Libellé complet, pour l'accessibilité et l'info-bulle : « 5 ans ». */
  longLabel: string;
}

/** Âge minimal couvert par le catalogue. */
function minAge(groups: ManifestGroup[]): number | undefined {
  const ages = groups.map((group) => group.ageMin);
  return ages.length > 0 ? Math.min(...ages) : undefined;
}

/** Premier âge « ouvert » (`ageMax: null`) : `11 ans et plus`. */
function openFrom(groups: ManifestGroup[]): number | undefined {
  const open = groups.filter((group) => group.ageMax === null);
  return open.length > 0 ? Math.min(...open.map((group) => group.ageMin)) : undefined;
}

/**
 * Tous les âges cliquables, dans l'ordre.
 *
 * La liste s'arrête à l'âge ouvert : `11+` signifie « 11 ans et plus », il n'y a
 * pas de pastilles au-delà. Un groupe sans borne haute est donc couvert par sa
 * seule pastille ouverte.
 */
export function ageChoices(groups: ManifestGroup[]): AgeChoice[] {
  const from = minAge(groups);
  const open = openFrom(groups);
  if (from === undefined) return [];
  const finiteMax = Math.max(...groups.map((group) => group.ageMax ?? group.ageMin), open ?? from);
  const choices: AgeChoice[] = [];
  for (let age = from; age <= finiteMax; age++) {
    const isOpen = open !== undefined && age >= open;
    choices.push({
      age,
      shortLabel: isOpen ? `${age}+` : String(age),
      longLabel: isOpen ? `${age} ans et plus` : `${age} ans`,
    });
  }
  return choices;
}

/** L'âge `age` relève-t-il de cette tranche (bornes inclusives) ? */
export function coversAge(group: ManifestGroup, age: number): boolean {
  if (age < group.ageMin) return false;
  return group.ageMax === null ? age >= group.ageMin : age <= group.ageMax;
}

/** Âges exacts couverts par une tranche, arrêtés à l'âge ouvert du catalogue. */
export function agesOfGroup(group: ManifestGroup, groups: ManifestGroup[]): number[] {
  const open = openFrom(groups);
  const to = group.ageMax ?? open ?? group.ageMin;
  const ages: number[] = [];
  for (let age = group.ageMin; age <= to; age++) ages.push(age);
  return ages;
}

/** `2,3,4,5` → `[2, 3, 4, 5]` — valeurs invalides ignorées, tri croissant, sans doublon. */
export function parseAges(raw: string | undefined | null): number[] {
  if (!raw) return [];
  const seen = new Set<number>();
  for (const part of raw.split(",")) {
    const age = Number(part);
    if (Number.isInteger(age) && age >= 0) seen.add(age);
  }
  return [...seen].sort((a, b) => a - b);
}

/** `[2, 5]` → `"2,5"` (paramètre d'URL `?ages=`). */
export function serializeAges(ages: Iterable<number>): string {
  return [...new Set(ages)].sort((a, b) => a - b).join(",");
}

/**
 * Union des âges cochés : la fiche reste visible si elle couvre **au moins un**
 * âge sélectionné (un âge de frontière — 5 ou 7 ans — appartient à deux tranches,
 * on ne veut donc jamais masquer l'une ou l'autre). Sans âge coché, le filtre est
 * inactif.
 *
 * `dataAges` est l'attribut `data-ages` de la fiche (`"2,3,4,5"`).
 */
export function matchesAnyAge(dataAges: string | undefined, selected: Set<number>): boolean {
  if (selected.size === 0) return true;
  if (!dataAges) return false;
  for (const raw of dataAges.split(",")) {
    if (selected.has(Number(raw))) return true;
  }
  return false;
}

/** « 2, 3, 4 et 5 » — libellé lisible des âges couverts, pour les badges et aides. */
export function formatAges(ages: number[]): string {
  if (ages.length === 0) return "";
  if (ages.length === 1) return `${ages[0]}`;
  return `${ages.slice(0, -1).join(", ")} et ${ages[ages.length - 1]}`;
}
