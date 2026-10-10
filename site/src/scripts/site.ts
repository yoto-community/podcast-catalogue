/**
 * JavaScript vanilla partagé par toutes les pages (aucun framework client).
 *
 * Trois responsabilités :
 *  1. le **lecteur audio persistant** — l'élément vit dans le layout, hors `<main>` ;
 *     son état est conservé en mémoire de module et l'`<audio>` est recréé si besoin
 *     (la lecture ne redémarre jamais au changement de page) ;
 *  2. une **micro-routerisation** interne (fetch + remplacement de `<main>`) pour que
 *     la navigation n'interrompe pas la lecture ; sans JS, la navigation est classique ;
 *  3. les **filtres / recherche / tri** du catalogue (état `?q=` dans l'URL).
 */
import { normalizeText } from "../lib/text";
import { pageUrl } from "../lib/url";

/* ------------------------------------------------------------------ utilitaires */

function qs<T extends Element>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(selector);
}

function qsa<T extends Element>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

function pluralPodcasts(count: number): string {
  return `${count} podcast${count > 1 ? "s" : ""}`;
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/* -------------------------------------------------------------------- lecteur */

interface PlayerState {
  audioUrl: string;
  title: string;
  artist: string;
  album: string;
  externalUrl: string;
  image?: string;
  episodeId?: string;
}

interface PlayerDom {
  root: HTMLElement;
  audio: HTMLAudioElement;
  title: HTMLElement;
  artist: HTMLElement;
  toggle: HTMLButtonElement;
  iconPlay: SVGSVGElement;
  iconPause: SVGSVGElement;
  seek: HTMLInputElement;
  current: HTMLElement;
  duration: HTMLElement;
  external: HTMLAnchorElement;
  download: HTMLAnchorElement;
  error: HTMLElement;
  retry: HTMLButtonElement;
}

let playerState: PlayerState | null = null;
let playerDom: PlayerDom | null = null;
let userSeeking = false;

function readPlayerDom(): PlayerDom | null {
  const root = document.querySelector<HTMLElement>("[data-player]");
  if (!root) return null;
  const audio = qs<HTMLAudioElement>("[data-player-audio]", root);
  const title = qs<HTMLElement>("[data-player-title]", root);
  const artist = qs<HTMLElement>("[data-player-artist]", root);
  const toggle = qs<HTMLButtonElement>("[data-player-toggle]", root);
  const iconPlay = qs<SVGSVGElement>("[data-icon-play]", root);
  const iconPause = qs<SVGSVGElement>("[data-icon-pause]", root);
  const seek = qs<HTMLInputElement>("[data-player-seek]", root);
  const current = qs<HTMLElement>("[data-player-current]", root);
  const duration = qs<HTMLElement>("[data-player-duration]", root);
  const external = qs<HTMLAnchorElement>("[data-player-external]", root);
  const download = qs<HTMLAnchorElement>("[data-player-download]", root);
  const error = qs<HTMLElement>("[data-player-error]", root);
  const retry = qs<HTMLButtonElement>("[data-player-retry]", root);
  if (
    !audio ||
    !title ||
    !artist ||
    !toggle ||
    !iconPlay ||
    !iconPause ||
    !seek ||
    !current ||
    !duration ||
    !external ||
    !download ||
    !error ||
    !retry
  ) {
    return null;
  }
  return {
    root,
    audio,
    title,
    artist,
    toggle,
    iconPlay,
    iconPause,
    seek,
    current,
    duration,
    external,
    download,
    error,
    retry,
  };
}

function getPlayerDom(): PlayerDom | null {
  if (!playerDom) playerDom = readPlayerDom();
  return playerDom;
}

/**
 * Garantit qu'un seul `HTMLAudioElement` joue l'état en mémoire : si l'élément a été
 * perdu ou pointe une autre source, il est réécrit (position et état de lecture conservés).
 */
function ensureAudio(): HTMLAudioElement | null {
  const dom = getPlayerDom();
  if (!dom) return null;
  if (!playerState) return dom.audio;
  if (dom.audio.src === playerState.audioUrl) return dom.audio;

  const resumeAt = dom.audio.currentTime;
  const wasPlaying = !dom.audio.paused && !dom.audio.ended;
  const restore = (): void => {
    dom.audio.removeEventListener("loadedmetadata", restore);
    if (resumeAt > 0) {
      try {
        dom.audio.currentTime = resumeAt;
      } catch {
        /* metadata non prête : la lecture reprend au début */
      }
    }
    if (wasPlaying) void dom.audio.play().catch(() => showError());
  };
  dom.audio.addEventListener("loadedmetadata", restore);
  dom.audio.src = playerState.audioUrl;
  dom.audio.load();
  return dom.audio;
}

function showError(): void {
  const dom = getPlayerDom();
  if (!dom) return;
  dom.error.hidden = false;
  refreshPressedStates();
}

function clearError(): void {
  const dom = getPlayerDom();
  if (!dom) return;
  dom.error.hidden = true;
}

function updateToggleState(): void {
  const dom = getPlayerDom();
  if (!dom) return;
  const playing = !dom.audio.paused && !dom.audio.ended;
  dom.toggle.setAttribute("aria-label", playing ? "Pause" : "Lecture");
  dom.toggle.setAttribute("aria-pressed", String(playing));
  setIconVisible(dom.iconPlay, !playing);
  setIconVisible(dom.iconPause, playing);
  if ("mediaSession" in navigator)
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
}

/** `hidden` n'est pas typé sur les SVG : on pilote l'affichage en style inline. */
function setIconVisible(icon: SVGSVGElement, visible: boolean): void {
  icon.style.display = visible ? "" : "none";
}

function refreshPressedStates(): void {
  const dom = getPlayerDom();
  const playing = dom ? !dom.audio.paused && !dom.audio.ended : false;
  for (const button of qsa<HTMLElement>("[data-play]")) {
    const active =
      playing &&
      playerState !== null &&
      button.dataset.audio === playerState.audioUrl &&
      button.dataset.episode === playerState.episodeId;
    button.setAttribute("aria-pressed", String(active));
  }
}

function renderPlayerText(): void {
  const dom = getPlayerDom();
  if (!dom || !playerState) return;
  dom.title.textContent = playerState.title;
  dom.artist.textContent = `${playerState.artist} · ${playerState.album}`;
  dom.external.href = playerState.externalUrl;
  dom.download.href = playerState.audioUrl;
  dom.download.setAttribute("aria-label", `Télécharger « ${playerState.title} »`);
  dom.external.setAttribute(
    "aria-label",
    `Écouter « ${playerState.title} » sur le site de l’éditeur`,
  );
}

function updateMediaSession(state: PlayerState): void {
  if (!("mediaSession" in navigator)) return;
  const session = navigator.mediaSession;
  if (typeof MediaMetadata !== "undefined") {
    session.metadata = new MediaMetadata({
      title: state.title,
      artist: state.artist,
      album: state.album,
      artwork: state.image ? [{ src: state.image, sizes: "500x500", type: "image/jpeg" }] : [],
    });
  }
  const audio = getPlayerDom()?.audio;
  if (!audio) return;
  const setHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler): void => {
    try {
      session.setActionHandler(action, handler);
    } catch {
      /* action non supportée par le navigateur */
    }
  };
  setHandler("play", () => void audio.play().catch(() => showError()));
  setHandler("pause", () => audio.pause());
  setHandler("seekbackward", () => {
    audio.currentTime = Math.max(0, audio.currentTime - 10);
  });
  setHandler("seekforward", () => {
    const target = audio.currentTime + 10;
    audio.currentTime = Number.isFinite(audio.duration) ? Math.min(audio.duration, target) : target;
  });
  setHandler("stop", () => {
    audio.pause();
    audio.currentTime = 0;
  });
}

