# Contribuer au catalogue

Merci ! Deux règles suffisent à résumer le dépôt :

1. **On édite `entries/`, jamais `dist/` ni `schema/`** (les deux sont générés).
2. **Une contribution n'entre que si la CI passe** — structure, doublons, flux.

Le format complet des fichiers est décrit dans le [README](README.md#le-format-source) ;
ce document détaille les gestes.

---

## 1. Les 3 voies

### A — Éditer un fichier via l'UI GitHub (sans git)

1. Ouvrir `entries/<langue>/<tranche>.json` → **Edit this file**.
2. Ajouter l'objet à sa place (le fichier est **trié par slug**) :

   ```json
   {
     "name": "Les comptines du soir",
     "category": "musique",
     "rssUrl": "https://feeds.example.com/comptines.xml"
   }
   ```

3. **Commit directly to `main`** si vous avez les droits, sinon proposer une PR.
4. Attendre la CI : elle valide les 3 niveaux et commentaire le rapport dans la PR.

> Les champs optionnels (`publisher`, `description`, `imageUrl`, `websiteUrl`, `tags`)
> peuvent rester vides : le build les complète depuis le flux. `pnpm enrich --new --write`
> puis `pnpm auto-tag --write` rapportent ensuite ces compléments dans la source.
>
> L'UI GitHub n'applique pas notre format : la CI le signale (S7) et
> `pnpm validate --fix` le répare (tri + mise en forme).

### B — Proposer un podcast via un formulaire

**Issues → New issue → Proposer un podcast**, remplir les champs obligatoires
(nom, flux **https**, catégorie, langue, tranche). Le workflow `issue-to-pr.yml`
ouvre **automatiquement** une PR avec l'entrée triée à la bonne place.

- Si un champ est manquant ou invalide, une explication est postée en commentaire de
  l'issue : corrigez l'issue et **rouvrez-la en la commentant** (la PR est réécrite).
- L'entrée générée est **complétée depuis le flux** (`description`, `publisher`,
  `imageUrl`, `websiteUrl`) et reçoit une proposition de `tags` avant l'ouverture de la
  PR. Un flux injoignable ne bloque pas : la PR s'ouvre avec une entrée minimale.
- La PR passe ensuite exactement les mêmes contrôles qu'une contribution humaine.

### C — Signaler un flux défaillant

**Issues → New issue → Signaler un flux défaillant**. Si vous indiquez la
**nouvelle URL**, une PR de correction est ouverte automatiquement (l'entrée garde son
slug → sa position ne bouge pas). Sans nouvelle URL, l'issue sert de signalement pour
la revue humaine.

Un flux signalé par la CI apparaît aussi dans l'issue unique **`feed-health`**
(mise à jour chaque semaine, fermée au retour au vert).

### D — Contribuer au code (scripts, site, références)

```bash
git clone <url> && cd yoto-podcast-catalog
pnpm install
git checkout -b feat/ma-modification
# … modifier scripts/, site/, groups/, reference/ …
pnpm gen:types          # si reference/ ou les limites ont bougé (OBLIGATOIRE)
pnpm typecheck && pnpm lint && pnpm validate
pnpm build && pnpm validate:dist && pnpm site:build
git commit -m "feat: …"
```

---

## 2. Contrôles à passer avant de pousser

| Commande                           | Quand                                    |
| ---------------------------------- | ---------------------------------------- |
| `pnpm validate`                    | **toujours** (structure + doublons)      |
| `pnpm validate:changed`            | si un `rssUrl` a bougé (vérifie le flux) |
| `pnpm enrich --new --write`        | si des champs ➖ sont restés vides       |
| `pnpm auto-tag --write`            | si les `tags` ont été ajoutés/recalculés |
| `pnpm typecheck`                   | si un fichier `.ts` a bougé              |
| `pnpm lint`                        | si un fichier formatable a bougé         |
| `pnpm build && pnpm validate:dist` | si `scripts/` ou `reference/` a bougé    |
| `pnpm site:build`                  | si `dist/` ou `site/` a bougé            |

`pnpm validate` est rapide (< 5 s, aucun réseau) : il n'y a aucune excuse pour le sauter.

### Ce que la CI refuse

- champ inconnu, champ dérivé (`language`, `groupId`, `ageRange`) dans `entries/` ;
- nom > 200 caractères, description > 1000, éditeur > 120 ;
- flux `http://` (https **uniquement**), URL vers une IP privée/`localhost` ;
- un slug ou un flux déjà présent ailleurs (doublon) ;
- fichier non trié, formatage non canonical ;
- `schema/` édité à la main (S9) — corriger par `pnpm gen:types`, jamais à la main ;
- `dist/` non conforme à `artifact.schema.json` (S8) ;
- tranches d'âge incohérentes (S10) : `ageMin`/`ageMax` invalides, trou dans la
  couverture des âges, plus d'une tranche ouverte, `ageRange` ≠ bornes.

### Ce qui n'est bloquant que

- **les flux morts** (4xx) ou sans **aucun** épisode audio https parmi les 10 plus
  récents ;
- les flux injoignables (réseau) sont signalés en avertissement, jamais bloquants.

---

## 3. Conventions

**Commits** (conventionnels, alignés sur ceux générés par l'automatisation) :

```
feat: ajoute « Les comptines du soir » (issue #12)
fix: corrige le flux de Animalité (issue #31)
site: affiche la fraîcheur des épisodes
chore: régénère le schéma
```

**PR** : le gabarit pose la checklist ; un titre explicite et un _pourquoi_ suffisent —
la forme des fichiers est déjà contrôlée par la CI.

**Revue** : `CODEOWNERS` impose la relecture du mainteneur sur `.github/`, `schema/`,
`scripts/`, `groups/` et `reference/`.

**Étiquettes** :

| Étiquette         | Effet                                                        |
| ----------------- | ------------------------------------------------------------ |
| `podcast:ajout`   | déclenche `issue-to-pr.yml` (facultatif : le corps suffit)   |
| `podcast:flux`    | déclenche la branche « correction » de `issue-to-pr.yml`     |
| `ci:skip-network` | **réservée au mainteneur** : saute le niveau 3 de la CI      |
| `feed-health`     | l'issue unique de la vérification hebdomadaire (automatique) |

---

## 4. Changer les références (catégories, langues, tranches)

`reference/*.json` et `groups/groups.json` alimentent les enums des schémas. Toute
modification impose :

```bash
pnpm gen:types   # régénère schema/*.json + entry.schema.d.ts
git add reference/ schema/
```

Sans cette étape, `pnpm validate` échoue sur **S9** et la CI refuse le push. Ne renommez
pas un identifiant existant sans migration : il est référencé par chaque entrée et par
`dist/` (consommé par l'application qui épingle un tag).

**Bornes d'âge** : chaque tranche porte `ageMin` / `ageMax` (bornes **inclusives** ;
`ageMax: null` pour la dernière tranche ouverte, « 11 ans et plus »). Elles pilotent le
filtre « un ou plusieurs âges » du site et sont contrôlées par **S10** : couverture
continue des âges (aucun trou), pas de recouvrement d'un an ou plus, `ageRange` affiché
aligné sur les bornes. Une **borne partagée** (5 ans, 7 ans) est normale et voulue :
ces âges relèvent des deux tranches, le filtre fait l'union.
