import type { RoomData, Player, LastCompletedRound } from './roomService';

export interface X01ThrowRecord {
  points: number;
  isDouble: boolean;
  label: string;
}

/**
 * Rejoue l'intégralité d'une partie X01 de façon déterministe à partir de l'historique des lancers.
 * Cette approche élimine tout risque de désynchronisation de score lors des annulations en chaîne ou après des Busts.
 */
export function replayX01Game(
  targetScore: number,
  doubleOut: boolean,
  players: Player[]
): {
  players: Player[];
  activePlayerIndex: number;
  status: 'setup' | 'playing' | 'finished';
  winnerName: string;
  lastCompletedRound: LastCompletedRound | null;
} {
  const numPlayers = players.length;
  if (numPlayers === 0) {
    return { players: [], activePlayerIndex: 0, status: 'playing', winnerName: '', lastCompletedRound: null };
  }

  // 1. Initialiser tous les joueurs à leur état initial
  const simulatedPlayers: Player[] = players.map(p => ({
    ...p,
    score: targetScore,
    scoreBeforeRound: targetScore,
    dartsLeft: 3,
    throwsCount: 0,
    totalPoints: 0,
    avg: 0,
    history: [],
    x01ThrowsHistory: [],
    currentRoundThrows: [],
    roundScores: [],
    lastRoundScore: 0,
    bestRound: 0,
    roundBust: false,
    bustsCount: 0
  }));

  // File d'attente des lancers par joueur (si x01ThrowsHistory est un tableau même vide, il fait foi)
  const playerQueues: X01ThrowRecord[][] = players.map(p => {
    if (Array.isArray(p.x01ThrowsHistory)) {
      return [...p.x01ThrowsHistory];
    }
    // Rétrocompatibilité uniquement si x01ThrowsHistory n'était pas initialisé
    return (p.history || []).map(pts => ({
      points: pts,
      isDouble: pts === 50 || (doubleOut && pts % 2 === 0 && pts <= 40),
      label: pts === 50 ? 'D25' : pts === 25 ? '25' : pts === 0 ? '0' : String(pts)
    }));
  });

  let currentActiveIndex = 0;
  let gameStatus: 'setup' | 'playing' | 'finished' = 'playing';
  let winnerName = '';
  let lastCompletedRound: LastCompletedRound | null = null;

  const totalRemainingThrows = () => playerQueues.reduce((sum, q) => sum + q.length, 0);

  while (totalRemainingThrows() > 0 && gameStatus !== 'finished') {
    const queue = playerQueues[currentActiveIndex];
    const player = simulatedPlayers[currentActiveIndex];

    if (queue.length === 0) {
      const hasOtherThrows = playerQueues.some((q, idx) => idx !== currentActiveIndex && q.length > 0);
      if (!hasOtherThrows) break;
      currentActiveIndex = (currentActiveIndex + 1) % numPlayers;
      continue;
    }

    // Début d'un nouveau tour pour ce joueur
    player.scoreBeforeRound = player.score;
    player.currentRoundThrows = [];
    player.roundBust = false;
    player.dartsLeft = 3;

    let roundEnded = false;
    let roundPointsAccumulated = 0;

    while (player.dartsLeft > 0 && queue.length > 0 && !roundEnded) {
      const nextThrow = queue.shift()!;
      const points = nextThrow.points;
      const isDouble = nextThrow.isDouble;
      const label = nextThrow.label;

      player.history.push(points);
      player.x01ThrowsHistory!.push(nextThrow);
      player.dartsLeft -= 1;
      player.throwsCount += 1;
      roundPointsAccumulated += points;
      player.totalPoints += points;
      player.currentRoundThrows!.push(label);

      const newScore = player.score - points;
      let isBust = false;

      // Règles officielles de Bust & Double Out
      if (newScore < 0) {
        isBust = true;
      } else if (doubleOut) {
        if (newScore === 1) {
          isBust = true;
        } else if (newScore === 0 && !isDouble) {
          isBust = true;
        }
      }

      if (isBust) {
        // Règle officielle PDC/WDF : une volée bustée vaut 0 point marqué dans le total et la moyenne
        player.totalPoints = Math.max(0, player.totalPoints - roundPointsAccumulated);
        roundPointsAccumulated = 0;
        player.score = player.scoreBeforeRound;
        player.dartsLeft = 0;
        player.roundBust = true;
        player.bustsCount = (player.bustsCount || 0) + 1;
        roundEnded = true;
      } else {
        player.score = newScore;
        player.roundBust = false;
      }

      // Moyenne métrique sur 3 fléchettes
      if (player.throwsCount > 0) {
        player.avg = parseFloat(((player.totalPoints / player.throwsCount) * 3).toFixed(1));
      }

      // Victoire
      if (player.score === 0) {
        gameStatus = 'finished';
        winnerName = player.name;
        roundEnded = true;
      }
    }

    // Clôture du tour si 3 fléchettes consommées, Bust ou Victoire
    if (player.dartsLeft === 0 || roundEnded) {
      const roundScore = player.roundBust ? 0 : (player.scoreBeforeRound - player.score);
      player.roundScores = [...(player.roundScores || []), roundScore];
      player.lastRoundScore = roundScore;
      player.bestRound = Math.max(0, ...(player.roundScores || []));

      lastCompletedRound = {
        roundId: `x01-${currentActiveIndex}-${player.throwsCount}`,
        playerIndex: currentActiveIndex,
        playerName: player.name,
        throws: [...(player.currentRoundThrows || [])],
        score: roundScore,
        isBust: !!player.roundBust
      };

      if (gameStatus !== 'finished') {
        player.dartsLeft = 3;
        currentActiveIndex = (currentActiveIndex + 1) % numPlayers;
      }
    }
  }

  return {
    players: simulatedPlayers,
    activePlayerIndex: currentActiveIndex,
    status: gameStatus,
    winnerName,
    lastCompletedRound
  };
}

