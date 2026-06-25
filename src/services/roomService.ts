import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  onSnapshot, 
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  limit
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { db, auth } from '../firebase';
import { playerService } from './playerService';
import type { ThemeType } from '../context/ThemeContext';

/** Type de jeu : X01 (décompte), Cricket (fermeture de cibles), Bart (tennis) ou Clock (Tour de l'horloge) */
export type GameType = 'x01' | 'cricket' | 'bart' | 'clock';


/** Variante de Cricket : Classique, Crazy (aléatoire), Tactical (non-adjacent) */
export type CricketVariant = 'classic' | 'crazy' | 'tactical';

export interface Player {
  globalId?: string;            // ID of the persistent cloud player profile
  name: string;
  emoji?: string;
  score: number;                // X01 : points restants | Cricket : points marqués (scoring offensif/défensif)
  scoreBeforeRound?: number;    // X01 : score au début du tour pour gérer le Bust
  avg: number;                  // X01 : moyenne 3 fléchettes | Cricket : MPR (Marks Per Round)
  dartsLeft: number;
  throwsCount: number;
  totalPoints: number;
  history: number[];            // Historique brut des scores pour les statistiques
  bestRound?: number;           // Meilleur score de tour (3 fléchettes)
  lastRound?: string;           // Libellé textuel des lancers du dernier tour (ex: "T20, D10, 5")
  lastRoundScore?: number;      // Score du dernier tour (volée) complété
  roundScores?: number[];       // Historique des scores de chaque tour (volée) pour l'annulation et les stats
  currentRoundThrows?: string[]; // Libellés des lancers du tour en cours
  roundBust?: boolean;          // Indique si le joueur a fait un bust dans ce tour
  bustsCount?: number;          // Nombre total de busts dans la partie X01
  // === Cricket spécifique ===
  cricketMarks?: Record<string, number>; // Marques par cible (ex: { "20": 3, "19": 1, "25": 0 })
  missedDarts?: number;                  // Nombre de fléchettes loupées
  accuracy?: number;                     // Précision globale (%)
  whiteRounds?: number;                  // Nombre de tours à 0 marques
  bestCricketRound?: number;             // Meilleur nombre de marques en 1 tour (0 à 9)
  // === Bart spécifique ===
  bartState?: {
    setsWon: number;
    gamesWon: number;
    currentPoints: number | 'ADV'; // 0, 15, 30, 40, 'ADV'
    tieBreakPoints: number;
    acesCount: number;
    returnWinnersCount: number;
    servesWon: number;
    servesPlayed: number;
    breakPointsConverted: number;
    breakPointsPlayed: number;
    heatMap: Record<string, { attempts: number; success: number; perfects?: number }>; // Statistiques des zones préférentielles
    gamesStreak: number; // Nombre de jeux consécutifs gagnés
  };
  // === Clock spécifique ===
  clockState?: {
    currentTarget: number;
    throwsCount: number;
    hitsCount: number;
    accuracy: number;
    targetHistory: number[];
    throwHistory: boolean[];
  };
}

export interface CalibrationSettings {
  centerX: number;
  centerY: number;
  radius: number;
  rDoubleOuter: number;
  rDoubleInner: number;
  rTripleOuter: number;
  rTripleInner: number;
  rBullOuter: number;
  rBullInner: number;
  haloWhiteRadius?: number;
  haloMaxRadius?: number;
  statsPanelY?: number;
  statsPanelX?: number;
  statsFontSize?: number;
  commentsFontSize?: number;
  statsFontScaleX?: number;
  statsFontScaleY?: number;
  statsPanelWidth?: number;
  statsPanelHeight?: number;
}

