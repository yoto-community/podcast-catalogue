# Migration v2 — identifiants de tranches internationaux

**v2.0.0** renomme les tranches d'âge : les identifiants français (`tout-petits`,
`maternelle-cp`, `primaire`, `college-plus`) deviennent des ids neutres `age-*`.
Le catalogue est lu en français **et** en anglais : un identifiant français ne peut
plus servir de clé de données (ni de segment d'URL) universel.

## 1. Table de correspondance

| Ancien id / segment d'URL | Nouvel id = slug | Libellé fr      | Libellé en         |
| ------------------------- | ---------------- | --------------- | ------------------ |
| `tout-petits`             | `age-2-5`        | Tout-petits     | Toddlers           |
| `maternelle-cp`           | `age-5-7`        | Maternelle / CP | Preschool & K      |
| `primaire`                | `age-7-10`       | Primaire        | Elementary         |
| `college-plus`            | `age-11-plus`    | Collège & +     | Middle school & up |

Aucun **libellé affiché** et aucun **slug d'épisode** ne bouge : seuls les
identifiants et les segments d'URL de tranche changent. Les anciens ids sont
conservés dans `groups/groups.json` → `aliases`.

## 2. Ce qui change

### Fichiers `entries/` et `dist/`

| Avant                      | Après                      |
| -------------------------- | -------------------------- |
| `entries/fr/primaire.json` | `entries/fr/age-7-10.json` |
| `dist/fr/primaire.json`    | `dist/fr/age-7-10.json`    |

Le champ `groupId` suit le renommage, ainsi que `manifest.counts.byGroup` (clés) et
`manifest.shards[].group`.

### URL du site

`/{langue}/{ancien segment}/` → `/{langue}/{slug}/` :

- `/fr/tout-petits/` → `/fr/age-2-5/`
- `/fr/primaire/` → `/fr/age-7-10/`
- `/en/maternelle-cp/` → `/en/age-5-7/`

Les anciennes URL restent servies : à chaque build, le site regénère une page de
redirection (`meta refresh` + `canonical` — GitHub Pages n'offre pas de 301) pour
chaque ancien segment, pages de tranche **et** pages d'épisode. Ces pages sont
`noindex` et hors sitemap.

### API

- `?age=` accepte l'**id**, le **slug** et les **anciens ids** : `?age=primaire`
  reste valable (résolution via `manifest.groups[].aliases`).
- `schemaVersion` passe de **1** à **2** : `groups[]` gagne `slug` et `aliases`,
  `groupId` change de valeur. `slug`/`aliases` sont des champs **ajouts** (non
  bloquants pour une lecture tolérante), les valeurs de `groupId` sont une cassure.

## 3. À faire côté consommateur

1. Remplacer les anciens ids dans vos comparaisons (`groupId === "primaire"` →
   `age-7-10`) et vos chemins de fichiers (`entries/fr/primaire.json` →
   `entries/fr/age-7-10.json`).
2. **Épingler une version** : `@v2.0.0` (ou votre tag), jamais `@main` — le README
   l'impose déjà. `schemaVersion: 2` dans `dist/manifest.json` signale le format.
3. Auteurs de données : **rien à faire**, `aliases` assure la transition.

Les **favoris** du site sont stockés par slug d'épisode (`yoto-favorites`) : aucun
impact. Les filtres d'âge (`?ages=`, `data-group`) emploient toujours l'**id**.

## 4. Annulation

Le rollback = tag `v1.x` : les anciens identifiants reviennent tels quels. Pensez à
publier un `MIGRATION.md` inverse (nouvel → ancien) si vous basculez à rebours un
consommateur déjà migré.
