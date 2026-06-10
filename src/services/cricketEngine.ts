/**
 * Moteur de Règles du Cricket — Minou Darts
 * 
 * Ce module contient toute la logique métier du jeu Cricket et ses variantes :
 * - Cricket Classique (15-20 + Bull)
 * - Crazy Cricket (6 numéros aléatoires + Bull)
 * - Tactical Cricket (6 numéros non-adjacents + Bull)
 * 
 * Mode de jeu : Cricket Standard (le joueur qui ferme marque les points pour lui-même).
 * Victoire : fermer les 7 cibles ET avoir un score ≥ à celui de tous les adversaires.
 * 
 * Référence : docs/02_GAME_RULES_ADVANCED.md
 */

import { generateNonAdjacentNumbers, generateRandomNumbers, generateAdjacentNumbers } from './boardTopology';
import type { CricketVariant, RoomData } from './roomService';

// ─── Constantes ─────────────────────────────────────────────

/** Cibles fixes du Cricket Classique */
const CLASSIC_TARGETS = [20, 19, 18, 17, 16, 15];

/** Le Bull est toujours la 7ème cible en Cricket */
const BULL = 25;

/** Nombre de marques nécessaires pour fermer un numéro */
const MARKS_TO_CLOSE = 3;

// ─── Génération des cibles ──────────────────────────────────

/**
 * Génère la liste des cibles selon la variante de Cricket choisie et ses options.
 * 
 * @param variant - 'classic' | 'crazy' | 'tactical'
 * @param options - Options de configuration pour le mode Crazy (distribution, bulle)
 * @returns Tableau de numéros (Bull=25 en dernier si actif), triés par ordre décroissant
 */
export function generateCricketTargets(
  variant: CricketVariant,
  options?: {
    distribution?: 'random' | 'non_adjacent' | 'adjacent';
    withBull?: boolean;
  }
): number[] {
  let numbers: number[];
  const withBull = options?.withBull ?? true;
  const distribution = options?.distribution ?? 'random';
  
  if (variant === 'classic') {
    numbers = [...CLASSIC_TARGETS];
  } else {
    // Mode Crazy : dépend de la distribution choisie
    switch (distribution) {
      case 'non_adjacent':
        numbers = generateNonAdjacentNumbers(6);
        break;
      case 'adjacent':
        numbers = generateAdjacentNumbers(6);
        break;
      case 'random':
      default:
        numbers = generateRandomNumbers(6);
    }
  }
  
  // Ajouter le Bull en dernier seulement s'il est activé
  return withBull ? [...numbers, BULL] : numbers;
}

/**
 * Crée un objet de marques Cricket vide pour un joueur (toutes les cibles à 0).
 * 
 * @param targets - Les 7 cibles de la partie (ex: [20,19,18,17,16,15,25])
 * @returns Un Record<string, number> avec chaque cible à 0 marques
 */
export function createEmptyMarks(targets: number[]): Record<string, number> {
  const marks: Record<string, number> = {};
  for (const target of targets) {
    marks[String(target)] = 0;
  }
  return marks;
}

// ─── Logique de scoring ─────────────────────────────────────

/**
 * Symboles d'affichage des marques Cricket.
 * 0 marques = vide, 1 = /, 2 = X, 3+ = ⊗ (fermé)
 */
export function getMarkSymbol(marks: number): string {
  if (marks === 0) return '';
  if (marks === 1) return '/';
  if (marks === 2) return 'X';
  return '⊗'; // 3 ou plus = fermé
}

/**
 * Vérifie si un numéro fait partie des cibles de la partie.
 */
export function isValidCricketTarget(target: number, cricketTargets: number[]): boolean {
  return cricketTargets.includes(target);
}

/**
 * Interface décrivant le résultat d'un lancer Cricket pour le suivi.
 */
export interface CricketThrowResult {
  target: number;           // Numéro touché
  multiplier: number;       // 1 (Simple), 2 (Double), 3 (Triple)
  marksApplied: number;     // Marques effectivement comptées
  pointsScored: number;     // Points marqués sur ce lancer
  wasValid: boolean;        // true si le numéro fait partie des cibles
}

