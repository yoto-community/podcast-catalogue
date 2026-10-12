/**
 * Lecture partagée des corps d'issue GitHub (formulaires YAML → champs `**Clé** : valeur`).
 * Utilisé par `scripts/issue-to-entry.ts` (ajout) et `scripts/issue-to-fix.ts` (correction).
 */
import { normalizeName } from "./norm.ts";

/** Minuscules, sans accent, sans mise en forme Markdown, sans parenthèses ni `:` final. */
export function normalizeKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[*`_#]/g, "")
    .replace(/\s*\([^)]*\)/g, "") // « Éditeur (optionnel) » → « editeur »
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[:?]+$/, "");
}

/**
 * Extrait les paires `clé → valeur` d'un corps de Markdown, quel que soit le format :
 *
 * - formulaire d'issue GitHub : `### Champ` suivi de la réponse (jusqu'au champ suivant) ;
 * - Markdown classique : `**Clé** : valeur`, `- **Clé** : valeur`, `Clé : valeur`.
 *
 * Les clés sont normalisées (`normalizeKey`), les commentaires HTML retirés,
 * `_No response_` (champ vide du formulaire) est ignoré, la première occurrence gagne.
 */
export function parseIssueFields(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = body.split(/\r?\n/).map((line) => line.replace(/<!--[\s\S]*?-->/g, ""));
  let headingKey: string | undefined;
  let buffer: string[] = [];

  const clean = (value: string): string =>
    value
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*`_]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const flush = (): void => {
    if (headingKey && buffer.length > 0 && !(headingKey in out)) {
      const value = clean(buffer.join(" "));
      if (value && !/^no response$/i.test(value)) out[headingKey] = value;
    }
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const heading = trimmed.match(/^#{1,6}\s+(.+?)\s*$/);
    if (heading) {
      flush();
      headingKey = normalizeKey(heading[1] ?? "");
      continue;
    }
    if (headingKey) {
      if (trimmed) buffer.push(trimmed);
      continue;
    }
    const match =
      trimmed.match(/^\s*(?:[-*+]\s+)?(?:\*\*|__)?\s*([^:*\n][^:]*?)\s*(?:\*\*|__)?\s*:\s*(.+)$/) ??
      trimmed.match(/^\s*(?:[-*+]\s+)?([^:\n]+?)\s*:\s*(.+)$/);
    if (!match) continue;
    const key = normalizeKey(match[1] ?? "");
    const value = clean(match[2] ?? "");
    if (key && value && !(key in out)) out[key] = value;
  }
  flush();
  return out;
}

/**
 * Résout un id canonique depuis un id, un slug d'URL, un ancien id (`aliases`),
 * un libellé fr ou un libellé en — le formulaire d'issue n'a donc jamais besoin
 * d'être mis à jour quand on renomme une tranche.
 */
export function resolveId<
  T extends {
    id: string;
    label: string;
    slug?: string;
    aliases?: string[];
    translations?: Record<string, { label?: string }>;
  },
>(raw: string, items: T[]): string | undefined {
  const needle = normalizeName(raw);
  for (const item of items) {
    const labels = [
      item.id,
      item.slug ?? "",
      item.label,
      ...(item.aliases ?? []),
      ...Object.values(item.translations ?? {}).map((t) => t?.label ?? ""),
    ];
    if (labels.some((label) => label && normalizeName(label) === needle)) return item.id;
  }
  return undefined;
}

/** Résout une langue : code (`fr`/`en`), libellé, ou nom anglais courant. */
export function resolveLanguage(
  raw: string,
  languages: Array<{ code: string; label: string }>,
): string | undefined {
  const needle = normalizeName(raw);
  const aliases = { french: "fr", francais: "fr", english: "en", anglais: "en" } as const;
  const aliased = aliases[needle as keyof typeof aliases];
  if (aliased) return aliased;
  for (const lang of languages) {
    if (normalizeName(lang.code) === needle || normalizeName(lang.label) === needle)
      return lang.code;
  }
  return undefined;
}
