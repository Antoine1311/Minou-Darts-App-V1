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

export const playerService = {
  /**
   * Créer un nouveau joueur dans le Cloud
   */
  createPlayer: async (ownerId: string, name: string, emoji: string): Promise<GlobalPlayer> => {
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
    
    return {
      id: docRef.id,
      ...newPlayerData,
      createdAt: new Date()
    };
  },

  /**
   * Récupérer les joueurs appartenant à un utilisateur spécifique
   */
  getPlayersByOwner: async (ownerId: string): Promise<GlobalPlayer[]> => {
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
        createdAt: data.createdAt?.toDate() || new Date()
      });
    });
    
    // Trier par nom alphabétiquement
    return players.sort((a, b) => a.name.localeCompare(b.name));
  },

  /**
   * Mettre à jour l'emoji d'un joueur
   */
  updatePlayerEmoji: async (playerId: string, newEmoji: string): Promise<void> => {
    const playerRef = doc(db, 'players', playerId);
    await updateDoc(playerRef, {
      emoji: newEmoji
    });
  },

  /**
   * Supprimer un joueur
   */
  deletePlayer: async (playerId: string): Promise<void> => {
    const playerRef = doc(db, 'players', playerId);
    await deleteDoc(playerRef);
  },

  /**
   * Mettre à jour les statistiques d'un joueur à la fin d'une partie
   * Utilise une transaction pour garantir la consistance des données
   */
  updatePlayerStats: async (playerId: string, won: boolean, points: number, darts: number): Promise<void> => {
    if (!playerId) return;
    
    const playerRef = doc(db, 'players', playerId);
    
    try {
      await runTransaction(db, async (transaction) => {
        const playerDoc = await transaction.get(playerRef);
        if (!playerDoc.exists()) {
          throw new Error("Joueur introuvable!");
        }

        const data = playerDoc.data();
        const currentStats = data.stats || { gamesPlayed: 0, wins: 0, totalPoints: 0, dartsThrown: 0 };
        
        transaction.update(playerRef, {
          "stats.gamesPlayed": currentStats.gamesPlayed + 1,
          "stats.wins": won ? currentStats.wins + 1 : currentStats.wins,
          "stats.totalPoints": currentStats.totalPoints + points,
          "stats.dartsThrown": currentStats.dartsThrown + darts
        });
      });
    } catch (e) {
      console.error("Erreur lors de la mise à jour des statistiques du joueur:", e);
    }
  }
};