export interface RoomData {
  roomId: string;
  theme: ThemeType;
  gameType: GameType;                     // Type de jeu sélectionné
  targetScore: number;                    // Utilisé seulement pour X01
  doubleOut?: boolean;                    // Option Double Out pour X01
  cricketScoringMode?: 'standard' | 'cutthroat'; // Mode de points pour le Cricket
  cricketVariant?: CricketVariant;        // Variante Cricket choisie (si gameType === 'cricket')
  cricketTargets?: number[];              // Les 7 cibles Cricket (ex: [20,19,18,17,16,15,25])
  bartConfig?: {
    setsToWin: number;
    serverIndex: number;
    currentTarget?: {
      number: number | 'bull';
      zone: 'inner' | 'outer';
    } | null;
    resolutionStep: 'waiting_for_target' | 'waiting_for_result';
    isTieBreak: boolean;
    lastEvent?: {
      type: 'ace' | 'retour_gagnant' | 'match_won';
      playerName: string;
      timestamp: number;
    };
    historyStates?: string[];
    inputMethod?: 'keyboard' | 'target';
  };
  activePlayerIndex: number;
  status: 'setup' | 'playing' | 'finished';
  players: Player[];
  createdAt: any;
  creatorId: string;
  winnerName?: string;
  lastUpdate?: any;
  projectorMode?: 'classic' | 'fullscreen' | 'ar'; // Mode de vue du projecteur, synchronisé en temps réel
  calibration?: CalibrationSettings; // Paramètres de calibrage de la cible en Réalité Augmentée
  isCalibrating?: boolean; // Indique si la calibration est en cours (pour synchroniser l'affichage de la cible avec la télécommande)
  clockConfig?: {
    includeBull: boolean;
  };
}

