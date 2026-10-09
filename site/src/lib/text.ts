/**
 * Normalisation partagée entre le build (index de recherche pré-calculé)
 * et le client (requête de l'utilisateur) : les deux doivent produire
 * exactement la même forme pour que « Écoute » trouve « ecoute ».
 */

/** Marques combinantes laissées par la décomposition NFD (accents). */
const COMBINING_MARKS = /[\p{Diacritic}]/gu;

/** Normalise une chaîne : sans accent, en minuscules, espaces réduits. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Concatène les champs recherchables d'une entrée, normalisés. */
export function searchIndex(...values: Array<string | undefined>): string {
  return normalizeText(values.filter(Boolean).join(" "));
}
