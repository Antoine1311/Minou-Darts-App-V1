import type { RoomData, Player } from './roomService';

/**
 * Initialise l'état "Bart" pour un joueur
 */
export const createEmptyBartState = () => ({
  setsWon: 0,
  gamesWon: 0,
  currentPoints: 0 as number | 'ADV',
  tieBreakPoints: 0,
  acesCount: 0,
  returnWinnersCount: 0,
  servesWon: 0,
  servesPlayed: 0,
  breakPointsConverted: 0,
  breakPointsPlayed: 0,
  heatMap: {} as Record<string, { attempts: number; success: number; perfects?: number }>,
  gamesStreak: 0
});

// Helper pour sauvegarder l'état actuel avant modification
const pushHistory = (room: RoomData): string[] => {
  const history = room.bartConfig?.historyStates || [];
  // On garde les 15 dernières actions pour éviter de surcharger Firestore
  const newHistory = [...history, JSON.stringify(room)].slice(-15);
  return newHistory;
};

/**
 * Fonction pour annuler la dernière action
 */
export const undoBartAction = (room: RoomData): RoomData => {
  if (!room.bartConfig || !room.bartConfig.historyStates || room.bartConfig.historyStates.length === 0) {
    return room;
  }
  const lastStateStr = room.bartConfig.historyStates[room.bartConfig.historyStates.length - 1];
  const lastState = JSON.parse(lastStateStr) as RoomData;
  return lastState;
};

/**
 * Phase 1 : Le serveur sélectionne la cible
 */
export const processBartTargetSelection = (
  room: RoomData, 
  targetNumber: number | 'bull', 
  zone: 'inner' | 'outer'
): RoomData => {
  if (!room.bartConfig) return room;

  const historyStates = pushHistory(room);

  return {
    ...room,
    bartConfig: {
      ...room.bartConfig,
      currentTarget: {
        number: targetNumber,
        zone
      },
      resolutionStep: 'waiting_for_result',
      historyStates
    }
  };
};

/**
 * Gère l'évolution des points d'un jeu normal (hors tie-break)
 */
const addPointToPlayer = (
  scorerState: NonNullable<Player['bartState']>, 
  opponentState: NonNullable<Player['bartState']>,
  pointsToAdd: number = 1
): { scorerWonGame: boolean, nextScorerPoints: number | 'ADV', nextOpponentPoints: number | 'ADV' } => {
  let scorerWonGame = false;
  let nextScorerPoints = scorerState.currentPoints;
  let nextOpponentPoints = opponentState.currentPoints;

  for (let i = 0; i < pointsToAdd; i++) {
    if (scorerWonGame) break; // Déjà gagné

    if (nextScorerPoints === 0) {
      nextScorerPoints = 15;
    } else if (nextScorerPoints === 15) {
      nextScorerPoints = 30;
    } else if (nextScorerPoints === 30) {
      nextScorerPoints = 40;
    } else if (nextScorerPoints === 40) {
      if (nextOpponentPoints === 40) {
        nextScorerPoints = 'ADV';
      } else if (nextOpponentPoints === 'ADV') {
        nextScorerPoints = 40;
        nextOpponentPoints = 40;
      } else {
        scorerWonGame = true;
      }
    } else if (nextScorerPoints === 'ADV') {
      scorerWonGame = true;
    }
  }

  return { scorerWonGame, nextScorerPoints, nextOpponentPoints };
};

/**
 * Phase 2 : Résolution du point
 */
