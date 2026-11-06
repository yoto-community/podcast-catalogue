import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PREFS_KEY,
  PREFS_VERSION,
  TOOLKIT_KEY,
  TOOLKIT_VERSION,
  parsePrefs,
  parseToolkit,
  readPodcastFavorites,
  readPrefs,
  readToolkitWithLegacy,
  resolveTheme,
  syncPodcastFavorites,
  writePrefs,
  type SharedStorage,
} from "./shared-storage.ts";

const DATE = "2026-11-06";

function memoryStorage(initial: Record<string, string> = {}): SharedStorage & {
  values: Map<string, string>;
} {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("preferences", () => {
  it("parses a valid shared object and ignores unknown fields", () => {
    assert.deepEqual(parsePrefs(JSON.stringify({ version: 1, theme: "dark", locale: "fr" })), {
      version: PREFS_VERSION,
      theme: "dark",
      locale: "fr",
    });
    assert.deepEqual(parsePrefs(JSON.stringify({ version: 1, theme: "sepia", locale: "fr" })), {
      version: PREFS_VERSION,
      locale: "fr",
    });
  });

  it("falls back to the historical keys", () => {
    const storage = memoryStorage({ "yoto-icons-theme": "dark", "yoto-locale": "en" });
    assert.deepEqual(readPrefs(storage), { version: 1, theme: "dark", locale: "en" });
  });

  it("merges a preference without losing the other field", () => {
    const storage = memoryStorage({
      [PREFS_KEY]: JSON.stringify({ version: 1, theme: "dark", locale: "fr" }),
    });

    assert.equal(writePrefs({ locale: "en" }, storage), true);
    assert.deepEqual(JSON.parse(storage.values.get(PREFS_KEY) ?? "{}"), {
      version: 1,
      theme: "dark",
      locale: "en",
    });
  });

  it("resolves system, light and dark", () => {
    assert.equal(resolveTheme("system", true), "dark");
    assert.equal(resolveTheme("system", false), "light");
    assert.equal(resolveTheme("light", true), "light");
    assert.equal(resolveTheme("dark", false), "dark");
  });
});

describe("toolkit", () => {
  it("mirrors historical favourites until the new key exists", () => {
    const storage = memoryStorage({
      "yoto-icons-favorites": JSON.stringify(["icon-a"]),
      "yoto-favorites": JSON.stringify(["podcast-a"]),
    });

    assert.deepEqual(readToolkitWithLegacy(storage, DATE).items, [
      { type: "icon", id: "icon-a", title: "icon-a", addedAt: DATE },
      { type: "podcast", id: "podcast-a", title: "podcast-a", addedAt: DATE },
    ]);
  });

  it("uses the toolkit as the source of truth once it exists", () => {
    const storage = memoryStorage({
      [TOOLKIT_KEY]: JSON.stringify({
        version: 1,
        items: [{ type: "podcast", id: "podcast-b", title: "B", addedAt: DATE }],
      }),
      "yoto-favorites": JSON.stringify(["podcast-a"]),
    });

    assert.deepEqual(readPodcastFavorites(storage), ["podcast-b"]);
  });

  it("falls back to the historical key before the toolkit exists", () => {
    const storage = memoryStorage({
      "yoto-favorites": JSON.stringify(["podcast-a"]),
    });

    assert.deepEqual(readPodcastFavorites(storage), ["podcast-a"]);
  });

  it("replaces podcast items with titled favourites and preserves other types", () => {
    const storage = memoryStorage({
      [TOOLKIT_KEY]: JSON.stringify({
        version: 1,
        items: [
          { type: "podcast", id: "podcast-a", title: "Real A", addedAt: "2026-01-01" },
          { type: "icon", id: "icon-a", title: "Icon", addedAt: DATE },
        ],
      }),
    });

    assert.equal(
      syncPodcastFavorites(["podcast-a", "podcast-b"], { "podcast-b": "Real B" }, storage, DATE),
      true,
    );

    assert.deepEqual(parseToolkit(storage.values.get(TOOLKIT_KEY) ?? null, DATE).items, [
      { type: "icon", id: "icon-a", title: "Icon", addedAt: DATE },
      { type: "podcast", id: "podcast-a", title: "Real A", addedAt: "2026-01-01" },
      { type: "podcast", id: "podcast-b", title: "Real B", addedAt: DATE },
    ]);
  });

  it("keeps historical keys untouched when syncing the toolkit", () => {
    const storage = memoryStorage({
      "yoto-icons-favorites": JSON.stringify(["icon-a"]),
      "yoto-favorites": JSON.stringify(["podcast-a"]),
    });

    syncPodcastFavorites(["podcast-b"], { "podcast-b": "B" }, storage, DATE);

    assert.equal(storage.values.get("yoto-icons-favorites"), JSON.stringify(["icon-a"]));
    assert.equal(storage.values.get("yoto-favorites"), JSON.stringify(["podcast-a"]));
  });

  it("never throws when storage is blocked", () => {
    assert.equal(
      syncPodcastFavorites(
        ["podcast-a"],
        {},
        {
          getItem: () => {
            throw new Error("blocked");
          },
          setItem: () => {
            throw new Error("blocked");
          },
        },
      ),
      false,
    );
  });

  it("uses the documented toolkit version", () => {
    assert.equal(TOOLKIT_VERSION, 1);
  });
});
