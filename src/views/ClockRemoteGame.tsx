import React, { useState } from 'react';
import { ArrowLeft, Tv, RotateCcw, Check, X, Settings } from 'lucide-react';
import type { RoomData } from '../services/roomService';
import { roomService } from '../services/roomService';
import { clockEngine } from '../services/clockEngine';

interface ClockRemoteGameProps {
  room: RoomData;
  isLocalMode: boolean;
  setLocalRoom: React.Dispatch<React.SetStateAction<RoomData | null>>;
  roomId: string | null;
  setShowProjectionModal: (show: boolean) => void;
  onExitTrigger: () => void;
  onOpenProjectorSettings: () => void;
}

export const ClockRemoteGame: React.FC<ClockRemoteGameProps> = ({
  room,
  isLocalMode,
  setLocalRoom,
  roomId,
  setShowProjectionModal,
  onExitTrigger,
  onOpenProjectorSettings
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activePlayerIndex = room.activePlayerIndex;
  const activePlayer = room.players[activePlayerIndex];

  // S'assurer que le joueur actif a un clockState initialisé
  const clockState = activePlayer?.clockState || {
    currentTarget: 1,
    throwsCount: 0,
    hitsCount: 0,
    accuracy: 0,
    targetHistory: [],
    throwHistory: []
  };

  const currentTarget = clockState.currentTarget;
  const includeBull = room.clockConfig?.includeBull ?? true;

  // Enregistrer un lancer (Touché / Loupé)
  const handleThrow = async (hit: boolean) => {
    if (isSubmitting || !activePlayer) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const updatedRoom = clockEngine.processClockThrow(room, hit);
      
      if (isLocalMode) {
        setLocalRoom(updatedRoom);
      } else if (roomId) {
        await roomService.updateRoom(roomId, updatedRoom);
      }
    } catch (err) {
      console.error("Erreur lors de l'enregistrement du lancer :", err);
      setError("Échec de l'enregistrement. Veuillez réessayer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Annuler le dernier lancer (Undo)
  const handleUndo = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const updatedRoom = clockEngine.undoClockThrow(room);
      
      if (isLocalMode) {
        setLocalRoom(updatedRoom);
      } else if (roomId) {
        await roomService.updateRoom(roomId, updatedRoom);
      }
    } catch (err) {
      console.error("Erreur lors de l'annulation du lancer :", err);
      setError("Échec de l'annulation. Veuillez réessayer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Vérifier si le joueur actif a lancé des fléchettes au total
  const hasThrows = room.players.some(p => p.clockState && p.clockState.throwsCount > 0);

  return (
    <div className="remote-view-container h-svh bg-zinc-950 text-white flex flex-col relative overflow-hidden select-none font-sans">
      
      {/* En-tête de la télécommande */}
      <header className="p-3 bg-zinc-900/90 flex items-center justify-between border-b border-zinc-800/80 z-10">
        <div className="flex items-center gap-3">
          <button 
            onClick={onExitTrigger} 
            className="text-theme-accent hover:text-white transition-colors cursor-pointer focus:outline-none"
          >
            <ArrowLeft className="w-6 h-6 stroke-[2.5]" />
          </button>
          <h1 className="text-lg font-black tracking-tight text-white uppercase">Tour de l'horloge</h1>
        </div>
        <div className="flex items-center gap-2">
          {!isLocalMode && (
            <button
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-theme-accent/10 border border-theme-accent/30 hover:border-theme-accent hover:bg-theme-accent/20 transition-all cursor-pointer"
              onClick={() => setShowProjectionModal(true)}
            >
              <Tv className="w-4 h-4 stroke-[2.5] text-theme-accent" />
              <span className="text-[10px] font-black text-theme-accent uppercase tracking-wider">Sync</span>
            </button>
          )}
          {/* Bouton ⚙️ Paramètres Projecteur */}
          <button
            onClick={onOpenProjectorSettings}
            title="Paramètres du projecteur"
            className="p-1.5 bg-zinc-900/80 border border-zinc-800/80 hover:border-theme-accent/60 hover:bg-zinc-800 text-zinc-500 hover:text-theme-accent rounded-xl transition-all cursor-pointer animate-fadeIn"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Message d'erreur */}
      {error && (
        <div className="bg-red-500/10 border-b border-red-500/30 py-2.5 px-4 text-xs text-red-400 text-center font-medium flex items-center justify-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          {error}
        </div>
      )}

      {/* Contenu principal de la télécommande */}
      <main className="flex-1 flex flex-col justify-between p-4 overflow-y-auto min-h-0 bg-gradient-to-b from-zinc-900 to-zinc-950">
        
        {/* Section Joueur Actif */}
        <div className="text-center pt-2">
          <span className="text-[10px] font-black tracking-widest text-theme-accent uppercase bg-theme-accent/10 border border-theme-accent/20 px-3 py-1 rounded-full">
            À vous de jouer
          </span>
          <h2 className="text-2xl font-black text-white mt-2 uppercase tracking-wide">
            {activePlayer?.name}
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Volée en cours : {3 - (activePlayer?.dartsLeft ?? 3)} / 3 fléchettes lancées
          </p>
        </div>

        {/* Cible géante centrale */}
        <div className="flex flex-col items-center justify-center my-6">
          <span className="text-[9px] font-black text-zinc-500 tracking-widest uppercase mb-2">
            Cible à toucher
          </span>
          
          <div className="relative w-44 h-44 rounded-full bg-zinc-900 border-4 border-zinc-800 flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.02)] transition-all duration-300">
            {/* Effet pulsant jaune fluo */}
            <div className="absolute inset-0 rounded-full border border-theme-accent animate-ping opacity-25" />
            <div className="absolute -inset-1 rounded-full border-2 border-theme-accent/40 blur-sm animate-pulse" />

            <div className="flex flex-col items-center justify-center">
              <span className="text-6xl font-black text-white tracking-tighter drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                {currentTarget === 25 ? 'BULL' : currentTarget}
              </span>
              <span className="text-[8px] font-black text-theme-accent uppercase tracking-widest mt-1">
                {currentTarget === 25 ? "Centre de la cible" : `Secteur ${currentTarget}`}
              </span>
            </div>
          </div>
        </div>

        {/* Boutons de Saisie (Loupé / Touché) */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Bouton LOUPÉ */}
            <button
              onClick={() => handleThrow(false)}
              disabled={isSubmitting}
              className="py-4 px-6 rounded-2xl bg-zinc-900 hover:bg-zinc-850 active:bg-zinc-900 border border-zinc-800 active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
            >
              <X className="w-8 h-8 text-red-500 stroke-[3]" />
              <span className="text-sm font-black text-zinc-300 uppercase tracking-wider">Loupé</span>
              <span className="text-[9px] text-zinc-500 font-bold uppercase">Fléchette +1</span>
            </button>

            {/* Bouton TOUCHÉ */}
            <button
              onClick={() => handleThrow(true)}
              disabled={isSubmitting}
              className="py-4 px-6 rounded-2xl bg-gradient-to-br from-green-600 to-emerald-700 hover:from-green-500 hover:to-emerald-600 active:from-green-600 active:to-emerald-700 active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-green-900/15 disabled:opacity-50"
            >
              <Check className="w-8 h-8 text-white stroke-[3]" />
              <span className="text-sm font-black text-white uppercase tracking-wider">Touché !</span>
              <span className="text-[9px] text-green-200 font-bold uppercase">Cible suivante</span>
            </button>
          </div>

          {/* Affichage des lancers de la volée courante */}
          <div className="flex items-center justify-center gap-2.5 pt-2">
            {[0, 1, 2].map((i) => {
              const thr = (activePlayer?.currentRoundThrows || [])[i];
              return (
                <div
                  key={i}
                  className={`w-20 py-2 rounded-xl border-2 text-center text-xs font-black uppercase tracking-wider transition-all duration-300 ${
                    thr
                      ? thr === 'Touché'
                        ? 'bg-green-500/10 border-green-500 text-green-400 font-extrabold shadow-sm shadow-green-500/5'
                        : 'bg-red-500/10 border-red-500/60 text-red-400'
                      : 'bg-zinc-950/20 border-zinc-800/80 text-zinc-700'
                  }`}
                >
                  {thr || `-`}
                </div>
              );
            })}
          </div>
        </div>

        {/* Section Actions de contrôle (Undo / Leaderboard compact) */}
        <div className="mt-6 pt-4 border-t border-zinc-800/60 space-y-4">
          <div className="flex justify-between items-center">
            {/* Précision & Lancers */}
            <div className="flex gap-4">
              <div className="flex flex-col">
                <span className="text-[8px] text-zinc-500 font-black uppercase tracking-widest">Fléchettes</span>
                <span className="text-sm font-black text-white">{clockState.throwsCount}</span>
              </div>
              <div className="w-[1px] bg-zinc-800" />
              <div className="flex flex-col">
                <span className="text-[8px] text-zinc-500 font-black uppercase tracking-widest">Précision</span>
                <span className="text-sm font-black text-theme-accent">
                  {clockState.accuracy.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %
                </span>
              </div>
            </div>

            {/* Bouton Undo */}
            <button
              onClick={handleUndo}
              disabled={isSubmitting || !hasThrows}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-zinc-850 active:scale-95 transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Annuler</span>
            </button>
          </div>

          {/* Multijoueur Leaderboard */}
          {room.players.length > 1 && (
            <div className="bg-zinc-900/40 p-3 rounded-2xl border border-zinc-800/30">
              <h3 className="text-[8px] font-black text-zinc-500 uppercase tracking-widest mb-2">
                Progression des joueurs
              </h3>
              <div className="space-y-2">
                {room.players.map((p, idx) => {
                  const isPlayerActive = idx === activePlayerIndex;
                  const pState = p.clockState || { currentTarget: 1, throwsCount: 0 };
                  const targetLabel = pState.currentTarget === 25 ? 'BULL' : String(pState.currentTarget);
                  
                  // Calculer le pourcentage de progression (1 à 20 ou 25)
                  const maxTarget = includeBull ? 25 : 20;
                  // Si target est 25, la progression est 20 segments + 1 bulle = 21 étapes.
                  // Mais pour simplifier, c'est le numéro actuel visé.
                  const progressValue = pState.currentTarget === 25 ? 20 : (pState.currentTarget - 1);
                  const progressPercent = Math.min(100, Math.round((progressValue / maxTarget) * 100));

                  return (
                    <div 
                      key={p.name}
                      className={`flex items-center justify-between text-xs p-1.5 rounded-lg ${
                        isPlayerActive ? 'bg-zinc-850 border border-zinc-800' : 'opacity-70'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-1.5 h-1.5 rounded-full ${isPlayerActive ? 'bg-theme-accent animate-pulse' : 'bg-zinc-700'}`} />
                        <span className="font-bold text-white truncate max-w-[100px] capitalize">{p.name}</span>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-zinc-400">
                          Visé: <strong className="text-theme-accent">{targetLabel}</strong>
                        </span>
                        <div className="w-16 bg-zinc-950 h-1.5 rounded-full overflow-hidden border border-zinc-800">
                          <div 
                            className="bg-theme-accent h-full rounded-full transition-all duration-500"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-zinc-500 font-bold min-w-[20px] text-right">
                          {pState.throwsCount} F
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

      </main>

    </div>
  );
};