/**
 * Traite un lancer de fléchette en mode Cricket.
 * 
 * Logique :
 * 1. Si le numéro ne fait pas partie des cibles → ignoré (0 marque, 0 point)
 * 2. Calcule les marques brutes (multiplier × 1)
 * 3. Applique les marques jusqu'à fermeture (max 3)
 * 4. Les marques excédentaires deviennent des points SI au moins un adversaire n'a pas fermé
 * 5. Vérifie la condition de victoire
 */
export function processCricketThrow(
  room: RoomData,
  baseNumber: number,
  multiplier: number
): { updatedRoom: Partial<RoomData>; throwResult: CricketThrowResult } {
  const updatedPlayers = room.players.map(p => ({
    ...p,
    cricketMarks: { ...(p.cricketMarks || {}) },
    currentRoundThrows: p.currentRoundThrows ? [...p.currentRoundThrows] : []
  }));

  const playerIndex = room.activePlayerIndex;
  const player = updatedPlayers[playerIndex];
  const targets = room.cricketTargets || [];
  const isCutThroat = room.cricketScoringMode === 'cutthroat';
  
  // Si on commence un nouveau tour, réinitialiser les lancers
  if (player.dartsLeft === 3) {
    player.currentRoundThrows = [];
  }
  
  // Résultat par défaut (lancer non valide ou manqué)
  let throwResult: CricketThrowResult = {
    target: baseNumber,
    multiplier,
    marksApplied: 0,
    pointsScored: 0,
    wasValid: false
  };

  // 1. Vérifier si le numéro fait partie des cibles
  if (baseNumber !== 0 && isValidCricketTarget(baseNumber, targets)) {
    throwResult.wasValid = true;
    const targetKey = String(baseNumber);
    const currentMarks = player.cricketMarks?.[targetKey] || 0;
    
    // Déterminer les marques brutes
    // Pour le Bull : Simple = 1 marque, Double = 2 marques (Inner Bull)
    let rawMarks = multiplier;
    if (baseNumber === BULL) {
      // Triple Bull n'existe pas en fléchettes réelles
      rawMarks = Math.min(multiplier, 2);
    }
    
    // 2. Appliquer les marques jusqu'à MARKS_TO_CLOSE
    const marksNeeded = Math.max(0, MARKS_TO_CLOSE - currentMarks);
    const marksApplied = Math.min(rawMarks, marksNeeded);
    const excessMarks = rawMarks - marksApplied;
    
    // Mettre à jour les marques du joueur
    player.cricketMarks![targetKey] = currentMarks + marksApplied;
    
    throwResult.marksApplied = marksApplied;
    
    // 3. Les marques excédentaires deviennent des points
    // SEULEMENT si le joueur a fermé ET qu'au moins un adversaire n'a pas fermé
    if (excessMarks > 0 || currentMarks >= MARKS_TO_CLOSE) {
      const scorableMarks = currentMarks >= MARKS_TO_CLOSE ? rawMarks : excessMarks;
      
      // Vérifier si au moins un adversaire n'a pas fermé cette cible
      const someOpponentOpen = updatedPlayers.some((p, idx) => {
        if (idx === playerIndex) return false;
        return (p.cricketMarks?.[targetKey] || 0) < MARKS_TO_CLOSE;
      });
      
      if (someOpponentOpen && scorableMarks > 0) {
        const pointsValue = baseNumber === BULL ? 25 : baseNumber;
        const points = scorableMarks * pointsValue;
        
        if (isCutThroat) {
          // Cut Throat : On donne les points aux adversaires qui n'ont pas encore fermé
          updatedPlayers.forEach((p, idx) => {
            if (idx !== playerIndex && (p.cricketMarks?.[targetKey] || 0) < MARKS_TO_CLOSE) {
              p.score = (p.score || 0) + points;
              p.totalPoints = (p.totalPoints || 0) + points;
            }
          });
        } else {
          // Standard : On s'attribue les points
          player.score = (player.score || 0) + points;
          player.totalPoints = (player.totalPoints || 0) + points;
        }
        throwResult.pointsScored = points;
      }
    }
  }
  
  // 4. Mise à jour des compteurs du joueur et calcul des statistiques de tirs réussis/loupés
  player.dartsLeft -= 1;
  player.throwsCount += 1;
  player.history = [...player.history, baseNumber === 0 ? 0 : baseNumber + multiplier * 100];
  
  const isMissed = baseNumber === 0 || !isValidCricketTarget(baseNumber, targets);
  if (isMissed) {
    player.missedDarts = (player.missedDarts || 0) + 1;
  }
  
  player.accuracy = parseFloat((((player.throwsCount - (player.missedDarts || 0)) / player.throwsCount) * 100).toFixed(1));

  // Enregistrer le libellé du lancer
  let label = '';
  if (baseNumber === 0) {
    label = '0';
  } else {
    const prefix = multiplier === 3 ? 'T' : multiplier === 2 ? 'D' : '';
    label = `${prefix}${baseNumber}`;
  }
  player.currentRoundThrows = [...(player.currentRoundThrows || []), label];
  
  // Calcul du MPR (Marks Per Round) — stocké dans le champ `avg` pour compatibilité
  const totalMarksCount = Object.values(player.cricketMarks || {}).reduce(
    (sum, m) => sum + Math.min(m, MARKS_TO_CLOSE), 0
  );
  const roundsPlayed = Math.ceil(player.throwsCount / 3);
  player.avg = roundsPlayed > 0 
    ? parseFloat((totalMarksCount / roundsPlayed).toFixed(2)) 
    : 0;
  
  // 5. Vérifier la victoire (nécessaire pour savoir si le tour est terminé)
  let status: RoomData['status'] = room.status;
  let winnerName = room.winnerName || '';
  
  const playerAllClosed = targets.every(
    t => (player.cricketMarks?.[String(t)] || 0) >= MARKS_TO_CLOSE
  );
  
  if (playerAllClosed) {
    // Vérifier les scores
    const playerScore = player.score || 0;
    const hasHighestOrLowestScore = updatedPlayers.every((p, idx) => {
      if (idx === playerIndex) return true;
      const opponentScore = p.score || 0;
      // En Cut Throat, le score doit être inférieur ou égal (le plus bas gagne)
      return isCutThroat ? playerScore <= opponentScore : playerScore >= opponentScore;
    });
    
    if (hasHighestOrLowestScore) {
      status = 'finished';
      winnerName = player.name;
    }
  }

  // Si le tour se termine (ou la partie est finie), calculer les stats de tour (bestCricketRound, whiteRounds)
  // On identifie les lancers de ce tour à partir de player.history (les 1, 2 ou 3 derniers lancers de ce tour)
  const isRoundEnded = player.dartsLeft === 0 || status === 'finished';
  if (isRoundEnded) {
    const throwsThisRoundCount = player.currentRoundThrows.length;
    const roundHistory = player.history.slice(player.history.length - throwsThisRoundCount);
    
    // Calculer le nombre de marques appliquées (ou brutes si cible fermée) durant cette volée
    let marksThisRound = 0;
    roundHistory.forEach(rawPoints => {
      if (rawPoints > 0) {
        let baseNum = 0;
        let mult = 1;
        if (rawPoints > 100) {
          baseNum = rawPoints % 100;
          mult = Math.floor(rawPoints / 100);
        } else if (rawPoints === 25) {
          baseNum = 25; mult = 1;
        } else if (rawPoints === 50) {
          baseNum = 25; mult = 2;
        }
        
        if (baseNum > 0 && isValidCricketTarget(baseNum, targets)) {
          let rawMarks = mult;
          if (baseNum === BULL) rawMarks = Math.min(rawMarks, 2);
          marksThisRound += rawMarks;
        }
      }
    });

    if (marksThisRound === 0) {
      player.whiteRounds = (player.whiteRounds || 0) + 1;
    }
    
    player.bestCricketRound = Math.max(player.bestCricketRound || 0, marksThisRound);
  }

  updatedPlayers[playerIndex] = player;
  

  
  // 6. Gestion de fin de tour (3 fléchettes lancées)
  let activePlayerIndex = room.activePlayerIndex;
  if (player.dartsLeft === 0 && status !== 'finished') {
    player.dartsLeft = 3;
    updatedPlayers[playerIndex] = player;
    activePlayerIndex = (playerIndex + 1) % updatedPlayers.length;
    
    // Réinitialiser les lancers du tour courant du joueur suivant
    updatedPlayers[activePlayerIndex].currentRoundThrows = [];
  }
  
  return {
    updatedRoom: {
      players: updatedPlayers,
      activePlayerIndex,
      status,
      winnerName
    },
    throwResult
  };
}

