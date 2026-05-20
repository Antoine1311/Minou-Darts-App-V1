# 02_GAME_RULES_ADVANCED.md
## Règles et Variantes des Jeux - Minou Dart

### 1. Les Jeux "X01" (101 à 1001)
Le principe reste de réduire son score à exactement 0.
- **Paramètre `startingScore` :** Modulable au lancement de la partie (101, 201, 301, 501, 701, 1001).
- **Paramètre `doubleOut` (Booléen) :**
  - Si `true` : La fléchette victorieuse DOIT être un double ou la bulle centrale. Une fléchette simple menant à 0 provoque un Bust.
  - Si `false` (Master/Single Out) : N'importe quelle fléchette menant à exactement 0 valide la victoire (un simple suffit).

### 2. Le Cricket et ses Variantes
Le principe est de "fermer" 6 numéros + le Bull (soit 7 cibles) en les touchant 3 fois chacun.
- **Variante 1 : Cricket Classique**
  - Cibles fixes : 15, 16, 17, 18, 19, 20 et Bull.
- **Variante 2 : Crazy Cricket (Aléatoire)**
  - Cibles : Le Bull + 6 numéros tirés aléatoirement entre 1 et 20.
- **Variante 3 : Tactical Cricket (Aléatoire Non-Adjacent)**
  - Cibles : Le Bull + 6 numéros tirés aléatoirement, avec la contrainte stricte qu'aucun des 6 numéros tirés ne doit être adjacent à un autre sur la cible (référence : `01_BOARD_TOPOLOGY.md`).
