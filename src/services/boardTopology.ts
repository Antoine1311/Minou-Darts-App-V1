/**
 * Topologie et Géométrie de la Cible de Fléchettes
 * 
 * Ce module encode la disposition physique exacte d'une cible standard
 * pour le calcul des variantes de jeu (notamment le Cricket Tactical à
 * numéros aléatoires non-adjacents).
 * 
 * Référence : docs/01_BOARD_TOPOLOGY.md
 */

/**
 * Séquence des 20 secteurs dans le sens horaire, en partant du haut (Midi).
 * Le tableau est circulaire : le secteur 5 (index 19) est adjacent au secteur 20 (index 0).
 */
export const BOARD_SEQUENCE: readonly number[] = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5
];

/**
 * Vérifie si deux numéros sont adjacents sur la cible physique.
 * Deux numéros sont adjacents s'ils sont côte à côte dans BOARD_SEQUENCE
 * (en tenant compte de la circularité : 5 est adjacent à 20).
 * 
 * @param a - Premier numéro (1-20)
 * @param b - Deuxième numéro (1-20)
 * @returns true si les deux numéros sont voisins sur la cible
 */
export function areAdjacent(a: number, b: number): boolean {
  if (a === b) return false;
  
  const indexA = BOARD_SEQUENCE.indexOf(a);
  const indexB = BOARD_SEQUENCE.indexOf(b);
  
  // Si l'un des deux n'est pas dans la séquence (ex: Bull = 25), ils ne sont pas adjacents
  if (indexA === -1 || indexB === -1) return false;
  
  const len = BOARD_SEQUENCE.length;
  // Vérifier la circularité : distance de 1 dans un sens ou dans l'autre
  const distance = Math.abs(indexA - indexB);
  return distance === 1 || distance === len - 1;
}

/**
 * Génère une liste de `count` numéros (parmi 1-20) qui ne sont adjacents
 * à aucun autre numéro de la liste sur la cible physique.
 * 
 * Algorithme : shuffle + filtre greedy avec retry en cas d'échec.
 * Le nombre maximum théorique de numéros non-adjacents sur une cible de 20 est 10,
 * donc trouver 6 non-adjacents est toujours possible.
 * 
 * @param count - Nombre de numéros à générer (6 pour le Cricket standard)
 * @returns Un tableau de `count` numéros non-adjacents, triés par ordre décroissant
 */
export function generateNonAdjacentNumbers(count: number = 6): number[] {
  const maxAttempts = 100; // Sécurité anti-boucle infinie
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidates = shuffleArray([...Array(20)].map((_, i) => i + 1));
    const selected: number[] = [];
    
    for (const num of candidates) {
      // Vérifier que ce numéro n'est adjacent à aucun numéro déjà sélectionné
      const isValid = selected.every(existing => !areAdjacent(num, existing));
      
      if (isValid) {
        selected.push(num);
        if (selected.length === count) {
          // Trier par ordre décroissant pour un affichage cohérent (comme 20, 19, 18...)
          return selected.sort((a, b) => b - a);
        }
      }
    }
    // Si on n'a pas trouvé assez de numéros, on réessaie avec un nouveau shuffle
  }
  
  // Fallback de sécurité (ne devrait jamais arriver pour count ≤ 10)
  console.warn(`boardTopology: Impossible de trouver ${count} numéros non-adjacents après ${maxAttempts} tentatives. Fallback sur des numéros aléatoires.`);
  return shuffleArray([...Array(20)].map((_, i) => i + 1)).slice(0, count).sort((a, b) => b - a);
}

/**
 * Mélange un tableau en place (algorithme de Fisher-Yates).
 */
function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Génère `count` numéros aléatoires parmi 1-20 (sans contrainte d'adjacence).
 * Utilisé pour le Crazy Cricket.
 * 
 * @param count - Nombre de numéros à générer
 * @returns Un tableau de `count` numéros uniques, triés par ordre décroissant
 */
export function generateRandomNumbers(count: number = 6): number[] {
  return shuffleArray([...Array(20)].map((_, i) => i + 1))
    .slice(0, count)
    .sort((a, b) => b - a);
}

/**
 * Génère une liste de `count` numéros consécutifs (adjacents) sur la cible physique
 * en partant d'une position de départ aléatoire.
 * 
 * @param count - Nombre de numéros à générer
 * @returns Un tableau de `count` numéros adjacents, triés par ordre décroissant
 */
export function generateAdjacentNumbers(count: number = 6): number[] {
  const startIndex = Math.floor(Math.random() * BOARD_SEQUENCE.length);
  const selected: number[] = [];
  
  for (let i = 0; i < count; i++) {
    const index = (startIndex + i) % BOARD_SEQUENCE.length;
    selected.push(BOARD_SEQUENCE[index]);
  }
  
  return selected.sort((a, b) => b - a);
}
