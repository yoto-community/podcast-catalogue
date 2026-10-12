<!-- Merci de décrire le POURQUOI du changement : la forme des fichiers est déjà contrôlée par la CI. -->

## Ce que j'ajoute / corrige

<!-- Ex. : « ajoute le podcast X dans entries/fr/age-7-10.json » ou « l'ancien flux de Y redirige vers un 404 ». -->

## Type de changement

- [ ] **Ajout** d'une entrée (`entries/<langue>/<tranche>.json`)
- [ ] **Correction** d'une entrée (URL de flux, image, description)
- [ ] **Site** (`site/`) ou **scripts** / **CI**
- [ ] **Références** (`groups/`, `reference/`) — penser à `pnpm gen:types` après

## Contrôles

- [ ] `pnpm validate` passe (structure + doublons)
- [ ] `pnpm validate:changed` vérifie le(s) flux modifié(s) (https, épisodes audio https)
- [ ] La tranche d'âge reflète le contenu réel des épisodes
- [ ] Aucun champ dérivé (`language`, `groupId`, `ageRange`) n'est écrit dans `entries/`