function showPlayer(): void {
  const dom = getPlayerDom();
  if (!dom) return;
  dom.root.hidden = false;
  document.body.classList.add("has-player");
}

function hidePlayer(): void {
  const dom = getPlayerDom();
  if (!dom) return;
  dom.root.hidden = true;
  document.body.classList.remove("has-player");
}

function playEpisode(data: PlayerState): void {
  const dom = getPlayerDom();
  if (!dom) return;
  const sameSource = playerState?.audioUrl === data.audioUrl;
  playerState = data;
  showPlayer();
  renderPlayerText();
  clearError();
  if (!sameSource) {
    dom.audio.src = data.audioUrl;
    try {
      dom.audio.currentTime = 0;
    } catch {
      /* les métadonnées ne sont pas encore chargées : la lecture démarre au début */
    }
  }
  updateMediaSession(data);
  const attempt = ensureAudio();
  if (attempt) void attempt.play().catch(() => showError());
}

function playNextEpisode(): void {
  const dom = getPlayerDom();
  if (!dom || !playerState) return;

  // Find all play buttons in the current episode list
  const playButtons = qsa<HTMLButtonElement>("[data-play]");
  if (playButtons.length === 0) return;

  // Find the index of the currently playing episode
  let currentIndex = -1;
  for (let i = 0; i < playButtons.length; i++) {
    const btn = playButtons[i];
    if (
      btn.dataset.audio === playerState.audioUrl &&
      btn.dataset.episode === playerState.episodeId
    ) {
      currentIndex = i;
      break;
    }
  }

  // If current episode not found or it's the last one, stop
  if (currentIndex === -1 || currentIndex >= playButtons.length - 1) return;

  // Get the next episode's button
  const nextButton = playButtons[currentIndex + 1];
  const nextAudioUrl = nextButton.dataset.audio;
  if (!nextAudioUrl) return;

  // Play the next episode
  playEpisode({
    audioUrl: nextAudioUrl,
    title: nextButton.dataset.title ?? "Épisode",
    artist: nextButton.dataset.artist ?? "Podcast",
    album: nextButton.dataset.album ?? "",
    externalUrl: nextButton.dataset.external ?? nextAudioUrl,
    image: nextButton.dataset.image || undefined,
    episodeId: nextButton.dataset.episode,
  });
}

