# feat(i18n)!: identifiants de tranches neutres age-* (SCHEMA_VERSION 2)

> Corps de la PR `feat/i18n-groupes` → `main` — non committé (fichier de travail).
> Ouvrir avec : `gh pr create --title "feat(i18n)!: identifiants de tranches neutres age-* (SCHEMA_VERSION 2)" --body-file docs/pr-i18n-groupes.md`
> ou coller le contenu ci-dessous dans l'interface GitHub :
> <https://github.com/yoto-community/podcast-catalogue/compare/main...feat/i18n-groupes?expand=1>

## Cassure assumée

`SCHEMA_VERSION` 1 → 2, version npm `2.0.0`. Voir `MIGRATION.md`.

| Ancien id / segment d'URL | Nouvel id / segment |
| ------------------------- | ------------------- |
| `tout-petits`             | `age-2-5`           |
| `maternelle-cp`           | `age-5-7`           |
| `primaire`                | `age-7-10`          |
| `college-plus`            | `age-11-plus`       |

- Les segments d'URL sont **neutres et identiques en FR et EN** (`/fr/age-7-10/`, `/en/age-7-10/`) ; seuls les **libellés affichés** restent localisés.
- Les anciens ids restent résolus via `aliases` (dans `groups/groups.json`) : `?age=primaire` fonctionne toujours, et les pages historiques redirigent (meta refresh + `canonical` + `noindex` — GitHub Pages n'a pas de 301). Le sitemap ne contient que les URL canoniques.
- `slug` = `id` pour l'instant ; le champ est conservé en tête pour une future surcharge `translations.<lang>.slug`.

## Corrections incluses

- **Validation S11a-d** (nouvelles règles bloquantes) : id = bornes (`age-<min>-<max>`), unicité globale id/slug/alias, absence de code de langue dans l'id, libellés traduits obligatoires.
- **Redirections statiques** : `site/src/pages/[...legacy].astro` + `site/src/layouts/RedirectLayout.astro` (tranche et épisode).
- **Fix recherche `/search/`** : l'index plein-texte n'était jamais publié — `build-search-index.ts` écrivait dans `dist/` (jamais copié par Astro), aucune étape ne l'exécutait dans `pages.yml`, et l'URL côté client ignorait `BASE_PATH` → 404 en prod. Corrigé : écriture dans `site/public/` (ignoré par git), `pnpm build:search-index` ajouté au workflow Pages (source unique, `episodes.yml` appelle ce workflow), URL préfixée par `pageUrl()`.
- **Corrections TS hors périmètre assumées** : `<script is:inline>` → `<script>` compilé par Astro (la page était cassée au runtime et les 66 erreurs `astro check` disparaissent), erreurs de type restantes, prettier appliqué au dépôt.

## Vérifications locales (toutes vertes)

- `pnpm typecheck`
- `pnpm --filter site check` — 0 erreur (était 66)
- `pnpm lint` — prettier (était rouge)
- `pnpm validate` — S1 à S11 (+ test négatif S11 vérifié : slug manquant + collision d'alias → 2 erreurs bloquantes)
- `pnpm build` + `pnpm validate:dist`
- `SITE_URL=https://yoto-community.github.io/podcast-catalogue pnpm site:build` — 593 pages ; vérifié dans `dist` : pages canons `fr|en/age-*`, redirections tranche + épisode avec `canonical` absolu et `refresh` préfixé par le `base`, sitemap sans ancien segment, scripts bundlés, `search-index.json` servi (1,8 Mo, 1847 épisodes, `groupSlug` présent), filtres et exemples `developers.astro` générés depuis le manifeste.

## Hors périmètre (signalé, non traité)

- Catégories toujours en ids français (`histoire`, `science`, `fiction`…) — sujet adjacent, même motivation que ce PR.
- Les favoris (`yoto-favorites`) stockent des slugs d'épisode : aucun impact du renommage.
- `scripts/release.ts` appelle déjà `build:search-index` — l'option `--skip-search-index` n'est plus nécessaire.