/**
 * Annule le dernier lancer Cricket (Undo) de façon chronologique et robuste.
 * 
 * @param room - L'état actuel de la room
 * @returns Un objet partiel RoomData à appliquer, ou null si rien à annuler
 */
export function undoCricketThrow(room: RoomData): Partial<RoomData> | null {
  const updatedPlayers = room.players.map(p => ({
    ...p,
    cricketMarks: { ...(p.cricketMarks || {}) },
    history: [...p.history],
    currentRoundThrows: p.currentRoundThrows ? [...p.currentRoundThrows] : []
  }));

  const targets = room.cricketTargets || [];
  let targetPlayerIndex = room.activePlayerIndex;
  let player = updatedPlayers[targetPlayerIndex];
  
  // Si le joueur actif a ses 3 fléchettes, l'undo concerne le joueur précédent
  if (player.dartsLeft === 3) {
    const prevIndex = (targetPlayerIndex - 1 + updatedPlayers.length) % updatedPlayers.length;
    const prevPlayer = updatedPlayers[prevIndex];
    
    if (prevPlayer.history.length === 0) {
      return null; // Personne n'a encore joué
    }
    
    targetPlayerIndex = prevIndex;
    player = prevPlayer;
  }
  
  if (player.history.length === 0) {
    return null;
  }
  
  // Retirer le dernier lancer du joueur ciblé
  player.history.pop();
  player.throwsCount = Math.max(0, player.throwsCount - 1);
  
  // Rétablir la fléchette
  if (player.dartsLeft === 3) {
    player.dartsLeft = 1;
  } else {
    player.dartsLeft += 1;
  }
  
  updatedPlayers[targetPlayerIndex] = player;
  
  // Recalculer toutes les marques et points chronologiquement depuis l'origine de la partie
  const histories = updatedPlayers.map(p => [...p.history]);
  
  // Réinitialiser les joueurs
  for (const p of updatedPlayers) {
    p.cricketMarks = createEmptyMarks(targets);
    p.score = 0;
    p.totalPoints = 0;
    p.throwsCount = 0;
    p.history = [];
    p.dartsLeft = 3;
    p.currentRoundThrows = [];
    p.missedDarts = 0;
    p.accuracy = 0;
    p.whiteRounds = 0;
    p.bestCricketRound = 0;
  }
  
  let playerIndices = updatedPlayers.map(() => 0);
  let activeIdx = 0;
  let finished = false;
  
  while (!finished) {
    const historyIndex = playerIndices[activeIdx];
    const playerHist = histories[activeIdx];
    
    if (historyIndex >= playerHist.length) {
      const anyoneElse = playerIndices.some((idx, pIdx) => idx < histories[pIdx].length);
      if (!anyoneElse) {
        break;
      }
      activeIdx = (activeIdx + 1) % updatedPlayers.length;
      continue;
    }
    
    const lancersRestants = playerHist.length - historyIndex;
    const lancersDuTour = Math.min(3, lancersRestants);
    
    // Réinitialiser les lancers pour ce tour
    const p = updatedPlayers[activeIdx];
    p.currentRoundThrows = [];
    
    for (let i = 0; i < lancersDuTour; i++) {
      const rawPoints = playerHist[historyIndex + i];
      p.history.push(rawPoints);
      p.throwsCount += 1;
      p.dartsLeft -= 1;
      
      let label = '0';
      let baseNumber = 0;
      let mult = 1;
      
      if (rawPoints > 0) {
        if (rawPoints > 100) {
          // Nouveau format encodé bijectivement
          baseNumber = rawPoints % 100;
          mult = Math.floor(rawPoints / 100);
        } else if (rawPoints === 25) {
          baseNumber = 25; mult = 1;
        } else if (rawPoints === 50) {
          baseNumber = 25; mult = 2;
        } else {
          // Ancien format (rétrocompatibilité par devinette)
          let found = false;
          for (const t of targets) {
            if (t === 25) continue;
            for (const m of [3, 2, 1]) {
              if (t * m === rawPoints) {
                baseNumber = t;
                mult = m;
                found = true;
                break;
              }
            }
            if (found) break;
          }
        }
        
        if (baseNumber > 0) {
          const prefix = mult === 3 ? 'T' : mult === 2 ? 'D' : '';
          label = `${prefix}${baseNumber}`;
          
          const targetKey = String(baseNumber);
          const currentMarks = p.cricketMarks![targetKey] || 0;
          
          let rawMarks = mult;
          if (baseNumber === BULL) rawMarks = Math.min(rawMarks, 2);
          
          const marksNeeded = Math.max(0, MARKS_TO_CLOSE - currentMarks);
          const marksApplied = Math.min(rawMarks, marksNeeded);
          const excessMarks = rawMarks - marksApplied;
          
          p.cricketMarks![targetKey] = currentMarks + marksApplied;
          
          if (excessMarks > 0 || currentMarks >= MARKS_TO_CLOSE) {
            const scorableMarks = currentMarks >= MARKS_TO_CLOSE ? rawMarks : excessMarks;
            
            const someOpponentOpen = updatedPlayers.some((op, opIdx) => {
              if (opIdx === activeIdx) return false;
              return (op.cricketMarks?.[targetKey] || 0) < MARKS_TO_CLOSE;
            });
            
            if (someOpponentOpen && scorableMarks > 0) {
              const pointsValue = baseNumber === BULL ? 25 : baseNumber;
              const points = scorableMarks * pointsValue;
              
              if (room.cricketScoringMode === 'cutthroat') {
                updatedPlayers.forEach((op, opIdx) => {
                  if (opIdx !== activeIdx && (op.cricketMarks?.[targetKey] || 0) < MARKS_TO_CLOSE) {
                    op.score = (op.score || 0) + points;
                    op.totalPoints = (op.totalPoints || 0) + points;
                  }
                });
              } else {
                p.score = (p.score || 0) + points;
                p.totalPoints = (p.totalPoints || 0) + points;
              }
            }
          }
        }
      }
      
      const isMissed = baseNumber === 0 || !isValidCricketTarget(baseNumber, targets);
      if (isMissed) {
        p.missedDarts = (p.missedDarts || 0) + 1;
      }
      
      p.currentRoundThrows = [...(p.currentRoundThrows || []), label];
    }
    
    // Calcul des statistiques de précision et du tour fini à la fin de la volée
    p.accuracy = parseFloat((((p.throwsCount - (p.missedDarts || 0)) / p.throwsCount) * 100).toFixed(1));
    
    // Si c'est un tour complet (ou dernier lancer de la simulation pour ce joueur), on calcule le tour blanc / meilleur tour
    const throwsThisRoundCount = p.currentRoundThrows.length;
    const roundHistory = p.history.slice(p.history.length - throwsThisRoundCount);
    let marksThisRound = 0;
    
    roundHistory.forEach(rawPoints => {
      if (rawPoints > 0) {
        let baseNum = 0;
        let m = 1;
        if (rawPoints > 100) {
          baseNum = rawPoints % 100;
          m = Math.floor(rawPoints / 100);
        } else if (rawPoints === 25) {
          baseNum = 25; m = 1;
        } else if (rawPoints === 50) {
          baseNum = 25; m = 2;
        }
        if (baseNum > 0 && isValidCricketTarget(baseNum, targets)) {
          let rawMarks = m;
          if (baseNum === BULL) rawMarks = Math.min(rawMarks, 2);
          marksThisRound += rawMarks;
        }
      }
    });

    if (marksThisRound === 0) {
      p.whiteRounds = (p.whiteRounds || 0) + 1;
    }
    p.bestCricketRound = Math.max(p.bestCricketRound || 0, marksThisRound);
    
    playerIndices[activeIdx] += lancersDuTour;
    
    if (p.dartsLeft === 0) {
      p.dartsLeft = 3;
      activeIdx = (activeIdx + 1) % updatedPlayers.length;
    }
  }
  
  // Recalculer les moyennes (MPR) de chaque joueur à la fin de la simulation
  for (const p of updatedPlayers) {
    const totalMarks = Object.values(p.cricketMarks || {}).reduce(
      (sum, m) => sum + Math.min(m, MARKS_TO_CLOSE), 0
    );
    const rounds = Math.ceil(p.throwsCount / 3);
    p.avg = rounds > 0 ? parseFloat((totalMarks / rounds).toFixed(2)) : 0;
    p.accuracy = p.throwsCount > 0 ? parseFloat((((p.throwsCount - (p.missedDarts || 0)) / p.throwsCount) * 100).toFixed(1)) : 0;
  }
  
  return {
    players: updatedPlayers,
    activePlayerIndex: targetPlayerIndex,
    status: 'playing',
    winnerName: ''
  };
}