export const processBartResolution = (
  room: RoomData,
  resolution: 'player1_closest' | 'player2_closest' | 'player1_perfect' | 'player2_perfect' | 'cancel'
): RoomData => {
  if (!room.bartConfig) return room;

  const historyStates = pushHistory(room);

  if (resolution === 'cancel') {
    // Si annulé, on réinitialise l'étape pour rejouer le point
    return {
      ...room,
      bartConfig: {
        ...room.bartConfig,
        currentTarget: null,
        resolutionStep: 'waiting_for_target',
        historyStates
      }
    };
  }

  const updatedRoom = JSON.parse(JSON.stringify(room)) as RoomData;
  const bartConfig = { ...updatedRoom.bartConfig! };

  const isPlayer1Winner = resolution === 'player1_closest' || resolution === 'player1_perfect';
  const winnerIndex = isPlayer1Winner ? 0 : 1;
  const loserIndex = isPlayer1Winner ? 1 : 0;
  const isServer = winnerIndex === bartConfig.serverIndex;

  const winner = updatedRoom.players[winnerIndex];
  const loser = updatedRoom.players[loserIndex];

  const isPerfect = resolution === 'player1_perfect' || resolution === 'player2_perfect';
  const pointsEarned = isPerfect ? 2 : 1;

  // Événements d'animation et Statistiques (Ace / Retour Gagnant)
  if (isPerfect) {
    if (isServer) {
      bartConfig.lastEvent = { type: 'ace', playerName: winner.name, timestamp: Date.now() };
      winner.bartState!.acesCount++;
    } else {
      bartConfig.lastEvent = { type: 'retour_gagnant', playerName: winner.name, timestamp: Date.now() };
      winner.bartState!.returnWinnersCount++;
    }
  }
  
  if (isServer) {
    winner.bartState!.servesWon++;
  }
  
  const server = updatedRoom.players[bartConfig.serverIndex];
  if (!server.bartState) server.bartState = createEmptyBartState();
  server.bartState.servesPlayed++;

  // Update Heatmap stats for the server (they picked the target)
  if (bartConfig.currentTarget) {
    const targetKey = `${bartConfig.currentTarget.number}_${bartConfig.currentTarget.zone}`;
    if (!server.bartState.heatMap[targetKey]) {
      server.bartState.heatMap[targetKey] = { attempts: 0, success: 0, perfects: 0 };
    }
    // Assurer la rétrocompatibilité des données existantes dans Firestore
    if (server.bartState.heatMap[targetKey].perfects === undefined) {
      server.bartState.heatMap[targetKey].perfects = 0;
    }
    server.bartState.heatMap[targetKey].attempts++;
    if (isServer) {
      server.bartState.heatMap[targetKey].success++;
      if (isPerfect) {
        server.bartState.heatMap[targetKey].perfects++;
      }
    }
  }

  let setWon = false;
  let matchWon = false;

  if (bartConfig.isTieBreak) {
    const oldTotalPoints = winner.bartState!.tieBreakPoints + loser.bartState!.tieBreakPoints;
    winner.bartState!.tieBreakPoints += pointsEarned;
    
    // Règle du tie-break (7 points, 2 d'écart)
    if (winner.bartState!.tieBreakPoints >= 7 && (winner.bartState!.tieBreakPoints - loser.bartState!.tieBreakPoints) >= 2) {
      setWon = true;
    } else {
      // Alternance du service au tie-break (joueur A : 1er point, puis B: 2, A: 2, etc.)
      const newTotalPoints = winner.bartState!.tieBreakPoints + loser.bartState!.tieBreakPoints;
      
      // On calcule combien de fois on a franchi un nombre de points impair
      let serviceChanges = 0;
      for (let p = oldTotalPoints + 1; p <= newTotalPoints; p++) {
        if (p % 2 === 1) serviceChanges++;
      }
      
      if (serviceChanges % 2 === 1) {
        bartConfig.serverIndex = bartConfig.serverIndex === 0 ? 1 : 0;
      }
    }
  } else {
    // Jeu normal
    const serverIndex = bartConfig.serverIndex;
    const receiverIndex = serverIndex === 0 ? 1 : 0;
    const serverState = updatedRoom.players[serverIndex].bartState!;
    const receiverState = updatedRoom.players[receiverIndex].bartState!;

    // Balle de break si le receveur est à 40 (et le serveur à 0, 15, 30) ou si le receveur est à ADV
    const isBreakPointSituation = (receiverState.currentPoints === 40 &&
      (serverState.currentPoints === 0 || serverState.currentPoints === 15 || serverState.currentPoints === 30)) ||
      receiverState.currentPoints === 'ADV';

    if (isBreakPointSituation) {
      receiverState.breakPointsPlayed++;
    }

    const { scorerWonGame, nextScorerPoints, nextOpponentPoints } = addPointToPlayer(winner.bartState!, loser.bartState!, pointsEarned);
    winner.bartState!.currentPoints = nextScorerPoints;
    loser.bartState!.currentPoints = nextOpponentPoints;

    if (scorerWonGame) {
      if (winnerIndex === receiverIndex) {
        if (!isBreakPointSituation) {
          receiverState.breakPointsPlayed++;
        }
        receiverState.breakPointsConverted++;
      }
      winner.bartState!.gamesWon++;
      winner.bartState!.gamesStreak++;
      loser.bartState!.gamesStreak = 0;
      
      winner.bartState!.currentPoints = 0;
      loser.bartState!.currentPoints = 0;

      // Vérification du Set
      if (winner.bartState!.gamesWon >= 6) {
        if (winner.bartState!.gamesWon - loser.bartState!.gamesWon >= 2) {
          setWon = true;
        } else if (winner.bartState!.gamesWon === 6 && loser.bartState!.gamesWon === 6) {
          bartConfig.isTieBreak = true;
          winner.bartState!.tieBreakPoints = 0;
          loser.bartState!.tieBreakPoints = 0;
        }
      }
      
      // Alternance de service à la fin d'un jeu (seulement si le set n'est pas gagné)
      if (!setWon) {
        bartConfig.serverIndex = bartConfig.serverIndex === 0 ? 1 : 0;
      }
    }
  }

  if (setWon) {
    winner.bartState!.setsWon++;
    winner.bartState!.gamesWon = 0;
    loser.bartState!.gamesWon = 0;
    winner.bartState!.currentPoints = 0;
    loser.bartState!.currentPoints = 0;
    winner.bartState!.tieBreakPoints = 0;
    loser.bartState!.tieBreakPoints = 0;
    bartConfig.isTieBreak = false;
    
    // Alternance de service globale pour commencer le nouveau set
    bartConfig.serverIndex = bartConfig.serverIndex === 0 ? 1 : 0;

    if (winner.bartState!.setsWon >= bartConfig.setsToWin) {
      matchWon = true;
    }
  }

  bartConfig.currentTarget = null;
  bartConfig.resolutionStep = 'waiting_for_target';
  bartConfig.historyStates = historyStates;
  updatedRoom.bartConfig = bartConfig;

  if (matchWon) {
    updatedRoom.status = 'finished';
    updatedRoom.winnerName = winner.name;
    bartConfig.lastEvent = { type: 'match_won', playerName: winner.name, timestamp: Date.now() };
  }

  return updatedRoom;
};
