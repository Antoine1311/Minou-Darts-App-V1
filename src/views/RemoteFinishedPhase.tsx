import React, { useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import type { RoomData } from '../services/roomService';
import { roomService, getGameHighlights } from '../services/roomService';
import { undoBartAction } from '../services/bartEngine';
import { undoX01Throw } from '../services/x01Engine';
import { clockEngine } from '../services/clockEngine';
import { haptics } from '../services/haptics';

interface RemoteFinishedPhaseProps {
  currentRoom: RoomData;
  isLocalMode: boolean;
  roomId: string | null;
  setLocalRoom: (room: RoomData | null) => void;
  updateRoomState: (data: Partial<RoomData>) => void;
  setRoomId: (id: string | null) => void;
  setRoom: (room: RoomData | null) => void;
  onLeaveRoom?: () => void;
  handleCricketUndo: () => Promise<void>;
}

export const RemoteFinishedPhase: React.FC<RemoteFinishedPhaseProps> = ({
  currentRoom,
  isLocalMode,
  roomId,
  setLocalRoom,
  updateRoomState,
  setRoomId,
  setRoom,
  onLeaveRoom,
  handleCricketUndo
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
    const isRoomCricket = currentRoom.gameType === 'cricket';
    const isRoomBart = currentRoom.gameType === 'bart';
    const isRoomClock = currentRoom.gameType === 'clock';
    
    const renderHighlightText = (text: string) => {
      const parts = text.split(/\*\*(.*?)\*\*/g);
      return parts.map((part, i) => i % 2 === 1 ? <strong key={i} className="text-theme-accent font-black">{part}</strong> : part);
    };

    return (
      <div className="remote-view-container min-h-svh bg-theme-bg text-theme-text-primary transition-all duration-300 flex flex-col justify-between items-center p-6 select-none">
        <div className="w-full max-w-md bg-black/30 border border-theme-border/50 rounded-3xl p-6 backdrop-blur-md shadow-2xl flex flex-col items-center max-h-[calc(100dvh-2rem)] overflow-y-auto">
          
          <div className="p-3 bg-theme-accent/10 border-2 border-theme-accent rounded-full mb-4 animate-bounce">
            <Check className="w-10 h-10 text-theme-accent stroke-[3px]" />
          </div>

          <h1 className="text-2xl font-black mb-1 tracking-wide text-center">MATCH TERMINÉ</h1>
          <p className="text-[10px] text-theme-text-secondary text-center mb-1.5">
            {isRoomClock
              ? "Tour complet de l'horloge validé par :"
              : "Le vainqueur de ce salon est :"}
          </p>
          <span className="text-2xl font-black text-theme-accent tracking-widest mb-5 uppercase">
            {currentRoom.winnerName}
          </span>

          {/* Tableau Récapitulatif des Statistiques adapté à chaque mode de jeu */}
          {isRoomCricket ? (
            <div className="w-full bg-black/45 border border-theme-border/20 rounded-2xl p-3 mb-4">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2 text-center">Statistiques Finales (Cricket)</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-theme-border/20 text-zinc-500 font-bold uppercase tracking-wider text-[9px]">
                      <th className="pb-1.5">Joueur</th>
                      <th className="pb-1.5 text-center">MPR</th>
                      <th className="pb-1.5 text-center">Préc.</th>
                      <th className="pb-1.5 text-center">Loupées</th>
                      <th className="pb-1.5 text-center">T. Blancs</th>
                      <th className="pb-1.5 text-center">Best T.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentRoom.players.map((p) => (
                      <tr key={p.name} className="border-b border-theme-border/10">
                        <td className="py-2 font-bold uppercase text-zinc-200 truncate max-w-[70px]">{p.name}</td>
                        <td className="py-2 text-center font-bold text-theme-accent">
                          {p.avg.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 text-center font-bold text-white">
                          {p.accuracy !== undefined ? `${p.accuracy.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} %` : '-'}
                        </td>
                        <td className="py-2 text-center text-red-400">{p.missedDarts || 0}</td>
                        <td className="py-2 text-center text-zinc-500">{p.whiteRounds || 0}</td>
                        <td className="py-2 text-center text-yellow-500">{p.bestCricketRound || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : isRoomBart ? (
            <div className="w-full bg-black/45 border border-theme-border/20 rounded-2xl p-4 mb-4">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3 text-center">Statistiques Finales (Bart)</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-theme-border/20 text-zinc-500 font-bold uppercase tracking-wider text-[9px]">
                      <th className="pb-2">Joueur</th>
                      <th className="pb-2 text-center">Sets / Jeux</th>
                      <th className="pb-2 text-center">% Service</th>
                      <th className="pb-2 text-center">Aces / Retours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentRoom.players.map((p) => {
                      const bs = p.bartState;
                      const servePct = bs && bs.servesPlayed > 0
                        ? `${((bs.servesWon / bs.servesPlayed) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} %`
                        : '-';
                      return (
                        <tr key={p.name} className="border-b border-theme-border/10">
                          <td className="py-2 font-bold uppercase text-zinc-200 truncate max-w-[85px]">{p.name}</td>
                          <td className="py-2 text-center font-bold text-theme-accent">
                            {bs ? `${bs.setsWon} S / ${bs.gamesWon} J` : '-'}
                          </td>
                          <td className="py-2 text-center font-bold text-white">{servePct}</td>
                          <td className="py-2 text-center font-bold text-yellow-500">
                            {bs ? `${bs.acesCount} / ${bs.returnWinnersCount}` : '0 / 0'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : isRoomClock ? (
            <div className="w-full bg-black/45 border border-theme-border/20 rounded-2xl p-4 mb-4">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3 text-center">Statistiques Finales (Horloge)</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-theme-border/20 text-zinc-500 font-bold uppercase tracking-wider text-[9px]">
                      <th className="pb-2">Joueur</th>
                      <th className="pb-2 text-center">Progression</th>
                      <th className="pb-2 text-center">Précision</th>
                      <th className="pb-2 text-center">Fléchettes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentRoom.players.map((p) => {
                      const cs = p.clockState;
                      const isWinner = p.name === currentRoom.winnerName;
                      const targetLabel = isWinner
                        ? 'Fini 🏆'
                        : `Cible ${cs?.currentTarget === 25 ? 'Bulle' : (cs?.currentTarget ?? 1)}`;
                      const accLabel = cs
                        ? `${cs.accuracy.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
                        : '0,0 %';
                      return (
                        <tr key={p.name} className="border-b border-theme-border/10">
                          <td className="py-2 font-bold uppercase text-zinc-200 truncate max-w-[80px]">{p.name}</td>
                          <td className={`py-2 text-center font-bold ${isWinner ? 'text-yellow-400' : 'text-theme-accent'}`}>
                            {targetLabel}
                          </td>
                          <td className="py-2 text-center font-bold text-white">{accLabel}</td>
                          <td className="py-2 text-center text-zinc-400">{cs?.throwsCount ?? p.throwsCount}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="w-full bg-black/45 border border-theme-border/20 rounded-2xl p-4 mb-4">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3 text-center">Statistiques Finales</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-theme-border/20 text-zinc-500 font-bold uppercase tracking-wider text-[10px]">
                      <th className="pb-2">Joueur</th>
                      <th className="pb-2 text-center">Moyenne</th>
                      <th className="pb-2 text-center">Meilleur</th>
                      <th className="pb-2 text-center">Lancers</th>
                      <th className="pb-2 text-center">Busts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentRoom.players.map((p) => (
                      <tr key={p.name} className="border-b border-theme-border/10">
                        <td className="py-2 font-bold uppercase text-zinc-200 truncate max-w-[80px]">{p.name}</td>
                        <td className="py-2 text-center font-bold text-white">
                          {p.avg.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 text-center font-bold text-yellow-500">{p.bestRound || '-'}</td>
                        <td className="py-2 text-center text-zinc-400">{p.throwsCount}</td>
                        <td className="py-2 text-center text-red-400">{p.bustsCount || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Moments Forts du Match */}
          <div className="w-full bg-black/45 border border-theme-border/20 rounded-2xl p-4 mb-5">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3 text-center">Moments Forts</h3>
            <div className="space-y-2 text-xs text-left">
              {getGameHighlights(currentRoom).map((hl, idx) => (
                <div key={idx} className="flex items-start gap-2 bg-black/20 p-2.5 rounded-xl border border-zinc-900/35">
                  <p className="text-zinc-300 leading-normal">
                    {renderHighlightText(hl)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="w-full space-y-3 mt-auto">
            {currentRoom.gameType === 'bart' && currentRoom.bartConfig?.historyStates && currentRoom.bartConfig.historyStates.length > 0 && (
              <button
                onClick={async () => {
                  if (isSubmitting) return;
                  haptics.undo();
                  setIsSubmitting(true);
                  try {
                    if (currentRoom.statsRecorded) {
                      roomService.revertMatchStats(currentRoom);
                    }
                    const updatedRoom = { ...undoBartAction(currentRoom), statsRecorded: false };
                    if (isLocalMode) {
                      setLocalRoom(updatedRoom);
                    } else if (roomId) {
                      await roomService.updateRoom(roomId, updatedRoom);
                    }
                  } catch (err) {
                    console.error("Erreur undo Bart :", err);
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                disabled={isSubmitting}
                className="w-full py-3.5 bg-red-600/10 border-2 border-red-500/30 hover:bg-red-600/20 text-red-400 font-extrabold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4 stroke-[3]" /> CORRIGER / ANNULER LE DERNIER POINT
              </button>
            )}

            {currentRoom.gameType === 'cricket' && (
              <button
                onClick={() => {
                  haptics.undo();
                  handleCricketUndo();
                }}
                disabled={isSubmitting}
                className="w-full py-3.5 bg-red-600/10 border-2 border-red-500/30 hover:bg-red-600/20 text-red-400 font-extrabold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4 stroke-[3]" /> CORRIGER / ANNULER LE DERNIER LANCER
              </button>
            )}

            {currentRoom.gameType === 'x01' && (
              <button
                onClick={async () => {
                  if (isSubmitting) return;
                  haptics.undo();
                  setIsSubmitting(true);
                  try {
                    const partialUndo = undoX01Throw(currentRoom);
                    if (partialUndo) {
                      if (currentRoom.statsRecorded) {
                        roomService.revertMatchStats(currentRoom);
                        partialUndo.statsRecorded = false;
                      }
                      if (isLocalMode) {
                        setLocalRoom({ ...currentRoom, ...partialUndo } as RoomData);
                      } else if (roomId) {
                        await roomService.updateRoom(roomId, partialUndo);
                      }
                    }
                  } catch (err) {
                    console.error("Erreur undo X01 :", err);
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                disabled={isSubmitting}
                className="w-full py-3.5 bg-red-600/10 border-2 border-red-500/30 hover:bg-red-600/20 text-red-400 font-extrabold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4 stroke-[3]" /> CORRIGER / ANNULER LE DERNIER LANCER
              </button>
            )}

            {currentRoom.gameType === 'clock' && (
              <button
                onClick={async () => {
                  if (isSubmitting) return;
                  haptics.undo();
                  setIsSubmitting(true);
                  try {
                    const updatedRoom = clockEngine.undoClockThrow(currentRoom);
                    if (updatedRoom) {
                      if (currentRoom.statsRecorded) {
                        roomService.revertMatchStats(currentRoom);
                      }
                      const nextRoom = { ...updatedRoom, statsRecorded: false };
                      if (isLocalMode) {
                        setLocalRoom(nextRoom);
                      } else if (roomId) {
                        await roomService.updateRoom(roomId, nextRoom);
                      }
                    }
                  } catch (err) {
                    console.error("Erreur undo Clock :", err);
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                disabled={isSubmitting}
                className="w-full py-3.5 bg-red-600/10 border-2 border-red-500/30 hover:bg-red-600/20 text-red-400 font-extrabold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4 stroke-[3]" /> CORRIGER / ANNULER LE DERNIER LANCER
              </button>
            )}

            <button
              onClick={async () => {
                // Renvoyer le salon en phase setup pour configurer une nouvelle partie
                await updateRoomState({
                  status: 'setup',
                  activePlayerIndex: 0,
                  winnerName: '',
                  statsRecorded: false,
                  lastCompletedRound: null
                });
              }}
              className="w-full py-3.5 bg-theme-accent hover:bg-theme-accent-hover text-black font-black text-xs rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              <RotateCcw className="w-4 h-4 stroke-[3]" /> CONFIGURER NOUVEAU MATCH
            </button>

            <button
              onClick={() => {
                if (onLeaveRoom) {
                  onLeaveRoom();
                } else {
                  setLocalRoom(null);
                  setRoomId(null);
                  setRoom(null);
                  window.location.hash = '#/remote';
                }
              }}
              className="w-full py-3.5 bg-black/40 border border-theme-border text-theme-text-primary font-bold text-xs rounded-xl transition-all hover:bg-black/60 cursor-pointer"
            >
              QUITTER LE SALON
            </button>
          </div>
        </div>
      </div>
    );
};
