# yoto-podcast-catalog

Catalogue **statique de podcasts pour enfants** : une source éditoriale humaine
(`entries/`), validée par une CI bloquante, publiée en JSON (`dist/`) et exposée par un
site statique (GitHub Pages) où l'on peut chercher et **écouter un épisode**.

L'objectif pratique : **constituer des cartes MYO (Make Your Own) Yoto** — repérer un
podcast adapté à l'âge, récupérer son flux RSS et l'ajouter sur une carte de son lecteur
Yoto.

[![CI](https://github.com/sgr-domo/yoto-podcast-catalog/actions/workflows/ci.yml/badge.svg)](https://github.com/sgr-domo/yoto-podcast-catalog/actions/workflows/ci.yml)
[![Santé des flux](https://github.com/sgr-domo/yoto-podcast-catalog/actions/workflows/feed-health.yml/badge.svg)](https://github.com/sgr-domo/yoto-podcast-catalog/actions/workflows/feed-health.yml)
[![Pages](https://github.com/sgr-domo/yoto-podcast-catalog/actions/workflows/pages.yml/badge.svg)](https://github.com/sgr-domo/yoto-podcast-catalog/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> 133 podcasts · 2 langues · 4 tranches d'âge · 10 épisodes pré-extraits par podcast.

---

## Consommer le catalogue

| Canal                                                         | Quand l'utiliser                                   | Fraîcheur                 |
| ------------------------------------------------------------- | -------------------------------------------------- | ------------------------- |
| **Pages** `…/dist/index.json`                                 | site public, app en développement, tiers           | à chaque merge sur `main` |
| **Release** `…/releases/download/vX.Y.Z/catalog.json`         | **l'application en production (pinning d'un tag)** | scellée, jamais réécrite  |
| **jsDelivr** `cdn.jsdelivr.net/gh/<owner>/<repo>@main/dist/…` | CDN simple, sans compte                            | à chaque merge            |

Le manifeste `dist/index.json` (~1 Ko) décrit la version (`catalogVersion`), les éclats
publiés, les compteurs et les empreintes `sha256` : c'est lui qu'on fetch en premier.

**Règle de pinning** : l'application épingle un **tag**, jamais `main`. Une contribution
externe ne peut donc pas casser la production sans revue.

---

## Usage — cartes MYO Yoto

Ce catalogue est pensé pour **fabriquer des cartes MYO (Make Your Own) Yoto** : sur le
lecteur Yoto, une carte MYO permet d'y associer un flux RSS audio. Ici, chaque entrée
expose un `rssUrl` valide (vérifié par la CI), déjà classé par **langue** et par
**tranche d'âge** — il suffit de choisir un podcast et d'utiliser son flux :

1. Chercher un podcast sur le site (`/`) ou dans `dist/<langue>/<tranche>.json`.
2. Récupérer son `rssUrl` (et `imageUrl` pour la pochette de la carte).
3. Créer une carte MYO dans l'app Yoto → « Podcast » → coller le flux.

Un même podcast peut ensuite être réutilisé sur plusieurs cartes (par enfant, par
thème) sans rien recopier à la main.

---

## Démarrage

```bash
pnpm install            # racine (workspace : racine + site/)
pnpm validate           # structure + doublons (< 5 s)
pnpm build              # dist/ (auto-complétion depuis les flux RSS)
pnpm build:episodes     # dist/episodes/ (10 épisodes par podcast)
pnpm site:dev           # site en local → http://localhost:4321
```

### À faire une fois après la création du dépôt

1. **Settings → Pages → Source : GitHub Actions** (sinon `deploy-pages` est refusé).
2. **Créer les libellés** utilisés par les formulaires et la CI :
   `podcast:ajout`, `podcast:flux`, `ci:skip-network`
   (`feed-health` est créé automatiquement par le premier contrôle hebdomadaire).
3. Ajuster `REPOSITORY` dans `scripts/lib/config.ts` (+ `pnpm gen:types`) et
   `.github/CODEOWNERS` si le dépôt n'est pas sous `sgr-domo/yoto-podcast-catalog`.
4. (Optionnel) variable de dépôt `SITE_URL` / `BASE_PATH` pour un domaine Pages
   personnalisé — sinon l'URL est déduite automatiquement.

---

## Arbre du dépôt

```
entries/<langue>/<tranche>.json   ⚠ source unique — éditée à la main (ou via une issue)
groups/groups.json                 tranches d'âge (id, libellés fr/en, âges)
reference/                         catégories, langues, éditeurs connus
schema/*.json + entry.schema.d.ts  ⚠ GÉNÉRÉS par `pnpm gen:types` (anti-dérive : S9)
scripts/                           build, validation, vérification des flux, issue → PR
site/                              site Astro statique (GitHub Pages)
dist/                              ⚠ GÉNÉRÉ par la CI — gitignoré, jamais édité
.github/workflows/                 ci · pages · episodes · feed-health · release · issue-to-pr
```

---

## Le format source

`entries/<langue>/<tranche>.json` = tableau d'objets **triés par slug**, une entrée par
podcast.

| Champ         | Requis | Règle                                                                         |
| ------------- | ------ | ----------------------------------------------------------------------------- |
| `name`        | ✅     | ≤ 200 caractères, unique (son slug)                                           |
| `category`    | ✅     | `histoire` · `education` · `fiction` · `documentaire` · `musique` · `science` |
| `rssUrl`      | ✅     | `https://` obligatoire, hôte public (anti-SSRF)                               |
| `publisher`   | ➖     | ≤ 120 caractères, auto-complété depuis le flux                                |
| `description` | ➖     | ≤ 1000 caractères, auto-proposée depuis le flux                               |
| `imageUrl`    | ➖     | `https://`, auto-complétée depuis `itunes:image`                              |
| `websiteUrl`  | ➖     | `https://`, auto-complétée depuis `<link>` du canal                           |

**Champs dérivés interdits** dans la source : `language`, `groupId`, `ageRange` (+ `id`,
`slug`, `isActive`, `createdBy`). Ils viennent du **chemin du fichier** :
`entries/fr/primaire.json` → `language: "fr"`, `groupId: "primaire"`, `ageRange` lu dans
`groups/groups.json` (traduit selon la langue).

Un fichier vide n'existe pas.

---

## Ce que produit le build

```bash
pnpm build            # dist/ : manifeste + éclats + bundle complet
pnpm build:episodes   # dist/episodes/ : index.json + <slug>.json
pnpm validate:dist    # contrôle S8 (artefacts conformes + sha256 du manifeste)
```

- **Découpage adaptatif** : par langue, les tranches ≥ 15 entrées ont leur fichier
  (`dist/fr/tout-petits.json`), les tranches en dessous sont fusionnées
  (`dist/en.json`). Le manifeste référence chaque éclat avec `bytes` + `sha256`.
- **`catalogVersion`** = `YYYY.MM.DD-<nb de commits>` (monotone, dédié au cache).
- **`dist/episodes/`** : le navigateur ne peut pas lire un RSS tiers (cross-origin) et
  Pages ne peut pas le proxifier — les 10 épisodes les plus récents sont donc pré-extraits,
  avec `fetchedAt` pour l'affichage de fraîcheur. Un flux en panne **conserve** son
  dernier fichier publié (jamais de liste vide).
- **Auto-complétion** : `publisher`, `description`, `imageUrl`, `websiteUrl` sont remplis
  depuis le flux (cache disque 24 h). Un champ manquant en sortie est **bloquant**
  (échappatoire : `pnpm build --allow-incomplete`).

---

## Validation — 3 niveaux

| Niveau | Commande                | Ce que contrôle                                              | Durée  |
| ------ | ----------------------- | ------------------------------------------------------------ | ------ |
| 1      | `pnpm validate`         | structure S1…S9 (champs, limites, tri, schéma)               | < 5 s  |
| 2      | `pnpm validate`         | doublons D1…D4 (slug, flux, noms proches)                    | < 5 s  |
| 3      | `pnpm validate:changed` | flux modifiés vs `main` : https, épisodes https, langue, âge | réseau |
| —      | `pnpm validate:all`     | les 133 flux (audit hebdomadaire)                            | réseau |
| —      | `pnpm validate:dist`    | artefacts `dist/` (S8)                                       | < 1 s  |

Autres contrôles :

- **S9 — anti-dérive du schéma** : `schema/*.json` et `entry.schema.d.ts` doivent être
  _exactement_ ce que le code calcule. Éditer un schéma à la main = échec de `pnpm validate`
  et de la CI. Le bon réflexe : `pnpm gen:types` puis commit.
- **CI** : `pnpm gen:types && git diff --exit-code schema/` en plus de S9, `typecheck`,
  `prettier --check`, `build` + `validate:dist`, niveau 3 sur les flux modifiés.
- **Échappatoire mainteneur** : libellé `ci:skip-network` sur la PR → saute le niveau 3 et
  tolère un `dist` incomplet quand un flux tiers est en panne (réservé au mainteneur via
  `CODEOWNERS`).
- **Réseau** : une erreur transitoire (5xx, timeout, DNS) n'est **jamais bloquante** —
  3 tentatives, puis secours sur le cache périmé (`FEED_STALE_CACHE`) ou « non vérifié ».
  Seuls les flux réellement morts (4xx) bloquent.

---

## Contributions — 3 voies

| Voie                                                                   | Compétence requise   |
| ---------------------------------------------------------------------- | -------------------- |
| **A.** Éditer `entries/…` via l'UI GitHub (_Edit this file_)           | coller un objet JSON |
| **B.** Formulaire « Proposer un podcast » → PR ouverte automatiquement | aucun git            |
| **C.** Formulaire « Signaler un flux défaillant » → PR de correction   | aucun git            |
| **D.** Fork + branche + PR (scripts, site, références)                 | git                  |

Détails, contrôles et conventions : **[CONTRIBUTING.md](CONTRIBUTING.md)**.

---

## Site statique

```bash
pnpm site:dev      # hot-reload Astro
pnpm site:build    # 142 pages pré-rendues → site/dist/
```

- **Parcours** : `/` (catalogue + recherche instantanée) → `/{langue}/` →
  `/{langue}/{tranche}/` → `/{langue}/{tranche}/{slug}/` (10 épisodes, JSON-LD).
- **Écoute** : mini-player persistant — la lecture **survit à la navigation** grâce à un
  micro-routeur côté serveur (le `<audio>` n'est jamais recréé).
- **Sans framework client** : ~45 Ko chargés au premier rendu (HTML 38 Ko gzip, JS 3,9 Ko,
  CSS 2,9 Ko). Aucun fetch réseau pendant le build : le site lit `dist/` sur disque.
- **Variables** : `BASE_PATH` (préfixe des liens) et `SITE_URL` (URL canoniques) —
  déduites automatiquement dans `pages.yml`, surchargeables par variables de dépôt.

---

## Workflows

| Fichier           | Déclencheur                     | Rôle                                                     |
| ----------------- | ------------------------------- | -------------------------------------------------------- |
| `ci.yml`          | PR + push `main`                | validation bloquante (niveaux 1 à 3) + commentaire de PR |
| `pages.yml`       | push `main` (chemins concernés) | `build` + `build:episodes` + site → GitHub Pages         |
| `episodes.yml`    | cron 6 h                        | appelle `pages.yml` (fraîcheur des épisodes)             |
| `feed-health.yml` | cron hebdo + manuel             | vérifie les 133 flux, tient l'issue `feed-health` à jour |
| `release.yml`     | tag `v*`                        | Release avec `catalog.json`, manifeste, tar `dist/`      |
| `issue-to-pr.yml` | issue ouverte                   | formulaire → PR (ajout ou correction de flux)            |

---

## Licence

[MIT](LICENSE) — les données (`entries/`) référencent des flux RSS publics ; seules les
métadonnées éditoriales sont dans ce dépôt.
