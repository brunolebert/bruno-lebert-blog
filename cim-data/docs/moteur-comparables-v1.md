# CIM Data — Moteur de comparables V1

## Statut

Moteur local exploratoire. Aucune estimation personnalisée, vente
indépendante ou valeur individuelle n'est certifiée. Non publié.

## Code

- `cim-data/tools/moteur_comparables_v1.py`
- `cim-data/tests/test_moteur_comparables_v1.py`

Le moteur lit les références DVF et les coordonnées BAN à partir des
index préalablement générés. Il ne modifie aucune donnée source.

## Entrées

Le moteur accepte des coordonnées latitude/longitude, un rayon en
mètres, une fourchette de surface bâtie et un nombre de pièces.

Le point central doit provenir d'une adresse effectivement validée
dans le référentiel géographique. Le moteur ne géocode pas lui-même
une adresse textuelle.

## Dépendances

1. Dépôt local contenant `cim-data/runtime/dvf`.
2. Répertoire d'index comprenant :
   - `index-mutations-dvf-global-v0`
   - `raccordement-groupes-dvf-ban-global-v1`
   - `candidats-appartements-geographiques-v0`

Les index ne sont pas régénérés par le moteur. Leur procédure de
production complète doit encore être industrialisée.

## Exécution portable

Depuis la racine du dépôt :

    python3 -B cim-data/tools/moteur_comparables_v1.py \
      --repo "$PWD" \
      --base "$CIM_DATA_INDEX_DIR" \
      --lat 43.295515 --lon 5.397366 \
      --rayon 150 --surface-min 65 --surface-max 80 --pieces 3

La variable `CIM_DATA_INDEX_DIR` doit désigner un répertoire
d'index existant. Elle est transmise explicitement à `--base`.
Aucun chemin absolu du Mac n'est intégré au code.

Tests :

    python3 -B cim-data/tests/test_moteur_comparables_v1.py \
      --repo "$PWD" --indices "$CIM_DATA_INDEX_DIR"

Le test Chave utilise deux points BAN, contrairement à l'exemple CLI
qui utilise un seul point.

## Garanties et limites

- 134 communes / 49 530 candidats dans la base testée.
- Références DVF conservées ; groupes classés à titre indicatif.
- Les dépendances peuvent être incluses dans la valeur foncière.
- Identifiant officiel de mutation absent des index utilisés.
- Rayon géographique ≠ micro-secteur homogène.
- Aucune médiane, aucun prix au m² ni estimation certifiée.
- Les index restent externes au dépôt ; ils doivent être fournis
  explicitement lors de l'exécution et des tests.

Aucun résultat ne doit être affiché publiquement comme une
transaction indépendante ou une estimation certifiée.
