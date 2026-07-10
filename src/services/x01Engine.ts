import type { RoomData } from './roomService';

export const calculateNextX01State = (room: RoomData, points: number, isDouble: boolean = false, throwLabel?: string): RoomData => {
  const updatedRoom = { 
    ...room,
    players: room.players.map(p => ({ 
      ...p, 
      history: [...(p.history || [])],
      currentRoundThrows: p.currentRoundThrows ? [...p.currentRoundThrows] : []
    }))
  };
  const playerIndex = updatedRoom.activePlayerIndex;
  const player = updatedRoom.players[playerIndex];

  // Initialiser scoreBeforeRound si non défini
  if (player.scoreBeforeRound === undefined) {
    player.scoreBeforeRound = player.score;
  }

  // Si on commence un nouveau tour, s'assurer que currentRoundThrows est vide et roundBust est faux
  if (player.dartsLeft === 3) {
    player.currentRoundThrows = [];
    player.roundBust = false;
  }

  // 1. Enregistrer le lancer
  player.history = [...player.history, points];
  player.dartsLeft -= 1;
  player.throwsCount = (player.throwsCount || 0) + 1;
  player.totalPoints = (player.totalPoints || 0) + points;

  // Ajouter le libellé du lancer
  if (throwLabel) {
    player.currentRoundThrows = [...(player.currentRoundThrows || []), throwLabel];
  } else {
    player.currentRoundThrows = [...(player.currentRoundThrows || []), String(points)];
  }

  // Calcul du nouveau score théorique
  const newScore = player.score - points;
  let isBust = false;

  // Règle du "Bust" (Dépassement) et Double Out
  if (newScore < 0) {
    isBust = true;
  } else if (updatedRoom.doubleOut) {
    if (newScore === 1) {
      isBust = true;
    } else if (newScore === 0 && !isDouble) {
      isBust = true;
    }
  }

  if (isBust) {
    // Bust! On remet le score du début de tour
    player.score = player.scoreBeforeRound;
    player.dartsLeft = 0; 
    player.roundBust = true;
    player.bustsCount = (player.bustsCount || 0) + 1;
  } else {
    player.score = newScore;
    player.roundBust = false;
  }

  // Calcul de la moyenne métrique
  if (player.throwsCount > 0) {
    player.avg = parseFloat(((player.totalPoints / player.throwsCount) * 3).toFixed(1));
  }

  updatedRoom.players[playerIndex] = player;

  // Vérifier si le tour est terminé (3 fléchettes, Bust, ou victoire)
  const isRoundEnded = player.dartsLeft === 0 || player.score === 0;
  if (isRoundEnded) {
    const roundScore = player.roundBust ? 0 : ((player.scoreBeforeRound ?? player.score) - player.score);
    player.roundScores = [...(player.roundScores || []), roundScore];
    player.lastRoundScore = roundScore;
    player.bestRound = Math.max(0, ...(player.roundScores || []));
  }

  // Vérifier si le joueur a gagné
  if (player.score === 0) {
    updatedRoom.status = 'finished';
    updatedRoom.winnerName = player.name;
  } else if (player.dartsLeft === 0) {
    // Passer au joueur suivant
    player.dartsLeft = 3;
    updatedRoom.players[playerIndex] = player;

    const nextPlayerIndex = (playerIndex + 1) % updatedRoom.players.length;
    updatedRoom.activePlayerIndex = nextPlayerIndex;
    
    updatedRoom.players[nextPlayerIndex].scoreBeforeRound = updatedRoom.players[nextPlayerIndex].score;
    updatedRoom.players[nextPlayerIndex].currentRoundThrows = [];
    updatedRoom.players[nextPlayerIndex].roundBust = false;
  }

  return updatedRoom;
};

export const undoX01Throw = (room: RoomData): Partial<RoomData> | null => {
  const updatedPlayers = room.players.map(p => ({
    ...p,
    history: [...(p.history || [])],
    currentRoundThrows: p.currentRoundThrows ? [...p.currentRoundThrows] : [],
    roundScores: p.roundScores ? [...p.roundScores] : []
  }));
  
  let targetPlayerIndex = room.activePlayerIndex;
  let player = updatedPlayers[targetPlayerIndex];
  let crossedRoundBoundary = false;
  const wasFinished = room.status === 'finished';

  // Si le tour n'est pas entamé ou si le jeu est fini, on annule le coup du joueur précédent
  if ((player.dartsLeft === 3 && !wasFinished) || wasFinished) {
    const prevPlayerIndex = (room.activePlayerIndex - 1 + room.players.length) % room.players.length;
    const prevPlayer = updatedPlayers[prevPlayerIndex];
    
    // Si c'est le début de partie et personne n'a joué
    if (!prevPlayer.history || prevPlayer.history.length === 0) {
      if (player.history && player.history.length > 0) {
        // En cas de partie terminée où le winner a juste fini son tour
        targetPlayerIndex = room.activePlayerIndex;
      } else {
        return null; // Rien à annuler
      }
    } else {
      targetPlayerIndex = prevPlayerIndex;
      player = prevPlayer;
      crossedRoundBoundary = true;
    }
  }

  // Si on est vraiment tout au début de la partie
  if (!player.history || player.history.length === 0) return null;

  const lastThrow = player.history.pop();
  if (lastThrow !== undefined) {
    player.throwsCount = Math.max(0, player.throwsCount - 1);
    player.totalPoints = Math.max(0, player.totalPoints - lastThrow);
    
    if (player.currentRoundThrows && player.currentRoundThrows.length > 0) {
      player.currentRoundThrows.pop();
    }
    
    // Si la fléchette annulée était un Bust
    if (player.roundBust) {
      player.roundBust = false;
      player.bustsCount = Math.max(0, (player.bustsCount || 1) - 1);
      // Re-calculer le score courant en fonction du score au début du tour
      player.score = player.scoreBeforeRound !== undefined ? player.scoreBeforeRound : player.score;
      // Soustraire tous les lancers de l'historique de ce tour
      const currentTourThrows = player.history.length % 3;
      const recentThrowsCount = currentTourThrows === 0 && player.history.length > 0 ? 3 : currentTourThrows;
      for(let i=0; i<recentThrowsCount; i++){
        player.score -= player.history[player.history.length - 1 - i];
      }
    } else {
      player.score += lastThrow;
    }

    if (crossedRoundBoundary || wasFinished) {
      if (player.roundScores && player.roundScores.length > 0) {
        player.roundScores.pop();
        player.lastRoundScore = player.roundScores.length > 0 ? player.roundScores[player.roundScores.length - 1] : 0;
        player.bestRound = player.roundScores.length > 0 ? Math.max(...player.roundScores) : 0;
      }
    }

    // Le joueur récupère une fléchette (ou passe de 0 à 1)
    if (crossedRoundBoundary || wasFinished) {
       player.dartsLeft = 1;
    } else {
       player.dartsLeft += 1;
    }

    // Moyenne
    if (player.throwsCount > 0) {
      player.avg = parseFloat(((player.totalPoints / player.throwsCount) * 3).toFixed(1));
    } else {
      player.avg = 0;
    }

    updatedPlayers[targetPlayerIndex] = player;

    return {
      players: updatedPlayers,
      activePlayerIndex: targetPlayerIndex,
      status: 'playing',
      winnerName: ''
    };
  }
  return null;
};
