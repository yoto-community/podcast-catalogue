/** Formatage localisé des données du catalogue (durées, dates, troncatures). */

import type { Locale } from "./i18n";

export { plural } from "./i18n";

const DATE_FORMATS: Record<Locale, { long: Intl.DateTimeFormat; medium: Intl.DateTimeFormat }> = {
  fr: {
    long: new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }),
    medium: new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }),
  },
  en: {
    long: new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }),
    medium: new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }),
  },
};

/** 512 → « 8 min 32 s » · 3725 → « 1 h 02 min » · 60 → « 1 min ». */
export function formatDuration(seconds?: number, _locale: Locale = "fr"): string | undefined {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return undefined;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  if (m > 0) return s > 0 ? `${m} min ${s} s` : `${m} min`;
  return `${s} s`;
}

/** Date ISO → « 2 oct. 2026 » (ou « 2 Oct 2026 » en anglais). */
export function formatDate(iso?: string, locale: Locale = "fr"): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return DATE_FORMATS[locale].medium.format(date);
}

/** Date ISO → « 9 octobre 2026 » (ou « 9 October 2026 » en anglais). */
export function formatDateLong(iso?: string, locale: Locale = "fr"): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return DATE_FORMATS[locale].long.format(date);
}

/** Date ISO → attribut `datetime` sûr. */
export function isoDay(iso?: string): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

/** Tronque sans couper un mot, avec « … » final. */
export function truncate(value: string | undefined, max: number): string | undefined {
  if (!value) return undefined;
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
