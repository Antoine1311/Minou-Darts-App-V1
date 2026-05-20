import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { ThemeType } from '../context/ThemeContext';

export interface Player {
  name: string;
  score: number;
  avg: number;
  dartsLeft: number;
  throwsCount: number;
  totalPoints: number;
  history: number[]; // Historique des scores pour les statistiques
}

export interface RoomData {
  roomId: string;
  theme: ThemeType;
  targetScore: number;
  activePlayerIndex: number;
  status: 'setup' | 'playing' | 'finished';
  players: Player[];
  createdAt: any;
  winnerName?: string;
  lastUpdate?: any;
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
  createRoom: async (theme: ThemeType, targetScore: number = 501): Promise<string> => {
    const roomId = generateRoomId();
    const roomRef = doc(db, 'rooms', roomId);
    
    const initialRoom: RoomData = {
      roomId,
      theme,
      targetScore,
      activePlayerIndex: 0,
      status: 'setup',
      players: [
        { name: 'Joueur 1', score: targetScore, avg: 0, dartsLeft: 3, throwsCount: 0, totalPoints: 0, history: [] }
      ],
      createdAt: serverTimestamp()
    };

    await setDoc(roomRef, initialRoom);
    return roomId;
  },

  /**
   * Vérifie si un salon existe
   */
  checkRoomExists: async (roomId: string): Promise<boolean> => {
    if (!roomId || roomId.length !== 4) return false;
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
   * Enregistre un lancer de fléchette pour le joueur actif et calcule les scores
   */
  recordThrow: async (roomId: string, room: RoomData, points: number): Promise<void> => {
    const updatedRoom = { ...room };
    const playerIndex = updatedRoom.activePlayerIndex;
    const player = { ...updatedRoom.players[playerIndex] };

    // 1. Enregistrer le lancer
    player.history = [...player.history, points];
    player.dartsLeft -= 1;
    player.throwsCount += 1;
    player.totalPoints += points;

    // Calcul du nouveau score théorique
    const newScore = player.score - points;

    // Règle du "Bust" (Dépassement) : si le score tombe en dessous de 0, ou à 1 (car il faut finir sur un double/double bull ou juste atteindre 0 selon les règles simplifiées du bar, ici on gère le simple passage sous 0 pour la flexibilité)
    if (newScore < 0) {
      // Bust! On remet le score du début de tour (qui était player.score)
      // On retire les lancers du tour actuel (les fléchettes restantes sont consommées)
      const throwsInThisTurn = 3 - player.dartsLeft;
      player.dartsLeft = 0; // Tour fini
      // On n'applique pas les points de ce tour
      // Le score reste inchangé
      // On peut ajouter une petite alerte / note
    } else {
      player.score = newScore;
    }

    // Calcul de la moyenne métrique (Standard 3 fléchettes : (points totaux / lancers) * 3)
    if (player.throwsCount > 0) {
      player.avg = parseFloat(((player.totalPoints / player.throwsCount) * 3).toFixed(1));
    }

    // Mettre à jour le joueur dans le tableau
    updatedRoom.players[playerIndex] = player;

    // Vérifier si le joueur a gagné
    if (player.score === 0) {
      updatedRoom.status = 'finished';
      updatedRoom.winnerName = player.name;
    } 
    // Gérer la fin de tour (les 3 fléchettes ont été lancées)
    else if (player.dartsLeft === 0) {
      // Réinitialiser les fléchettes pour le joueur qui vient de finir
      player.dartsLeft = 3;
      updatedRoom.players[playerIndex] = player;

      // Passer au joueur suivant
      updatedRoom.activePlayerIndex = (playerIndex + 1) % updatedRoom.players.length;
    }

    // Sauvegarder dans Firestore
    await roomService.updateRoom(roomId, {
      players: updatedRoom.players,
      activePlayerIndex: updatedRoom.activePlayerIndex,
      status: updatedRoom.status,
      winnerName: updatedRoom.winnerName
    });
  }
};
