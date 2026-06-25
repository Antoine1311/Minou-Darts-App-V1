import type { RoomData, Player } from './roomService';

export interface ClockState {
  currentTarget: number;       // 1 à 20, puis 25 (ou s'arrête à 20)
  throwsCount: number;        // Nombre total de fléchettes lancées
  hitsCount: number;          // Nombre total de cibles touchées
  accuracy: number;           // Précision en %
  targetHistory: number[];    // Historique des cibles pour l'annulation (Undo)
  throwHistory: boolean[];    // Historique des résultats (true = Touché, false = Loupé) pour l'annulation (Undo)
}

export const clockEngine = {
  /**
   * Initialise ou s'assure que le clockState existe pour un joueur
   */
  initPlayerState: (player: Player): Player => {
    if (player.clockState) return player;
    return {
      ...player,
      clockState: {
        currentTarget: 1,
        throwsCount: 0,
        hitsCount: 0,
        accuracy: 0,
        targetHistory: [],
        throwHistory: []
      }
    };
  },

  /**
   * Calcule le prochain état après un lancer (Loupé ou Touché)
   */
  processClockThrow: (room: RoomData, hit: boolean): RoomData => {
    // Cloner la room et les joueurs de manière immuable
    const updatedRoom: RoomData = {
      ...room,
      players: room.players.map(p => {
        const cloned = { ...p };
        if (cloned.clockState) {
          cloned.clockState = {
            ...cloned.clockState,
            targetHistory: [...cloned.clockState.targetHistory],
            throwHistory: [...cloned.clockState.throwHistory]
          };
        } else {
          cloned.clockState = {
            currentTarget: 1,
            throwsCount: 0,
            hitsCount: 0,
            accuracy: 0,
            targetHistory: [],
            throwHistory: []
          };
        }
        cloned.currentRoundThrows = cloned.currentRoundThrows ? [...cloned.currentRoundThrows] : [];
        return cloned;
      })
    };

    const playerIndex = updatedRoom.activePlayerIndex;
    const player = updatedRoom.players[playerIndex];
    const state = player.clockState!;

    // Sauvegarder l'état actuel dans l'historique avant modification
    state.targetHistory.push(state.currentTarget);
    state.throwHistory.push(hit);

    // Incrémenter les lancers
    state.throwsCount += 1;
    player.throwsCount += 1;
    player.dartsLeft -= 1;

    if (hit) {
      state.hitsCount += 1;
      if (!player.currentRoundThrows) player.currentRoundThrows = [];
      player.currentRoundThrows.push('Touché');
      
      const includeBull = room.clockConfig?.includeBull ?? true;
      if (state.currentTarget === 20) {
        if (includeBull) {
          state.currentTarget = 25;
        } else {
          // Partie terminée !
          updatedRoom.status = 'finished';
          updatedRoom.winnerName = player.name;
        }
      } else if (state.currentTarget === 25) {
        // Partie terminée !
        updatedRoom.status = 'finished';
        updatedRoom.winnerName = player.name;
      } else {
        state.currentTarget += 1;
      }
    } else {
      if (!player.currentRoundThrows) player.currentRoundThrows = [];
      player.currentRoundThrows.push('Loupé');
    }

    // Calcul de la précision
    if (state.throwsCount > 0) {
      state.accuracy = parseFloat(((state.hitsCount / state.throwsCount) * 100).toFixed(1));
    }

    // Si la partie vient de se terminer, on s'arrête là
    if (updatedRoom.status === 'finished') {
      return updatedRoom;
    }

    // Si la volée de 3 fléchettes est finie
    if (player.dartsLeft === 0) {
      player.dartsLeft = 3;
      player.currentRoundThrows = [];
      updatedRoom.activePlayerIndex = (playerIndex + 1) % updatedRoom.players.length;
    }

    return updatedRoom;
  },

  /**
   * Annule le dernier lancer enregistré
   */
  undoClockThrow: (room: RoomData): RoomData => {
    const hasAnyThrows = room.players.some(p => p.clockState && p.clockState.throwsCount > 0);
    if (!hasAnyThrows) return room;

    const updatedRoom: RoomData = {
      ...room,
      players: room.players.map(p => {
        const cloned = { ...p };
        if (cloned.clockState) {
          cloned.clockState = {
            ...cloned.clockState,
            targetHistory: [...cloned.clockState.targetHistory],
            throwHistory: [...cloned.clockState.throwHistory]
          };
        }
        cloned.currentRoundThrows = cloned.currentRoundThrows ? [...cloned.currentRoundThrows] : [];
        return cloned;
      })
    };

    let targetPlayerIndex = updatedRoom.activePlayerIndex;
    
    // Si la partie est finie, le vainqueur est celui qui a fait le dernier lancer
    if (updatedRoom.status === 'finished') {
      updatedRoom.status = 'playing';
      updatedRoom.winnerName = '';
      const winnerIdx = updatedRoom.players.findIndex(p => p.name === room.winnerName);
      if (winnerIdx !== -1) {
        targetPlayerIndex = winnerIdx;
        updatedRoom.activePlayerIndex = winnerIdx;
      }
    } else {
      // Si le joueur actif actuel a 3 fléchettes, le dernier lancer a été fait par le joueur précédent
      const currentPlayer = updatedRoom.players[targetPlayerIndex];
      if (currentPlayer.dartsLeft === 3) {
        const prevPlayerIndex = (targetPlayerIndex - 1 + updatedRoom.players.length) % updatedRoom.players.length;
        const prevPlayer = updatedRoom.players[prevPlayerIndex];
        if (prevPlayer.clockState && prevPlayer.clockState.throwsCount > 0) {
          targetPlayerIndex = prevPlayerIndex;
          updatedRoom.activePlayerIndex = prevPlayerIndex;
          prevPlayer.dartsLeft = 0; // Temporairement remis à 0
        }
      }
    }

    const player = updatedRoom.players[targetPlayerIndex];
    const state = player.clockState;
    if (!state || state.throwsCount === 0) return room;

    const lastHit = state.throwHistory.pop();
    const lastTarget = state.targetHistory.pop();

    if (lastTarget !== undefined) {
      state.currentTarget = lastTarget;
    }

    state.throwsCount -= 1;
    player.throwsCount -= 1;
    player.dartsLeft += 1;

    if (lastHit) {
      state.hitsCount -= 1;
    }

    // Calcul de la précision
    if (state.throwsCount > 0) {
      state.accuracy = parseFloat(((state.hitsCount / state.throwsCount) * 100).toFixed(1));
    } else {
      state.accuracy = 0;
    }

    // Retrait du dernier lancer de l'affichage du tour
    if (!player.currentRoundThrows) player.currentRoundThrows = [];
    if (player.currentRoundThrows.length > 0) {
      player.currentRoundThrows.pop();
    } else {
      // Si la liste est vide car on vient de remonter un tour, on reconstitue le tour précédent
      const recentThrows: string[] = [];
      const startIndex = Math.floor((state.throwsCount - 1) / 3) * 3;
      for (let i = startIndex; i < state.throwsCount; i++) {
        recentThrows.push(state.throwHistory[i] ? 'Touché' : 'Loupé');
      }
      player.currentRoundThrows = recentThrows;
    }

    return updatedRoom;
  }
};
