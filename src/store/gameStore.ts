import { create } from 'zustand';
import type { RoomData } from '../services/roomService';
import { roomService } from '../services/roomService';
import { calculateNextX01State, undoX01Throw } from '../services/x01Engine';

interface GameState {
  localRoom: RoomData | null;
  setLocalRoom: (updater: RoomData | null | ((prev: RoomData | null) => RoomData | null)) => void;
  syncFromFirebase: (firebaseRoom: RoomData) => void;
  recordThrowX01: (points: number, isDouble?: boolean, throwLabel?: string) => Promise<void>;
  undoX01: () => Promise<void>;
}

export const useGameStore = create<GameState>((set, get) => ({
  localRoom: null,

  setLocalRoom: (updater) => set((state) => ({ 
    localRoom: typeof updater === 'function' ? updater(state.localRoom) : updater 
  })),

  // Synchronise le store local avec la source de vérité Firebase
  // L'Optimistic UI ignore la mise à jour si on a un état plus récent
  syncFromFirebase: (firebaseRoom) => {
    const { localRoom } = get();
    // Si pas de partie locale ou si Firebase est plus récent
    if (!localRoom || (firebaseRoom.lastUpdate?.seconds > localRoom.lastUpdate?.seconds)) {
      set({ localRoom: firebaseRoom });
    }
  },

  recordThrowX01: async (points, isDouble = false, throwLabel) => {
    const { localRoom } = get();
    if (!localRoom) return;

    // 1. Calcul de l'état suivant (Optimistic)
    const nextState = calculateNextX01State(localRoom, points, isDouble, throwLabel);
    
    // Mettre une fausse date de mise à jour pour que le syncFromFirebase n'écrase pas cet état optimiste avec un ancien
    nextState.lastUpdate = { seconds: Date.now() / 1000 + 10, nanoseconds: 0 }; 

    // 2. Application immédiate de l'état à la vue
    set({ localRoom: nextState });

    // 3. Envoi à Firebase en tâche de fond ("Fire and Forget")
    try {
      await roomService.recordThrow(localRoom.roomId, localRoom, points, isDouble, throwLabel);
    } catch (err) {
      console.error("Erreur de synchronisation Firebase, annulation locale", err);
      // En cas d'erreur réseau, rollback
      set({ localRoom });
    }
  },

  undoX01: async () => {
    const { localRoom } = get();
    if (!localRoom) return;

    const partialUndo = undoX01Throw(localRoom);
    if (!partialUndo) return; // Rien à annuler

    const nextState = { ...localRoom, ...partialUndo } as RoomData;
    nextState.lastUpdate = { seconds: Date.now() / 1000 + 10, nanoseconds: 0 };

    set({ localRoom: nextState });

    try {
      await roomService.updateRoom(localRoom.roomId, partialUndo);
    } catch (err) {
      console.error("Erreur de synchronisation Firebase lors de l'undo", err);
      set({ localRoom }); // Rollback
    }
  }
}));
