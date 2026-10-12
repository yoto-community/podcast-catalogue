import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import { FEED_CACHE_TTL_MS, USER_AGENT } from "./config.ts";
import type { FeedResult, ParsedFeed, ParsedItem } from "./types.ts";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
  processEntities: true,
  ignoreDeclaration: true,
});

const RETRY_DELAYS_MS = [1_000, 5_000, 15_000];
const FETCH_TIMEOUT_MS = 10_000;

export class FeedFetchError extends Error {
  constructor(
    readonly url: string,
    message: string,
    readonly transient: boolean,
  ) {
    super(message);
    this.name = "FeedFetchError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cacheFile(url: string): string {
  const hash = crypto.createHash("sha1").update(url).digest("hex");
  return path.join(`${hash}.json`);
}

interface CacheEntry {
  url: string;
  fetchedAt: string;
  xml: string;
  finalUrl?: string;
}

function readCache(file: string): CacheEntry | undefined {
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as CacheEntry;
  } catch {
    return undefined;
  }
}

/** Récupère un flux XML avec cache disque 24 h, 3 tentatives et backoff. */
export async function fetchFeed(
  url: string,
  opts: { refresh?: boolean; offline?: boolean; cacheDir: string } = { cacheDir: "" },
): Promise<FeedResult> {
  const file = path.join(opts.cacheDir, cacheFile(url));
  if (!opts.refresh && fs.existsSync(file)) {
    try {
      const cached = JSON.parse(fs.readFileSync(file, "utf8")) as CacheEntry;
      const age = Date.now() - new Date(cached.fetchedAt).getTime();
      if (age < FEED_CACHE_TTL_MS) {
        return {
          url,
          xml: cached.xml,
          fetchedAt: cached.fetchedAt,
          fromCache: true,
          finalUrl: cached.finalUrl,
        };
      }
    } catch {
      // cache corrompu → on retélécharge
    }
  }
  if (opts.offline) {
    const cached = readCache(file);
    if (cached) {
      return {
        url,
        xml: cached.xml,
        fetchedAt: cached.fetchedAt,
        fromCache: true,
        finalUrl: cached.finalUrl,
      };
    }
    throw new FeedFetchError(url, "hors-ligne et absent du cache", false);
  }

  try {
    let lastError = "";
    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const res = await fetch(url, {
          signal: controller.signal,
          redirect: "follow",
          headers: {
            "user-agent": USER_AGENT,
            accept: "application/rss+xml, application/xml, text/xml, */*",
          },
        });
        clearTimeout(timer);
        if (res.status >= 500) throw new Error(`HTTP ${res.status} (transitoire)`);
        if (!res.ok) throw new FeedFetchError(url, `HTTP ${res.status}`, false);
        const xml = await res.text();
        if (!xml.trim()) throw new Error("corps vide (transitoire)");
        const fetchedAt = new Date().toISOString();
        const finalUrl = res.url || url;
        fs.mkdirSync(opts.cacheDir, { recursive: true });
        fs.writeFileSync(
          file,
          JSON.stringify({ url, fetchedAt, xml, finalUrl } satisfies CacheEntry),
          "utf8",
        );
        return { url, xml, fetchedAt, fromCache: false, finalUrl };
      } catch (err) {
        if (err instanceof FeedFetchError && !err.transient) throw err;
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt < RETRY_DELAYS_MS.length - 1) await sleep(RETRY_DELAYS_MS[attempt] ?? 1_000);
      }
    }
    throw new FeedFetchError(
      url,
      `injoignable après ${RETRY_DELAYS_MS.length} tentatives : ${lastError}`,
      true,
    );
  } catch (err) {
    // Panne transitoire du tiers (5xx, timeout, DNS) : on sert le cache périmé plutôt que
    // de faire échouer une PR — les flux réellement morts (4xx) restent détectés ci-dessus.
    const stale = err instanceof FeedFetchError && err.transient ? readCache(file) : undefined;
    if (stale) {
      return {
        url,
        xml: stale.xml,
        fetchedAt: stale.fetchedAt,
        fromCache: true,
        stale: true,
        finalUrl: stale.finalUrl,
      };
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ parsing */

function toArr<T = unknown>(value: unknown): T[] {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]) as T[];
}

function text(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("#text" in obj) return text(obj["#text"]);
    if ("@_href" in obj) return text(obj["@_href"]);
  }
  return undefined;
}

