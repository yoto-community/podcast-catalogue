/**
 * Gestion des favoris — localStorage uniquement, pas de backend.
 * Key: "yoto-favorites" — value: string[] (slugs)
 *
 * La même liste est miroirée dans `yoto-community:toolkit:v1` pour que le
 * portail et le catalogue d'icônes partagent les favoris.
 */

import { isLocale, t } from "../lib/i18n";
import { TOOLKIT_KEY, readPodcastFavorites, syncPodcastFavorites } from "../lib/shared-storage";

const FAV_KEY = "yoto-favorites";

/** Récupère la liste des slugs favoris (ancienne clé + trousse partagée). */
export function getFavorites(): string[] {
  return readPodcastFavorites();
}

/** Vérifie si un slug est en favori. */
export function isFavorite(slug: string): boolean {
  return getFavorites().includes(slug);
}

/** Ajoute ou retire un favori. Retourne le nouvel état (true = ajouté). */
export function toggleFavorite(slug: string, title?: string): boolean {
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
  persist(favs, title ? { [slug]: title } : {});
  dispatchFavoritesChange(favs);
  return added;
}

/** Retire un favori (utilisé depuis la page favoris). */
export function removeFavorite(slug: string): void {
  const favs = getFavorites().filter((s) => s !== slug);
  persist(favs);
  dispatchFavoritesChange(favs);
}

/** Vide tous les favoris. */
export function clearFavorites(): void {
  persist([]);
  dispatchFavoritesChange([]);
}

function persist(favs: string[], titles: Record<string, string> = {}): void {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(favs));
  } catch {
    /* stockage indisponible : la trousse tentera elle aussi sans casser la page */
  }
  syncPodcastFavorites(favs, titles);
}

/** Dispatch un événement personnalisé pour synchroniser l'UI (multi-onglets). */
function dispatchFavoritesChange(favs: string[]): void {
  window.dispatchEvent(new CustomEvent("yoto-favorites-change", { detail: { favorites: favs } }));
}

/** Écoute les changements de favoris (depuis un autre onglet ou même page). */
export function onFavoritesChange(cb: (favs: string[]) => void): () => void {
  const handler = (e: CustomEvent<{ favorites: string[] }>) => cb(e.detail.favorites);
  window.addEventListener("yoto-favorites-change", handler as EventListener);
  // Aussi écouter storage pour les changements cross-onglet et inter-sites
  const storageHandler = (e: StorageEvent) => {
    if (e.key === FAV_KEY || e.key === TOOLKIT_KEY) cb(getFavorites());
  };
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener("yoto-favorites-change", handler as EventListener);
    window.removeEventListener("storage", storageHandler);
  };
}

/** Met à jour l'attribut aria-pressed et l'icône d'un bouton favori. */
export function updateFavoriteButton(btn: HTMLButtonElement, isFav: boolean): void {
  const rawLocale = document.documentElement.dataset.locale;
  const locale = isLocale(rawLocale) ? rawLocale : "fr";
  btn.setAttribute("aria-pressed", String(isFav));
  btn.setAttribute("aria-label", t(locale, isFav ? "favoriteRemoveAria" : "favoriteAddAria"));
  const label = btn.querySelector(".favorite-text");
  if (label) label.textContent = t(locale, isFav ? "unfavorite" : "favorite");
}
