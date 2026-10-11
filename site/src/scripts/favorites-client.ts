/**
 * Client-side favorites API — bundlé par Vite.
 * À importer depuis un `<script>` traité par Astro (jamais `is:inline`
 * ni `<script type="module">` brut : ces variantes restent telles quelles
 * dans le HTML et leurs imports relatifs renvoient un 404).
 * Re-export de la logique depuis favorites.ts mais compatible navigateur.
 */

const FAV_KEY = "yoto-favorites";

/** Récupère la liste des slugs favoris. */
export function getFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

/** Vérifie si un slug est en favori. */
export function isFavorite(slug: string): boolean {
  return getFavorites().includes(slug);
}

/** Ajoute ou retire un favori. Retourne le nouvel état (true = ajouté). */
export function toggleFavorite(slug: string): boolean {
  const favs = getFavorites();
  const idx = favs.indexOf(slug);
  let added: boolean;
  if (idx === -1) {
    favs.push(slug);
    added = true;
  } else {
    favs.splice(idx, 1);
    added = false;
  }
  localStorage.setItem(FAV_KEY, JSON.stringify(favs));
  dispatchFavoritesChange(favs);
  return added;
}

/** Retire un favori. */
export function removeFavorite(slug: string): void {
  const favs = getFavorites().filter((s) => s !== slug);
  localStorage.setItem(FAV_KEY, JSON.stringify(favs));
  dispatchFavoritesChange(favs);
}

/** Vide tous les favoris. */
export function clearFavorites(): void {
  localStorage.removeItem(FAV_KEY);
  dispatchFavoritesChange([]);
}

/** Dispatch un événement personnalisé pour synchroniser l'UI (multi-onglets). */
function dispatchFavoritesChange(favs: string[]): void {
  window.dispatchEvent(new CustomEvent("yoto-favorites-change", { detail: { favorites: favs } }));
}

/** Écoute les changements de favoris (depuis un autre onglet ou même page). */
export function onFavoritesChange(cb: (favs: string[]) => void): () => void {
  const handler = (e: CustomEvent<{ favorites: string[] }>) => cb(e.detail.favorites);
  window.addEventListener("yoto-favorites-change", handler as EventListener);
  const storageHandler = (e: StorageEvent) => {
    if (e.key === FAV_KEY) cb(getFavorites());
  };
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener("yoto-favorites-change", handler as EventListener);
    window.removeEventListener("storage", storageHandler);
  };
}

/** Met à jour l'attribut aria-pressed et l'icône d'un bouton favori. */
export function updateFavoriteButton(btn: HTMLButtonElement, isFav: boolean): void {
  btn.setAttribute("aria-pressed", String(isFav));
  btn.setAttribute("aria-label", isFav ? "Retirer des favoris" : "Ajouter aux favoris");
  const label = btn.querySelector(".favorite-text");
  if (label) label.textContent = isFav ? "Retirer" : "Favori";
}

/** Synchronise l'état (favori ou non) de tous les boutons présents dans le DOM. */
export function syncAllFavoriteButtons(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>("[data-favorite][data-slug]");
  for (const btn of buttons) {
    const slug = btn.dataset.slug;
    if (!slug) continue;
    updateFavoriteButton(btn, isFavorite(slug));
  }
}

let delegated = false;

/**
 * Initialise les boutons favoris.
 *
 * Le site utilise un micro-routeur (fetch + remplacement de `<main>`, voir site.ts) :
 * après une navigation interne, les boutons sont un DOM neuf, sans écouteur attaché.
 * On délègue donc le clic sur `document` (aucune liaison par nœud) et on
 * resynchronise l'état depuis le localStorage à chaque appel — idempotent.
 */
export function initAllFavoriteButtons(): void {
  if (!delegated) {
    delegated = true;

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const btn = target.closest<HTMLButtonElement>("[data-favorite][data-slug]");
      const slug = btn?.dataset.slug;
      if (!btn || !slug) return;
      updateFavoriteButton(btn, toggleFavorite(slug));
    });

    // Multi-onglets / même page
    onFavoritesChange(() => syncAllFavoriteButtons());
  }

  syncAllFavoriteButtons();
}
