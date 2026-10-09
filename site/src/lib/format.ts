/** Formatage FR des données du catalogue (durées, dates, troncatures). */

const DATE_LONG = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });
const DATE_MEDIUM = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

/** 512 → « 8 min 32 s » · 3725 → « 1 h 02 min » · 60 → « 1 min ». */
export function formatDuration(seconds?: number): string | undefined {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return undefined;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  if (m > 0) return s > 0 ? `${m} min ${s} s` : `${m} min`;
  return `${s} s`;
}

/** Date ISO → « 2 oct. 2026 ». */
export function formatDate(iso?: string): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return DATE_MEDIUM.format(date);
}

/** Date ISO → « 9 octobre 2026 ». */
export function formatDateLong(iso?: string): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return DATE_LONG.format(date);
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

/** Pluriel simple des compteurs (« 1 podcast » / « 141 podcasts »). */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}
