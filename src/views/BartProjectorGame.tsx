import React, { useState, useEffect } from 'react';
import { Zap, Tv, Maximize2, Sparkles, Eye, Settings } from 'lucide-react';
import type { RoomData, Player, CalibrationSettings } from '../services/roomService';

interface BartProjectorGameProps {
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
}

export const BartProjectorGame: React.FC<BartProjectorGameProps> = ({ 
  room,
  projectorMode,
  setProjectorMode,
  showModeSelector,
  setShowModeSelector,
  renderCalibratedDartboard,
  calibration,
  isCalibrating,
  setIsCalibrating,
  calibrationStep,
  renderProjectorCalibrationInterface,
  lastCalibrationHit
}) => {
  const bartConfig = room.bartConfig!;
  const players = room.players;
  
  // Animation state pour les événements (Ace / Retour)
  const [activeEvent, setActiveEvent] = useState<{ type: string; playerName: string } | null>(null);

  useEffect(() => {
    if (bartConfig.lastEvent) {
      const isRecent = (Date.now() - bartConfig.lastEvent.timestamp) < 10000;
      if (isRecent) {
        setActiveEvent(bartConfig.lastEvent);
        const timer = setTimeout(() => setActiveEvent(null), 4000);
        return () => clearTimeout(timer);
      }
    }
  }, [bartConfig.lastEvent?.timestamp]);

  // Récupération de la cible favorite d'un joueur avec taux
  const getFavoriteTargetWithRate = (player: Player) => {
    const heatMap = player.bartState?.heatMap || {};
    let maxAttempts = 0;
    let favoriteKey = null;
    for (const [key, val] of Object.entries(heatMap)) {
      const attempts = (val as any).attempts || 0;
      if (attempts > maxAttempts) {
        maxAttempts = attempts;
        favoriteKey = key;
      }
    }
    if (!favoriteKey) return '-';
    const [num, zone] = favoriteKey.split('_');
    const val = heatMap[favoriteKey];
    const rate = val.attempts > 0 ? Math.round((val.success / val.attempts) * 100) : 0;
    const zoneStr = zone === 'inner' ? 'Int.' : 'Ext.';
    const numStr = num === 'bull' ? 'BULL' : num;
    return `${numStr} ${zoneStr} (${rate}%)`;
  };

  const [ambientMessageIndex, setAmbientMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setAmbientMessageIndex((prev) => prev + 1);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const getAmbientMessages = () => {
    const messages: React.ReactNode[] = [];

    // 1. Streaks
    const p1Streak = players[0].bartState!.gamesStreak;
    const p2Streak = players[1].bartState!.gamesStreak;
    if (p1Streak >= 2) {
      messages.push(
        <span className="text-orange-600 font-bold">
          🔥 {players[0].name} est chaud ! {p1Streak} jeux consécutifs !
        </span>
      );
    }
    if (p2Streak >= 2) {
      messages.push(
        <span className="text-orange-600 font-bold">
          🔥 {players[1].name} est chaud ! {p2Streak} jeux consécutifs !
        </span>
      );
    }

    // 2. Favorite targets
    const fav1 = getFavoriteTargetWithRate(players[0]);
    if (fav1 !== '-') {
      messages.push(
        <span>
          🎯 Target favorite de <strong className="text-zinc-900">{players[0].name}</strong> : <span className="text-theme-accent font-extrabold">{fav1}</span>
        </span>
      );
    }
    const fav2 = getFavoriteTargetWithRate(players[1]);
    if (fav2 !== '-') {
      messages.push(
        <span>
          🎯 Target favorite de <strong className="text-zinc-900">{players[1].name}</strong> : <span className="text-theme-accent font-extrabold">{fav2}</span>
        </span>
      );
    }

    // 3. Aces and Return Winners stats
    if (players[0].bartState!.acesCount > 0 || players[1].bartState!.acesCount > 0) {
      messages.push(
        <span>
          ⚡ Aces : <strong className="text-zinc-900">{players[0].name}</strong> ({players[0].bartState!.acesCount}) vs <strong className="text-zinc-900">{players[1].name}</strong> ({players[1].bartState!.acesCount})
        </span>
      );
    }
    if (players[0].bartState!.returnWinnersCount > 0 || players[1].bartState!.returnWinnersCount > 0) {
      messages.push(
        <span>
          💪 Retours gagnants : <strong className="text-zinc-900">{players[0].name}</strong> ({players[0].bartState!.returnWinnersCount}) vs <strong className="text-zinc-900">{players[1].name}</strong> ({players[1].bartState!.returnWinnersCount})
        </span>
      );
    }

    // 4. Default fun quotes (ambiançage)
    messages.push(<span className="text-zinc-500 font-medium">🎯 Visez le centre, chaque millimètre compte !</span>);
    messages.push(<span className="text-zinc-500 font-medium">⚡ Qui prendra l'avantage sur le prochain jeu ?</span>);
    messages.push(<span className="text-zinc-500 font-medium">🏆 La tension est à son comble dans ce match de Bart !</span>);
    messages.push(<span className="text-zinc-500 font-medium">💪 Un tennis de table de précision avec des fléchettes !</span>);

    return messages;
  };

  // Récupération des stats de la cible actuelle
  const currentServer = players[bartConfig.serverIndex];

  return (
    <div className="w-full h-full flex m-0 p-0 overflow-hidden bg-black select-none font-sans">
      
      {/* MOITIÉ GAUCHE : Cible et Grosse Target (conditionnée par projectorMode) */}
      {projectorMode !== 'fullscreen' && (
        <div 
          className={`w-1/2 h-full transition-all duration-500 shadow-[20px_0_40px_rgba(255,255,255,0.15)] z-10 relative overflow-hidden ${
            projectorMode === 'ar' 
              ? isCalibrating
                ? 'bg-white flex items-center justify-center p-0'
                : 'bg-black flex items-center justify-center p-0'
              : 'bg-white flex flex-col justify-end items-center pb-6'
          }`}
        >
          {projectorMode === 'ar' ? (
            <div className="w-full h-full relative flex items-center justify-center">
              {renderCalibratedDartboard(isCalibrating)}
              
              {/* Placeholder Zone Stats pour l'étape 9 (AR Setup) */}
              {isCalibrating && calibrationStep === 9 && (
                <div 
                  className="absolute bg-zinc-300/80 border-2 border-dashed border-zinc-500 rounded-3xl p-6 shadow-xl backdrop-blur-md z-40 transition-all duration-200"
                  style={
                    calibration?.statsPanelHeight !== undefined
                      ? {
                          left: `${calibration.statsPanelX ?? 16}px`,
                          top: `${calibration.statsPanelY ?? 250}px`,
                          width: `${calibration.statsPanelWidth ?? 320}px`,
                          height: `${calibration.statsPanelHeight ?? 280}px`,
                        }
                      : { 
                          left: `${calibration?.statsPanelX ?? 16}px`,
                          top: `calc(50% + ${calibration?.statsPanelY ?? 0}px)`, 
                          transform: 'translateY(-50%)',
                          width: '320px',
                          minHeight: '280px' 
                        }
                  }
                >
                  <div className="text-xs uppercase font-black tracking-widest text-zinc-600 mb-4 text-center">
                    Fausses Statistiques
                  </div>
                  <div className="flex flex-col gap-2 text-sm font-bold text-zinc-700 leading-snug">
                    <div className="h-4 bg-zinc-400/50 rounded w-3/4 animate-pulse"></div>
                    <div className="h-4 bg-zinc-400/50 rounded w-1/2 animate-pulse"></div>
                    <div className="h-4 bg-zinc-400/50 rounded w-5/6 animate-pulse mt-4"></div>
                    <div className="h-4 bg-zinc-400/50 rounded w-2/3 animate-pulse"></div>
                    <div className="h-4 bg-zinc-400/50 rounded w-3/4 animate-pulse"></div>
                    <div className="h-4 bg-zinc-400/50 rounded w-1/2 animate-pulse mt-4"></div>
                    <div className="text-center text-xs text-zinc-500 mt-4 italic font-medium">Positionnez cette bulle avec les curseurs</div>
                  </div>
                </div>
              )}

              {/* Bouton pour lancer la calibration (engrenage) */}
              {!isCalibrating && (
                <button
                  onClick={() => setIsCalibrating(true)}
                  className="absolute top-4 right-4 p-2.5 bg-black/80 text-theme-accent hover:text-black rounded-xl hover:scale-105 transition-all border border-theme-border/30 hover:bg-theme-accent z-30 flex items-center justify-center cursor-pointer shadow-lg"
                  title="Lancer le calibrage de la cible"
                >
                  <Settings className="w-5 h-5" />
                </button>
              )}

              {/* Notification de toucher pour tester l'adresse ou impact */}
              {lastCalibrationHit && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/90 text-white border-2 border-theme-accent px-4 py-2 rounded-2xl shadow-xl z-30 text-xs font-bold animate-fadeIn pointer-events-none">
                  🎯 Touché : <span className="text-theme-accent">{lastCalibrationHit.region}</span> &bull; Score : <span className="text-[#22c55e]">{lastCalibrationHit.score}</span>
                </div>
              )}

              {/* Éléments de jeu normaux (seulement si non calibration) */}
              {!isCalibrating && (
                <>
                  {/* Zone Cible en bas en AR */}
                  <div className="absolute bottom-16 left-0 right-0 flex justify-center z-20 pointer-events-none">
                    {bartConfig.currentTarget ? (
                      <div className="text-center animate-fadeIn">
                        <div className="flex items-baseline justify-center gap-4">
                          <span className="text-[10rem] md:text-[12rem] leading-none font-black text-white tracking-tighter drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]">
                            {bartConfig.currentTarget.number === 'bull' ? 'BULL' : bartConfig.currentTarget.number}
                          </span>
                          <span className="text-6xl md:text-7xl font-black text-zinc-400 lowercase drop-shadow-xl">
                            {bartConfig.currentTarget.zone === 'inner' ? 'intérieur' : 'extérieur'}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* OVERLAY: WAITING FOR SERVE (AR MODE) */}
                  {!bartConfig.currentTarget && (
                    <div 
                      className="absolute z-30 flex flex-col items-center justify-center pointer-events-none animate-pulse"
                      style={{
                        left: `${calibration?.centerX || 960}px`,
                        top: `${calibration?.centerY || 540}px`,
                        transform: 'translate(-50%, -50%)',
                        width: `${(calibration?.rDoubleOuter || 350) * 2}px`
                      }}
                    >
                      <span 
                        className="font-black text-red-600 block uppercase tracking-[0.3em] drop-shadow-md"
                        style={{ fontSize: `${(calibration?.rDoubleOuter || 350) * 0.08}px`, marginBottom: `${(calibration?.rDoubleOuter || 350) * 0.02}px` }}
                      >
                        Service
                      </span>
                      <span 
                        className="leading-none font-black text-black uppercase tracking-tighter drop-shadow-[0_0_10px_rgba(255,255,255,0.8)] px-4 text-center break-words max-w-full"
                        style={{ fontSize: `${(calibration?.rDoubleOuter || 350) * 0.25}px` }}
                      >
                        {currentServer.name}
                      </span>
                    </div>
                  )}

                  {/* Zone Stats à gauche en AR */}
                  <div 
                    className="absolute bg-black/60 border border-zinc-800 rounded-3xl p-6 shadow-2xl backdrop-blur-md z-20 transition-all duration-200 overflow-y-auto"
                    style={
                      calibration?.statsPanelHeight !== undefined
                        ? {
                            left: `${calibration.statsPanelX ?? 16}px`,
                            top: `${calibration.statsPanelY ?? 250}px`,
                            width: `${calibration.statsPanelWidth ?? 320}px`,
                            height: `${calibration.statsPanelHeight ?? 280}px`,
                          }
                        : { 
                            left: `${calibration?.statsPanelX ?? 16}px`,
                            top: `calc(50% + ${calibration?.statsPanelY || 0}px)`, 
                            transform: 'translateY(-50%)',
                            width: '320px',
                            minHeight: '280px' 
                          }
                    }
                  >
                    <div className="text-xs uppercase font-black tracking-widest text-zinc-500 mb-4">
                      {bartConfig.currentTarget ? 'Statistiques Cible' : 'Info Match'}
                    </div>
                    <div className="flex flex-col text-sm font-bold text-white leading-snug">
                        {(() => {
                          if (bartConfig.currentTarget) {
                            const targetKey = `${bartConfig.currentTarget.number}_${bartConfig.currentTarget.zone}`;
                            const stats = currentServer.bartState!.heatMap[targetKey];
                            const attempts = stats?.attempts || 0;
                            const success = stats?.success || 0;
                            const perfects = stats?.perfects || 0;
                            
                            if (attempts === 0) {
                              return (
                                <span className="text-zinc-400 italic text-lg">
                                  🆕 Premier essai de {currentServer.name} sur cette cible !
                                </span>
                              );
                            }

                            const rate = Math.round((success / attempts) * 100);
                            const isFetish = rate >= 50;

                            return (
                              <div className="flex flex-col gap-3 w-full text-lg">
                                <div className="flex flex-col gap-1">
                                  {isFetish ? (
                                    <span className="text-green-400 font-extrabold text-xl">🎯 Cible fétiche ({rate}%)</span>
                                  ) : (
                                    <span className="text-red-400 font-extrabold text-xl">⚠️ Cible difficile ({rate}%)</span>
                                  )}
                                  <span className="text-zinc-300 font-medium">pour {currentServer.name} ({success}/{attempts})</span>
                                </div>
                                {perfects > 0 && (
                                  <div className="text-yellow-400 font-extrabold text-base mt-2 bg-yellow-500/10 px-3 py-1.5 rounded-lg border border-yellow-500/30 w-fit">
                                    ⚡ {perfects} Perfect(s) réussi(s) !
                                  </div>
                                )}
                              </div>
                            );
                          } else {
                            const messages = getAmbientMessages();
                            if (messages.length === 0) return null;
                            const activeMsg = messages[ambientMessageIndex % messages.length];
                            return <div className="animate-fadeIn text-lg text-zinc-300">{activeMsg}</div>;
                          }
                        })()}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Ombre douce au sol pour détacher l'interface du fond blanc */}
              {bartConfig.currentTarget && (
                <div className="absolute bottom-0 left-0 w-full h-64 bg-gradient-to-t from-theme-accent/10 to-transparent blur-3xl z-0 pointer-events-none" />
              )}

              {/* Conteneur strict "Bas Gauche" pour ne pas empiéter sur la cible physique */}
              <div className="absolute bottom-16 left-6 right-6 flex flex-col justify-end gap-3 z-20">
                
                {/* 1. LIGNE CIBLE CHOISIE (Stable, hauteur fixe) */}
                <div className="h-28 flex flex-col justify-center mb-2">
                  {bartConfig.currentTarget ? (
                    <div className="animate-fadeIn">
                      <span className="text-xs md:text-sm font-black text-zinc-400 uppercase tracking-widest block mb-1">
                        Cible en cours
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-7xl md:text-8xl leading-none font-black text-zinc-950 tracking-tighter">
                          {bartConfig.currentTarget.number === 'bull' ? 'BULL' : bartConfig.currentTarget.number}
                        </span>
                        <span className="text-3xl font-black text-zinc-500 lowercase">
                          {bartConfig.currentTarget.zone === 'inner' ? 'intérieur' : 'extérieur'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="animate-pulse">
                      <span className="text-xs md:text-sm font-black text-zinc-400 uppercase tracking-widest block mb-1">
                        Nouveau Service
                      </span>
                      <span className="text-3xl md:text-4xl font-bold italic text-zinc-800 select-none">
                        À <span className="font-black not-italic text-theme-accent">{currentServer.name}</span> de servir
                      </span>
                    </div>
                  )}
                </div>

                {/* 2. ZONE AMBIANCE & STATISTIQUES (Stable, hauteur fixe) */}
                <div className="w-full h-32 bg-zinc-50 border border-zinc-200/80 rounded-2xl p-4 shadow-sm flex flex-col justify-between relative overflow-hidden">
                  <div className="text-[10px] uppercase font-black tracking-widest text-zinc-400 mb-1">
                    {bartConfig.currentTarget ? 'Données Cible' : 'Info Match'}
                  </div>
                  <div className="flex-grow flex items-center text-sm font-bold text-zinc-800 leading-snug">
                    {(() => {
                      if (bartConfig.currentTarget) {
                        const targetKey = `${bartConfig.currentTarget.number}_${bartConfig.currentTarget.zone}`;
                        const stats = currentServer.bartState!.heatMap[targetKey];
                        const attempts = stats?.attempts || 0;
                        const success = stats?.success || 0;
                        const perfects = stats?.perfects || 0;
                        
                        if (attempts === 0) {
                          return (
                            <span className="text-zinc-500 italic">
                              🆕 Premier essai de {currentServer.name} sur cette cible dans ce match !
                            </span>
                          );
                        }

                        const rate = Math.round((success / attempts) * 100);
                        const isFetish = rate >= 50;

                        return (
                          <div className="flex flex-col gap-1 w-full">
                            <div className="flex items-center gap-1.5">
                              {isFetish ? (
                                <span className="text-green-600 font-extrabold">🎯 Cible fétiche ({rate}% de réussite)</span>
                              ) : (
                                <span className="text-red-500 font-extrabold">⚠️ Cible difficile ({rate}% de réussite)</span>
                              )}
                              <span className="text-zinc-500 font-medium">pour {currentServer.name} ({success}/{attempts} gagnés)</span>
                            </div>
                            {perfects > 0 && (
                              <div className="text-yellow-600 font-extrabold text-xs mt-1 bg-yellow-50 px-2 py-0.5 rounded border border-yellow-200 w-fit">
                                ⚡ {perfects} Perfect(s) réussi(s) sur cette cible !
                              </div>
                            )}
                          </div>
                        );
                      } else {
                        // Rotation des messages d'ambiance
                        const messages = getAmbientMessages();
                        if (messages.length === 0) return null;
                        const activeMsg = messages[ambientMessageIndex % messages.length];
                        return <div className="animate-fadeIn">{activeMsg}</div>;
                      }
                    })()}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Minou Dart Game fixé tout en bas */}
          <div className="absolute bottom-6 left-0 right-0 text-center select-none z-20 pointer-events-none">
            <span className={`italic text-sm font-serif tracking-widest opacity-40 ${projectorMode === 'ar' ? 'text-zinc-500' : 'text-zinc-950'}`}>
              Minou Dart Game
            </span>
          </div>
        </div>
      )}

      {/* MOITIÉ DROITE : Interface Sombre (Score Tennis) ou Calibration */}
      <div className={`${projectorMode === 'fullscreen' ? 'w-full' : 'w-1/2'} h-full bg-theme-bg text-theme-text-primary p-5 flex flex-col justify-between relative border-l border-theme-border/30`}>
        {isCalibrating ? (
          renderProjectorCalibrationInterface()
        ) : (
          <>
            {/* Top bar */}
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-theme-accent animate-ping" />
              <h2 className="text-xs font-bold tracking-widest text-theme-text-secondary uppercase">
                BART (Tennis) &bull; SALON : {room.roomId} &bull; FORMAT: {bartConfig.setsToWin} SET{bartConfig.setsToWin > 1 ? 'S' : ''}
              </h2>
            </div>

        {/* Tennis Scoreboard & Match Stats */}
        <div className="flex-grow flex flex-col justify-start max-w-2xl w-full mx-auto pt-3">
          
          {bartConfig.isTieBreak && (
            <div className="bg-orange-500/20 border border-orange-500/50 rounded-xl p-3 mb-6 text-center animate-pulse">
              <span className="text-orange-400 font-black tracking-widest uppercase text-xl">TIE-BREAK EN COURS</span>
            </div>
          )}

          <div className="bg-black/60 border border-zinc-800 rounded-3xl overflow-hidden backdrop-blur-md shadow-2xl">
            {/* En-tête du tableau */}
            <div className="flex border-b border-zinc-800 bg-zinc-900/50">
              <div className="w-1/2 p-4 font-black text-xs text-zinc-500 uppercase tracking-widest">Joueurs</div>
              <div className="w-1/6 p-4 text-center border-l border-zinc-800 font-black text-xs text-zinc-500 uppercase">Sets</div>
              <div className="w-1/6 p-4 text-center border-l border-zinc-800 font-black text-xs text-zinc-500 uppercase">Jeux</div>
              <div className="w-1/6 p-4 text-center border-l border-zinc-800 font-black text-xs text-theme-accent uppercase bg-theme-accent/5">Points</div>
            </div>

            {/* Lignes des joueurs */}
            {players.map((player, idx) => {
              const isServer = idx === bartConfig.serverIndex;
              const isTieBreak = bartConfig.isTieBreak;
              const pointsDisplay = isTieBreak ? player.bartState!.tieBreakPoints : player.bartState!.currentPoints;
              
              return (
                <div key={idx} className="flex border-b border-zinc-800/50 last:border-b-0 bg-black/40 items-stretch">
                  
                  {/* Nom du joueur & Serveur */}
                  <div className="w-1/2 p-6 flex items-center gap-4 relative overflow-hidden">
                    {/* Indicateur de Service */}
                    <div className="w-8 flex justify-center">
                      {isServer && (
                        <div className="w-3 h-3 rounded-full bg-theme-accent shadow-[0_0_10px_var(--theme-accent)] animate-pulse" />
                      )}
                    </div>
                    <span className="text-3xl font-black uppercase text-white truncate tracking-wide">
                      {player.name}
                    </span>
                    {/* Highlight background if server */}
                    {isServer && <div className="absolute inset-0 bg-theme-accent/5 -z-10" />}
                  </div>

                  {/* Sets */}
                  <div className="w-1/6 p-6 flex items-center justify-center border-l border-zinc-800/50 bg-black/60">
                    <span className="text-4xl font-bold text-zinc-300 font-mono">
                      {player.bartState!.setsWon}
                    </span>
                  </div>

                  {/* Jeux */}
                  <div className="w-1/6 p-6 flex items-center justify-center border-l border-zinc-800/50 bg-black/40">
                    <span className="text-4xl font-bold text-white font-mono">
                      {player.bartState!.gamesWon}
                    </span>
                  </div>

                  {/* Points du jeu en cours */}
                  <div className="w-1/6 p-6 flex items-center justify-center border-l border-zinc-800/50 bg-theme-accent/10 relative overflow-hidden">
                    <span className="text-5xl font-black text-theme-accent font-mono z-10">
                      {pointsDisplay}
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-t from-theme-accent/20 to-transparent -z-10" />
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Messages de tension (Break, Set, Match) */}
          <div className="min-h-[3rem] flex flex-col items-center justify-center gap-1 mt-2.5">
            {(() => {
              const p1 = players[0];
              const p2 = players[1];
              const isTieBreak = bartConfig.isTieBreak;

              // Helper: Check if a player is 1 point away from winning a game
              const isGamePoint = (p: typeof p1, opp: typeof p1) => {
                if (isTieBreak) {
                  return p.bartState!.tieBreakPoints >= 6 && (p.bartState!.tieBreakPoints - opp.bartState!.tieBreakPoints >= 1);
                } else {
                  return (p.bartState!.currentPoints === 40 && opp.bartState!.currentPoints !== 'ADV') || p.bartState!.currentPoints === 'ADV';
                }
              };

              const p1GamePoint = isGamePoint(p1, p2);
              const p2GamePoint = isGamePoint(p2, p1);

              if (!p1GamePoint && !p2GamePoint) return null;

              // Identify who is about to win
              const winnerP = p1GamePoint ? p1 : p2;
              const loserP = p1GamePoint ? p2 : p1;
              const winnerIsServer = p1GamePoint ? (bartConfig.serverIndex === 0) : (bartConfig.serverIndex === 1);

              // Check if winning this game wins the set
              const isSetPoint = isTieBreak || (winnerP.bartState!.gamesWon >= 5 && (winnerP.bartState!.gamesWon - loserP.bartState!.gamesWon >= 1));
              
              // Check if winning this set wins the match
              const isMatchPoint = isSetPoint && (winnerP.bartState!.setsWon === bartConfig.setsToWin - 1);

              // Check if it's a break point (receiver is about to win)
              const isBreakPoint = !winnerIsServer;

              let message = '';
              let style = '';

              if (isMatchPoint) {
                message = "BALLE DE MATCH";
                style = "bg-yellow-500/20 border-yellow-500 text-yellow-500";
              } else if (isSetPoint) {
                message = "BALLE DE SET";
                style = "bg-orange-500/20 border-orange-500 text-orange-500";
              } else if (isBreakPoint) {
                message = "BALLE DE BREAK";
                style = "bg-red-500/20 border-red-500 text-red-500";
              } else {
                return null; // Balle de jeu classique pour le serveur, on n'affiche rien d'alarmant
              }

              return (
                <>
                  <span className={`px-6 py-2 border font-black uppercase tracking-[0.3em] rounded-full animate-pulse ${style}`}>
                    {message}
                  </span>
                  {isBreakPoint && (
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest mt-1">
                      Conversions de break : {winnerP.bartState!.breakPointsConverted} / {winnerP.bartState!.breakPointsPlayed + 1}
                    </span>
                  )}
                </>
              );
            })()}
          </div>

          {/* STATISTIQUES GLOBALES DU MATCH */}
          <div className="w-full bg-black/40 rounded-3xl p-4 border border-zinc-800/80 shadow-2xl backdrop-blur-md mt-3.5">
            <h3 className="text-zinc-500 font-black tracking-widest uppercase text-[10px] mb-3 text-center">Statistiques du Match</h3>
            
            <div className="flex justify-between items-center text-xs font-bold text-white mb-4 border-b border-zinc-800/50 pb-2">
              <span className="w-1/3 truncate text-right uppercase tracking-wider">{players[0].name}</span>
              <span className="w-1/3 text-center text-zinc-500">VS</span>
              <span className="w-1/3 truncate uppercase tracking-wider">{players[1].name}</span>
            </div>

            <div className="flex flex-col gap-2.5">
              {/* % Service */}
              <div className="flex justify-between items-center text-xs">
                <span className="w-1/3 text-right font-mono text-zinc-300">
                  {(players[0]?.bartState?.servesPlayed || 0) > 0 ? Math.round(((players[0]?.bartState?.servesWon || 0) / (players[0]?.bartState?.servesPlayed || 1)) * 100) : 0}%
                </span>
                <span className="w-1/3 text-center text-[9px] uppercase font-black text-theme-accent tracking-widest">Réussite Service</span>
                <span className="w-1/3 font-mono text-zinc-300">
                  {(players[1]?.bartState?.servesPlayed || 0) > 0 ? Math.round(((players[1]?.bartState?.servesWon || 0) / (players[1]?.bartState?.servesPlayed || 1)) * 100) : 0}%
                </span>
              </div>

              {/* Aces */}
              <div className="flex justify-between items-center text-xs">
                <span className="w-1/3 text-right font-mono font-bold text-yellow-400">{players[0]?.bartState?.acesCount || 0}</span>
                <span className="w-1/3 text-center text-[9px] uppercase font-black text-zinc-400 tracking-widest font-sans">Aces</span>
                <span className="w-1/3 font-mono font-bold text-yellow-400">{players[1]?.bartState?.acesCount || 0}</span>
              </div>

              {/* Retours Gagnants */}
              <div className="flex justify-between items-center text-xs">
                <span className="w-1/3 text-right font-mono font-bold text-green-400">{players[0]?.bartState?.returnWinnersCount || 0}</span>
                <span className="w-1/3 text-center text-[9px] uppercase font-black text-zinc-400 tracking-widest font-sans">Retours Gagnants</span>
                <span className="w-1/3 font-mono font-bold text-green-400">{players[1]?.bartState?.returnWinnersCount || 0}</span>
              </div>

              {/* Break Points */}
              <div className="flex justify-between items-center text-xs">
                <span className="w-1/3 text-right font-mono text-red-400">{players[0]?.bartState?.breakPointsConverted || 0} / {players[0]?.bartState?.breakPointsPlayed || 0}</span>
                <span className="w-1/3 text-center text-[9px] uppercase font-black text-zinc-400 tracking-widest font-sans">Breaks</span>
                <span className="w-1/3 font-mono text-red-400">{players[1]?.bartState?.breakPointsConverted || 0} / {players[1]?.bartState?.breakPointsPlayed || 0}</span>
              </div>

              {/* Total Perfects */}
              <div className="flex justify-between items-center text-xs">
                <span className="w-1/3 text-right font-mono font-bold text-yellow-400">
                  {(players[0]?.bartState?.acesCount || 0) + (players[0]?.bartState?.returnWinnersCount || 0)}
                </span>
                <span className="w-1/3 text-center text-[9px] uppercase font-black text-zinc-400 tracking-widest font-sans">Total Perfects</span>
                <span className="w-1/3 font-mono font-bold text-yellow-400">
                  {(players[1]?.bartState?.acesCount || 0) + (players[1]?.bartState?.returnWinnersCount || 0)}
                </span>
              </div>

              {/* Cible Fétiche */}
              <div className="flex justify-between items-center text-xs">
                <span className="w-1/3 text-right font-bold text-zinc-300 truncate font-mono">
                  {players[0] ? getFavoriteTargetWithRate(players[0]) : '-'}
                </span>
                <span className="w-1/3 text-center text-[9px] uppercase font-black text-zinc-400 tracking-widest font-sans">Cible Fétiche</span>
                <span className="w-1/3 font-bold text-zinc-300 truncate font-mono">
                  {players[1] ? getFavoriteTargetWithRate(players[1]) : '-'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-2 pt-2 border-t border-theme-border/20 flex flex-row justify-between items-center text-[10px] text-theme-text-secondary/80 select-none">
          <div className="flex items-center gap-2">
            <span className="font-extrabold tracking-widest text-theme-accent">MINOU DARTS</span>
            <span className="text-zinc-700">|</span>
            <span className="uppercase tracking-wider text-[9px]">Est. 2026</span>
          </div>
          <div className="text-center font-mono">
            SALON : <span className="font-black text-theme-accent">{room.roomId}</span>
          </div>
          <div className="text-right hidden sm:block">
            JEU BART &bull; METRIC PWA
          </div>
        </div>

        {/* Bouton de sélection de mode de vue et popup (en bas à droite) */}
        <div className="absolute bottom-4 right-4 z-50 flex flex-col items-end gap-2">
          {showModeSelector && (
            <div className="bg-zinc-950/95 border border-theme-border/50 rounded-2xl p-2.5 shadow-2xl backdrop-blur-md w-56 flex flex-col gap-1 text-xs text-white">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest px-2 py-1">
                Mode d'affichage
              </span>
              <button 
                onClick={() => { setProjectorMode('classic'); setShowModeSelector(false); }}
                className={`w-full flex items-center justify-between p-2 rounded-xl text-left font-bold transition-all ${
                  projectorMode === 'classic' 
                    ? 'bg-theme-accent text-black font-extrabold shadow-md' 
                    : 'hover:bg-zinc-900 text-zinc-350 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Tv className="w-4 h-4" />
                  <span>Vue Classique</span>
                </div>
                {projectorMode === 'classic' && <span className="text-[9px] uppercase tracking-wider font-black">Actif</span>}
              </button>

              <button 
                onClick={() => { setProjectorMode('fullscreen'); setShowModeSelector(false); }}
                className={`w-full flex items-center justify-between p-2 rounded-xl text-left font-bold transition-all ${
                  projectorMode === 'fullscreen' 
                    ? 'bg-theme-accent text-black font-extrabold shadow-md' 
                    : 'hover:bg-zinc-900 text-zinc-350 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Maximize2 className="w-4 h-4" />
                  <span>Plein Écran</span>
                </div>
                {projectorMode === 'fullscreen' && <span className="text-[9px] uppercase tracking-wider font-black">Actif</span>}
              </button>

              <button 
                onClick={() => { setProjectorMode('ar'); setShowModeSelector(false); }}
                className={`w-full flex items-center justify-between p-2 rounded-xl text-left font-bold transition-all ${
                  projectorMode === 'ar' 
                    ? 'bg-theme-accent text-black font-extrabold shadow-md' 
                    : 'hover:bg-zinc-900 text-zinc-350 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  <span>Réalité Augmentée</span>
                </div>
                {projectorMode === 'ar' && <span className="text-[9px] uppercase tracking-wider font-black">Actif</span>}
              </button>
            </div>
          )}

          <button
            onClick={() => setShowModeSelector(!showModeSelector)}
            className="p-3.5 bg-zinc-900/90 border border-theme-border/50 text-theme-accent rounded-full hover:scale-105 transition-all shadow-xl hover:bg-zinc-950 flex items-center justify-center"
            title="Changer de vue"
          >
            <Eye className="w-5 h-5" />
          </button>
        </div>
      </>
    )}
  </div>

      {/* OVERLAY ANIMATION: ACE & RETOUR GAGNANT */}
      {activeEvent && (activeEvent.type === 'ace' || activeEvent.type === 'retour_gagnant') && (
        <div className={`absolute inset-0 z-50 flex items-center justify-center pointer-events-none animate-fadeInOut ${projectorMode === 'ar' ? '' : 'bg-black/80 backdrop-blur-sm'}`}>
          <div className={`text-center relative ${projectorMode === 'ar' ? 'scale-[1.2] -translate-y-8 px-4 w-full flex flex-col items-center' : ''}`}>
            {projectorMode !== 'ar' && <div className="absolute -inset-20 bg-yellow-500/20 blur-[100px] rounded-full animate-pulse" />}
            <Zap className={`w-24 h-24 md:w-32 md:h-32 text-yellow-400 mx-auto mb-4 md:mb-8 animate-bounce ${projectorMode === 'ar' ? 'drop-shadow-[0_0_50px_rgba(250,204,21,1)]' : 'drop-shadow-[0_0_30px_rgba(250,204,21,0.8)]'}`} />
            <h1 className="text-7xl md:text-8xl lg:text-9xl font-black uppercase tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600 leading-none drop-shadow-[0_0_30px_rgba(250,204,21,0.6)] text-center break-words max-w-full">
              {activeEvent.type === 'ace' ? 'ACE' : 'RETOUR GAGNANT'}
            </h1>
            <p className="text-4xl md:text-5xl lg:text-6xl font-black text-white uppercase tracking-widest mt-4 md:mt-8 animate-pulse drop-shadow-[0_0_15px_rgba(255,255,255,1)] text-center break-words max-w-full px-4">
              {activeEvent.playerName}
            </p>
          </div>
        </div>
      )}

      {/* Styles for custom animation */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeInOut {
          0% { opacity: 0; transform: scale(1.1); }
          10% { opacity: 1; transform: scale(1); }
          90% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.9); }
        }
        .animate-fadeInOut {
          animation: fadeInOut 4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}} />
      {/* Bouton de sélection de mode de vue et popup (en bas à droite) */}
      <div className="absolute bottom-4 right-4 z-50 flex flex-col items-end gap-2">
        {showModeSelector && (
          <div className="bg-zinc-950/95 border border-theme-border/50 rounded-2xl p-2.5 shadow-2xl backdrop-blur-md w-56 flex flex-col gap-1 text-xs text-white">
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest px-2 py-1">
              Mode d'affichage
            </span>
            <button 
              onClick={() => { setProjectorMode('classic'); setShowModeSelector(false); }}
              className={`w-full flex items-center justify-between p-2 rounded-xl text-left font-bold transition-all ${
                projectorMode === 'classic' 
                  ? 'bg-theme-accent text-black font-extrabold shadow-md' 
                  : 'hover:bg-zinc-900 text-zinc-350 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <Tv className="w-4 h-4" />
                <span>Vue Classique</span>
              </div>
              {projectorMode === 'classic' && <span className="text-[9px] uppercase tracking-wider font-black">Actif</span>}
            </button>

            <button 
              onClick={() => { setProjectorMode('fullscreen'); setShowModeSelector(false); }}
              className={`w-full flex items-center justify-between p-2 rounded-xl text-left font-bold transition-all ${
                projectorMode === 'fullscreen' 
                  ? 'bg-theme-accent text-black font-extrabold shadow-md' 
                  : 'hover:bg-zinc-900 text-zinc-350 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <Maximize2 className="w-4 h-4" />
                <span>Plein Écran</span>
              </div>
              {projectorMode === 'fullscreen' && <span className="text-[9px] uppercase tracking-wider font-black">Actif</span>}
            </button>

            <button 
              onClick={() => { setProjectorMode('ar'); setShowModeSelector(false); }}
              className={`w-full flex items-center justify-between p-2 rounded-xl text-left font-bold transition-all ${
                projectorMode === 'ar' 
                  ? 'bg-theme-accent text-black font-extrabold shadow-md' 
                  : 'hover:bg-zinc-900 text-zinc-350 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <span>Réalité Augmentée</span>
              </div>
              {projectorMode === 'ar' && <span className="text-[9px] uppercase tracking-wider font-black">Actif</span>}
            </button>
          </div>
        )}

        <button
          onClick={() => setShowModeSelector(!showModeSelector)}
          className="p-3.5 bg-zinc-900/90 border border-theme-border/50 text-theme-accent rounded-full hover:scale-105 transition-all shadow-xl hover:bg-zinc-950 flex items-center justify-center"
          title="Changer de vue"
        >
          <Eye className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
