# Plan — Identifiants de tranches internationaux (i18n)

> Statut : proposition à valider · Date : 2026-10-12
> Décisions retenues : **ids `age-2-5`** + **URLs localisées par langue**.

---

## 1. Constat

Les 4 tranches sont identifiées aujourd'hui par des **mots français** qui servent en même
temps de clé technique, de nom de fichier et de segment d'URL :

| id actuel       | utilisé comme                                               |
| --------------- | ----------------------------------------------------------- |
| `tout-petits`   | fichier source, éclat `dist/`, segment d'URL, paramètre API |
| `maternelle-cp` | idem                                                        |
| `primaire`      | idem                                                        |
| `college-plus`  | idem                                                        |

Problèmes, par ordre de gravité :

1. **Ancrage culturel** — `maternelle-cp` / `primaire` / `college-plus` sont des
   classes du **système scolaire français**. Ils ne correspondent à rien en DE, ES, IT…
   (le renommer en anglais ne ferait que déplacer le problème vers le système US).
2. **Peu explicite** — `maternelle-cp` mélange deux niveaux ; `college-plus` dit « + »
   sans dire quoi ; rien ne dit qu'il s'agit d'une **plage d'âges**.
3. **Fuite dans les URLs non-françaises** — `/en/maternelle-cp/…` affiche un id
   français à un lecteur anglais (`site/src/pages/[lang]/[tranche]/*`).
4. **Valeurs codées en dur** (bloquant pour toute i18n, indépendamment du nom) :
   - `site/src/pages/search.astro:59-63` (options du `<select>`) et `:361-365`
     (`getAgeLabel()` — carte littérale) ;
   - `site/src/pages/health.astro:135-138` (options du `<select>`) ;
   - `site/src/pages/developers.astro:151,157,173,177,191,193,206,257,285`
     (exemples d'API) ;
   - `scripts/import-legacy.ts:69-73` (repli `"tout-petits"`).
     → Ajouter une tranche ou une langue impose d'éditer 4 fichiers de code.
5. **Libellés en fallback toujours français** — `site/src/lib/catalog.ts:190-202` et
   `scripts/lib/catalog.ts:38-44` retombent sur `group.label` (FR) pour une langue non
   couverte : une page ES afficherait du français.

Bonne nouvelle : l'essentiel est **déjà dérivé** (`schema/*` générés par `pnpm gen:types`,
`GroupId` issu de `groups/groups.json`, éclats lus via `shards[].path`) — le renommage est
mécanique, à condition de bien séparer les trois rôles actuellement fondus dans `id`.

---

## 2. Décisions

