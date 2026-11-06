/**
 * Shared same-origin storage used by every Yoto Community site.
 *
 * The podcast catalogue is the source of truth for `yoto-favorites`; this
 * module mirrors that list into the versioned toolkit so the portal and the
 * icons catalogue can read it. Preferences (`theme`, `locale`) use a single
 * shared key too.
 */

export type ThemePreference = "light" | "dark" | "system";
export type LocalePreference = "en" | "fr";

export const PREFS_VERSION = 1;
export const PREFS_KEY = "yoto-community:prefs:v1";
export const TOOLKIT_VERSION = 1;
export const TOOLKIT_KEY = "yoto-community:toolkit:v1";

const THEME_VALUES: readonly ThemePreference[] = ["light", "dark", "system"];
const LOCALE_VALUES: readonly LocalePreference[] = ["en", "fr"];

export interface Prefs {
  version: typeof PREFS_VERSION;
  theme?: ThemePreference;
  locale?: LocalePreference;
}

export type ToolkitItemType = "project" | "icon" | "podcast";

export interface ToolkitItem {
  type: ToolkitItemType;
  id: string;
  title: string;
  addedAt: string;
}

export interface Toolkit {
  version: typeof TOOLKIT_VERSION;
  items: ToolkitItem[];
}

export interface SharedStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const LEGACY_FAVORITES: readonly { key: string; type: ToolkitItemType }[] = [
  { key: "yoto-icons-favorites", type: "icon" },
  { key: "yoto-favorites", type: "podcast" },
];

function today(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function isTheme(value: unknown): value is ThemePreference {
  return typeof value === "string" && (THEME_VALUES as readonly string[]).includes(value);
}

function isLocale(value: unknown): value is LocalePreference {
  return typeof value === "string" && (LOCALE_VALUES as readonly string[]).includes(value);
}

function isItemType(value: unknown): value is ToolkitItemType {
  return value === "project" || value === "icon" || value === "podcast";
}

export function parsePrefs(raw: string | null): Prefs {
  if (!raw) return { version: PREFS_VERSION };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { version: PREFS_VERSION };
    }

    const record = parsed as Record<string, unknown>;
    if (record.version !== PREFS_VERSION) return { version: PREFS_VERSION };

    const prefs: Prefs = { version: PREFS_VERSION };
    if (isTheme(record.theme)) prefs.theme = record.theme;
    if (isLocale(record.locale)) prefs.locale = record.locale;
    return prefs;
  } catch {
    return { version: PREFS_VERSION };
  }
}

