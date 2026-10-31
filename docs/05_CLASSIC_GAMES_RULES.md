# 05_CLASSIC_GAMES_RULES.md
## Spécifications des Règles des Jeux Classiques de Fléchettes - Minou Dart

Ce document détaille les règles officielles, les variantes populaires ainsi que les spécifications techniques et logiques pour l'implémentation de nouveaux modes de jeu classiques dans l'application **Minou Dart**.

---

## 📊 Matrice Récapitulative des Jeux

| Jeu | Cibles | Nb Joueurs | Profil / Intérêt | Complexité Logique |
| :--- | :--- | :--- | :--- | :--- |
| **Killer** | 1 numéro par joueur | 2 à 8+ | Convivial, pub, élimination directe | Moyenne |
| **Halve-It** | Séquence prédéfinie (7-10 tours) | 1 à 8 | Suspense, punitif, tout public | Faible |
| **Shanghai** | Tours 1 à 7 (ou 1 à 20) | 1 à 8 | Vitesse, KO instantané | Faible |
| **Gotcha !** | Toute la cible (Course aux points) | 2 à 8 | Taquin, retournements de situation | Faible |
| **Count-Up** | Libre (8 tours / 24 fléchettes) | 1 à 8 | Échauffement, statistiques, solo | Très faible |
| **Baseball** | Secteurs 1 à 9 (9 manches) | 1 à 6 | Accessible, familial | Faible |
| **Tic-Tac-Toe** | Grille 3×3 de secteurs | 2 (ou 2 équipes) | Visuel, tactique, duel | Moyenne |
| **Scram** | Secteurs 1 à 20 + Bull | 2 (ou 2 équipes) | Asymétrique, duel stratégique | Faible |
| **Chase the Dragon** | T10 à T20, Bull, Double Bull | 1 à 4 | Précision experte, entraînement | Faible |

---

## 1. Killer (Le Tueur)

### 1.1 Objectif
Devenir le « Killer » de la partie pour ensuite éliminer tous les autres joueurs en ciblant leurs numéros respectifs. Le dernier joueur avec au moins une vie gagne.

### 1.2 Paramètres de Configuration
- `initialLives` : Nombre de vies par joueur (Classique : 3 vies ou 5 vies).
- `assignmentMode` :
  - **Manuel / Choix du joueur :** Chaque joueur choisit un numéro unique (1 à 20).
  - **Tirage de précision :** Chaque joueur lance une fléchette de sa mauvaise main (ou main normale) ; le numéro touché devient son numéro.
- `qualificationRule` :
  - **Option Doubles (Standard) :** Il faut toucher le double de son numéro pour devenir Killer.
  - **Option 3 Hits :** Il faut accumuler 3 impacts sur son numéro (Simple = 1, Double = 2, Triple = 3).
- `suicideRule` (Booléen) : Si un joueur déjà Killer touche accidentellement son propre numéro, il perd une vie.

### 1.3 Déroulement d'un Tour
1. **Phase de Qualification :**
   - Le joueur vise son propre numéro pour remplir la condition de qualification.
   - Les tirs sur les numéros adverses sont ignorés tant qu'il n'est pas Killer.
2. **Phase Killer :**
   - Dès qu'un joueur est qualifié Killer, il peut viser les numéros de n'importe quel joueur encore en jeu.
   - Chaque impact sur le numéro d'un adversaire lui retire des vies :
     - En règle standard : 1 impact simple = 1 vie en moins, Double = 2 vies, Triple = 3 vies (ou seulement les doubles selon la sévérité choisie).
3. **Élimination :**
   - Dès qu'un joueur tombe à 0 vie, il est éliminé de la manche.

### 1.4 Modèle de Données Suggéré (TypeScript)
```typescript
interface KillerPlayerState {
  targetNumber: number; // 1 à 20
  lives: number;        // ex: 3 ou 5
  isKiller: boolean;
  hitsToQualify: number; // progression si mode 3 hits
  isEliminated: boolean;
}
```

---

## 2. Halve-It / Half-It (Diviser par 2)

### 2.1 Objectif
Accumuler le score le plus élevé possible à travers une série de manches à cibles obligatoires. En cas de manche blanche (aucune fléchette sur la cible), le score total est divisé par deux.

### 2.2 Séquence des Manches
La séquence classique comprend 7 à 9 manches prédéfinies :
1. **Secteur 20**
2. **Secteur 16**
3. **N'importe quel Double** (valeur réelle du double doublée)
4. **Secteur 14**
5. **Secteur 11**
6. **N'importe quel Triple** (valeur réelle du triple triplée)
7. **Secteur 25 / Bull** (Simple Bull = 25, Double Bull = 50)