export const calculateNextX01State = (
  room: RoomData,
  points: number,
  isDouble: boolean = false,
  throwLabel?: string
): RoomData => {
  const targetIndex = room.activePlayerIndex;
  const label = throwLabel || (points === 50 ? 'D25' : points === 25 ? '25' : points === 0 ? '0' : String(points));

  const updatedPlayers = room.players.map((p, idx) => {
    if (idx !== targetIndex) return { ...p };
    const prevX01History = Array.isArray(p.x01ThrowsHistory)
      ? [...p.x01ThrowsHistory]
      : (p.history || []).map(pts => ({
          points: pts,
          isDouble: pts === 50 || (!!room.doubleOut && pts % 2 === 0 && pts <= 40),
          label: pts === 50 ? 'D25' : pts === 25 ? '25' : pts === 0 ? '0' : String(pts)
        }));

    const nextHist = [...prevX01History, { points, isDouble, label }];
    return {
      ...p,
      x01ThrowsHistory: nextHist,
      history: nextHist.map(t => t.points)
    };
  });

  const replayed = replayX01Game(
    room.targetScore || 501,
    !!room.doubleOut,
    updatedPlayers
  );

  return {
    ...room,
    players: replayed.players,
    activePlayerIndex: replayed.activePlayerIndex,
    status: replayed.status,
    winnerName: replayed.winnerName,
    lastCompletedRound: replayed.lastCompletedRound
  };
};

export const undoX01Throw = (room: RoomData): Partial<RoomData> | null => {
  const players = room.players || [];
  if (players.length === 0) return null;

  const totalThrows = players.reduce((sum, p) => {
    const count = Array.isArray(p.x01ThrowsHistory)
      ? p.x01ThrowsHistory.length
      : (p.history ? p.history.length : 0);
    return sum + count;
  }, 0);

  if (totalThrows === 0) return null; // Rien à annuler

  // Identifier le joueur ayant lancé la dernière fléchette
  let lastThrowerIndex = -1;
  const activePlayer = players[room.activePlayerIndex];

  if (room.status === 'finished') {
    lastThrowerIndex = players.findIndex(p => p.name === room.winnerName);
    if (lastThrowerIndex === -1) lastThrowerIndex = room.activePlayerIndex;
  } else if (activePlayer && activePlayer.dartsLeft < 3) {
    lastThrowerIndex = room.activePlayerIndex;
  } else {
    for (let offset = 1; offset <= players.length; offset++) {
      const candidateIdx = (room.activePlayerIndex - offset + players.length) % players.length;
      const candidate = players[candidateIdx];
      const count = Array.isArray(candidate.x01ThrowsHistory)
        ? candidate.x01ThrowsHistory.length
        : (candidate.history ? candidate.history.length : 0);
      if (count > 0) {
        lastThrowerIndex = candidateIdx;
        break;
      }
    }
  }

  if (lastThrowerIndex === -1) return null;

  // Retirer le dernier lancer du joueur identifié en synchronisant aussi history
  const updatedPlayers = players.map((p, idx) => {
    if (idx !== lastThrowerIndex) return { ...p };
    const x01Hist = Array.isArray(p.x01ThrowsHistory)
      ? [...p.x01ThrowsHistory]
      : (p.history || []).map(pts => ({
          points: pts,
          isDouble: pts === 50 || (!!room.doubleOut && pts % 2 === 0 && pts <= 40),
          label: pts === 50 ? 'D25' : pts === 25 ? '25' : pts === 0 ? '0' : String(pts)
        }));

    x01Hist.pop();
    return {
      ...p,
      x01ThrowsHistory: x01Hist,
      history: x01Hist.map(t => t.points)
    };
  });

  const replayed = replayX01Game(
    room.targetScore || 501,
    !!room.doubleOut,
    updatedPlayers
  );

  return {
    players: replayed.players,
    activePlayerIndex: replayed.activePlayerIndex,
    status: replayed.status,
    winnerName: replayed.winnerName,
    lastCompletedRound: replayed.lastCompletedRound
  };
};