| Sujet                 | Décision                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identifiant technique | `age-2-5` · `age-5-7` · `age-7-10` · `age-11-plus` (neutre, auto-explicite)                                                                                                              |
| Segment d'URL         | **slug neutre, identique en toutes langues** : `age-2-5`, `age-5-7`, `age-7-10`, `age-11-plus` — raccord avec l'id (surcharge `translations.<lang>.slug` possible pour un futur `en-gb`) |
| Fichiers `entries/`   | **id neutre** : `entries/fr/age-7-10.json` (indépendant de la langue)                                                                                                                    |
| Libellés affichés     | localisés, inchangés : « Tout-petits » / « Toddlers » (jamais dans l'URL)                                                                                                                |
| Anciens ids           | champ `aliases` (résolution API + redirections d'URL)                                                                                                                                    |
| Cassure de format     | oui, assumée : `SCHEMA_VERSION` 1 → 2, release `v2.0.0` + notes de migration                                                                                                             |

Règle d'or du plan : **`id` ne change jamais par accident** (il est vérifié par la CI),
**slug d'URL ne change jamais sans `aliases`** (redirection générée automatiquement).

Le neutralisme des segments d'URL vient du choix de nom : pas de mot d'une langue
donnée, pas de référence au système scolaire d'un pays. Un système US (_first grade_)
ou UK (_Year 1_) ne peut être rendu dans un slug unique — c'est le rôle des **libellés**
(`translations.<lang>.label`), pas de l'URL. Une locale `en-gb` pourra plus tard avoir
son propre slug sans toucher à `en`, ni aux ids, ni aux fichiers.

### 2.1 Table de correspondance

| Ancien id       | Nouvel id = slug | Libellé fr      | Libellé en         |
| --------------- | ---------------- | --------------- | ------------------ |
| `tout-petits`   | `age-2-5`        | Tout-petits     | Toddlers           |
| `maternelle-cp` | `age-5-7`        | Maternelle / CP | Preschool & K      |
| `primaire`      | `age-7-10`       | Primaire        | Elementary         |
| `college-plus`  | `age-11-plus`    | Collège & +     | Middle school & up |

> **Toutes les URLs de tranche changent** (fr comme en) : `/{langue}/{ancien-id}/` →
> `/{langue}/{slug}/`, redirection générée à partir de `aliases` (pages de groupe
> **et** pages d'épisode). Les libellés affichés, eux, ne bougent pas.
>
> Champ `slug` conservé **même s'il vaut aujourd'hui l'id** : c'est lui qui porte la
> règle « segment d'URL localisable », `id` restant la clé de données (`entries/`,
> `groupId`, `counts.byGroup`, `?age=`).

### 2.2 Modèle de données cible — `groups/groups.json`

```jsonc
{
  "id": "age-5-7", // clé technique neutre — format vérifié par la CI
  "order": 2,
  "ageMin": 5,
  "ageMax": 7,
  "label": "Maternelle / CP", // FR (langue par défaut du dépôt)
  "ageRange": "5 – 7 ans",
  "slug": "maternelle-cp", // segment d'URL en FR — stable, curé à la main
  "aliases": ["maternelle-cp"], // anciens ids/segments : résolution + redirection
  "translations": {
    "en": {
      "label": "Preschool & K",
      "ageRange": "5 – 7 years",
      "slug": "preschool-k", // segment d'URL en EN
    },
  },
}
```

Aujourd'hui l'ancien `id` et l'ancien segment FR sont **identiques** : un seul tableau
`aliases` couvre donc rétro-compatibilité API **et** redirections d'URL.

---

## 3. Phases

Chaque phase = une PR indépendante, réversible, verte en CI.

### Phase 1 — Modèle de données (aucun changement visible)

1. `groups/groups.json` : ajouter `slug`, `translations.<lang>.slug`, `aliases: []`
   (ids inchangés pour l'instant).
2. `scripts/lib/types.ts` (`GroupDef`) et `site/src/lib/types.ts` (`ManifestGroup`) :
   - `slug`, `aliases`, `slug` dans `GroupTranslation`.
3. `scripts/build.ts:318-332` : émettre `slug` et `aliases` dans `manifest.groups[]`.
4. Nouveaux helpers :
   - `scripts/lib/catalog.ts` → `groupBySlugOrAlias(groups, raw)` (id + slug + alias) ;
   - `site/src/lib/catalog.ts` → `groupSlug(group, pageLanguage)` (repli slug FR),
     `groupPath(languageCode, group)` (helper **unique** de construction d'URL) ;
   - `site/src/lib/url.ts:4,8` : mettre à jour les commentaires d'exemple.
5. Nouvelles règles (voir §4) : `S11` (noms/slugs/aliases).
6. `pnpm gen:types` (les descriptions de `scripts/lib/schema.ts:100,230` mentionnent
   `entries/<langue>/<tranche>.json` — pas de changement de fond, S9 verrouille le reste).

> Livrable : `manifest.groups[]` expose déjà les slugs et les aliases. Rien ne casse.

### Phase 2 — URLs localisées (avec redirections)

1. `site/src/pages/[lang]/[tranche]/index.astro:24` et
   `[lang]/[tranche]/[slug]/index.astro:19` : `params.tranche = groupSlug(group, lang)`.
2. Remplacer les **~15 constructions** `/${entry.language}/${entry.groupId}/` par
   `groupPath(...)` : `PodcastCard.astro:15`, `index.astro:35,49,74`, `favoris.astro:64`,
   `health.astro:177,202`, `nouveautes.astro:18`, `sitemap-index.xml.ts:47`,
   `[lang]/index.astro:49`, `[lang]/[tranche]/index.astro:38`,
   `[lang]/[tranche]/[slug]/index.astro:36,69`, `editeurs/[slug]/index.astro:33`,
   `themes/[slug]/index.astro:34`.
3. **Redirections** : route unique `site/src/pages/[...legacy].astro`, qui énumère
   depuis `manifest.groups[].aliases` les anciens segments et émet, pour chacun,
   `site/src/layouts/RedirectLayout.astro` (`meta refresh` + `canonical` + `noindex` —
   GitHub Pages n'offre pas de 301) : `/{lang}/{ancienSegment}/` → `/{lang}/{slug}/`,
   **et** toutes les pages d'épisode `/{lang}/{ancienSegment}/{episode}/` → nouvelle
   URL (~200 redirections générées, zéro écriture manuelle).
4. `sitemap-index.xml.ts` : uniquement les URLs canoniques (les redirections restent
   hors sitemap).
5. Les comparaisons `data-group` / `?ages=` continuent d'employer l'**id** (`ages.ts`,
   `search.astro:440`) : le segment d'URL et la clé de filtrage restent découplés.

> Vérif : `/fr/age-7-10/` canonique, `/fr/primaire/` → redirection vers
> `/fr/age-7-10/`, aucun 404 dans le sitemap.

### Phase 3 — Renommage des identifiants (la seule cassure)

1. `git mv entries/<lang>/<ancien>.json entries/<lang>/age-*.json` (6 fichiers :
   `fr` ×4, `en` ×2 — les slugs d'entrée ne changent pas, le tri par slug est préservée).
2. `groups/groups.json` : `id` → `age-*`, remplir `aliases: ["<ancien id>"]`.
3. Purger les références littérales restantes :
   - `scripts/import-legacy.ts:69-73` → `"age-2-5"` ;
   - `scripts/issue-to-entry.ts:118-122,192` : le chemin cible utilise l'**id** ;
   - `scripts/lib/issue.ts:75-88` (`resolveId`) : faire correspondre aussi `slug` et
     `aliases` → le formulaire GH (`add-podcast.yml`, qui envoie des **libellés** FR)
     continue de fonctionner sans modification ;
   - `scripts/check-feeds.ts:136-141`, `scripts/enrich.ts:7`, `scripts/lib/types.ts:65`
     : commentaires/exemples de chemins.
4. `scripts/build.ts:244,260` (chemins d'éclats `dist/fr/age-7-10.json`, `group`),
   `:315` (`counts.byGroup`), `scripts/build-search-index.ts:27,119` :
   aucune écriture littérale — **vérifier** qu'elles suivent `entry.groupId`.
5. Rétro-compatibilité API :
   - `site/src/pages/api/search.json.ts:23` (`?age=`) : résolution par
     **id + slug + alias** via `manifest.groups[].aliases` → `?age=primaire` reste
     valable (et redirige symboliquement vers le bon filtre) ;
   - `api/catalog/[lang].json.ts:18-22` : `group` = nouvel id.
6. `scripts/lib/config.ts:31` : `SCHEMA_VERSION = 2`.
7. Docs : `README.md:86,130-133,158`, `CONTRIBUTING.md:17,93,100-101,139,153`,
   `.github/PULL_REQUEST_TEMPLATE.md:5,19`, `site/src/pages/contribuer.astro:97`,
   `developers.astro` (exemples).
8. **`MIGRATION.md`** (nouveau) : table ancien → nouvel id, chemins d'éclats,
   `counts.byGroup`, `?age=`, et rappel du pinning par tag (consommateurs non impactés
   avant leur bump volontaire).

> Contrôle : `grep -rn "tout-petits\|maternelle-cp\|primaire\|college-plus" --glob '!groups/groups.json' --glob '!MIGRATION.md' --glob '!docs/'`
> ne doit plus retourner que `aliases`, `MIGRATION.md`, `docs/` et les redirections générées.

### Phase 4 — Suppression des valeurs codées en dur (i18n-ready)

1. `search.astro` : générer les `<option>` du filtre âge depuis `manifest.groups` au
   build, supprimer `getAgeLabel()` (`:359-366`) au profit de `groupAgeRange(group, lang)`.
2. `health.astro:135-138` : idem (options générées).
3. `developers.astro` : exemples (`byGroup`, `?age=`, `groupId`) interpolés depuis le
   manifest — la doc ne peut plus dériver.
4. Fallback de libellé : signaler (règle bloquante) toute langue de
   `reference/languages.json` sans `label`/`slug` traduits dans `groups/groups.json`.

> Critère : ajouter la langue `es` = `reference/languages.json` + `groups/*.translations.es`
>
> - `entries/es/…`, **zéro ligne de code**.

### Phase 5 (recommandée, hors périmètre strict) — `ageRange` dérivé

`ageRange` est une **chaîne traduite en double** : `S10` (`scripts/validate.ts:213-243`)
la revalide déjà contre `ageMin`/`ageMax` pour chaque langue. La calculer
(`${min} – ${max} ans` / `${min}–${max} years`) et supprimer `ageRange` + `translations.*.ageRange`
de `groups.json` : une langue de plus ne demande plus de saisir deux chaînes cohérentes
au caractère près. À traiter comme une PR séparée (touche S10, les schémas générés, le site).

---

## 4. Règles de validation à ajouter (`scripts/validate.ts`)

| Règle    | Contrôle                                                                                                                                                | Sévérité      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **S11a** | `id` au format `age-<ageMin>-<ageMax>` (`age-<n>-plus` si `ageMax: null`) — un id ne peut pas mentir sur les bornes                                     | erreur        |
| **S11b** | `id`, `slug` (toutes langues), `aliases` : `[a-z0-9-]+`, longueur ≥ 3, **unicité globale** (un alias ne peut être l'id/slug d'un autre groupe)          | erreur        |
| **S11c** | `id`/`slug` ≠ code de langue (`reference/languages.json`) → évite `/fr/en/…`                                                                            | erreur        |
| **S11d** | pour **chaque** langue qui a des entrées : `label` **et** `ageRange` présents dans `translations.<lang>` (le `slug` étant global, il ne se décline pas) | erreur        |
| **S11e** | `aliases` non vide quand un id/segment a changé (comparaison git optionnelle)                                                                           | avertissement |
| **S10**  | inchangé, **mais** son format `ageRange` FR (`:213`) est à adapter dès que la Phase 5 arrive                                                            | —             |

Effet de bord de **S11a** : changer une borne d'âge impose un renommage d'id + un alias +
des redirections. C'est voulu (rareté assumée, `aliases` couvre la transition) — c'est le
prix d'identifiants qui restent explicites.

---

## 5. Risques et repli

| Risque                                                       | Atténuation                                                                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Consommateurs de `main` (jsDelivr `@main`) cassés à la merge | README impose le pinning d'un tag ; `MIGRATION.md` + release `v2.0.0` ; `SCHEMA_VERSION` signale le break                                              |
| SEO `en` (perte de positions)                                | Toutes les URLs de tranche changent (fr **et** en) ; redirections + `canonical` ; sitemap reconstruit sur les URL canoniques                           |
| Cache PWA (HTML pré-caché, liens anciens)                    | `registerType: "autoUpdate"` + `cleanupOutdatedCaches` ; l'ancien lien pointe vers une page de redirection existante                                   |
| Oubli d'un site de remplacement                              | grep de surveillance (§Phase 3) en CI + `typecheck` (les unions générées dans `schema/entry.schema.d.ts:46` cassent le build si un ancien id subsiste) |
| Rollback                                                     | chaque phase est un PR indépendant ; Phase 3 réversible en un `git revert` (les `aliases` assurent la continuité des URLs dans les deux sens)          |

Hors périmètre (à ne pas mélanger) : internationnalisation de l'**UI** du site
(boutons, menus, `pwaConfig.manifest.lang: "fr"`, `formatDateFr` dans `search.astro`).

---

## 6. Critères d'acceptation

```bash
pnpm gen:types && git diff --exit-code schema/   # S9 — schémas dérivés
pnpm typecheck && pnpm --filter site check
pnpm lint
pnpm validate                                    # S1…S11, D1…D4
pnpm build --no-network && pnpm validate:dist    # S8
pnpm site:build
```

Manuel / automatisé :

- [ ] `/fr/age-7-10/` (URL canonique, 200, canonical correct)
- [ ] `/fr/primaire/` → redirige vers `/fr/age-7-10/` (page d'épisode comprise)
- [ ] `?age=primaire` toujours accepté (alias) **et** `?age=age-7-10`
- [ ] sitemap : 0 URL en ancien segment
- [ ] `grep` de surveillance §Phase 3 : plus aucune littérale hors `aliases` / `MIGRATION.md`
- [ ] `search.astro` et `health.astro` : plus aucune valeur d'option en dur dans le HTML
- [ ] ajout d'un groupe de test en CI : aucune modification de code nécessaire

---

## 7. Ordre des PR

| #   | PR                                                      | Effort | Cassure                                     |
| --- | ------------------------------------------------------- | ------ | ------------------------------------------- |
| 1   | Modèle `slug`/`aliases` + règles S11                    | S      | non                                         |
| 2   | Helpers d'URL + URLs localisées + redirects             | M      | **toutes** les URLs de tranche (redirigées) |
| 3   | Renommage `age-*` + `SCHEMA_VERSION 2` + `MIGRATION.md` | M      | **oui** (`dist/`, paramètres, fichiers)     |
| 4   | Dé-codage dur (`search`/`health`/`developers`)          | S      | non                                         |
| 5   | `ageRange` dérivé (optionnel)                           | M      | non (source only)                           |
