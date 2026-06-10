import React, { useState } from 'react';
import { ArrowLeft, Tv, Target, XCircle, Award, RotateCcw } from 'lucide-react';
import type { RoomData } from '../services/roomService';
import { roomService } from '../services/roomService';
import { processBartTargetSelection, processBartResolution, undoBartAction } from '../services/bartEngine';

interface BartRemoteGameProps {
  room: RoomData;
  isLocalMode: boolean;
  setLocalRoom: React.Dispatch<React.SetStateAction<RoomData | null>>;
  roomId: string | null;
  setShowProjectionModal: (show: boolean) => void;
  onExitTrigger: () => void;
}

export const BartRemoteGame: React.FC<BartRemoteGameProps> = ({
  room,
  isLocalMode,
  setLocalRoom,
  roomId,
  setShowProjectionModal,
  onExitTrigger
}) => {
  const [selectedNumber, setSelectedNumber] = useState<number | 'bull' | null>(null);
  const [selectedZone, setSelectedZone] = useState<'inner' | 'outer' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const bartConfig = room.bartConfig!;
  const server = room.players[bartConfig.serverIndex];
  
  const handleExit = () => {
    onExitTrigger();
  };

  const handleZoneSelection = async (zone: 'inner' | 'outer') => {
    if (!selectedNumber || isSubmitting) return;
    setIsSubmitting(true);
    setSelectedZone(zone);
    try {
      const updatedRoom = processBartTargetSelection(room, selectedNumber, zone);
      if (isLocalMode) {
        setLocalRoom(updatedRoom);
      } else if (roomId) {
        await roomService.updateRoom(roomId, updatedRoom);
      }
      setSelectedNumber(null);
      setSelectedZone(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolution = async (resolution: 'player1_closest' | 'player2_closest' | 'player1_perfect' | 'player2_perfect' | 'cancel') => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const updatedRoom = processBartResolution(room, resolution);
      if (isLocalMode) {
        setLocalRoom(updatedRoom);
      } else if (roomId) {
        await roomService.updateRoom(roomId, updatedRoom);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUndo = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const updatedRoom = undoBartAction(room);
      if (isLocalMode) {
        setLocalRoom(updatedRoom);
      } else if (roomId) {
        await roomService.updateRoom(roomId, updatedRoom);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="remote-view-container min-h-svh bg-black text-white flex flex-col justify-between relative overflow-hidden select-none font-sans">
      {/* En-tête Bart */}
      <header className="p-3 bg-black flex items-center justify-between border-b border-zinc-800 z-10">
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExit} 
            className="text-theme-accent hover:text-theme-accent-hover transition-colors cursor-pointer focus:outline-none"
          >
            <ArrowLeft className="w-6 h-6 stroke-[2.5]" />
          </button>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Tv className="w-5 h-5 text-theme-accent" /> BART
          </h1>
        </div>
        
        <div className="flex items-center gap-4 text-theme-accent">
          {bartConfig.historyStates && bartConfig.historyStates.length > 0 && (
            <button 
              onClick={handleUndo} 
              disabled={isSubmitting}
              className="focus:outline-none hover:text-white transition-colors cursor-pointer disabled:opacity-50 flex items-center bg-zinc-800/80 p-1.5 rounded-lg" 
              title="Annuler la dernière action"
            >
              <RotateCcw className="w-5 h-5 stroke-[2.5]" />
            </button>
          )}
          {!isLocalMode && (
            <button
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-theme-accent/10 border border-theme-accent/30 hover:border-theme-accent hover:bg-theme-accent/20 transition-all cursor-pointer"
              title="Synchroniser le Visualisateur"
              onClick={() => setShowProjectionModal(true)}
            >
              <Tv className="w-4 h-4 stroke-[2.5] text-theme-accent" />
              <span className="text-[9px] font-black text-theme-accent uppercase tracking-wider">Sync</span>
            </button>
          )}
        </div>
      </header>

      {/* Informations générales */}
      <div className="bg-[#121212] py-2 px-4 border-b border-zinc-900 text-xs text-zinc-400 font-medium tracking-wide flex justify-between">
        <span>Format : {bartConfig.setsToWin} Set{bartConfig.setsToWin > 1 ? 's' : ''} gagnant{bartConfig.setsToWin > 1 ? 's' : ''}</span>
        {bartConfig.isTieBreak && <span className="text-orange-400 font-bold animate-pulse">TIE-BREAK EN COURS</span>}
      </div>

      {/* Tableau des scores compact (Télécommande) */}
      <div className="bg-black/60 px-4 py-3 border-b border-zinc-800 text-xs">
        <div className="grid grid-cols-6 text-zinc-500 font-bold uppercase tracking-wider text-[10px] mb-2 border-b border-zinc-800/50 pb-1">
          <div className="col-span-3">Joueurs</div>
          <div className="text-center">Sets</div>
          <div className="text-center">Jeux</div>
          <div className="text-center text-theme-accent">Pts</div>
        </div>
        {room.players.map((p, idx) => {
          const isServer = idx === bartConfig.serverIndex;
          const isTieBreak = bartConfig.isTieBreak;
          const pointsDisplay = isTieBreak ? p.bartState!.tieBreakPoints : p.bartState!.currentPoints;
          return (
            <div key={idx} className="grid grid-cols-6 items-center py-1.5">
              <div className="col-span-3 flex items-center gap-2 pr-2">
                {isServer ? <div className="w-2 h-2 rounded-full bg-theme-accent animate-pulse" /> : <div className="w-2 h-2" />}
                <span className={`font-black truncate uppercase text-xs ${isServer ? 'text-white' : 'text-zinc-400'}`}>{p.name}</span>
              </div>
              <div className="text-center font-mono font-bold text-zinc-300">{p.bartState!.setsWon}</div>
              <div className="text-center font-mono font-bold text-white">{p.bartState!.gamesWon}</div>
              <div className="text-center font-mono font-black text-theme-accent text-sm">{pointsDisplay}</div>
            </div>
          );
        })}
      </div>

      <div className="flex-grow flex flex-col items-center justify-start p-4 pt-6 pb-4 mb-2">
        {bartConfig.resolutionStep === 'waiting_for_target' ? (
          /* ÉTAPE 1 : CHOIX DE CIBLE */
          <div className="w-full px-1 space-y-6">
            <div className="text-center space-y-1 mb-4">
              <p className="text-sm text-zinc-400 uppercase tracking-widest font-bold">Au service</p>
              <h2 className="text-2xl font-black text-theme-accent">{server.name}</h2>
              <p className="text-xs text-zinc-500">Sélectionnez la cible à atteindre</p>
            </div>

            <div className="bg-zinc-900/40 p-2 rounded-2xl border-2 border-zinc-700 space-y-4">
              {/* Grille des numéros */}
              <div className="grid grid-cols-5 gap-2">
                {[20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((num) => (
                  <button
                    key={num}
                    onClick={() => setSelectedNumber(num)}
                    className={`py-2.5 rounded-lg font-black text-sm transition-all border-2 ${
                      selectedNumber === num
                        ? 'bg-theme-accent border-theme-accent text-black scale-105 shadow-[0_0_15px_rgba(56,189,248,0.4)]'
                        : 'bg-black border-zinc-700 text-zinc-300 hover:border-theme-accent/50'
                    }`}
                  >
                    {num}
                  </button>
                ))}
                <button
                  onClick={() => setSelectedNumber('bull')}
                  className={`col-span-5 py-2.5 rounded-lg font-black text-sm transition-all border-2 uppercase tracking-widest ${
                    selectedNumber === 'bull'
                      ? 'bg-theme-accent border-theme-accent text-black scale-105 shadow-[0_0_15px_rgba(56,189,248,0.4)]'
                      : 'bg-black border-zinc-700 text-zinc-300 hover:border-theme-accent/50'
                  }`}
                >
                  BULL (25 / 50)
                </button>
              </div>

              {/* Choix Intérieur / Extérieur */}
              {selectedNumber && (
                <div className="space-y-3 pt-4 border-t-2 border-zinc-700 animate-fadeIn">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleZoneSelection('outer')}
                      disabled={isSubmitting}
                      className={`py-5 rounded-2xl font-black text-sm transition-all border-2 uppercase tracking-wider ${
                        selectedZone === 'outer'
                          ? 'bg-white border-white text-black shadow-[0_0_15px_rgba(255,255,255,0.3)]'
                          : 'bg-black border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                      }`}
                    >
                      Extérieur
                    </button>
                    <button
                      onClick={() => handleZoneSelection('inner')}
                      disabled={isSubmitting}
                      className={`py-5 rounded-2xl font-black text-sm transition-all border-2 uppercase tracking-wider ${
                        selectedZone === 'inner'
                          ? 'bg-theme-accent border-theme-accent text-black shadow-[0_0_15px_rgba(56,189,248,0.3)]'
                          : 'bg-black border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                      }`}
                    >
                      Intérieur
                    </button>
                  </div>
                  <button
                    onClick={() => setSelectedNumber(null)}
                    className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-400 border border-zinc-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-all"
                  >
                    Annuler la sélection
                  </button>
                </div>
              )}
            </div>

            {/* Bouton d'annulation du dernier coup */}
            {bartConfig.historyStates && bartConfig.historyStates.length > 0 && (
              <div className="pt-2 max-w-lg mx-auto w-full">
                <button
                  onClick={handleUndo}
                  disabled={isSubmitting}
                  className="w-full py-3.5 bg-red-600/10 hover:bg-red-600/20 border-2 border-red-500/30 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 text-red-400 font-extrabold text-sm"
                  title="Annuler le dernier point enregistré"
                >
                  <RotateCcw className="w-4 h-4 stroke-[3]" />
                  RETOUR / ANNULER DERNIER COUP
                </button>
              </div>
            )}
          </div>
        ) : (
          /* ÉTAPE 2 : RÉSOLUTION DU POINT */
          <div className="w-full px-2 space-y-6">
            <div className="text-center space-y-2 mb-6">
              <p className="text-sm text-zinc-400 uppercase tracking-widest font-bold">Cible sélectionnée</p>
              <div className="inline-block px-6 py-3 bg-theme-accent/10 border-2 border-theme-accent rounded-2xl">
                <h2 className="text-4xl font-black text-theme-accent">
                  {bartConfig.currentTarget?.number === 'bull' ? 'BULL' : bartConfig.currentTarget?.number}
                  <span className="text-xl ml-2 text-white/90">
                    {bartConfig.currentTarget?.zone === 'inner' ? 'INT' : 'EXT'}
                  </span>
                </h2>
              </div>
              <p className="text-xs text-zinc-500 pt-2">Qui remporte ce point ?</p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Plus proche joueur 1 */}
                <button
                  onClick={() => handleResolution('player1_closest')}
                  disabled={isSubmitting}
                  className="bg-[#1e1e1e] hover:bg-[#2e2e2e] border-2 border-zinc-700 hover:border-blue-400 rounded-2xl p-6 h-32 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 shadow-lg"
                >
                  <Target className="w-6 h-6 text-blue-400" />
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Plus proche</span>
                  <span className="text-sm font-black text-white text-center truncate w-full">{room.players[0].name}</span>
                </button>

                {/* Plus proche joueur 2 */}
                <button
                  onClick={() => handleResolution('player2_closest')}
                  disabled={isSubmitting}
                  className="bg-[#1e1e1e] hover:bg-[#2e2e2e] border-2 border-zinc-700 hover:border-green-400 rounded-2xl p-6 h-32 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 shadow-lg"
                >
                  <Target className="w-6 h-6 text-green-400" />
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Plus proche</span>
                  <span className="text-sm font-black text-white text-center truncate w-full">{room.players[1].name}</span>
                </button>

                {/* Perfect joueur 1 */}
                <button
                  onClick={() => handleResolution('player1_perfect')}
                  disabled={isSubmitting}
                  className="bg-[#1e1e1e] hover:bg-[#2e2e2e] border-2 border-zinc-700 hover:border-yellow-500 rounded-2xl p-6 h-32 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 shadow-lg"
                >
                  <Award className="w-6 h-6 text-yellow-500" />
                  <span className="text-[10px] font-black text-yellow-500 uppercase tracking-widest font-sans">PERFECT</span>
                  <span className="text-sm font-black text-white text-center truncate w-full">{room.players[0].name}</span>
                </button>

                {/* Perfect joueur 2 */}
                <button
                  onClick={() => handleResolution('player2_perfect')}
                  disabled={isSubmitting}
                  className="bg-[#1e1e1e] hover:bg-[#2e2e2e] border-2 border-zinc-700 hover:border-yellow-500 rounded-2xl p-6 h-32 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 shadow-lg"
                >
                  <Award className="w-6 h-6 text-yellow-500" />
                  <span className="text-[10px] font-black text-yellow-500 uppercase tracking-widest font-sans">PERFECT</span>
                  <span className="text-sm font-black text-white text-center truncate w-full">{room.players[1].name}</span>
                </button>
              </div>

              <div className="pt-4 border-t border-zinc-800 grid grid-cols-5 gap-3">
                <button
                  onClick={() => handleResolution('cancel')}
                  disabled={isSubmitting}
                  className="col-span-3 py-4 bg-red-500/10 hover:bg-red-500/20 border-2 border-red-500/30 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 text-red-400 font-extrabold text-xs uppercase tracking-wider"
                  title="Annuler le point pour Double Perfect"
                >
                  <XCircle className="w-4 h-4" />
                  Double Perfect
                </button>
                <button
                  onClick={handleUndo}
                  disabled={isSubmitting}
                  className="col-span-2 py-4 bg-zinc-800 hover:bg-zinc-700 border-2 border-zinc-700 rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 text-zinc-300 font-extrabold text-xs uppercase tracking-wider"
                  title="Retourner au choix de cible"
                >
                  <ArrowLeft className="w-4 h-4 stroke-[3]" />
                  Retour
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