function bindPlayer(): void {
  const dom = getPlayerDom();
  if (!dom) return;
  const audio = dom.audio;

  dom.toggle.addEventListener("click", () => {
    if (!playerState) return;
    if (audio.paused)
      void ensureAudio()
        ?.play()
        .catch(() => showError());
    else audio.pause();
  });

  dom.retry.addEventListener("click", () => {
    if (!playerState) return;
    clearError();
    audio.load();
    void audio.play().catch(() => showError());
  });

  qs<HTMLElement>("[data-player-close]", dom.root)?.addEventListener("click", () => {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    playerState = null;
    clearError();
    hidePlayer();
    refreshPressedStates();
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "none";
      navigator.mediaSession.metadata = null;
    }
  });

  dom.seek.addEventListener("pointerdown", () => {
    userSeeking = true;
  });
  dom.seek.addEventListener("pointerup", () => {
    userSeeking = false;
  });
  dom.seek.addEventListener("input", () => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = (Number(dom.seek.value) / 100) * audio.duration;
  });

  audio.addEventListener("loadedmetadata", () => {
    dom.duration.textContent = formatClock(audio.duration);
    dom.seek.disabled = !Number.isFinite(audio.duration) || audio.duration <= 0;
  });
  audio.addEventListener("timeupdate", () => {
    dom.current.textContent = formatClock(audio.currentTime);
    if (userSeeking || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    dom.seek.value = String((audio.currentTime / audio.duration) * 100);
  });
  audio.addEventListener("play", () => {
    updateToggleState();
    refreshPressedStates();
    clearError();
  });
  audio.addEventListener("pause", () => {
    updateToggleState();
    refreshPressedStates();
  });
  audio.addEventListener("ended", () => {
    updateToggleState();
    refreshPressedStates();
    playNextEpisode();
  });
  audio.addEventListener("error", () => {
    if (!playerState) return;
    showError();
    updateToggleState();
  });
}

/* -------------------------------------------------------------- micro-routeur */

function syncMeta(selector: string, content: string | null | undefined): void {
  if (!content) return;
  const meta = document.head.querySelector<HTMLMetaElement>(selector);
  if (meta) meta.content = content;
}

function syncCanonical(href: string | undefined): void {
  if (!href) return;
  const link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (link) link.href = href;
}

function syncJsonLd(doc: Document): void {
  const fresh = qsa<HTMLScriptElement>('script[type="application/ld+json"]', doc.head);
  for (const script of qsa<HTMLScriptElement>('script[type="application/ld+json"]')) {
    script.remove();
  }
  for (const script of fresh) {
    document.head.appendChild(document.importNode(script, true));
  }
}

/** Reprend les CSS/JS/manettes de la page récupérée (sans ré-exécuter les nôtres). */
function adoptHeadAssets(doc: Document): void {
  const styles = new Set(qsa<HTMLLinkElement>('link[rel="stylesheet"]').map((link) => link.href));
  for (const link of qsa<HTMLLinkElement>('link[rel="stylesheet"]', doc.head)) {
    if (!styles.has(link.href)) document.head.appendChild(document.importNode(link, true));
  }

  const stylesInlined = new Set(qsa<HTMLStyleElement>("style").map((style) => style.textContent));
  for (const style of qsa<HTMLStyleElement>("style", doc.head)) {
    if (!stylesInlined.has(style.textContent)) {
      document.head.appendChild(document.importNode(style, true));
    }
  }

  const scripts = new Set(qsa<HTMLScriptElement>("script").map((script) => script.src));
  for (const script of qsa<HTMLScriptElement>("script", doc.head)) {
    if (script.type === "application/ld+json") continue;
    if (script.src && !scripts.has(script.src)) {
      document.head.appendChild(document.importNode(script, true));
    }
  }
}