*(Variante "Triangle des Bermudes" : 12, 13, 14, Doubles, 15, 16, 17, Triples, 18, 19, 20, Bull).*

### 2.3 Déroulement & Comptage
- À chaque manche, les joueurs lancent 3 fléchettes sur la cible imposée.
- **Réussite :** Tous les points marqués sur la cible requise s'additionnent au score global du joueur.
- **Pénalité Halve-It :** Si le joueur ne place **aucune** de ses 3 fléchettes dans la cible imposée (score de la volée = 0), son score total actuel est **divisé par 2**.
  - Règle d'arrondi : Arrondi standard au supérieur (ex: 75 / 2 = 38).

### 2.4 Modèle de Données Suggéré
```typescript
type HalveItTarget = 
  | { type: 'number'; value: number }
  | { type: 'any_double' }
  | { type: 'any_triple' }
  | { type: 'bull' };

interface HalveItConfig {
  rounds: HalveItTarget[];
}
```

---

## 3. Shanghai

### 3.1 Objectif
Obtenir le plus grand score cumulé après avoir parcouru les cibles du jeu, OU remporter la partie instantanément en réalisant un « Shanghai ».

### 3.2 Déroulement
- Se joue traditionnellement en 7 tours (numéros 1 à 7) ou 20 tours (numéros 1 à 20).
- Au tour $N$, seul le secteur $N$ rapporte des points :
  - Simple = $N \times 1$
  - Double = $N \times 2$
  - Triple = $N \times 3$
- Tout tir en dehors du secteur $N$ rapporte 0 point.

