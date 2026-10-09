/**
 * Gestion des favoris — localStorage uniquement, pas de backend.
 * Key: "yoto-favorites" — value: string[] (slugs)
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

/** Retire un favori (utilisé depuis la page favoris). */
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
  // Aussi écouter storage pour les changements cross-onglet
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
