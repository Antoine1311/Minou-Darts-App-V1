import React from 'react';
import { Zap, Tv, Maximize2, Sparkles, Eye, ArrowLeft, Smartphone, ArrowLeftRight } from 'lucide-react';
import type { RoomData, CalibrationSettings } from '../services/roomService';
import { useTheme } from '../context/ThemeContext';

interface CricketProjectorGameProps {
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
  renderProjectorCricketMarkSymbol: (marks: number, allClosed: boolean) => React.ReactNode;
}

export const CricketProjectorGame: React.FC<CricketProjectorGameProps> = ({
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
  renderStatsCalibrationOverlay,
  renderProjectorCricketMarkSymbol
}) => {
  const { theme } = useTheme();
  const players = room.players || [];
  const activePlayerIndex = room.activePlayerIndex ?? 0;
  const targets = room.cricketTargets || [];

  const renderGameAnimationDetails = (isDarkTheme: boolean, isAbsolute: boolean = false) => {
    const progBgClass = isDarkTheme ? "bg-zinc-900/90 border-zinc-700/80 shadow-xl backdrop-blur-md" : "bg-zinc-50/90 border-zinc-200/80 shadow-md";
    const progTextClass = isDarkTheme ? "text-zinc-300" : "text-zinc-700";
    const progHeaderClass = isDarkTheme ? "text-zinc-400" : "text-zinc-650";
    const progTitleClass = isDarkTheme ? "text-zinc-300" : "text-zinc-500";
    const progDividerClass = isDarkTheme ? "border-zinc-700" : "border-zinc-200";
    const progLineBgClass = isDarkTheme ? "bg-zinc-700/50" : "bg-zinc-200";
    const progLineFillClass = isDarkTheme ? "bg-zinc-500" : "bg-zinc-400";
    const curBgClass = isDarkTheme ? "bg-zinc-800 border-zinc-600 text-white" : "bg-white border-zinc-350";

    return (
      <div className={`w-full px-8 flex flex-col gap-4 ${isAbsolute ? 'absolute bottom-6 left-0 z-20 pointer-events-none' : 'pb-6'}`}>
        <div className="pointer-events-auto flex flex-col gap-4 w-full">
          <div className={`w-full p-4 rounded-3xl border-2 flex flex-col gap-2 ${progBgClass}`}>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-black uppercase tracking-widest ${progTitleClass}`}>
                Avancement du Match (Cibles Fermées)
              </span>
              <span className={`text-[10px] font-bold ${progHeaderClass}`}>
                Objectif : {targets.length} Cibles
              </span>
            </div>
            
            <div className={`flex flex-col gap-2 pt-1 border-t ${progDividerClass}`}>
              {players.map((player, idx) => {
                const isActive = idx === activePlayerIndex;
                const closedCount = targets.filter(t => (player.cricketMarks?.[String(t)] || 0) >= 3).length;
                const progressPercentage = targets.length > 0 ? (closedCount / targets.length) * 100 : 0;
                
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

      {/* 2. Grille de scores Cricket */}
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

        {/* Zone Supérieure : Scores Cricket */}
        <div className="flex-grow flex flex-col justify-start min-h-0 overflow-hidden">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-theme-accent animate-ping" />
            <h2 className={`text-xs font-bold tracking-widest text-theme-text-secondary uppercase ${
              theme === 'arcade' ? 'neon-glow-pink-text font-mono' : ''
            }`}>
              {`CRICKET ${room.cricketVariant === 'classic' ? 'CLASSIQUE' : room.cricketVariant === 'crazy' ? 'CRAZY' : 'TACTICAL'}`} &bull; SALON : {room.roomId}
            </h2>
          </div>

          {/* Grille verticale de Cricket */}
          <div className="flex-grow flex flex-col justify-between min-h-0 select-none w-full">
            <table 
              className="w-full border-collapse table-fixed flex-grow"
              style={{ fontSize: `${calibration?.statsFontSize ?? 16}px` }}
            >
              <thead>
                <tr className="border-b border-theme-border/20">
                  <th className="w-[80px] md:w-[100px] pb-1"></th>
                  {players.map((player, idx) => {
                    const isActive = idx === activePlayerIndex;
                    const numPlayers = players.length;
                    const baseSize = calibration?.statsFontSize ?? 16;
                    const nameStyle = { fontSize: `${Math.round(baseSize * (numPlayers > 4 ? 0.8 : numPlayers > 2 ? 0.9 : 1.1))}px` };
                    const scoreStyle = { fontSize: `${Math.round(baseSize * (numPlayers > 4 ? 1.1 : numPlayers > 2 ? 1.3 : 1.7))}px` };
                    const headerHeight = numPlayers > 4 ? 'min-h-[55px]' : 'min-h-[70px]';

                    return (
                      <th 
                        key={player.name} 
                        className={`pb-2 px-1 text-center transition-all duration-300 relative ${
                          isActive ? 'bg-theme-accent/5' : ''
                        }`}
                      >
                        <div className={`flex flex-col items-center justify-center gap-0.5 py-1 ${headerHeight}`}>
                          {isActive ? (
                            <div className="flex items-center gap-1 bg-theme-accent text-black font-black text-[9px] md:text-xs px-2.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                              <Zap className="w-2.5 h-2.5 fill-current" /> Actif
                            </div>
                          ) : (
                            <div className="h-5 opacity-0 select-none">-</div>
                          )}
                          <span 
                            className={`font-black uppercase tracking-wider truncate max-w-full block ${
                              isActive ? 'text-theme-accent' : 'text-theme-text-primary'
                            } ${theme === 'arcade' ? 'font-mono' : ''}`}
                            style={nameStyle}
                          >
                            {player.name}
                          </span>
                          <span 
                            className={`font-black block ${
                              isActive ? 'text-theme-accent' : 'text-theme-text-primary'
                            } ${theme === 'arcade' ? 'neon-glow-text font-mono' : ''}`}
                            style={scoreStyle}
                          >
                            {player.score || 0}
                          </span>
                        </div>
                        <div className={`absolute bottom-0 left-2 right-2 h-[3px] rounded-full transition-all duration-300 ${
                          isActive ? 'bg-theme-accent' : 'bg-transparent'
                        }`} />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              
              <tbody>
                {targets.map((target) => {
                  const isBull = target === 25;
                  const targetLabel = isBull ? 'Bull' : String(target);
                  const allClosed = players.every(p => (p.cricketMarks?.[String(target)] || 0) >= 3);
                  
                  return (
                    <tr 
                      key={target} 
                      className={`border-b transition-all duration-500 ${
                        allClosed 
                          ? 'border-green-900/40 bg-green-950/20' 
                          : 'border-theme-border/10'
                      }`}
                    >
                      <td className="p-0.5 text-center align-middle">
                        <div 
                          className={`w-full py-1 md:py-1.5 rounded-xl font-black text-center shadow-md transition-all relative overflow-hidden ${
                            allClosed 
                              ? 'bg-green-950/40 text-green-700 border border-green-900/50'
                              : isBull 
                                ? 'bg-red-600 text-white border border-red-500 shadow-red-600/10' 
                                : 'bg-green-600 text-white border border-green-500 shadow-green-600/10'
                          }`}
                          style={{ fontSize: `${Math.round((calibration?.statsFontSize ?? 16) * 1.25)}px` }}
                        >
                          {targetLabel}
                          {allClosed && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="w-full h-[2px] bg-green-600/50 rotate-[-20deg] rounded-full" />
                            </div>
                          )}
                        </div>
                      </td>
                      
                      {players.map((player, idx) => {
                        const marks = player.cricketMarks?.[String(target)] || 0;
                        const isActive = idx === activePlayerIndex;
                        return (
                          <td 
                            key={player.name} 
                            className={`p-1 text-center align-middle transition-colors ${
                              allClosed 
                                ? 'opacity-40' 
                                : isActive 
                                  ? 'bg-theme-accent/5' 
                                  : ''
                            }`}
                          >
                            <div className="flex justify-center items-center h-7 md:h-8 lg:h-9">
                              {renderProjectorCricketMarkSymbol(marks, allClosed)}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>

              {/* Ligne des 3 fléchettes en cours */}
              <tfoot>
                <tr className="border-t-2 border-theme-border/30">
                  <td className="p-1 text-center">
                    <span 
                      className="font-bold text-zinc-500 uppercase tracking-widest block"
                      style={{ fontSize: `${Math.round((calibration?.statsFontSize ?? 16) * 0.7)}px` }}
                    >
                      Volée
                    </span>
                  </td>
                  {players.map((player, idx) => {
                    const isActive = idx === activePlayerIndex;
                    const roundThrows = player.currentRoundThrows || [];
                    return (
                      <td key={player.name} className={`p-1 text-center ${isActive ? 'bg-theme-accent/5' : ''}`}>
                        <div className="flex justify-center items-center gap-1">
                          {[0, 1, 2].map((i) => {
                            const throwLabel = roundThrows[i] || '';
                            const displayLabel = throwLabel === '0' ? 'Loupé' : throwLabel;
                            const boxWidth = players.length >= 5 ? 'w-10 h-7 md:w-11 md:h-8.5' : 'w-14 h-9 md:w-16 md:h-11';
                            return (
                              <div 
                                key={i} 
                                className={`${boxWidth} rounded-lg border-2 flex items-center justify-center font-black transition-all ${
                                  throwLabel 
                                    ? throwLabel === '0'
                                      ? 'border-red-950 bg-red-950/20 text-red-400 font-extrabold uppercase text-[7.5px] md:text-[9px]'
                                      : 'border-theme-accent/50 bg-black/80 text-theme-accent font-extrabold shadow-md' 
                                    : 'border-zinc-850 bg-zinc-950/10 text-transparent'
                                }`}
                                style={{ fontSize: `${Math.round((calibration?.statsFontSize ?? 16) * 0.7)}px` }}
                              >
                                {displayLabel}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>

            {/* Indicateur du joueur actif */}
            <div className="mt-1 text-center">
              <span 
                className="text-theme-text-secondary uppercase tracking-widest font-black animate-pulse"
                style={{ fontSize: `${Math.round((calibration?.statsFontSize ?? 16) * 0.65)}px` }}
              >
                🎯 {players[activePlayerIndex]?.name} à vous de jouer &bull; {players[activePlayerIndex]?.dartsLeft} fléchettes restantes
              </span>
            </div>
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
            CRICKET &bull; METRIC PWA
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