### 3.3 La Règle du KO Instantané (« Shanghai »)
Si, au cours d'une même volée de 3 fléchettes sur le secteur du tour, un joueur réalise :
- **1 Simple** + **1 Double** + **1 Triple** (dans n'importe quel ordre),
il réalise un **Shanghai** et **remporte immédiatement la partie**, quel que soit l'écart de points au classement.

### 3.4 Modèle de Données Suggéré
```typescript
interface ShanghaiTurnEvaluation {
  hasSingle: boolean;
  hasDouble: boolean;
  hasTriple: boolean;
  isInstantWin: boolean; // hasSingle && hasDouble && hasTriple
}
```

---

## 4. Gotcha !

### 4.1 Objectif
Être le premier joueur à atteindre exactement un score cible prédéfini (ex: 301 ou 501), en partant de 0.

### 4.2 Règles Spéciales
1. **Addition continue :** Chaque fléchette marque sa valeur normale (simples, doubles, triples, bull).
2. **Le coup Gotcha (Écrasement) :**
   - Si à la fin de sa volée (ou immédiatement lors d'un lancer, selon option), le score d'un joueur $A$ atteint **exactement** le score actuel d'un joueur $B$, le score du joueur $B$ est **immédiatement réinitialisé à 0** !
3. **Le Bust (Dépassement) :**
   - Si un joueur dépasse le score cible, sa volée complète est annulée et son score revient à celui du début de son tour.

---

## 5. Count-Up (Course aux points)

### 5.1 Objectif
Maximiser son score total sur un nombre fixe de tours. C'est le mode d'entraînement par excellence (très populaire sur les cibles électroniques professionnelles).

### 5.2 Paramètres
- `numberOfRounds` : Standard = 8 tours (soit 24 fléchettes au total).
- `bullScoring` :
  - **Split Bull (Acier traditionnel) :** Simple Bull = 25 pts, Double Bull = 50 pts.
  - **Fat Bull (Électronique / Soft-tip) :** Tout le Bullseye (interne et externe) vaut 50 pts.

### 5.3 Métriques et Statistiques Clés à Afficher
- **PPD (Points Per Dart) :** Score total divisé par le nombre de fléchettes lancées.
- **PPR (Points Per Round / Moyenne par volée) :** Score total divisé par le nombre de tours complétés.
- **Score Maximum Théorique :** 1 440 points (8 tours de $3 \times \text{Triple 20} = 180$).

---

## 6. Baseball

### 6.1 Objectif
Marquer le plus grand nombre de points (« runs ») à travers 9 manches (Innings 1 à 9).

### 6.2 Déroulement
- La partie compte 9 manches.
- À la manche 1, on ne vise que le secteur 1. À la manche 2, le secteur 2... jusqu'à la manche 9.
- **Comptage des points :**
  - Simple = 1 run
  - Double = 2 runs
  - Triple = 3 runs
- Score maximum par manche = 9 runs (3 triples). Score maximum sur la partie = 81 runs.
- **Extra-Innings (Prolongations) :** En cas d'égalité à la fin de la 9e manche, des manches supplémentaires sont jouées sur le secteur 10, puis 11, etc., jusqu'à désignation d'un vainqueur.

---

## 7. Tic-Tac-Toe (Morpion)

### 7.1 Objectif
Être le premier joueur (ou équipe) à aligner 3 cases conquises (horizontalement, verticalement ou en diagonale) sur une grille de 3×3.

### 7.2 Configuration de la Grille
La grille comporte 9 cibles prédéfinies. Une disposition classique équilibrée est :
```
[  12  ] [  20  ] [  18  ]
[  11  ] [ Bull ] [  15  ]
[  14  ] [  19  ] [  16  ]
```
*(Variante : Chiffres tirés aléatoirement ou cases spéciales « N'importe quel Double / Triple »).*

### 7.3 Conquête des Cases
- Pour s'approprier une case, un joueur doit marquer **3 impacts** sur le secteur correspondant :
  - Simple = 1 impact
  - Double = 2 impacts
  - Triple = 3 impacts (conquête immédiate en un tir)
- **Verrouillage définitif :** Dès qu'un joueur a complété les 3 impacts, la case lui appartient définitivement avec son symbole (X ou O). L'adversaire ne peut plus marquer dessus.

---

## 8. Scram (Le Bloqueur et le Marqueur)

### 8.1 Objectif
Jeu asymétrique en duel (1 contre 1 ou équipe contre équipe) disputé en deux manches. Le vainqueur est celui qui cumule le plus grand score lors de sa phase de « Marqueur ».

### 8.2 Déroulement des Deux Manches
- **Manche 1 :**
  - **Joueur A (Le Bloqueur) :** Il vise les secteurs 1 à 20 et le Bull. Dès qu'il touche un secteur ouvert, ce secteur est immédiatement « fermé / bloqué ». Il ne marque pas de points.
  - **Joueur B (Le Marqueur) :** Il vise les secteurs qui ne sont pas encore fermés par le Bloqueur. Chaque fléchette réussie ajoute des points à son score.
  - Fin de manche 1 : Dès que les 21 cibles (1 à 20 + Bull) sont fermées par le Bloqueur.
- **Manche 2 :**
  - Rôles inversés : Le Joueur B devient le Bloqueur et le Joueur A devient le Marqueur.
  - Fin de manche 2 : Quand le Joueur B a fermé tous les secteurs.

### 8.3 Condition de Victoire
Comparaison des scores finaux obtenus en tant que Marqueur. Le joueur avec le plus haut score l'emporte.

---

## 9. Chase the Dragon (Chasse au Dragon)

### 9.1 Objectif
Course de vitesse et de haute précision : valider successivement et strictement dans l'ordre les cibles majeures du jeu de fléchettes.

### 9.2 Ordre Strict des Cibles
1. **Triple 10**
2. **Triple 11**
3. **Triple 12**
4. **Triple 13**
5. **Triple 14**
6. **Triple 15**
7. **Triple 16**
8. **Triple 17**
9. **Triple 18**
10. **Triple 19**
11. **Triple 20**
12. **Simple Bull (25)**
13. **Double Bull (50)**

### 9.3 Règle de Progression
- Seul le secteur exact de l'étape courante permet de passer à la suivante. Les simples et les doubles des secteurs 10 à 20 ne rapportent rien et ne font pas avancer.
- Si un joueur touche la cible requise avec sa 1ère fléchette, ses 2e et 3e fléchettes de la volée peuvent enchaîner directement sur les cibles suivantes.
- Le premier à réussir le Double Bull final remporte la victoire.

---

## 🛠️ Recommandations d'Architecture pour Minou Dart

1. **Uniformisation des moteurs (`*Engine.ts`) :**
   - Chaque jeu doit implémenter une signature commune dans `src/services/` :
     - `createEmpty[Game]State()`
     - `handle[Game]Throw(room: RoomData, segment: DartSegment): RoomData`
     - `undoLastThrow(room: RoomData): RoomData`
2. **Réutilisation des composants :**
   - Les vues `Projector` et `Remote` existantes de **Clock** et **Cricket** peuvent servir de matrices de départ :
     - `Halve-It` & `Shanghai` partagent le principe d'une cible courante par manche (proche de l'horloge).
     - `Scram` et `Tic-Tac-Toe` partagent le principe des 3 marques et fermetures de secteurs (identique au Cricket).
