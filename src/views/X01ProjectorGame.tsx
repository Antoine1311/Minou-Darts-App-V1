import React from 'react';
import { Tv, Maximize2, Sparkles, Eye, ArrowLeft, Smartphone, ArrowLeftRight } from 'lucide-react';
import type { RoomData, CalibrationSettings } from '../services/roomService';
import { useTheme } from '../context/ThemeContext';
import { getCheckoutSuggestion } from '../services/checkoutSuggestions';

interface X01ProjectorGameProps {
  room: RoomData;
  projectorMode: 'classic' | 'fullscreen' | 'ar';
  setProjectorMode: (mode: 'classic' | 'fullscreen' | 'ar') => void;
  targetPosition?: 'left' | 'right';
  setTargetPosition?: (pos: 'left' | 'right') => void;
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

export const X01ProjectorGame: React.FC<X01ProjectorGameProps> = ({
  room,
  projectorMode,
  setProjectorMode,
  targetPosition = 'left',
  setTargetPosition,
  showModeSelector,
  setShowModeSelector,
  renderCalibratedDartboard,
  calibration,
  isCalibrating,
  calibrationStep,
  renderProjectorCalibrationInterface,
  renderStatsCalibrationOverlay
}) => {
  const { theme } = useTheme();
  const players = room.players || [];
  const activePlayerIndex = room.activePlayerIndex ?? 0;

  const renderGameAnimationDetails = (isDarkTheme: boolean, isAbsolute: boolean = false) => {
    const progBgClass = isDarkTheme ? "bg-zinc-900/90 border-zinc-700/80 shadow-xl backdrop-blur-md" : "bg-zinc-50/90 border-zinc-200/80 shadow-md";
    const progTextClass = isDarkTheme ? "text-zinc-300" : "text-zinc-700";
    const progHeaderClass = isDarkTheme ? "text-zinc-400" : "text-zinc-650";
    const progTitleClass = isDarkTheme ? "text-zinc-300" : "text-zinc-500";
    const progDividerClass = isDarkTheme ? "border-zinc-700" : "border-zinc-200";
    const progLineBgClass = isDarkTheme ? "bg-zinc-700/50" : "bg-zinc-200";
    const progLineFillClass = isDarkTheme ? "bg-zinc-500" : "bg-zinc-400";
    const curBgClass = isDarkTheme ? "bg-zinc-800 border-zinc-600 text-white" : "bg-white border-zinc-350";

    const activePlayer = players[activePlayerIndex];
    const minFinish = room.doubleOut ? 2 : 1;
    const suggestion = activePlayer && activePlayer.score <= 180 && activePlayer.score >= minFinish
      ? getCheckoutSuggestion(activePlayer.score, !!room.doubleOut, activePlayer.dartsLeft)
      : null;

    const renderProjectorCheckoutDartBadge = (dart: string, idx: number) => {
      let bgClass = 'bg-zinc-800 text-zinc-200 border-zinc-700';
      let display = dart;

      if (dart.startsWith('T')) {
        bgClass = 'bg-red-600/90 text-white border-red-500 shadow-sm shadow-red-900/30';
        display = `T${dart.substring(1)}`;
      } else if (dart.startsWith('D')) {
        bgClass = 'bg-yellow-500 text-black border-yellow-400 font-extrabold shadow-sm shadow-yellow-900/20';
        display = `D${dart.substring(1)}`;
      } else if (dart.startsWith('S')) {
        bgClass = 'bg-zinc-800 text-zinc-300 border-zinc-750';
        display = `S${dart.substring(1)}`;
      } else if (dart === 'BULL') {
        bgClass = 'bg-red-600 text-white border-red-500 shadow-sm shadow-red-900/40 font-extrabold';
        display = 'BULL';
      }

      const isImmediateDart = idx === 0;

      return (
        <React.Fragment key={`${dart}-${idx}`}>
          {idx > 0 && (
            <span className="text-zinc-500 font-black text-sm select-none">&rarr;</span>
          )}
          <span 
            className={`px-4 py-1.5 rounded-xl border font-black uppercase tracking-wider transition-all ${bgClass} ${
              isImmediateDart
                ? 'ring-2 ring-yellow-300 shadow-[0_0_14px_rgba(253,224,71,0.5)] scale-105'
                : 'opacity-90 ring-1 ring-cyan-400/50'
            }`}
            style={{ fontSize: `${Math.round((calibration?.commentsFontSize ?? 18) * 0.85)}px` }}
          >
            {display}
          </span>
        </React.Fragment>
      );
    };

    return (
      <div className={`w-full px-8 flex flex-col gap-4 ${isAbsolute ? 'absolute bottom-6 left-0 z-20 pointer-events-none' : 'pb-6'}`}>
        <div className="pointer-events-auto flex flex-col gap-4 w-full">
          {/* Encart de suggestion de finition pour le joueur actif */}
          {suggestion && suggestion.length > 0 && (
            <div className={`w-full bg-zinc-950 text-white p-4 rounded-3xl border-2 border-theme-accent flex items-center justify-between gap-4 ${isDarkTheme ? 'shadow-[0_0_30px_rgba(255,255,255,0.1)] backdrop-blur-md' : 'shadow-[0_0_20px_rgba(255,255,255,0.05)]'}`}>
              <div className="flex flex-col">
                <span 
                  className="text-theme-accent font-black uppercase tracking-widest"
                  style={{ fontSize: `${Math.round((calibration?.statsFontSize ?? 16) * 0.7)}px` }}
                >
                  Finition Conseillée &bull; {activePlayer.name}
                </span>
                <span 
                  className="font-bold text-zinc-400"
                  style={{ fontSize: `${Math.round((calibration?.commentsFontSize ?? 18) * 0.75)}px` }}
                >
                  Reste : <strong className="text-white text-base md:text-lg">{activePlayer.score}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                {suggestion.map(renderProjectorCheckoutDartBadge)}
              </div>
            </div>
          )}

          {/* Barre de progression globale du match */}
          <div className={`w-full p-4 rounded-3xl border-2 flex flex-col gap-2 ${progBgClass}`}>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-black uppercase tracking-widest ${progTitleClass}`}>
                Avancement du Match (Décompte des Points)
              </span>
              <span className={`text-[10px] font-bold ${progHeaderClass}`}>
                Objectif : {room.targetScore} &rarr; 0
              </span>
            </div>
            
            <div className={`flex flex-col gap-2 pt-1 border-t ${progDividerClass}`}>
              {players.map((player, idx) => {
                const isActive = idx === activePlayerIndex;
                const progressPercentage = Math.max(0, Math.min(100, (((room.targetScore - player.score) / room.targetScore) * 100)));
                
                return (
                  <div key={player.name} className="flex items-center gap-3">
                    <span className={`text-xs font-bold w-20 truncate ${isActive ? 'text-theme-accent font-black' : progTextClass}`}>
                      {player.name}
                    </span>
                    <div className={`flex-1 h-3 rounded-full overflow-visible relative flex items-center ${progLineBgClass}`}>
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          isActive ? 'bg-theme-accent shadow-[0_0_10px_var(--theme-accent)]' : progLineFillClass
                        }`}
                        style={{ width: `${progressPercentage}%` }}
                      />
                      <div 
                        className={`absolute w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shadow-md border -ml-2.5 transition-all duration-500 ${
                          isActive 
                            ? 'bg-zinc-950 border-[#22c55e] scale-110 z-10' 
                            : `${curBgClass} scale-100 opacity-90`
                        }`}
                        style={{ left: `${progressPercentage}%` }}
                      >
                        {player.emoji || '🎯'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`w-full h-full flex ${targetPosition === 'right' ? 'flex-row-reverse' : 'flex-row'} m-0 p-0 overflow-hidden bg-black select-none relative font-sans text-white`}>
      {/* 1. Éclairage de la cible physique ou AR */}
      {projectorMode !== 'fullscreen' && (
        <div 
          className={`w-1/2 h-full transition-all duration-500 ${
            targetPosition === 'right' ? 'shadow-[-20px_0_40px_rgba(255,255,255,0.15)]' : 'shadow-[20px_0_40px_rgba(255,255,255,0.15)]'
          } z-10 flex flex-col relative overflow-hidden ${
            projectorMode === 'ar'
              ? isCalibrating && room.calibrationSubMode === 'white'
                ? 'bg-white justify-center items-center p-0'
                : 'bg-black justify-center items-center p-0'
              : 'bg-white justify-end items-center pb-6'
          }`}
          id="projector-spotlight"
        >
          {projectorMode === 'ar' ? (
            <>
              {/* Cible SVG de réalité augmentée */}
              <div className="w-full h-1/2 flex items-center justify-center relative overflow-visible">
                {renderCalibratedDartboard(isCalibrating)}
              </div>

              {/* Placeholder Zone Stats pour l'étape 9 (AR Setup) */}
              {isCalibrating && calibrationStep === 9 && (
                <div 
                  className="absolute bg-zinc-300/80 border-2 border-dashed border-zinc-500 rounded-3xl p-6 shadow-xl backdrop-blur-md z-40 transition-all duration-200 pointer-events-none"
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
                  <div 
                    className="font-black text-zinc-800 uppercase text-center w-full truncate"
                    style={{ fontSize: `${calibration?.statsFontSize ?? 16}px`, marginBottom: '10px' }}
                  >
                    ZONE STATS ET COMMENTAIRES
                  </div>
                  <div 
                    className="font-bold text-zinc-700 leading-snug overflow-hidden text-ellipsis"
                    style={{ fontSize: `${calibration?.commentsFontSize ?? 14}px` }}
                  >
                    Placez cette boîte dans une zone non-éclairée de votre mur pour y projeter les statistiques de volée.
                  </div>
                </div>
              )}

              {/* Panneau de configuration de calibration si actif */}
              {isCalibrating && (
                <div className="w-full h-1/2 flex flex-col justify-end p-6 z-20 pointer-events-auto">
                  {renderProjectorCalibrationInterface()}
                </div>
              )}

              {/* Détails du jeu et progression en mode AR hors calibration */}
              {!isCalibrating && (
                <div className="w-full h-1/2 flex flex-col justify-end z-20">
                  {renderGameAnimationDetails(true, false)}
                </div>
              )}

              {renderStatsCalibrationOverlay && renderStatsCalibrationOverlay()}
            </>
          ) : (
            <span
              className="italic text-xl text-zinc-950 font-serif tracking-widest opacity-50 select-none"
              style={{ fontFamily: "'Playfair Display', 'Didot', 'Georgia', serif" }}
            >
              Minou Dart Game
            </span>
          )}
        </div>
      )}

      {/* 2. Cartes des Joueurs X01 */}
      <div 
        className={`${
          projectorMode === 'fullscreen' ? 'w-full' : 'w-1/2'
        } h-full bg-theme-bg text-theme-text-primary p-4 md:p-5 flex flex-col justify-between relative ${
          targetPosition === 'right' ? 'border-r' : 'border-l'
        } border-theme-border/30`}
      >
        {/* Boutons d'accès rapide en haut à droite */}
        <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
          <a 
            href={`#/remote?room=${room.roomId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 p-2 px-3.5 rounded-full bg-theme-accent/20 hover:bg-theme-accent text-theme-accent hover:text-black border border-theme-accent/30 font-bold text-xs transition-all duration-300 cursor-pointer"
            title="Ouvrir la télécommande de saisie"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Saisie Télécommande</span>
          </a>
          <a 
            href="#/" 
            className="p-2 rounded-full bg-black/40 hover:bg-black/80 border border-theme-border/30 hover:border-theme-accent text-theme-text-secondary hover:text-theme-accent transition-all duration-300"
          >
            <ArrowLeft className="w-5 h-5" />
          </a>
        </div>

        {/* Zone Supérieure : Scores X01 */}
        <div className="flex-grow flex flex-col justify-start min-h-0 overflow-hidden">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-theme-accent animate-ping" />
            <h2 className={`text-xs font-bold tracking-widest text-theme-text-secondary uppercase ${
              theme === 'arcade' ? 'neon-glow-pink-text font-mono' : ''
            }`}>
              MODE {room.targetScore} &bull; SALON : {room.roomId}
            </h2>
          </div>

          {/* Grille des joueurs X01 */}
          <div className={`flex-grow min-h-0 gap-1.5 p-2 ${
            players.length === 3 || players.length === 4
              ? 'grid grid-cols-2 content-stretch'
              : players.length >= 5
                ? 'grid grid-cols-2 gap-1 content-stretch'
                : 'flex flex-col justify-stretch'
          }`}>
            {players.map((player, idx) => {
              const isActive = idx === activePlayerIndex;
              const numPlayers = players.length;
              const isLastOddPlayer = numPlayers > 1 && numPlayers % 2 !== 0 && idx === numPlayers - 1;
              
              let cardPadding: string;
              let dartBoxSize: string;
              let statBoxPadding: string;
              let rowSpacing: string;
              const cardFlexClass = numPlayers >= 3 ? '' : 'flex-1';
              
              if (numPlayers <= 2) {
                cardPadding = 'p-4 md:p-5';
                dartBoxSize = 'w-16 h-11 rounded-xl';
                statBoxPadding = 'p-1.5';
                rowSpacing = 'mt-3.5';
              } else if (numPlayers <= 4) {
                cardPadding = 'p-3 md:p-4';
                dartBoxSize = 'w-14 h-9.5 rounded-xl';
                statBoxPadding = 'p-1';
                rowSpacing = 'mt-2.5';
              } else {
                cardPadding = 'p-1 md:p-1.5';
                dartBoxSize = 'w-9 h-6.5 rounded-md';
                statBoxPadding = 'p-0.5';
                rowSpacing = 'mt-1';
              }

              const baseSize = calibration?.statsFontSize ?? 16;
              const nameStyle = { fontSize: `${Math.round(baseSize * (numPlayers >= 5 ? 0.85 : numPlayers <= 2 ? 1.3 : 1.1))}px` };
              const scoreStyle = { fontSize: `${Math.round(baseSize * (numPlayers >= 5 ? 1.8 : numPlayers <= 2 ? 4.5 : 3.5))}px` };
              const subLabelStyle = { fontSize: `${Math.round(baseSize * 0.65)}px` };
              const tourStyle = { fontSize: `${Math.round(baseSize * 0.75)}px` };
              const sumStyle = { fontSize: `${Math.round(baseSize * 0.85)}px` };
              const boxStyle = { fontSize: `${Math.round(baseSize * 0.75)}px` };
              const statsValueStyle = { fontSize: `${Math.round(baseSize * 0.85)}px` };

              const roundThrows = player.currentRoundThrows || [];
              const dart1 = roundThrows[0] || '';
              const dart2 = roundThrows[1] || '';
              const dart3 = roundThrows[2] || '';
              
              let roundSum: number;
              if (isActive) {
                const dartsCount = 3 - player.dartsLeft;
                const history = player.history || [];
                const recentThrows = history.slice(history.length - dartsCount);
                roundSum = recentThrows.reduce((a, b) => a + b, 0);
              } else {
                roundSum = roundThrows.reduce((sum, label) => {
                  if (!label || label === '0') return sum;
                  if (label.startsWith('T')) return sum + parseInt(label.substring(1)) * 3;
                  if (label.startsWith('D')) {
                    if (label === 'D25') return sum + 50;
                    return sum + parseInt(label.substring(1)) * 2;
                  }
                  return sum + parseInt(label);
                }, 0);
              }

              const formattedAvg = player.avg.toLocaleString('fr-FR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              });

              return (
                <div 
                  key={player.name}
                  className={`relative flex flex-col justify-center rounded-3xl border-2 transition-all duration-300 ${cardPadding} ${cardFlexClass} ${
                    isActive 
                      ? 'bg-theme-accent/15 border-theme-accent shadow-[0_0_20px_var(--theme-accent)]/15 scale-[1.01]' 
                      : player.roundBust
                        ? 'bg-[#1a0f0f] border-red-500/30 opacity-90'
                        : 'bg-black/35 border-theme-border/20 opacity-70'
                  } ${theme === 'arcade' && isActive ? 'neon-glow-border shadow-[0_0_20px_var(--theme-accent)]' : ''} ${isLastOddPlayer ? 'col-span-2' : ''}`}
                >
                  {/* Ligne 1 : Nom du joueur et Score restant géant */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col justify-center min-w-0 flex-1 pr-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span 
                          className={`font-black px-2.5 py-0.5 rounded-md flex-shrink-0 ${
                            isActive ? 'bg-theme-accent text-black font-extrabold' : 'bg-black/40 text-theme-text-secondary'
                          } ${theme === 'arcade' ? 'font-mono' : ''}`}
                          style={{ fontSize: `${Math.round(baseSize * 0.7)}px` }}
                        >
                          J{idx + 1}
                        </span>
                        <span 
                          className={`font-black tracking-wide uppercase truncate flex items-center gap-1.5 ${
                            isActive ? 'text-theme-accent' : 'text-zinc-300'
                          } ${theme === 'arcade' ? 'font-mono' : ''}`}
                          style={nameStyle}
                        >
                          <span className="text-base select-none">{player.emoji || '🎯'}</span>
                          <span className="truncate">{player.name}</span>
                        </span>
                      </div>
                      
                      {/* Statut du tour */}
                      <div className="flex items-center gap-2 mt-1">
                        {isActive ? (
                          <span className="font-extrabold text-[#22c55e] flex items-center gap-1.5" style={subLabelStyle}>
                            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-ping" />
                            {player.dartsLeft} fléchette{player.dartsLeft > 1 ? 's' : ''} restante{player.dartsLeft > 1 ? 's' : ''}
                          </span>
                        ) : player.roundBust ? (
                          <span className="font-extrabold text-red-500 flex items-center gap-1" style={subLabelStyle}>
                            Dépassement (Bust)
                          </span>
                        ) : (
                          <span className="text-zinc-500 font-medium" style={subLabelStyle}>
                            En attente
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Score géant */}
                    <div 
                      className={`font-black tracking-tight text-right flex-shrink-0 leading-none ${
                        isActive 
                          ? 'text-white' 
                          : player.roundBust 
                            ? 'text-red-400/80' 
                            : 'text-zinc-400'
                      } ${theme === 'arcade' ? 'neon-glow-text font-mono' : ''}`}
                      style={scoreStyle}
                    >
                      {player.score}
                    </div>
                  </div>

                  {/* Ligne 2 : Volée en cours (3 cases) */}
                  <div className={`flex items-center justify-between gap-2 ${rowSpacing} pt-2 border-t border-zinc-900/60`}>
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500 font-bold uppercase tracking-wider" style={tourStyle}>
                        Tour :
                      </span>
                      <span className={`font-black ${roundSum > 0 ? 'text-[#22c55e]' : 'text-zinc-500'}`} style={sumStyle}>
                        {roundSum > 0 ? `+${roundSum}` : '0'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {[dart1, dart2, dart3].map((dart, dIdx) => {
                        const isCurrentThrow = isActive && dIdx === (3 - player.dartsLeft);
                        const isBustDart = player.roundBust && dart && dIdx === roundThrows.length - 1;

                        return (
                          <div 
                            key={dIdx}
                            className={`${dartBoxSize} border flex items-center justify-center font-black transition-all ${
                              dart 
                                ? isBustDart
                                  ? 'bg-red-950/80 border-red-500 text-red-400 font-black shadow-inner shadow-red-950/50'
                                  : dart === '0'
                                    ? 'bg-zinc-950 border-red-500/40 text-red-500 font-extrabold'
                                    : dart.startsWith('T')
                                      ? 'bg-red-950/80 border-red-500/60 text-red-400 font-black shadow-inner shadow-red-950/50'
                                      : dart.startsWith('D')
                                        ? 'bg-yellow-950/80 border-yellow-500/60 text-yellow-500 font-black shadow-inner shadow-yellow-950/50'
                                        : dart === 'BULL' || dart === 'D25'
                                          ? 'bg-red-900 border-red-500 text-white font-black'
                                          : 'bg-zinc-900 border-zinc-700 text-white font-extrabold'
                                : isCurrentThrow
                                  ? 'border-[#22c55e] text-[#22c55e] bg-[#22c55e]/10 ring-1 ring-[#22c55e]/30 animate-pulse'
                                  : 'border-zinc-800/80 bg-black/25 text-transparent'
                            }`}
                            style={boxStyle}
                          >
                            {dart}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Ligne 3 : Grille des 4 statistiques (2x2) */}
                  <div className={`grid grid-cols-2 gap-1.5 ${rowSpacing} pt-2 border-t border-zinc-900/60 text-center`}>
                    <div className={`flex flex-col items-center justify-center ${statBoxPadding} bg-black/25 rounded-xl border border-zinc-900/40`}>
                      <span className="text-zinc-500 font-bold uppercase tracking-wider mb-0.5" style={{ fontSize: `${Math.round(baseSize * 0.55)}px` }}>Moyenne</span>
                      <span className="font-extrabold text-white" style={statsValueStyle}>{formattedAvg}</span>
                    </div>

                    <div className={`flex flex-col items-center justify-center ${statBoxPadding} bg-black/25 rounded-xl border border-zinc-900/40`}>
                      <span className="text-zinc-500 font-bold uppercase tracking-wider mb-0.5" style={{ fontSize: `${Math.round(baseSize * 0.55)}px` }}>Dernier</span>
                      <span className="font-extrabold text-[#22c55e]" style={statsValueStyle}>
                        {player.lastRoundScore !== undefined && player.lastRoundScore > 0 ? player.lastRoundScore : '-'}
                      </span>
                    </div>

                    <div className={`flex flex-col items-center justify-center ${statBoxPadding} bg-black/25 rounded-xl border border-zinc-900/40`}>
                      <span className="text-zinc-500 font-bold uppercase tracking-wider mb-0.5" style={{ fontSize: `${Math.round(baseSize * 0.55)}px` }}>Meilleur</span>
                      <span className="font-extrabold text-yellow-500" style={statsValueStyle}>
                        {player.bestRound !== undefined && player.bestRound > 0 ? player.bestRound : '-'}
                      </span>
                    </div>

                    <div className={`flex flex-col items-center justify-center ${statBoxPadding} bg-black/25 rounded-xl border border-zinc-900/40`}>
                      <span className="text-zinc-500 font-bold uppercase tracking-wider mb-0.5" style={{ fontSize: `${Math.round(baseSize * 0.55)}px` }}>Lancers</span>
                      <span className="font-extrabold text-zinc-300" style={statsValueStyle}>{player.throwsCount}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pied de page */}
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
            CIBLE : {room.targetScore} &bull; METRIC PWA
          </div>
        </div>

        {/* Menu de sélection du mode d'affichage et inversion de côté */}
        <div className={`absolute bottom-4 ${targetPosition === 'right' ? 'left-4 items-start' : 'right-4 items-end'} z-50 flex flex-col gap-2`}>
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

              {/* Inversion de côté Cible / Scores */}
              {projectorMode !== 'fullscreen' && setTargetPosition && (
                <>
                  <div className="border-t border-zinc-800 my-1" />
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest px-2 py-1">
                    Position de la cible
                  </span>
                  <button
                    onClick={() => {
                      setTargetPosition(targetPosition === 'left' ? 'right' : 'left');
                      setShowModeSelector(false);
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-xl text-left font-bold transition-all hover:bg-zinc-900 text-zinc-350 hover:text-white cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <ArrowLeftRight className="w-4 h-4 text-theme-accent" />
                      <span>{targetPosition === 'left' ? 'Cible à droite' : 'Cible à gauche'}</span>
                    </div>
                    <span className="text-[9px] uppercase tracking-wider font-bold text-zinc-400">
                      {targetPosition === 'left' ? 'Gauche' : 'Droite'}
                    </span>
                  </button>
                </>
              )}
            </div>
          )}

          <button
            onClick={() => setShowModeSelector(!showModeSelector)}
            className="p-3.5 bg-zinc-900/90 border border-theme-border/50 text-theme-accent rounded-full hover:scale-105 transition-all shadow-xl hover:bg-zinc-950 flex items-center justify-center cursor-pointer"
            title="Changer de vue"
          >
            <Eye className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