// Générer un code de salon à 4 caractères majuscules simples (ex: "MN42")
const generateRoomId = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export const roomService = {
  /**
   * Crée une nouvelle partie (salon) dans Firestore
   */
  createRoom: async (theme: ThemeType, targetScore: number = 501, gameType: GameType = 'x01'): Promise<string> => {
    // S'authentifier anonymement d'abord
    const userCredential = await signInAnonymously(auth);
    const creatorId = userCredential.user.uid;

    const roomId = generateRoomId();
    const roomRef = doc(db, 'rooms', roomId);
    
    const initialRoom: RoomData = {
      roomId,
      theme,
      gameType,
      targetScore,
      doubleOut: false, // par défaut
      cricketScoringMode: 'standard', // par défaut
      activePlayerIndex: 0,
      status: 'setup',
      players: [],
      createdAt: serverTimestamp(),
      creatorId
    };

    await setDoc(roomRef, initialRoom);
    return roomId;
  },

  /**
   * Vérifie si un salon existe
   */
  checkRoomExists: async (roomId: string): Promise<boolean> => {
    if (!roomId || roomId.length !== 4) return false;
    
    // S'authentifier pour pouvoir lire/écrire
    await signInAnonymously(auth);
    
    const roomRef = doc(db, 'rooms', roomId.toUpperCase());
    const docSnap = await getDoc(roomRef);
    return docSnap.exists();
  },

  /**
   * S'abonne aux modifications en temps réel d'un salon
   */
  subscribeToRoom: (roomId: string, onUpdate: (room: RoomData) => void, onError?: (err: any) => void) => {
    const roomRef = doc(db, 'rooms', roomId.toUpperCase());
    
    return onSnapshot(roomRef, (docSnap) => {
      if (docSnap.exists()) {
        onUpdate(docSnap.data() as RoomData);
      } else {
        if (onError) onError(new Error("Le salon n'existe pas ou a été supprimé."));
      }
    }, (error) => {
      if (onError) onError(error);
    });
  },

  /**
   * Met à jour directement les données brutes d'un salon
   */
  updateRoom: async (roomId: string, data: Partial<RoomData>): Promise<void> => {
    const roomRef = doc(db, 'rooms', roomId.toUpperCase());
    await updateDoc(roomRef, {
      ...data,
      lastUpdate: serverTimestamp()
    });
  },

  /**
   * Fonction pure calculant le prochain état du salon après un lancer X01.
   * Conçue pour être partagée entre le mode en ligne et le mode local de la télécommande.
   */
  calculateNextX01State: (room: RoomData, points: number, isDouble: boolean = false, throwLabel?: string): RoomData => {
    const updatedRoom = { 
      ...room,
      players: room.players.map(p => ({ 
        ...p, 
        history: [...p.history],
        currentRoundThrows: p.currentRoundThrows ? [...p.currentRoundThrows] : []
      }))
    };
    const playerIndex = updatedRoom.activePlayerIndex;
    const player = updatedRoom.players[playerIndex];

    // Initialiser scoreBeforeRound si non défini
    if (player.scoreBeforeRound === undefined) {
      player.scoreBeforeRound = player.score;
    }

    // Si on commence un nouveau tour, s'assurer que currentRoundThrows est vide et roundBust est faux pour le joueur actif
    if (player.dartsLeft === 3) {
      player.currentRoundThrows = [];
      player.roundBust = false;
    }

    // 1. Enregistrer le lancer
    player.history = [...player.history, points];
    player.dartsLeft -= 1;
    player.throwsCount += 1;
    player.totalPoints += points;

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
      // Si doubleOut activé, le score ne peut pas tomber à 1
      if (newScore === 1) {
        isBust = true;
      }
      // Pour arriver à 0, il faut un Double
      else if (newScore === 0 && !isDouble) {
        isBust = true;
      }
    }

    if (isBust) {
      // Bust! On remet le score du début de tour (qui était scoreBeforeRound)
      player.score = player.scoreBeforeRound;
      // On consomme toutes les fléchettes du tour
      player.dartsLeft = 0; 
      player.roundBust = true;
      player.bustsCount = (player.bustsCount || 0) + 1;
    } else {
      player.score = newScore;
      player.roundBust = false;
    }

    // Calcul de la moyenne métrique (Standard 3 fléchettes : (points totaux / lancers) * 3)
    if (player.throwsCount > 0) {
      player.avg = parseFloat(((player.totalPoints / player.throwsCount) * 3).toFixed(1));
    }

    // Mettre à jour le joueur dans le tableau
    updatedRoom.players[playerIndex] = player;

    // Vérifier si le tour est terminé (3 fléchettes lancées, Bust, ou victoire)
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
    } 
    // Gérer la fin de tour (les 3 fléchettes ont été lancées ou Bust)
    else if (player.dartsLeft === 0) {
      // Réinitialiser les fléchettes pour le joueur qui vient de finir
      player.dartsLeft = 3;
      updatedRoom.players[playerIndex] = player;

      // Passer au joueur suivant
      const nextPlayerIndex = (playerIndex + 1) % updatedRoom.players.length;
      updatedRoom.activePlayerIndex = nextPlayerIndex;
      
      // Mettre à jour scoreBeforeRound pour le joueur suivant pour son nouveau tour
      updatedRoom.players[nextPlayerIndex].scoreBeforeRound = updatedRoom.players[nextPlayerIndex].score;
      
      // Réinitialiser les lancers du tour courant du joueur suivant
      updatedRoom.players[nextPlayerIndex].currentRoundThrows = [];
      updatedRoom.players[nextPlayerIndex].roundBust = false;
    }

    return updatedRoom;
  },

  /**
   * Enregistre un lancer de fléchette pour le joueur actif et calcule les scores
   */
  recordThrow: async (roomId: string, room: RoomData, points: number, isDouble: boolean = false, throwLabel?: string): Promise<void> => {
    const nextRoomState = roomService.calculateNextX01State(room, points, isDouble, throwLabel);

    // Sauvegarder dans Firestore
    await roomService.updateRoom(roomId, {
      players: nextRoomState.players,
      activePlayerIndex: nextRoomState.activePlayerIndex,
      status: nextRoomState.status,
      winnerName: nextRoomState.winnerName
    });

    // Si la partie vient de se terminer, on met à jour les statistiques de tous les joueurs
    if (room.status !== 'finished' && nextRoomState.status === 'finished') {
      for (const p of nextRoomState.players) {
        if (p.globalId) {
          const won = p.name === nextRoomState.winnerName;
          // Ignorer l'attente pour ne pas bloquer l'UI
          playerService.updatePlayerStats(p.globalId, won, p.totalPoints, p.throwsCount).catch(console.error);
        }
      }
    }
  },

  /**
   * Enregistre un lancer de fléchette en mode Cricket.
   * Délègue la logique métier au cricketEngine.
   */
  recordCricketThrow: async (roomId: string, room: RoomData, baseNumber: number, multiplier: number): Promise<void> => {
    const { processCricketThrow } = await import('./cricketEngine');
    const { updatedRoom } = processCricketThrow(room, baseNumber, multiplier);
    
    await roomService.updateRoom(roomId, updatedRoom);

    // Si la partie vient de se terminer, on met à jour les statistiques de tous les joueurs
    if (room.status !== 'finished' && updatedRoom.status === 'finished' && updatedRoom.players) {
      for (const p of updatedRoom.players) {
        if (p.globalId) {
          const won = p.name === updatedRoom.winnerName;
          // Ignorer l'attente pour ne pas bloquer l'UI
          playerService.updatePlayerStats(p.globalId, won, p.totalPoints, p.throwsCount).catch(console.error);
        }
      }
    }
  },

  /**
   * Récupère la liste des salons actifs créés par un utilisateur spécifique
   */
  getUserActiveRooms: async (userId: string): Promise<RoomData[]> => {
    try {
      const roomsRef = collection(db, 'rooms');
      const q = query(
        roomsRef,
        where('creatorId', '==', userId),
        limit(10)
      );

      const querySnapshot = await getDocs(q);
      const activeRooms: RoomData[] = [];
      
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data() as RoomData;
        // Filtrer localement pour ne garder que les salons actifs
        if (data.status === 'setup' || data.status === 'playing') {
          activeRooms.push(data);
        }
      });

      // Trier les salons par date de création décroissante (du plus récent au plus ancien)
      activeRooms.sort((a, b) => {
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return bTime - aTime;
      });

      return activeRooms;
    } catch (err) {
      console.error("Erreur lors de la récupération des salons de l'utilisateur :", err);
      return [];
    }
  }
};