export function safeStorage(): SharedStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function readKey(storage: SharedStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function readPrefs(storage: SharedStorage | null = safeStorage()): Prefs {
  if (!storage) return { version: PREFS_VERSION };

  let prefs: Prefs;
  try {
    const raw = storage.getItem(PREFS_KEY);
    prefs = raw === null ? { version: PREFS_VERSION } : parsePrefs(raw);
  } catch {
    return { version: PREFS_VERSION };
  }

  if (!prefs.theme) {
    const legacyTheme = readKey(storage, "yoto-icons-theme");
    if (isTheme(legacyTheme)) prefs.theme = legacyTheme;
  }
  if (!prefs.locale) {
    const legacyLocale = readKey(storage, "yoto-locale") ?? readKey(storage, "locale");
    if (isLocale(legacyLocale)) prefs.locale = legacyLocale;
  }

  return prefs;
}

export function writePrefs(
  patch: Partial<Omit<Prefs, "version">>,
  storage: SharedStorage | null = safeStorage(),
): boolean {
  if (!storage) return false;

  try {
    const current = readPrefs(storage);
    storage.setItem(
      PREFS_KEY,
      JSON.stringify({
        ...current,
        ...patch,
        version: PREFS_VERSION,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): "light" | "dark" {
  if (preference === "system") return prefersDark ? "dark" : "light";
  return preference;
}

function normalizeItem(value: unknown, fallbackDate: string): ToolkitItem | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { type, id, title, addedAt } = record;

  if (!isItemType(type)) return null;
  if (typeof id !== "string" || id.trim() === "") return null;

  const cleanId = id.trim();
  return {
    type,
    id: cleanId,
    title: typeof title === "string" && title.trim() !== "" ? title.trim() : cleanId,
    addedAt: typeof addedAt === "string" && addedAt.trim() !== "" ? addedAt.trim() : fallbackDate,
  };
}

export function parseToolkit(raw: string | null, fallbackDate = today()): Toolkit {
  if (!raw) return { version: TOOLKIT_VERSION, items: [] };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { version: TOOLKIT_VERSION, items: [] };
    }

    const record = parsed as Record<string, unknown>;
    if (record.version !== TOOLKIT_VERSION || !Array.isArray(record.items)) {
      return { version: TOOLKIT_VERSION, items: [] };
    }

    const seen = new Set<string>();
    const items: ToolkitItem[] = [];
    for (const value of record.items) {
      const item = normalizeItem(value, fallbackDate);
      if (!item) continue;
      const key = `${item.type}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }

    return { version: TOOLKIT_VERSION, items };
  } catch {
    return { version: TOOLKIT_VERSION, items: [] };
  }
}

function readStringArray(storage: SharedStorage, key: string): string[] {
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string" && value !== "");
  } catch {
    return [];
  }
}

/** Read the new key, or mirror the historical favourites while it is absent. */
export function readToolkitWithLegacy(
  storage: SharedStorage | null = safeStorage(),
  fallbackDate = today(),
): Toolkit {
  if (!storage) return { version: TOOLKIT_VERSION, items: [] };

  const raw = readKey(storage, TOOLKIT_KEY);
  if (raw !== null) return parseToolkit(raw, fallbackDate);

  const items: ToolkitItem[] = [];
  for (const legacy of LEGACY_FAVORITES) {
    for (const id of readStringArray(storage, legacy.key)) {
      items.push({ type: legacy.type, id, title: id, addedAt: fallbackDate });
    }
  }
  return { version: TOOLKIT_VERSION, items };
}

/**
 * Podcast slugs. Once the shared toolkit exists it is the source of truth;
 * before that, the historical catalogue key is used so existing favourites
 * survive.
 */
export function readPodcastFavorites(storage: SharedStorage | null = safeStorage()): string[] {
  if (!storage) return [];

  const raw = readKey(storage, TOOLKIT_KEY);
  if (raw !== null) {
    return parseToolkit(raw)
      .items.filter((item) => item.type === "podcast")
      .map((item) => item.id);
  }
  return readStringArray(storage, "yoto-favorites");
}

/**
 * Replace the podcast slice of the toolkit with the current favourites,
 * keeping icon/project items untouched. Titles learned by the catalogue are
 * written so the portal can display real names.
 */
export function syncPodcastFavorites(
  favorites: Iterable<string>,
  titles: Record<string, string> = {},
  storage: SharedStorage | null = safeStorage(),
  fallbackDate = today(),
): boolean {
  if (!storage) return false;

  try {
    const current = readToolkitWithLegacy(storage, fallbackDate);
    const existing = new Map(
      current.items.filter((item) => item.type === "podcast").map((item) => [item.id, item]),
    );

    const ids = [...new Set(favorites)];
    const podcasts: ToolkitItem[] = ids.map((id) => {
      const previous = existing.get(id);
      return {
        type: "podcast",
        id,
        title: titles[id] || previous?.title || id,
        addedAt: previous?.addedAt || fallbackDate,
      };
    });

    const others = current.items.filter((item) => item.type !== "podcast");
    const items = [...others, ...podcasts];

    if (items.length === 0 && current.items.length === 0) return true;
    storage.setItem(TOOLKIT_KEY, JSON.stringify({ version: TOOLKIT_VERSION, items }));
    return true;
  } catch {
    return false;
  }
}