function adoptHead(doc: Document): void {
  document.title = doc.title;
  const description = doc.head
    .querySelector<HTMLMetaElement>('meta[name="description"]')
    ?.getAttribute("content");
  syncMeta('meta[name="description"]', description);
  syncMeta('meta[property="og:title"]', doc.title);
  syncMeta('meta[name="twitter:title"]', doc.title);
  syncMeta(
    'meta[property="og:description"]',
    doc.head.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content,
  );
  syncMeta(
    'meta[name="twitter:description"]',
    doc.head.querySelector<HTMLMetaElement>('meta[name="twitter:description"]')?.content,
  );
  syncMeta(
    'meta[property="og:url"]',
    doc.head.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content,
  );
  syncMeta(
    'meta[property="og:image"]',
    doc.head.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content,
  );
  syncCanonical(doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href);
  syncJsonLd(doc);
  adoptHeadAssets(doc);
}

function syncNavCurrent(): void {
  const clean = location.pathname.replace(/\/+$/, "") || "/";
  for (const link of qsa<HTMLAnchorElement>(".site-nav a")) {
    if (link.hasAttribute("data-search-link")) continue;
    const target = new URL(link.href, location.origin).pathname.replace(/\/+$/, "") || "/";
    const active =
      target === "/" ? clean === "/" : clean === target || clean.startsWith(`${target}/`);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

let navigationToken = 0;

async function navigate(url: URL, push: boolean): Promise<void> {
  const token = ++navigationToken;
  try {
    const response = await fetch(url.href, { headers: { accept: "text/html" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    if (token !== navigationToken) return;
    const doc = new DOMParser().parseFromString(html, "text/html");
    const currentMain = document.querySelector("main");
    const nextMain = doc.querySelector("main");
    if (!currentMain || !nextMain) {
      window.location.href = url.href;
      return;
    }
    adoptHead(doc);
    currentMain.replaceWith(nextMain);
    if (push) history.pushState({}, "", url.href);
    else history.replaceState({}, "", url.href);
    window.scrollTo(0, 0);
    initPage(true);
  } catch {
    window.location.href = url.href;
  }
}

function interceptClick(event: MouseEvent): void {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = event.target instanceof Element ? event.target.closest("a") : null;
  if (!anchor || anchor.hasAttribute("data-no-router") || anchor.hasAttribute("download")) return;
  if (anchor.target && anchor.target !== "_self") return;
  let url: URL;
  try {
    url = new URL(anchor.href, location.href);
  } catch {
    return;
  }
  if (url.origin !== location.origin) return;
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (url.pathname === location.pathname && url.search === location.search) return;
  event.preventDefault();
  void navigate(url, true);
}

/* --------------------------------------------------------- filtres et recherche */

interface CatalogRuntime {
  root: HTMLElement;
  list: HTMLElement;
  items: HTMLElement[];
  search: HTMLInputElement;
  count: HTMLElement;
  empty: HTMLElement;
  language?: HTMLSelectElement;
  group?: HTMLSelectElement;
  category?: HTMLSelectElement;
  sortButtons: HTMLButtonElement[];
}

function readCatalog(root: HTMLElement): CatalogRuntime | null {
  const list = qs<HTMLElement>("[data-list]", root);
  const search = qs<HTMLInputElement>("[data-search]", root);
  const count = qs<HTMLElement>("[data-count]", root);
  const empty = qs<HTMLElement>("[data-empty]", root);
  if (!list || !search || !count || !empty) return null;
  return {
    root,
    list,
    items: qsa<HTMLElement>("[data-entry]", list),
    search,
    count,
    empty,
    language: qs<HTMLSelectElement>('[data-filter="language"]', root) ?? undefined,
    group: qs<HTMLSelectElement>('[data-filter="group"]', root) ?? undefined,
    category: qs<HTMLSelectElement>('[data-filter="category"]', root) ?? undefined,
    sortButtons: qsa<HTMLButtonElement>("[data-sort]", root),
  };
}

function syncSearchUrl(value: string): void {
  const url = new URL(location.href);
  const trimmed = value.trim();
  if (trimmed) url.searchParams.set("q", trimmed);
  else url.searchParams.delete("q");
  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function applyFilters(runtime: CatalogRuntime): void {
  const query = normalizeText(runtime.search.value);
  const language = runtime.language?.value ?? "";
  const group = runtime.group?.value ?? "";
  const category = runtime.category?.value ?? "";
  let visible = 0;
  for (const item of runtime.items) {
    const data = item.dataset;
    const matches =
      (!language || data.language === language) &&
      (!group || data.group === group) &&
      (!category || data.category === category) &&
      (!query || (data.search ?? "").includes(query));
    item.hidden = !matches;
    if (matches) visible += 1;
  }
  runtime.count.textContent = pluralPodcasts(visible);
  runtime.empty.hidden = visible > 0;
}

function sortList(runtime: CatalogRuntime, key: string): void {
  const attribute = key === "category" ? "sortCategory" : "sortName";
  const sorted = [...runtime.items].sort((a, b) => {
    const left = a.dataset[attribute] ?? "";
    const right = b.dataset[attribute] ?? "";
    return left < right ? -1 : left > right ? 1 : 0;
  });
  for (const item of sorted) runtime.list.appendChild(item);
  for (const button of runtime.sortButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.sort === key));
  }
}

function bindCatalog(root: HTMLElement): void {
  const runtime = readCatalog(root);
  if (!runtime) return;

  applyFilters(runtime);

  const form = qs<HTMLFormElement>("[data-search-form]", root);
  form?.addEventListener("submit", (event) => event.preventDefault());

  let timer: ReturnType<typeof setTimeout> | undefined;
  runtime.search.addEventListener("input", () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      applyFilters(runtime);
      syncSearchUrl(runtime.search.value);
    }, 150);
  });

  for (const select of [runtime.language, runtime.group, runtime.category]) {
    select?.addEventListener("change", () => applyFilters(runtime));
  }

  for (const button of runtime.sortButtons) {
    button.addEventListener("click", () => sortList(runtime, button.dataset.sort ?? "name"));
  }

  for (const reset of qsa<HTMLElement>("[data-reset]", root)) {
    reset.addEventListener("click", () => {
      runtime.search.value = "";
      if (runtime.language) runtime.language.value = "";
      if (runtime.group) runtime.group.value = "";
      if (runtime.category) runtime.category.value = "";
      sortList(runtime, "name");
      applyFilters(runtime);
      syncSearchUrl("");
      runtime.search.focus();
    });
  }
}

/* ------------------------------------------------------------- initialisation */

function applyUrlState(): void {
  const params = new URLSearchParams(location.search);
  const search = qs<HTMLInputElement>("[data-search]");
  const query = params.get("q");
  if (search && query) {
    search.value = query;
    const root = search.closest<HTMLElement>("[data-catalog]");
    const runtime = root ? readCatalog(root) : null;
    if (runtime) applyFilters(runtime);
  }
  if (params.get("focus") === "search") {
    params.delete("focus");
    const next = `${location.pathname}${params.toString() ? `?${params}` : ""}${location.hash}`;
    history.replaceState(history.state, "", next);
    search?.focus();
  }
}

function initPage(navigated: boolean): void {
  for (const root of qsa<HTMLElement>("[data-catalog]")) bindCatalog(root);
  syncNavCurrent();
  if (playerState) {
    ensureAudio();
    showPlayer();
  }
  applyUrlState();
  if (navigated) {
    const main = document.querySelector<HTMLElement>("main");
    main?.focus({ preventScroll: true });
  }
}

function bindGlobalListeners(): void {
  document.addEventListener("click", interceptClick);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable)
    ) {
      return;
    }
    const search = qs<HTMLInputElement>("[data-search]");
    event.preventDefault();
    if (search) {
      search.focus();
      search.select();
      return;
    }
    window.location.href = `${pageUrl("/")}?focus=search`;
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLElement>("[data-play]");
    if (!button) return;
    event.preventDefault();
    const audioUrl = button.dataset.audio;
    if (!audioUrl) return;
    playEpisode({
      audioUrl,
      title: button.dataset.title ?? "Épisode",
      artist: button.dataset.artist ?? "Podcast",
      album: button.dataset.album ?? "",
      externalUrl: button.dataset.external ?? audioUrl,
      image: button.dataset.image || undefined,
      episodeId: button.dataset.episode,
    });
  });

  window.addEventListener("popstate", () => {
    void navigate(new URL(location.href), false);
  });
}

function start(): void {
  bindPlayer();
  bindGlobalListeners();
  initPage(false);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
