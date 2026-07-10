import React from 'react';
import { Zap, Tv, Maximize2, Eye } from 'lucide-react';
import type { RoomData, CalibrationSettings } from '../services/roomService';

interface ClockProjectorGameProps {
  room: RoomData;
  projectorMode: 'classic' | 'fullscreen' | 'ar';
  setProjectorMode: (mode: 'classic' | 'fullscreen' | 'ar') => void;
  showModeSelector: boolean;
  setShowModeSelector: (show: boolean) => void;
  renderCalibratedDartboard: (isCalibrationMode: boolean) => React.ReactNode;
  calibration?: CalibrationSettings;
  isCalibrating: boolean;
  setIsCalibrating: (cal: boolean) => void;
  calibrationStep: number;
  renderProjectorCalibrationInterface: () => React.ReactNode;
  lastCalibrationHit: { region: string; score: number } | null;
  renderStatsCalibrationOverlay?: () => React.ReactNode;
}

export const ClockProjectorGame: React.FC<ClockProjectorGameProps> = ({
  room,
  projectorMode,
  setProjectorMode,
  showModeSelector,
  setShowModeSelector,
  renderCalibratedDartboard,
  isCalibrating,
  setIsCalibrating,
  calibrationStep,
  renderProjectorCalibrationInterface,
  lastCalibrationHit,
  renderStatsCalibrationOverlay
}) => {
  const players = room.players;
  const activePlayerIndex = room.activePlayerIndex;
  const includeBull = room.clockConfig?.includeBull ?? true;
  const maxTarget = includeBull ? 25 : 20;

  // Calcul du score de tri pour le classement :
  // On trie d'abord par cible actuelle descendante (plus on a avancé, mieux c'est).
  // À cible égale, on trie par nombre de fléchettes lancées ascendant (celui qui a fait le moins de lancers est devant).
  const sortedPlayersIndices = players
    .map((player, idx) => ({ player, originalIndex: idx }))
    .sort((a, b) => {
      const aState = a.player.clockState || { currentTarget: 1, throwsCount: 0 };
      const bState = b.player.clockState || { currentTarget: 1, throwsCount: 0 };
      
      if (aState.currentTarget !== bState.currentTarget) {
        return bState.currentTarget - aState.currentTarget; // Plus grand en premier
      }
      return aState.throwsCount - bState.throwsCount; // Moins de lancers en premier
    });

  return (
    <div className="w-full h-full bg-zinc-950 flex select-none overflow-hidden relative font-sans text-white">
      
      {/* 1. MOITIÉ GAUCHE : La cible de fléchettes (Projetée en classique ou AR) */}
      {projectorMode !== 'fullscreen' && (
        <div 
          className="w-1/2 h-full flex flex-col items-center justify-center relative transition-all duration-300"
        >
          {projectorMode === 'ar' ? (
            <div className="w-full h-full relative flex flex-col justify-center items-center">
              <div className="w-full h-1/2 flex items-center justify-center relative overflow-visible">
                {renderCalibratedDartboard(isCalibrating)}
              </div>

              {/* Overlay de capture des clics pour le panneau de stats */}
              {renderStatsCalibrationOverlay && renderStatsCalibrationOverlay()}
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center p-4 md:p-6">
              {renderCalibratedDartboard(false)}
            </div>
          )}
        </div>
      )}

      {/* 2. MOITIÉ DROITE : Interface Sombre (Statistiques & Classement) */}
      <div 
        className={`${projectorMode === 'fullscreen' ? 'w-full' : 'w-1/2'} h-full bg-zinc-950 text-white transition-all duration-300 p-5 flex flex-col justify-between relative border-l border-zinc-900`}
      >
        {isCalibrating ? (
          renderProjectorCalibrationInterface()
        ) : (
          <>
            {/* Raccourcis / Options en haut à droite */}
            <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
              <button
                onClick={() => setShowModeSelector(!showModeSelector)}
                className="p-2 rounded-full bg-zinc-900 border border-zinc-800 hover:border-theme-accent text-zinc-400 hover:text-theme-accent transition-all cursor-pointer"
                title="Changer de vue"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>

            {/* Sélecteur de mode de projection flottant */}
            {showModeSelector && (
              <div className="absolute top-14 right-4 bg-zinc-900 border border-zinc-800 p-2.5 rounded-2xl shadow-2xl z-30 w-52 animate-fadeIn">
                <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-2.5 px-1">Mode d'affichage</p>
                <div className="space-y-1.5">
                  {[
                    { mode: 'classic' as const, label: 'Double écran (Classique)', icon: Tv },
                    { mode: 'fullscreen' as const, label: 'Plein écran (Interface)', icon: Maximize2 },
                    { mode: 'ar' as const, label: 'Réalité Augmentée (Cible)', icon: Eye }
                  ].map((item) => (
                    <button
                      key={item.mode}
                      onClick={() => {
                        setProjectorMode(item.mode);
                        setShowModeSelector(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-left transition-all cursor-pointer ${
                        projectorMode === item.mode
                          ? 'bg-theme-accent text-black font-extrabold'
                          : 'text-zinc-300 hover:bg-zinc-800'
                      }`}
                    >
                      <item.icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Contenu des scores */}
            <div className="flex-grow flex flex-col justify-start min-h-0 overflow-hidden">
              {/* En-tête du jeu */}
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full bg-theme-accent animate-ping" />
                <h2 className="text-xs font-black tracking-widest text-zinc-400 uppercase">
                  Tour de l'horloge &bull; {includeBull ? 'AVEC BULLE (25)' : 'SANS BULLE (20)'} &bull; SALON : {room.roomId}
                </h2>
              </div>

              {/* Liste des Joueurs classés */}
              <div className="flex-grow flex flex-col justify-stretch gap-3 min-h-0 py-1 overflow-y-auto">
                {sortedPlayersIndices.map(({ player, originalIndex }, rank) => {
                  const isActive = originalIndex === activePlayerIndex;
                  const state = player.clockState || {
                    currentTarget: 1,
                    throwsCount: 0,
                    hitsCount: 0,
                    accuracy: 0,
                    targetHistory: [],
                    throwHistory: []
                  };

                  // Calculer le pourcentage de progression
                  const progressValue = state.currentTarget === 25 ? 20 : (state.currentTarget - 1);
                  const progressPercent = Math.min(100, Math.round((progressValue / maxTarget) * 100));
                  
                  // Déterminer le libellé de la cible
                  const targetLabel = state.currentTarget === 25 ? 'BULL' : String(state.currentTarget);

                  // Formatage de la précision à la française (virgule pour décimale)
                  const formattedAccuracy = state.accuracy.toLocaleString('fr-FR', {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1
                  });

                  return (
                    <div
                      key={player.name}
                      className={`relative flex flex-col justify-center rounded-3xl border-2 p-4 transition-all duration-300 ${
                        isActive
                          ? 'bg-theme-accent/15 border-theme-accent shadow-[0_0_20px_var(--theme-accent)]/15 scale-[1.01]'
                          : room.status === 'finished' && player.name === room.winnerName
                            ? 'bg-emerald-950/20 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                            : 'bg-black/35 border-zinc-800/80 opacity-70'
                      }`}
                    >
                      {/* Badge de Rang */}
                      <div className="absolute top-3 right-4 flex items-center gap-1.5">
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">
                          Rang {rank + 1}
                        </span>
                      </div>

                      {/* Ligne 1 : Nom et Statut */}
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span 
                            className={`font-black px-2.5 py-0.5 rounded-md flex-shrink-0 text-xs ${
                              isActive 
                                ? 'bg-theme-accent text-black font-extrabold shadow-sm shadow-theme-accent/20' 
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            J{originalIndex + 1}
                          </span>
                          <span 
                            className={`font-black tracking-wide uppercase truncate text-base ${
                              isActive ? 'text-theme-accent' : 'text-zinc-300'
                            }`}
                          >
                            {player.name}
                          </span>
                          {isActive && (
                            <span className="flex items-center gap-1 bg-theme-accent text-black font-black text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                              <Zap className="w-2.5 h-2.5 fill-current" /> En cours
                            </span>
                          )}
                          {room.status === 'finished' && player.name === room.winnerName && (
                            <span className="bg-emerald-500 text-black font-black text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm shadow-emerald-500/20">
                              Vainqueur 🏆
                            </span>
                          )}
                        </div>

                        {/* Cible géante à viser */}
                        <div className="flex flex-col items-end">
                          <span className="text-[8px] text-zinc-500 font-black uppercase tracking-widest">Cible</span>
                          <span className={`text-xl font-black ${isActive ? 'text-theme-accent font-black animate-pulse' : 'text-zinc-400'}`}>
                            {room.status === 'finished' && player.name === room.winnerName ? 'FINI' : targetLabel}
                          </span>
                        </div>
                      </div>

                      {/* Ligne 2 : Barre de Progression Visuelle */}
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[10px] font-black text-zinc-400 mb-1">
                          <span>Progression</span>
                          <span className={isActive ? 'text-theme-accent font-black' : 'text-white'}>
                            {progressPercent} %
                          </span>
                        </div>
                        <div className="w-full h-3 bg-zinc-950 rounded-full border border-zinc-850 overflow-hidden shadow-inner">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isActive 
                                ? 'bg-gradient-to-r from-theme-accent/80 to-theme-accent shadow-[0_0_10px_var(--theme-accent)]' 
                                : 'bg-zinc-650'
                            }`}
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      </div>

                      {/* Ligne 3 : Statistiques de Précision et Lancers */}
                      <div className="mt-4 flex items-center justify-between border-t border-zinc-900/60 pt-3 text-xs font-bold text-zinc-400">
                        <div className="flex gap-4">
                          <span>
                            Lancers : <strong className="text-white font-black">{state.throwsCount}</strong>
                          </span>
                          <span className="text-zinc-800">|</span>
                          <span>
                            Précision : <strong className="text-theme-accent font-black">{formattedAccuracy} %</strong>
                          </span>
                        </div>

                        {/* Rendu des 3 derniers lancers du tour en cours */}
                        <div className="flex gap-1">
                          {[0, 1, 2].map((i) => {
                            const thr = (player.currentRoundThrows || [])[i];
                            return (
                              <div
                                key={i}
                                className={`w-14 h-7 rounded-lg border-2 flex items-center justify-center font-black text-[9px] uppercase tracking-wider transition-all duration-300 ${
                                  thr
                                    ? thr === 'Touché'
                                      ? 'border-green-500 bg-green-500/10 text-green-400 font-extrabold shadow-sm shadow-green-500/5'
                                      : 'border-red-500 bg-red-500/10 text-red-400'
                                    : 'border-zinc-850 bg-zinc-950/10 text-transparent'
                                }`}
                              >
                                {thr || ''}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>

              {/* Indicateur de joueur actif global en bas */}
              {room.status === 'playing' && players[activePlayerIndex] && (
                <div className="mt-4 py-2 border-t border-zinc-900 text-center">
                  <span className="text-zinc-500 text-[10px] uppercase font-black tracking-widest animate-pulse">
                    🎯 C'est à {players[activePlayerIndex].name} de lancer &bull; {players[activePlayerIndex].dartsLeft} fléchettes restantes
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

    </div>
  );
};