/**
 * Extrait les moments forts et faits marquants d'une partie terminée
 */
export function getGameHighlights(room: RoomData): string[] {
  const highlights: string[] = [];
  const players = room.players || [];
  if (players.length === 0) return highlights;

  const isCricket = room.gameType === 'cricket';
  const isBart = room.gameType === 'bart';

  if (isBart) {
    // === Highlights pour Bart ===
    highlights.push("🎾 **Moments forts du match** :");
    
    // 1. Détection de Remontada dans Bart
    if (room.winnerName) {
      const winner = players.find(p => p.name === room.winnerName);
      const loser = players.find(p => p.name !== room.winnerName);
      if (winner && loser && winner.bartState && loser.bartState) {
        if (loser.bartState.setsWon > 0 && winner.bartState.setsWon > loser.bartState.setsWon) {
          highlights.push(`📈 **Remontada de champion !** **${winner.name}** a perdu le premier set avant de renverser totalement le match contre **${loser.name}** !`);
        } else if (winner.bartState.gamesStreak >= 4) {
          highlights.push(`🔥 Série d'enfer : **${winner.name}** a terrassé son adversaire en remportant **${winner.bartState.gamesStreak}** jeux consécutifs !`);
        }
      }
    }

    players.forEach(p => {
      const state = p.bartState;
      if (!state) return;
      
      // 2. Aces et Retours Gagnants
      if (state.acesCount > 0) {
        highlights.push(`🌟 **${p.name}** a frappé **${state.acesCount} ACE(S)** !`);
      }
      if (state.returnWinnersCount > 0) {
        highlights.push(`⚡ **${p.name}** a réalisé **${state.returnWinnersCount} RETOUR(S) GAGNANT(S)** !`);
      }

      // 3. Réussite au service
      if (state.servesPlayed > 0) {
        const serveWinRate = (state.servesWon / state.servesPlayed) * 100;
        if (serveWinRate >= 70 && state.servesPlayed >= 3) {
          highlights.push(`💣 Service de plomb : **${p.name}** a été impérial au service avec **${serveWinRate.toFixed(0)}%** de réussite (${state.servesWon}/${state.servesPlayed}).`);
        }
      }

      // 4. Balles de break converties
      if (state.breakPointsPlayed > 0) {
        const breakRate = (state.breakPointsConverted / state.breakPointsPlayed) * 100;
        if (state.breakPointsConverted >= 2 && breakRate === 100) {
          highlights.push(`🔪 Réalisme chirurgical : **${p.name}** a converti **100%** de ses balles de break (**${state.breakPointsConverted}/${state.breakPointsPlayed}**) !`);
        } else if (state.breakPointsConverted > 0) {
          highlights.push(`🎯 Break : **${p.name}** a converti **${state.breakPointsConverted} balle(s) de break** sur ${state.breakPointsPlayed} jouées (${breakRate.toFixed(0)}%).`);
        }
      }

      // 5. Zone favorite (Heatmap)
      if (state.heatMap) {
        let favoriteZone = '';
        let maxAttempts = 0;
        let successCount = 0;
        
        Object.entries(state.heatMap).forEach(([zone, stats]) => {
          if (stats.attempts > maxAttempts) {
            maxAttempts = stats.attempts;
            favoriteZone = zone;
            successCount = stats.success;
          }
        });
        
        if (maxAttempts >= 3 && favoriteZone) {
          const successRate = ((successCount / maxAttempts) * 100).toFixed(0);
          highlights.push(`🎯 Zone fétiche : **${p.name}** a ciblé en priorité **${favoriteZone}** (réussite de **${successRate}%** sur **${maxAttempts}** tentatives).`);
        }
      }
    });

  } else if (!isCricket) {
    // === Highlights pour X01 ===
    
    // 1. Détection de Remontada en X01
    let remontadaText = '';
    const targetScore = room.targetScore;
    if (room.winnerName) {
      const winner = players.find(p => p.name === room.winnerName);
      if (winner && winner.roundScores && winner.roundScores.length >= 3) {
        let maxDeficit = 0;
        let deficitLeaderName = '';
        let deficitRound = 0;
        
        const maxRounds = Math.max(...players.map(p => p.roundScores?.length || 0));
        const currentScores = players.map(() => targetScore);
        
        for (let r = 0; r < maxRounds; r++) {
          players.forEach((p, idx) => {
            const roundScore = p.roundScores?.[r] ?? 0;
            currentScores[idx] = Math.max(0, currentScores[idx] - roundScore);
          });
          
          const winnerIdx = players.findIndex(p => p.name === room.winnerName);
          const winnerScoreAtRound = currentScores[winnerIdx];
          
          let leaderScore = targetScore;
          let leaderIdx = -1;
          
          currentScores.forEach((score, idx) => {
            if (idx !== winnerIdx && score < leaderScore && score > 0) {
              leaderScore = score;
              leaderIdx = idx;
            }
          });
          
          if (leaderIdx !== -1) {
            const deficit = winnerScoreAtRound - leaderScore;
            if (deficit > maxDeficit && r >= 2) {
              maxDeficit = deficit;
              deficitLeaderName = players[leaderIdx].name;
              deficitRound = r + 1;
            }
          }
        }
        
        if (maxDeficit >= 80 && deficitLeaderName) {
          remontadaText = `📈 **Remontada d'anthologie !** **${room.winnerName}** avait un retard de **${maxDeficit}** points sur **${deficitLeaderName}** au tour **${deficitRound}** avant de renverser le match !`;
        }
      }
    }
    if (remontadaText) {
      highlights.push(remontadaText);
    }

    // 2. Célébration individuelle de 180 et volées élevées
    players.forEach(p => {
      if (!p.roundScores) return;
      const perfectRounds = p.roundScores.filter(s => s === 180).length;
      if (perfectRounds > 0) {
        highlights.push(`👑 Exploit suprême : **${p.name}** a réalisé **${perfectRounds}** coup(s) parfait(s) de **180** !`);
      }
      
      const highRounds = p.roundScores.filter(s => s >= 100 && s < 180).length;
      if (highRounds >= 2) {
        highlights.push(`🔥 Gâchette d'or : **${p.name}** a été redoutable avec **${highRounds}** volées à plus de 100 points !`);
      }
    });

    // 3. Meilleur coup global (si non déjà couvert par le 180 individuel)
    let bestRoundVal = 0;
    let bestRoundPlayer = '';
    players.forEach(p => {
      if ((p.bestRound || 0) > bestRoundVal) {
        bestRoundVal = p.bestRound!;
        bestRoundPlayer = p.name;
      }
    });
    if (bestRoundVal > 0 && bestRoundVal !== 180) {
      if (bestRoundVal >= 100) {
        highlights.push(`🎯 Coup d'éclat : **${bestRoundPlayer}** a signé le meilleur coup avec un score spectaculaire de **${bestRoundVal}** points !`);
      } else {
        highlights.push(`🎯 **${bestRoundPlayer}** a réalisé le meilleur coup de la partie avec **${bestRoundVal}** points.`);
      }
    }

    // 4. Régularité (Meilleure moyenne)
    let bestAvg = 0;
    let bestAvgPlayer = '';
    players.forEach(p => {
      if (p.avg > bestAvg && p.throwsCount >= 6) {
        bestAvg = p.avg;
        bestAvgPlayer = p.name;
      }
    });
    if (bestAvgPlayer) {
      highlights.push(`📈 Régularité : **${bestAvgPlayer}** a été le plus constant avec une moyenne de **${bestAvg.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}** points.`);
    }

    // 5. Cibles Fétiches en X01 (Heuristique d'estimation)
    const getEstimatedTarget = (val: number): number => {
      if (val === 50 || val === 25) return 25;
      if (val > 0 && val <= 60 && val % 3 === 0) return val / 3;
      if (val > 0 && val <= 40 && val % 2 === 0) return val / 2;
      return val;
    };

    players.forEach(p => {
      if (!p.history || p.history.length === 0) return;
      const targetCounts: Record<number, number> = {};
      p.history.forEach(val => {
        if (val === 0) return;
        const target = getEstimatedTarget(val);
        targetCounts[target] = (targetCounts[target] || 0) + 1;
      });
      
      let favoriteTarget = -1;
      let maxCount = 0;
      Object.entries(targetCounts).forEach(([tgt, count]) => {
        if (count > maxCount) {
          maxCount = count;
          favoriteTarget = parseInt(tgt);
        }
      });
      
      if (maxCount >= 6 && favoriteTarget > 0) {
        const targetName = favoriteTarget === 25 ? "Bull's Eye" : String(favoriteTarget);
        highlights.push(`🎯 Viseur bloqué : **${p.name}** s'est acharné sur le **${targetName}** (touché **${maxCount}** fois dans la partie).`);
      }
    });

    // 6. Plus grand nombre de Busts (Cascadeur)
    let maxBusts = 0;
    let maxBustsPlayer = '';
    players.forEach(p => {
      if ((p.bustsCount || 0) > maxBusts) {
        maxBusts = p.bustsCount!;
        maxBustsPlayer = p.name;
      }
    });
    if (maxBusts >= 3) {
      highlights.push(`🤯 Cascadeur du match : **${maxBustsPlayer}** a fait exploser son score à **${maxBusts}** reprises !`);
    } else if (maxBusts > 0) {
      highlights.push(`😮 Sueurs froides : **${maxBustsPlayer}** a commis **${maxBusts}** bust(s) dans la partie !`);
    }

    // 7. Finition Double Out et Finition Éclair
    if (room.winnerName) {
      const winner = players.find(p => p.name === room.winnerName);
      if (winner) {
        if (winner.dartsLeft === 2 && winner.currentRoundThrows && winner.currentRoundThrows.length > 0) {
          const lastThrow = winner.currentRoundThrows[winner.currentRoundThrows.length - 1];
          highlights.push(`🎯 Finition éclair : **${winner.name}** a plié le match dès sa première fléchette du tour sur un superbe **${lastThrow}** !`);
        } else if (room.doubleOut && winner.currentRoundThrows && winner.currentRoundThrows.length > 0) {
          const lastThrowLabel = winner.currentRoundThrows[winner.currentRoundThrows.length - 1];
          if (lastThrowLabel && (lastThrowLabel.startsWith('D') || lastThrowLabel === 'D25')) {
            highlights.push(`🏆 Sang-froid : **${room.winnerName}** a conclu le match sur un superbe Double (**${lastThrowLabel}**) !`);
          }
        }
      }
    }

  } else {
    // === Highlights pour Cricket ===
    const targets = room.cricketTargets || [];

    // 1. Détection de Remontada en Cricket
    let remontadaText = '';
    if (room.winnerName && players.length >= 2) {
      const winnerIdx = players.findIndex(p => p.name === room.winnerName);
      if (winnerIdx !== -1) {
        const simMarks = players.map(() => {
          const m: Record<string, number> = {};
          targets.forEach(t => { m[String(t)] = 0; });
          return m;
        });
        const simScores = players.map(() => 0);
        
        const maxThrows = Math.max(...players.map(p => p.history?.length || 0));
        const maxRounds = Math.ceil(maxThrows / 3);
        const isCutThroat = room.cricketScoringMode === 'cutthroat';
        
        let maxCricketDeficit = 0;
        let deficitLeaderName = '';
        let deficitRound = 0;
        
        for (let r = 0; r < maxRounds; r++) {
          for (let pIdx = 0; pIdx < players.length; pIdx++) {
            const p = players[pIdx];
            const throws = p.history.slice(r * 3, (r + 1) * 3);
            
            throws.forEach(rawPoints => {
              if (rawPoints <= 0) return;
              
              let baseNumber = 0;
              let multiplier = 1;
              if (rawPoints > 100) {
                baseNumber = rawPoints % 100;
                multiplier = Math.floor(rawPoints / 100);
              } else if (rawPoints === 25) {
                baseNumber = 25; multiplier = 1;
              } else if (rawPoints === 50) {
                baseNumber = 25; multiplier = 2;
              }
              
              if (baseNumber > 0 && targets.includes(baseNumber)) {
                const targetKey = String(baseNumber);
                const currentMarks = simMarks[pIdx][targetKey] || 0;
                
                let rawMarks = multiplier;
                if (baseNumber === 25) rawMarks = Math.min(rawMarks, 2);
                
                const marksNeeded = Math.max(0, 3 - currentMarks);
                const marksApplied = Math.min(rawMarks, marksNeeded);
                const excessMarks = rawMarks - marksApplied;
                
                simMarks[pIdx][targetKey] = currentMarks + marksApplied;
                
                if (excessMarks > 0 || currentMarks >= 3) {
                  const scorableMarks = currentMarks >= 3 ? rawMarks : excessMarks;
                  
                  const someOpponentOpen = simMarks.some((marks, idx) => {
                    if (idx === pIdx) return false;
                    return (marks[targetKey] || 0) < 3;
                  });
                  
                  if (someOpponentOpen && scorableMarks > 0) {
                    const pointsValue = baseNumber === 25 ? 25 : baseNumber;
                    const points = scorableMarks * pointsValue;
                    
                    if (isCutThroat) {
                      simMarks.forEach((marks, idx) => {
                        if (idx !== pIdx && (marks[targetKey] || 0) < 3) {
                          simScores[idx] = (simScores[idx] || 0) + points;
                        }
                      });
                    } else {
                      simScores[pIdx] = (simScores[pIdx] || 0) + points;
                    }
                  }
                }
              }
            });
          }
          
          if (r >= 2) {
            const closedCounts = simMarks.map(marks => 
              targets.filter(t => (marks[String(t)] || 0) >= 3).length
            );
            
            const winnerClosed = closedCounts[winnerIdx];
            let leaderIdx = -1;
            let bestClosed = -1;
            
            for (let pIdx = 0; pIdx < players.length; pIdx++) {
              if (pIdx === winnerIdx) continue;
              const pClosed = closedCounts[pIdx];
              if (pClosed > bestClosed) {
                bestClosed = pClosed;
                leaderIdx = pIdx;
              } else if (pClosed === bestClosed && leaderIdx !== -1) {
                const pScore = simScores[pIdx];
                const bestScore = simScores[leaderIdx];
                const isLeaderBetter = isCutThroat ? pScore < bestScore : pScore > bestScore;
                if (isLeaderBetter) {
                  leaderIdx = pIdx;
                }
              }
            }
            
            if (leaderIdx !== -1) {
              const closedDeficit = closedCounts[leaderIdx] - winnerClosed;
              if (closedDeficit >= 2 && closedDeficit > maxCricketDeficit) {
                maxCricketDeficit = closedDeficit;
                deficitLeaderName = players[leaderIdx].name;
                deficitRound = r + 1;
              }
            }
          }
        }
        
        if (maxCricketDeficit >= 2 && deficitLeaderName) {
          remontadaText = `📈 **Remontada de l'espace !** **${room.winnerName}** avait un retard de **${maxCricketDeficit}** cibles sur **${deficitLeaderName}** au tour **${deficitRound}** avant de tout fermer pour l'emporter !`;
        }
      }
    }
    if (remontadaText) {
      highlights.push(remontadaText);
    }

    // 2. Meilleure précision (MPR)
    let bestMpr = 0;
    let bestMprPlayer = '';
    players.forEach(p => {
      if (p.avg > bestMpr && p.throwsCount >= 6) {
        bestMpr = p.avg;
        bestMprPlayer = p.name;
      }
    });
    if (bestMprPlayer) {
      highlights.push(`📈 Précision MPR : **${bestMprPlayer}** a dominé en précision avec un MPR (Marks Per Round) de **${bestMpr.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}** !`);
    }

    // 3. Meilleur scoreur (points)
    let maxScore = 0;
    let maxScorePlayer = '';
    players.forEach(p => {
      if ((p.score || 0) > maxScore) {
        maxScore = p.score || 0;
        maxScorePlayer = p.name;
      }
    });
    if (maxScore > 0 && room.cricketScoringMode !== 'cutthroat') {
      highlights.push(`💰 Artillerie lourde : **${maxScorePlayer}** a été le plus offensif avec un score de **${maxScore}** points marqués.`);
    } else if (maxScore > 0 && room.cricketScoringMode === 'cutthroat') {
      let minScore = 999999;
      let minScorePlayer = '';
      players.forEach(p => {
        if ((p.score || 0) < minScore) {
          minScore = p.score || 0;
          minScorePlayer = p.name;
        }
      });
      if (minScorePlayer) {
        highlights.push(`🛡️ Mur de fer : **${minScorePlayer}** a eu la meilleure défense en n'encaissant que **${minScore}** points.`);
      }
    }

    // 4. Tour parfait ou d'anthologie
    players.forEach(p => {
      if (p.bestCricketRound !== undefined) {
        if (p.bestCricketRound === 9) {
          highlights.push(`👑 Exploit historique ! **${p.name}** a réussi un tour parfait à **9 MARQUES** (3 Triples) !`);
        } else if (p.bestCricketRound >= 6) {
          highlights.push(`🔥 Volée d'anthologie : **${p.name}** a marqué **${p.bestCricketRound}** marques en un seul tour !`);
        }
      }
    });

    // 5. Cibles Fétiches en Cricket
    players.forEach(p => {
      if (!p.history || p.history.length === 0) return;
      const targetCounts: Record<number, number> = {};
      p.history.forEach(rawPoints => {
        if (rawPoints <= 0) return;
        let baseNumber = 0;
        if (rawPoints > 100) baseNumber = rawPoints % 100;
        else if (rawPoints === 25 || rawPoints === 50) baseNumber = 25;
        else baseNumber = rawPoints;
        
        if (baseNumber > 0 && targets.includes(baseNumber)) {
          targetCounts[baseNumber] = (targetCounts[baseNumber] || 0) + 1;
        }
      });
      
      let favoriteTarget = -1;
      let maxCount = 0;
      Object.entries(targetCounts).forEach(([tgt, count]) => {
        if (count > maxCount) {
          maxCount = count;
          favoriteTarget = parseInt(tgt);
        }
      });
      
      if (maxCount >= 5 && favoriteTarget > 0) {
        const targetName = favoriteTarget === 25 ? "Bull's Eye" : String(favoriteTarget);
        highlights.push(`🎯 Viseur calibré : **${p.name}** s'est acharné sur le **${targetName}** avec **${maxCount}** tirs réussis.`);
      }
    });

    // 6. Fermeture et domination du Bull's Eye
    let maxBullMarks = 0;
    let maxBullPlayer = '';
    players.forEach(p => {
      const bullMarks = p.cricketMarks?.['25'] || 0;
      if (bullMarks > maxBullMarks) {
        maxBullMarks = bullMarks;
        maxBullPlayer = p.name;
      }
    });
    if (maxBullMarks >= 3) {
      highlights.push(`🐂 Dompteur de Bull : **${maxBullPlayer}** a fermé le Bull's Eye avec un total de **${maxBullMarks}** marques !`);
    }

    // 7. Précision et fléchettes loupées (Le Maçon)
    let bestAccuracy = 0;
    let bestAccuracyPlayer = '';
    let maxMissed = 0;
    let maxMissedPlayer = '';
    players.forEach(p => {
      if (p.accuracy !== undefined && p.accuracy > bestAccuracy && p.throwsCount >= 6) {
        bestAccuracy = p.accuracy;
        bestAccuracyPlayer = p.name;
      }
      if (p.missedDarts !== undefined && p.missedDarts > maxMissed) {
        maxMissed = p.missedDarts;
        maxMissedPlayer = p.name;
      }
    });
    if (bestAccuracyPlayer) {
      highlights.push(`🎯 Précision chirurgicale : **${bestAccuracyPlayer}** a été le plus précis avec **${bestAccuracy.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}%** de tirs sur cible !`);
    }
    if (maxMissed >= 6 && maxMissedPlayer) {
      highlights.push(`🏗️ Rénovation de salle : **${maxMissedPlayer}** a arrosé le mur avec **${maxMissed}** fléchettes hors cible !`);
    } else if (maxMissed > 2 && maxMissedPlayer) {
      highlights.push(`😢 Manque de réussite : **${maxMissedPlayer}** a envoyé **${maxMissed}** fléchettes dans le décor.`);
    }

    // 8. Tours blancs (Le Pacifiste)
    let maxWhiteRounds = 0;
    let maxWhiteRoundsPlayer = '';
    players.forEach(p => {
      if ((p.whiteRounds || 0) > maxWhiteRounds) {
        maxWhiteRounds = p.whiteRounds!;
        maxWhiteRoundsPlayer = p.name;
      }
    });
    if (maxWhiteRounds >= 3) {
      highlights.push(`🕊️ Diplomate pacifiste : **${maxWhiteRoundsPlayer}** a joué la carte de la paix avec **${maxWhiteRounds}** tours blancs (0 marques).`);
    }
  }

  // Fallback si aucun fait marquant particulier n'a été identifié
  if (highlights.length <= 1 && room.winnerName) {
    highlights.push(`🏆 Félicitations à **${room.winnerName}** pour sa superbe victoire dans cette manche !`);
  }

  return highlights;
}
