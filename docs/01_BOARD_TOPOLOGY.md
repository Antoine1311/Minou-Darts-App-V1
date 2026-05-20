# 01_BOARD_TOPOLOGY.md
## Topologie et Géométrie de la Cible de Fléchettes

Pour le calcul des variantes de jeu (notamment le Cricket à numéros aléatoires non adjacents), le système doit comprendre la disposition physique exacte d'une cible de fléchettes standard.

### 1. Séquence des Secteurs (Sens horaire)
En partant du haut (Midi) et en tournant dans le sens des aiguilles d'une montre, l'ordre strict des 20 secteurs est le suivant :
`[20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]`

### 2. Définition de l'Adjacence
Deux numéros sont considérés comme "adjacents" s'ils sont côte à côte dans le tableau ci-dessus. 
- *Exemple 1 :* Les numéros adjacents au `20` sont le `5` (à gauche) et le `1` (à droite).
- *Exemple 2 :* Les numéros adjacents au `16` sont le `7` et le `8`.

### 3. Les Zones Centrales
- **Outer Bull (Bulle Extérieure / Verte) :** Vaut 25 points.
- **Inner Bull (Bulle Intérieure / Rouge) :** Vaut 50 points (Considéré comme un Double 25).
- Le centre n'est adjacent à aucun secteur de base dans la logique du Cricket.

### 4. Règle pour l'algorithme "Cricket Non-Adjacent"
Lors de la génération de la liste des 6 numéros (+ le Bull) pour cette variante :
Le script devra tirer un nombre au hasard. Pour chaque tirage suivant, il devra vérifier dans le tableau de séquence que le nouveau numéro n'est ni `Index - 1` ni `Index + 1` (en gérant la circularité du tableau, où le 5 et le 20 se touchent) par rapport aux numéros déjà sélectionnés.
