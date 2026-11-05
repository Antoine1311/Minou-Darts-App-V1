import { collection, doc, addDoc, getDocs, updateDoc, query, where, serverTimestamp, runTransaction, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface GlobalPlayerStats {
  gamesPlayed: number;
  wins: number;
  totalPoints: number;
  dartsThrown: number;
}

export interface GlobalPlayer {
  id: string;
  ownerId: string;
  name: string;
  emoji: string;
  stats: GlobalPlayerStats;
  createdAt: any;
}

const LOCAL_PLAYERS_STORAGE_KEY = 'minou-dart-local-saved-players';

export const playerService = {
  /**
   * Récupérer tous les joueurs locaux enregistrés dans la mémoire du téléphone
   */
  getLocalPlayers: (): GlobalPlayer[] => {
    try {
      const data = localStorage.getItem(LOCAL_PLAYERS_STORAGE_KEY);
      if (!data) return [];
      const parsed: GlobalPlayer[] = JSON.parse(data);
      return parsed.sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      console.error("Erreur lecture des joueurs locaux dans localStorage :", e);
      return [];
    }
  },

  /**
   * Créer ou enregistrer un joueur localement dans le téléphone
   */
  saveLocalPlayer: (name: string, emoji: string = '🎯'): GlobalPlayer => {
    const localPlayers = playerService.getLocalPlayers();
    const cleanName = name.trim();
    const existing = localPlayers.find(p => p.name.toLowerCase() === cleanName.toLowerCase());
    if (existing) {
      return existing;
    }

    const newPlayer: GlobalPlayer = {
      id: `local-player-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ownerId: 'local-device',
      name: cleanName,
      emoji: emoji || '🎯',
      stats: {
        gamesPlayed: 0,
        wins: 0,
        totalPoints: 0,
        dartsThrown: 0
      },
      createdAt: new Date().toISOString()
    };

    try {
      const updated = [...localPlayers, newPlayer];
      localStorage.setItem(LOCAL_PLAYERS_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error("Erreur sauvegarde du joueur local :", e);
    }

    return newPlayer;
  },

  /**
   * Supprimer un joueur de la mémoire locale du téléphone
   */
  deleteLocalPlayer: (playerIdOrName: string): void => {
    try {
      const localPlayers = playerService.getLocalPlayers();
      const filtered = localPlayers.filter(p => p.id !== playerIdOrName && p.name !== playerIdOrName);
      localStorage.setItem(LOCAL_PLAYERS_STORAGE_KEY, JSON.stringify(filtered));
    } catch (e) {
      console.error("Erreur suppression joueur local :", e);
    }
  },

  /**
   * Mettre à jour l'emoji d'un joueur local
   */
  updateLocalPlayerEmoji: (playerIdOrName: string, newEmoji: string): void => {
    try {
      const localPlayers = playerService.getLocalPlayers();
      const updated = localPlayers.map(p => {
        if (p.id === playerIdOrName || p.name === playerIdOrName) {
          return { ...p, emoji: newEmoji };
        }
        return p;
      });
      localStorage.setItem(LOCAL_PLAYERS_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error("Erreur mise à jour emoji joueur local :", e);
    }
  },

  /**
   * Mettre à jour les statistiques d'un joueur local dans la mémoire du téléphone
   */
  updateLocalPlayerStats: (playerIdOrName: string, won: boolean, points: number, darts: number): void => {
    try {
      const localPlayers = playerService.getLocalPlayers();
      let matched = false;
      const updated = localPlayers.map(p => {
        if (p.id === playerIdOrName || p.name === playerIdOrName) {
          matched = true;
          const currentStats = p.stats || { gamesPlayed: 0, wins: 0, totalPoints: 0, dartsThrown: 0 };
          return {
            ...p,
            stats: {
              gamesPlayed: (currentStats.gamesPlayed || 0) + 1,
              wins: won ? (currentStats.wins || 0) + 1 : (currentStats.wins || 0),
              totalPoints: (currentStats.totalPoints || 0) + points,
              dartsThrown: (currentStats.dartsThrown || 0) + darts
            }
          };
        }
        return p;
      });

      // Si le joueur n'était pas encore dans la liste locale mais a joué une partie locale
      if (!matched && playerIdOrName) {
        updated.push({
          id: playerIdOrName.startsWith('local-player-') ? playerIdOrName : `local-player-${Date.now()}`,
          ownerId: 'local-device',
          name: playerIdOrName.replace(/^local-player-\d+-?/, ''),
          emoji: '🎯',
          stats: {
            gamesPlayed: 1,
            wins: won ? 1 : 0,
            totalPoints: points,
            dartsThrown: darts
          },
          createdAt: new Date().toISOString()
        });
      }

      localStorage.setItem(LOCAL_PLAYERS_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error("Erreur mise à jour des stats du joueur local :", e);
    }
  },

  /**
   * Annuler les statistiques d'un joueur local (lors d'un Undo après match)
   */
  revertLocalPlayerStats: (playerIdOrName: string, won: boolean, points: number, darts: number): void => {
    try {
      const localPlayers = playerService.getLocalPlayers();
      const updated = localPlayers.map(p => {
        if (p.id === playerIdOrName || p.name === playerIdOrName) {
          const currentStats = p.stats || { gamesPlayed: 0, wins: 0, totalPoints: 0, dartsThrown: 0 };
          return {
            ...p,
            stats: {
              gamesPlayed: Math.max(0, (currentStats.gamesPlayed || 0) - 1),
              wins: won ? Math.max(0, (currentStats.wins || 0) - 1) : (currentStats.wins || 0),
              totalPoints: Math.max(0, (currentStats.totalPoints || 0) - points),
              dartsThrown: Math.max(0, (currentStats.dartsThrown || 0) - darts)
            }
          };
        }
        return p;
      });
      localStorage.setItem(LOCAL_PLAYERS_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error("Erreur annulation des stats du joueur local :", e);
    }
  },

  /**
   * Créer un nouveau joueur dans le Cloud (si en ligne)
   */
  createPlayer: async (ownerId: string, name: string, emoji: string): Promise<GlobalPlayer> => {
    // Si hors-ligne, basculer immédiatement sur le stockage local
    if (!navigator.onLine) {
      return playerService.saveLocalPlayer(name, emoji);
    }

    const playersRef = collection(db, 'players');
    
    const newPlayerData = {
      ownerId,
      name,
      emoji,
      stats: {
        gamesPlayed: 0,
        wins: 0,
        totalPoints: 0,
        dartsThrown: 0
      },
      createdAt: serverTimestamp()
    };
    
    const docRef = await addDoc(playersRef, newPlayerData);
    
    const created: GlobalPlayer = {
      id: docRef.id,
      ...newPlayerData,
      createdAt: new Date()
    };

    // Mettre également en cache local
    const localPlayers = playerService.getLocalPlayers();
    if (!localPlayers.some(p => p.id === created.id || p.name === created.name)) {
      localStorage.setItem(LOCAL_PLAYERS_STORAGE_KEY, JSON.stringify([...localPlayers, created]));
    }

    return created;
  },

  /**
   * Récupérer les joueurs appartenant à un utilisateur spécifique dans le Cloud
   */
  getPlayersByOwner: async (ownerId: string): Promise<GlobalPlayer[]> => {
    if (!navigator.onLine) {
      return playerService.getLocalPlayers();
    }

    try {
      const playersRef = collection(db, 'players');
      const q = query(playersRef, where("ownerId", "==", ownerId));
      
      const snapshot = await getDocs(q);
      const players: GlobalPlayer[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        players.push({
          id: doc.id,
          ownerId: data.ownerId,
          name: data.name,
          emoji: data.emoji,
          stats: data.stats || { gamesPlayed: 0, wins: 0, totalPoints: 0, dartsThrown: 0 },
          createdAt: data.createdAt?.toDate?.() || new Date()
        });
      });
      
      return players.sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      console.warn("Échec récupération joueurs Cloud, repli sur le stockage local :", e);
      return playerService.getLocalPlayers();
    }
  },

  /**
   * Mettre à jour l'emoji d'un joueur (Cloud ou Local)
   */
  updatePlayerEmoji: async (playerId: string, newEmoji: string): Promise<void> => {
    playerService.updateLocalPlayerEmoji(playerId, newEmoji);

    if (playerId.startsWith('local-player-') || !navigator.onLine) {
      return;
    }

    try {
      const playerRef = doc(db, 'players', playerId);
      await updateDoc(playerRef, {
        emoji: newEmoji
      });
    } catch (e) {
      console.error("Erreur mise à jour emoji Cloud :", e);
    }
  },

  /**
   * Supprimer un joueur (Cloud et Local)
   */
  deletePlayer: async (playerId: string): Promise<void> => {
    playerService.deleteLocalPlayer(playerId);

    if (playerId.startsWith('local-player-') || !navigator.onLine) {
      return;
    }

    try {
      const playerRef = doc(db, 'players', playerId);
      await deleteDoc(playerRef);
    } catch (e) {
      console.error("Erreur suppression joueur Cloud :", e);
    }
  },

  /**
   * Mettre à jour les statistiques d'un joueur à la fin d'une partie (Cloud ou Local)
   */
  updatePlayerStats: async (playerId: string, won: boolean, points: number, darts: number, playerName?: string): Promise<void> => {
    // Si profil local ou hors-ligne : mettre à jour le localStorage du smartphone
    if (!playerId || playerId.startsWith('local-player-') || !navigator.onLine) {
      playerService.updateLocalPlayerStats(playerId || playerName || '', won, points, darts);
      if (playerName && playerName !== playerId) {
        playerService.updateLocalPlayerStats(playerName, won, points, darts);
      }
      return;
    }
    
    // Si profil Cloud : transaction Firestore
    const playerRef = doc(db, 'players', playerId);
    
    try {
      await runTransaction(db, async (transaction) => {
        const playerDoc = await transaction.get(playerRef);
        if (!playerDoc.exists()) {
          // Repli sur le local si le document cloud n'est plus accessible
          playerService.updateLocalPlayerStats(playerName || playerId, won, points, darts);
          return;
        }

        const data = playerDoc.data();
        const currentStats = data.stats || { gamesPlayed: 0, wins: 0, totalPoints: 0, dartsThrown: 0 };
        
        transaction.update(playerRef, {
          "stats.gamesPlayed": (currentStats.gamesPlayed || 0) + 1,
          "stats.wins": won ? (currentStats.wins || 0) + 1 : (currentStats.wins || 0),
          "stats.totalPoints": (currentStats.totalPoints || 0) + points,
          "stats.dartsThrown": (currentStats.dartsThrown || 0) + darts
        });
      });
    } catch (e) {
      console.warn("Erreur mise à jour statistiques Cloud, repli local :", e);
      playerService.updateLocalPlayerStats(playerName || playerId, won, points, darts);
    }
  },

  /**
   * Annule l'enregistrement des statistiques d'une fin de partie lorsqu'un joueur corrige le dernier coup gagnant
   */
  revertPlayerStats: async (playerId: string, won: boolean, points: number, darts: number, playerName?: string): Promise<void> => {
    if (!playerId || playerId.startsWith('local-player-') || !navigator.onLine) {
      playerService.revertLocalPlayerStats(playerId || playerName || '', won, points, darts);
      if (playerName && playerName !== playerId) {
        playerService.revertLocalPlayerStats(playerName, won, points, darts);
      }
      return;
    }

    const playerRef = doc(db, 'players', playerId);

    try {
      await runTransaction(db, async (transaction) => {
        const playerDoc = await transaction.get(playerRef);
        if (!playerDoc.exists()) {
          playerService.revertLocalPlayerStats(playerName || playerId, won, points, darts);
          return;
        }

        const data = playerDoc.data();
        const currentStats = data.stats || { gamesPlayed: 0, wins: 0, totalPoints: 0, dartsThrown: 0 };

        transaction.update(playerRef, {
          "stats.gamesPlayed": Math.max(0, (currentStats.gamesPlayed || 0) - 1),
          "stats.wins": won ? Math.max(0, (currentStats.wins || 0) - 1) : (currentStats.wins || 0),
          "stats.totalPoints": Math.max(0, (currentStats.totalPoints || 0) - points),
          "stats.dartsThrown": Math.max(0, (currentStats.dartsThrown || 0) - darts)
        });
      });
    } catch (e) {
      console.warn("Erreur annulation statistiques Cloud, repli local :", e);
      playerService.revertLocalPlayerStats(playerName || playerId, won, points, darts);
    }
  }
};
