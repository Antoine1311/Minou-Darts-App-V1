import { create } from 'zustand';
import type { RoomData } from '../services/roomService';
import { roomService } from '../services/roomService';
import { playerService } from '../services/playerService';
import { calculateNextX01State, undoX01Throw } from '../services/x01Engine';

interface GameState {
  localRoom: RoomData | null;
  pendingWrites: number;
  setLocalRoom: (updater: RoomData | null | ((prev: RoomData | null) => RoomData | null)) => void;
  syncFromFirebase: (firebaseRoom: RoomData) => void;
  recordThrowX01: (points: number, isDouble?: boolean, throwLabel?: string) => Promise<void>;
  undoX01: () => Promise<void>;
}

export const useGameStore = create<GameState>((set, get) => ({
  localRoom: (() => {
    try {
      return playerService.getActiveLocalGame();
    } catch {
      return null;
    }
  })(),
  pendingWrites: 0,

  setLocalRoom: (updater) => set((state) => {
    const nextRoom = typeof updater === 'function' ? updater(state.localRoom) : updater;
    if (nextRoom && nextRoom.roomId === 'LOCAL') {
      if (nextRoom.status === 'playing' || nextRoom.status === 'finished') {
        playerService.saveActiveLocalGame(nextRoom);
      } else {
        playerService.clearActiveLocalGame();
      }
    }
    return { localRoom: nextRoom };
  }),

  // Synchronise le store local avec la source de vérité Firebase
  syncFromFirebase: (firebaseRoom) => {
    set({ localRoom: firebaseRoom });
  },

  recordThrowX01: async (points, isDouble = false, throwLabel) => {
    const { localRoom } = get();
    if (!localRoom) return;

    // 1. Calcul de l'état suivant (Optimistic UI)
    const nextState = calculateNextX01State(localRoom, points, isDouble, throwLabel);

    // En mode local autonome, application immédiate et sauvegarde continue dans le téléphone
    if (localRoom.roomId === 'LOCAL') {
      const justFinished = !localRoom.statsRecorded && localRoom.status !== 'finished' && nextState.status === 'finished';
      if (justFinished) {
        nextState.statsRecorded = true;
        roomService.recordMatchStats(nextState);
        playerService.recordLocalMatchHistory(nextState);
      }
      playerService.saveActiveLocalGame(nextState);
      set({ localRoom: nextState });
      return;
    }

    // 2. Application immédiate de l'état à la vue et incrémentation des écritures en attente
    set((state) => ({ 
      localRoom: nextState,
      pendingWrites: state.pendingWrites + 1 
    }));

    // 3. Envoi à Firebase en tâche de fond
    try {
      await roomService.recordThrow(localRoom.roomId, localRoom, points, isDouble, throwLabel);
    } catch (err) {
      console.error("Erreur de synchronisation Firebase, annulation locale", err);
      // En cas d'erreur réseau, rollback
      set({ localRoom });
    } finally {
      set((state) => ({ pendingWrites: Math.max(0, state.pendingWrites - 1) }));
    }
  },

  undoX01: async () => {
    const { localRoom } = get();
    if (!localRoom) return;

    const partialUndo = undoX01Throw(localRoom);
    if (!partialUndo) return; // Rien à annuler

    const wasFinishedWithStats = localRoom.status === 'finished' && !!localRoom.statsRecorded;
    if (wasFinishedWithStats) {
      roomService.revertMatchStats(localRoom);
      partialUndo.statsRecorded = false;
    }

    const nextState = { ...localRoom, ...partialUndo } as RoomData;

    // En mode local autonome, application immédiate avec sauvegarde locale continue
    if (localRoom.roomId === 'LOCAL') {
      playerService.saveActiveLocalGame(nextState);
      set({ localRoom: nextState });
      return;
    }

    set((state) => ({ 
      localRoom: nextState,
      pendingWrites: state.pendingWrites + 1 
    }));

    try {
      await roomService.updateRoom(localRoom.roomId, partialUndo);
    } catch (err) {
      console.error("Erreur de synchronisation Firebase lors de l'undo", err);
      set({ localRoom }); // Rollback
    } finally {
      set((state) => ({ pendingWrites: Math.max(0, state.pendingWrites - 1) }));
    }
  }
}));