const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
};

/** Décodage des entités restantes (fast-xml-parser ne couvre pas les entités HTML). */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isNaN(code) ? full : String.fromCodePoint(code);
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isNaN(code) ? full : String.fromCodePoint(code);
    }
    return ENTITY_MAP[body.toLowerCase()] ?? full;
  });
}

export function stripHtml(input: string): string {
  return decodeEntities(
    input
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** `it is 45 min` / `34:12` / `1:02:03` / `1500` → secondes. */
export function parseDuration(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  const clock = value.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (clock) {
    const h = Number(clock[1] ?? 0);
    const m = Number(clock[2]);
    const s = Number(clock[3]);
    return h * 3600 + m * 60 + s;
  }
  if (/^\d+$/.test(value)) {
    const n = Number(value);
    // Une valeur > 10000 est plus sûrement des millisecondes.
    return n > 10_000 && n % 1000 === 0 ? Math.round(n / 1000) : n;
  }
  const minutes = value.match(/(\d+(?:[.,]\d+)?)\s*(?:min|minutes?)/i);
  if (minutes) return Math.round(Number((minutes[1] ?? "").replace(",", ".")) * 60);
  return undefined;
}

function parseDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function attr(node: unknown, name: string): string | undefined {
  if (node && typeof node === "object") {
    const value = (node as Record<string, unknown>)[`@_${name}`];
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

/** Parse un flux RSS 2.0 (majoritaire) ou Atom en structure normalisée. */
export function parseFeed(xml: string): ParsedFeed {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`XML illisible : ${err instanceof Error ? err.message : String(err)}`);
  }

  if (doc["rss"] !== undefined || doc["rdf:RDF"] !== undefined) {
    const rss = (doc["rss"] ?? doc["rdf:RDF"]) as Record<string, unknown>;
    const channel =
      toArr<Record<string, unknown>>(rss["channel"])[0] ?? ({} as Record<string, unknown>);
    return parseRssChannel(channel);
  }
  if (doc["feed"] !== undefined) {
    return parseAtom(doc["feed"] as Record<string, unknown>);
  }
  throw new Error("flux ni RSS ni Atom");
}

function parseRssChannel(channel: Record<string, unknown>): ParsedFeed {
  const items = toArr<Record<string, unknown>>(channel["item"]);
  const image = channel["image"] as Record<string, unknown> | undefined;

  let selfUrl: string | undefined;
  for (const link of toArr<Record<string, unknown>>(channel["atom:link"])) {
    if ((attr(link, "rel") ?? "self") === "self") selfUrl = attr(link, "href") ?? selfUrl;
  }

  const categories = toArr(channel["category"])
    .map((c) => text(c))
    .filter((c): c is string => Boolean(c));

  // itunes:owner/itunes:name pour l'organisation propriétaire
  const owner = channel["itunes:owner"] as Record<string, unknown> | undefined;
  const ownerName = text(owner?.["itunes:name"]);

  // <copyright> — mention de droit, souvent l'éditeur
  const copyright = text(channel["copyright"]);

  return {
    title: text(channel["title"]),
    description: text(channel["description"]) ?? text(channel["itunes:summary"]),
    link: text(channel["link"]),
    language: text(channel["language"]) ?? text(channel["itunes:language"]),
    imageUrl:
      attr(channel["itunes:image"], "href") ??
      text(image?.["url"]) ??
      text(channel["image"]) ??
      undefined,
    // author : itunes:author — pour author (animateur/créateur)
    author:
      text(channel["itunes:author"]) ??
      text(channel["managingEditor"]) ??
      text(channel["webMaster"]),
    // podcastAuthor : itunes:author — pour author (animateur/créateur)
    podcastAuthor: text(channel["itunes:author"]),
    // owner : organisation propriétaire (itunes:owner/itunes:name) — pour publisher
    owner: ownerName,
    // copyright : mention de droit — pour publisher
    copyright,
    categories,
    selfUrl,
    lastBuildDate: parseDate(text(channel["lastBuildDate"])),
    items: items.map(parseRssItem).filter((item): item is ParsedItem => item !== undefined),
  };
}

function parseRssItem(item: Record<string, unknown>): ParsedItem | undefined {
  const enclosure = toArr<Record<string, unknown>>(item["enclosure"])[0];
  const audioUrl = attr(enclosure, "url");
  const media = item["media:content"] as Record<string, unknown> | undefined;
  const mediaUrl = attr(media, "url");
  const type = attr(enclosure, "type") ?? attr(media, "type");
  const isAudio =
    (type?.startsWith("audio/") ?? false) ||
    /\.(mp3|m4a|aac|ogg|oga|opus|wav)(\?|$)/i.test(audioUrl ?? mediaUrl ?? "");

  const rawDuration = text(item["itunes:duration"]);
  const description =
    text(item["description"]) ?? text(item["content:encoded"]) ?? text(item["itunes:summary"]);

  return {
    title: text(item["title"]),
    description,
    link: text(item["link"]),
    pubDate: parseDate(text(item["pubDate"])) ?? parseDate(text(item["dc:date"])),
    durationSec: parseDuration(rawDuration),
    audioUrl: isAudio ? (audioUrl ?? mediaUrl) : undefined,
    audioType: type,
    imageUrl: attr(item["itunes:image"], "href"),
    episodeNumber: intOrNull(text(item["itunes:episode"])),
    seasonNumber: intOrNull(text(item["itunes:season"])),
    guid: text(item["guid"]),
  };
}

function parseAtom(feed: Record<string, unknown>): ParsedFeed {
  const entries = toArr<Record<string, unknown>>(feed["entry"]);
  const links = toArr<Record<string, unknown>>(feed["link"]);
  const atomLink = (rel: string): string | undefined => {
    const found = links.find((l) => (attr(l, "rel") ?? "alternate") === rel);
    return found ? attr(found, "href") : undefined;
  };

  const self = toArr<Record<string, unknown>>(feed["atom:link"]).find(
    (l) => (attr(l, "rel") ?? "self") === "self",
  );

  const atomAuthor =
    text((feed["author"] as Record<string, unknown> | undefined)?.["name"]) ?? text(feed["author"]);

  return {
    title: text(feed["title"]),
    description: text(feed["subtitle"]) ?? text(feed["tagline"]),
    link: atomLink("alternate") ?? text(feed["link"]),
    language: text(feed["language"]) ?? attr(feed, "xml:lang"),
    imageUrl: text(feed["logo"]) ?? text(feed["icon"]) ?? attr(feed["image"], "href"),
    author: atomAuthor,
    podcastAuthor: atomAuthor,
    owner: undefined,
    categories: toArr<Record<string, unknown>>(feed["category"])
      .map((c) => attr(c, "term"))
      .filter((c): c is string => Boolean(c)),
    selfUrl: self ? attr(self, "href") : undefined,
    lastBuildDate: parseDate(text(feed["updated"])),
    items: entries.map(parseAtomEntry).filter((e): e is ParsedItem => e !== undefined),
  };
}

function parseAtomEntry(entry: Record<string, unknown>): ParsedItem | undefined {
  const links = toArr<Record<string, unknown>>(entry["link"]);
  const enclosure = links.find((l) => (attr(l, "rel") ?? "") === "enclosure");
  const alternate = links.find((l) => (attr(l, "rel") ?? "alternate") === "alternate");
  const href = attr(enclosure, "href") ?? attr(alternate, "href");
  const type = attr(enclosure, "type") ?? attr(alternate, "type");
  const isAudio =
    (type?.startsWith("audio/") ?? false) || /\.(mp3|m4a|aac|ogg|opus|wav)(\?|$)/i.test(href ?? "");

  return {
    title: text(entry["title"]),
    description: text(entry["summary"]) ?? text(entry["content"]),
    link: attr(alternate, "href"),
    pubDate: parseDate(text(entry["published"])) ?? parseDate(text(entry["updated"])),
    durationSec: parseDuration(text(entry["media:duration"]) ?? text(entry["itunes:duration"])),
    audioUrl: isAudio ? href : undefined,
    audioType: type,
    imageUrl: attr(entry["media:thumbnail"], "url") ?? attr(entry["image"], "href"),
    episodeNumber: intOrNull(text(entry["itunes:episode"])),
    seasonNumber: intOrNull(text(entry["itunes:season"])),
    guid: text(entry["id"]),
  };
}

function intOrNull(raw: string | undefined): number | undefined {
  if (!raw || !/^\d+$/.test(raw.trim())) return undefined;
  const n = Number(raw.trim());
  return Number.isFinite(n) ? n : undefined;
}
