import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Settings, Tv, Target, Smartphone } from 'lucide-react';
import type { RoomData } from '../services/roomService';
import { useGameStore } from '../store/gameStore';
import { getCheckoutSuggestion } from '../services/checkoutSuggestions';
import { haptics } from '../services/haptics';

// --- Constantes et Utilitaires pour le tracé de la cible SVG ---
const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const segmentAngle = 360 / 20;

const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
  return {
    x: centerX + (radius * Math.cos(angleInRadians)),
    y: centerY + (radius * Math.sin(angleInRadians)),
  };
};

const describeArc = (x: number, y: number, innerRadius: number, outerRadius: number, startAngle: number, endAngle: number) => {
  const startOuter = polarToCartesian(x, y, outerRadius, endAngle);
  const endOuter = polarToCartesian(x, y, outerRadius, startAngle);
  const startInner = polarToCartesian(x, y, innerRadius, endAngle);
  const endInner = polarToCartesian(x, y, innerRadius, startAngle);

  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    'M', startOuter.x, startOuter.y,
    'A', outerRadius, outerRadius, 0, largeArcFlag, 0, endOuter.x, endOuter.y,
    'L', endInner.x, endInner.y,
    'A', innerRadius, innerRadius, 0, largeArcFlag, 1, startInner.x, startInner.y,
    'Z',
  ].join(' ');
};
interface X01RemoteGameProps {
  currentRoom: RoomData;
  isLocalMode: boolean;
  setShowExitModal: (v: boolean) => void;
  setShowProjectionModal: (v: boolean) => void;
  setShowProjectorSettingsModal: (v: boolean) => void;
  setShowCalibrationPanel: (v: boolean) => void;
  updateRoomState: (data: Partial<RoomData>) => void;
  error: string | null;
}

export const X01RemoteGame: React.FC<X01RemoteGameProps> = ({
  currentRoom,
  isLocalMode,
  setShowExitModal,
  setShowProjectionModal,
  setShowProjectorSettingsModal,
  setShowCalibrationPanel,
  updateRoomState,
  error
}) => {
  const { recordThrowX01, undoX01 } = useGameStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const renderLargeThrowBadge = (dart: string, index: number, isActiveThrow: boolean) => {
    if (!dart) {
      return (
        <div
          className={`w-full h-11 rounded-xl border border-dashed flex flex-col items-center justify-center text-[7px] font-black uppercase tracking-wider transition-all duration-300 ${
            isActiveThrow
              ? 'border-[#22c55e] text-[#22c55e] bg-[#22c55e]/5 ring-1 ring-[#22c55e]/25'
              : 'border-zinc-800 text-zinc-600 bg-black/25'
          }`}
        >
          <span className="text-[10px] leading-none mb-0.5">🎯</span>
          <span>Flèche {index + 1}</span>
        </div>
      );
    }

    let bgClass = 'bg-zinc-900 border-zinc-700 text-white font-extrabold';
    let display = dart;

    if (dart === '0') {
      bgClass = 'bg-zinc-950 border-red-500/40 text-red-500 font-extrabold';
      display = 'Loupé';
    } else if (dart.startsWith('T')) {
      bgClass = 'bg-red-950/80 border-red-500/60 text-red-400 font-black shadow-inner shadow-red-950/50';
      display = `T${dart.substring(1)}`;
    } else if (dart.startsWith('D')) {
      bgClass = 'bg-yellow-950/80 border-yellow-500/60 text-yellow-500 font-black shadow-inner shadow-yellow-950/50';
      display = `D${dart.substring(1)}`;
    } else if (dart === 'BULL' || dart === 'D25') {
      bgClass = 'bg-red-900 border-red-500 text-white font-black';
      display = dart === 'D25' ? 'BULL' : 'BULL';
    }

    return (
      <div
        className={`w-full h-11 rounded-xl border flex items-center justify-center text-sm font-black transition-all duration-300 shadow-md ${bgClass}`}
      >
        {display}
      </div>
    );
  };

  const players = currentRoom.players || [];
  const activePlayerIndex = currentRoom.activePlayerIndex ?? 0;
  
  const playerListRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!playerListRef.current) return;
    const activeCard = playerListRef.current.querySelector('[data-active-player="true"]');
    if (activeCard) {
      activeCard.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [activePlayerIndex, currentRoom.players]);

  const [x01InputMethod, setX01InputMethod] = useState<'keyboard' | 'target'>(() => {
    return (localStorage.getItem('minou_dart_x01_input_method') as 'keyboard' | 'target') || 'keyboard';
  });

  const handleX01InputMethodChange = (method: 'keyboard' | 'target') => {
    setX01InputMethod(method);
    localStorage.setItem('minou_dart_x01_input_method', method);
  };
  
  
  const [multiplier, setMultiplier] = useState<'S' | 'D' | 'T'>('S');

  // Remplace handleThrowDirect de RemoteView par la nouvelle version Zustand optimisée
  const handleThrowDirect = async (basePoints: number, customMultiplier?: 'S' | 'D' | 'T') => {
    if (!currentRoom || isSubmitting) return;

    haptics.tap();
    setIsSubmitting(true);
    let points = basePoints;
    const targetMult = customMultiplier || multiplier;
    const isDouble = targetMult === 'D';

    let label: string;
    if (basePoints === 0) {
      label = '0';
    } else if (basePoints === 25) {
      if (targetMult === 'D') {
        points = 50;
        label = 'D25';
      } else {
        label = '25';
      }
    } else {
      if (targetMult === 'D') {
        points *= 2;
        label = `D${basePoints}`;
      } else if (targetMult === 'T') {
        points *= 3;
        label = `T${basePoints}`;
      } else {
        label = `${basePoints}`;
      }
    }

    try {
      setMultiplier('S');
      await recordThrowX01(points, isDouble, label);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUndo = async () => {
    if (isSubmitting) return;
    haptics.undo();
    setIsSubmitting(true);
    try {
      await undoX01();
    } catch(err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Support des claviers physiques et pavés numériques USB (chiffres 0 à 9 et combinaisons 10-20 / 25)
  const numBufferRef = useRef<string>('');
  const numBufferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (numBufferTimerRef.current) clearTimeout(numBufferTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const flushNumBuffer = () => {
      if (numBufferTimerRef.current) {
        clearTimeout(numBufferTimerRef.current);
        numBufferTimerRef.current = null;
      }
      const buffered = numBufferRef.current;
      numBufferRef.current = '';
      if (buffered) {
        const val = parseInt(buffered, 10);
        if (!Number.isNaN(val)) {
          handleThrowDirect(val);
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Backspace') {
        e.preventDefault();
        if (numBufferRef.current) {
          if (numBufferTimerRef.current) clearTimeout(numBufferTimerRef.current);
          numBufferRef.current = '';
          return;
        }
        handleUndo();
      } else if (e.key === 'Enter' && numBufferRef.current) {
        e.preventDefault();
        flushNumBuffer();
      } else if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        const digit = e.key;

        // Si un '1' ou un '2' est en attente d'un second chiffre (10..20 ou 25)
        if (numBufferRef.current) {
          const combined = parseInt(numBufferRef.current + digit, 10);
          if (numBufferTimerRef.current) {
            clearTimeout(numBufferTimerRef.current);
            numBufferTimerRef.current = null;
          }
          numBufferRef.current = '';
          if ((combined >= 10 && combined <= 20) || combined === 25) {
            handleThrowDirect(combined);
          } else {
            // Second chiffre non combinable : valider le 1er puis traiter le nouveau
            handleThrowDirect(parseInt(digit, 10));
          }
          return;
        }

        // '1' et '2' peuvent précéder un second chiffre (10..20, 25) : court délai de 400 ms
        if (digit === '1' || digit === '2') {
          numBufferRef.current = digit;
          numBufferTimerRef.current = setTimeout(flushNumBuffer, 400);
        } else {
          // '0' et '3'..'9' sont toujours à un seul chiffre : validation immédiate
          handleThrowDirect(parseInt(digit, 10));
        }
      } else if (e.key === '+' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        setMultiplier(m => m === 'D' ? 'S' : 'D');
      } else if (e.key === '*' || e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setMultiplier(m => m === 'T' ? 'S' : 'T');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleThrowDirect, isSubmitting]);



  // --- RENDU X01 (Inspiré de la capture d'écran - très similaire, premium) ---
  return (
    <div className="remote-view-container h-svh bg-black text-white flex flex-col justify-between relative overflow-hidden select-none font-sans">
      
      {/* En-tête X01 compact */}
      <header className="py-1.5 px-3 bg-black flex items-center justify-between border-b border-zinc-800 z-10">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowExitModal(true)} 
            className="w-10 h-10 flex items-center justify-center text-[#22c55e] hover:text-[#4ade80] transition-colors cursor-pointer focus:outline-none"
          >
            <ArrowLeft className="w-6 h-6 stroke-[2.5]" />
          </button>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-tight text-white leading-tight">X01</h1>
            <div className="text-[10px] text-zinc-400 font-medium tracking-wide flex items-center gap-1.5">
              <span>{currentRoom?.targetScore}, {currentRoom?.doubleOut ? 'Double Out' : 'Normal'}</span>
              <span className="text-zinc-600">•</span>
              <span className="text-[#22c55e]">Salon {currentRoom?.roomId}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-[#22c55e]">
          {!isLocalMode && (
            <button
              className="flex items-center justify-center w-10 h-10 gap-1 rounded-lg bg-[#22c55e]/10 border border-[#22c55e]/30 hover:border-[#22c55e] hover:bg-[#22c55e]/20 transition-all cursor-pointer"
              title="Synchroniser le Visualisateur"
              onClick={() => setShowProjectionModal(true)}
            >
              <Tv className="w-5 h-5 stroke-[2.5] text-[#22c55e]" />
            </button>
          )}
          {/* Bouton ⚙️ Paramètres Projecteur */}
          <button
            onClick={() => { 
              setShowProjectorSettingsModal(true); 
              setShowCalibrationPanel(false); 
              updateRoomState({ isCalibrating: false });
              localStorage.setItem('minou_dart_is_calibrating', 'false');
            }}
            title="Paramètres du projecteur"
            className="flex items-center justify-center w-10 h-10 bg-zinc-900/80 border border-zinc-700/50 hover:border-[#22c55e]/60 hover:bg-zinc-800 text-zinc-500 hover:text-[#22c55e] rounded-lg transition-all cursor-pointer"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-red-500/10 border-b border-red-500/30 py-2.5 px-4 text-xs text-red-400 text-center font-medium flex items-center justify-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          {error}
        </div>
      )}

      {/* Liste des joueurs avec défilement vertical systématique */}
      <div 
        ref={playerListRef}
        className="flex-grow overflow-y-auto min-h-0 p-3 bg-black flex flex-col space-y-4"
      >
        {players.map((player, idx) => {
          const isActive = activePlayerIndex === idx;
          
          // Extraire les lancers du joueur pour le tour en cours
          const roundThrows = player.currentRoundThrows || [];
          
          // Calculer le score du tour
          const roundSum = isActive
            ? (() => {
                 const dartsCount = 3 - player.dartsLeft;
                 const history = player.history || [];
                 const recentThrows = history.slice(history.length - dartsCount);
                 return recentThrows.reduce((a, b) => a + b, 0);
               })()
            : roundThrows.reduce((sum, label) => {
                 if (!label || label === '0') return sum;
                 if (label.startsWith('T')) return sum + parseInt(label.substring(1)) * 3;
                 if (label.startsWith('D')) {
                   if (label === 'D25') return sum + 50;
                   return sum + parseInt(label.substring(1)) * 2;
                 }
                 return sum + parseInt(label);
               }, 0);

          // Formatage de la moyenne avec virgule métrique (Règle user_global)
          const formattedAvg = player.avg.toLocaleString('fr-FR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          });

          const scoreSizeClass = 'text-6xl sm:text-7xl font-black';
          const nameSizeClass = 'text-xl sm:text-2xl font-extrabold';
          const cardPaddingClass = 'p-2 sm:p-3 rounded-2xl';

          // --- RENDU PLEINE LARGEUR (POUR TOUS LES JOUEURS) ---
          return (
            <div 
              key={player.name} 
              data-active-player={isActive ? "true" : "false"}
              className={`relative flex flex-col transition-all border ${cardPaddingClass} ${
                isActive 
                  ? 'active-player-card bg-zinc-900/95 border-[#22c55e] shadow-[0_0_15px_rgba(34,197,94,0.15)] ring-1 ring-[#22c55e]/25' 
                  : player.roundBust
                    ? 'bg-[#1a0f0f] border-red-500/30 opacity-90'
                    : 'bg-zinc-950 border-zinc-900/60 opacity-80'
              }`}
            >
              {/* Ligne 1 : Infos principales (Gauche: nom, fléchettes. Droite: score) */}
              <div className="flex items-center justify-between gap-2">
                {/* Gauche : Nom, Statut, Finition, Volée */}
                <div className="flex flex-col justify-center min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`${nameSizeClass} tracking-wide uppercase truncate flex items-center gap-2 ${
                      isActive ? 'text-[#22c55e]' : 'text-zinc-300'
                    }`}>
                      <span className="truncate">{player.name}</span>
                      <span className="text-xl sm:text-2xl flex-shrink-0">{player.emoji || '🎯'}</span>
                    </span>
                    {isActive && (
                      <span className="flex-shrink-0 flex items-center justify-center w-2.5 h-2.5 rounded-full bg-[#22c55e] animate-pulse" />
                    )}
                    {player.roundBust && (
                      <span className="flex-shrink-0 text-[10px] sm:text-xs bg-red-600/95 text-white font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">
                        Bust
                      </span>
                    )}
                  </div>
                  
                  {/* Statut et Finition intégrée adaptée au nombre de fléchettes restantes */}
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    <span className="text-xs sm:text-sm text-zinc-500 font-bold truncate">
                      {isActive ? `En cours — ${player.dartsLeft} flèche(s)` : 'En attente'}
                    </span>
                    {(() => {
                      const minFinish = currentRoom?.doubleOut ? 2 : 1;
                      const suggestion = (isActive && currentRoom?.gameType === 'x01' && player.score <= 180 && player.score >= minFinish)
                        ? getCheckoutSuggestion(player.score, !!currentRoom.doubleOut, player.dartsLeft)
                        : null;
                      return suggestion && suggestion.length > 0 ? (
                        <span className="text-[10px] sm:text-xs text-[#22c55e] font-black tracking-widest bg-[#22c55e]/10 border border-[#22c55e]/20 px-2 py-0.5 rounded shadow-sm">
                          {suggestion.join(' › ')}
                        </span>
                      ) : null;
                    })()}
                  </div>

                  {/* Volée en cours : badges miniatures discrets pour les adversaires (le joueur actif bénéficie déjà de la rangée grand format au-dessus du pavé) */}
                  {!isActive && (roundSum > 0 || roundThrows.length > 0 || player.roundBust) && (
                    <div className="flex items-center gap-1.5 mt-1">
                      {player.roundBust ? (
                        <span className="text-xs text-red-400 font-extrabold uppercase tracking-wider">
                          BUST ❌
                        </span>
                      ) : (
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-[10px] text-zinc-500 font-bold uppercase mr-0.5">Dernière volée :</span>
                          {roundThrows.map((dart, dIdx) => (
                            <span 
                              key={dIdx}
                              className="px-1.5 py-0.5 text-[11px] font-black bg-zinc-900 border border-zinc-800 text-zinc-300 rounded"
                            >
                              {dart}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Droite : Score géant + Points du tour */}
                <div className="flex flex-col items-end flex-shrink-0 ml-2">
                  <span className={`tracking-tighter leading-none ${
                    player.roundBust 
                      ? 'text-red-400/90' 
                      : isActive 
                        ? 'text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.15)]' 
                        : 'text-zinc-400'
                  } ${scoreSizeClass}`}>
                    {player.score}
                  </span>
                  <div className="flex items-center gap-1 mt-1 font-bold text-[13px] sm:text-sm uppercase tracking-wider">
                    {(roundSum > 0 || roundThrows.length > 0) ? (
                      <span className="text-[#22c55e]">Tour: {roundSum}</span>
                    ) : (
                      <span className="text-zinc-600">Tour: -</span>
                    )}
                    <span className="text-zinc-600">|</span>
                    <span className="text-zinc-500">Préc: <span className="text-zinc-300">{player.lastRoundScore !== undefined && player.lastRoundScore > 0 ? player.lastRoundScore : '-'}</span></span>
                  </div>
                </div>
              </div>

              {/* Ligne 2 : Statistiques en 1 ligne horizontale ultra-compacte */}
              <div className="flex flex-wrap justify-between items-center text-xs sm:text-sm text-zinc-400 mt-2 pt-1 border-t border-zinc-900/40 font-bold gap-x-2 gap-y-0.5">
                <span>Moy: <strong className="text-white">{formattedAvg}</strong></span>
                <span>Dernier: <strong className="text-[#22c55e]">{player.lastRoundScore !== undefined && player.lastRoundScore > 0 ? player.lastRoundScore : '-'}</strong></span>
                <span>Meil: <strong className="text-yellow-500">{player.bestRound !== undefined && player.bestRound > 0 ? player.bestRound : '-'}</strong></span>
                <span>Lancers: <strong className="text-zinc-300">{player.throwsCount}</strong></span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pavé de saisie X01 unifié de type Cricket */}
      <div
        className="bg-[#121212] p-2 border-t border-zinc-900 flex flex-col gap-1.5 relative"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        {/* Overlay de soumission */}
        {isSubmitting && (
          <div className="absolute inset-0 z-20 bg-black/40 flex items-center justify-center rounded-t-xl">
            <div className="w-6 h-6 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* === LIGNE D'ACTIONS UNIFIÉE (3 FLÉCHETTES + RETOUR) === */}
        {currentRoom?.gameType === 'x01' && (() => {
          const activePlayer = players[activePlayerIndex];
          if (!activePlayer) return null;
          const throws = activePlayer.currentRoundThrows || [];
          const dartCount = 3 - (activePlayer.dartsLeft ?? 3);

          return (
            <div className="w-full max-w-lg mx-auto flex items-center justify-center gap-1.5 py-1 px-1">
              {[0, 1, 2].map((i) => {
                const dartLabel = throws[i] ?? '';
                const isActive = i === dartCount;
                return (
                  <div key={i} className="flex-1">
                    {renderLargeThrowBadge(dartLabel, i, isActive)}
                  </div>
                );
              })}
              <button
                onClick={handleUndo}
                disabled={isSubmitting}
                className="w-16 sm:w-20 min-h-[44px] bg-[#dc2626] hover:bg-red-500 active:scale-95 text-white font-extrabold rounded-xl text-xs flex flex-col items-center justify-center transition-all cursor-pointer disabled:opacity-40 select-none touch-manipulation gap-0.5 shadow-md"
                title="Corriger le dernier lancer"
              >
                <ArrowLeft className="w-4 h-4 stroke-[3.5]" />
                <span>Retour</span>
              </button>
            </div>
          );
        })()}

        {/* === CLAVIER CONDITIONNEL (Cible ou Chiffres) === */}
        {x01InputMethod === 'target' ? (
          /* CIBLE INTERACTIVE SVG DÉFORMÉE + COINS (Loupé & Sélecteur) */
          <div className="w-full max-w-lg mx-auto animate-fadeIn relative">
            
            {/* Les 4 coins d'actions autour de la cible */}
            <button
              onClick={() => handleX01InputMethodChange('keyboard')}
              className="absolute top-0 left-1 w-14 h-14 bg-zinc-900/90 border border-zinc-700 rounded-xl flex flex-col items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors z-10 shadow-md"
              title="Passer au clavier"
            >
              <Smartphone className="w-5 h-5 mb-0.5" />
              <span className="text-[8px] font-bold uppercase tracking-widest">Clavier</span>
            </button>

            <button
              onClick={() => handleThrowDirect(0)}
              disabled={isSubmitting}
              className="absolute top-0 right-1 w-14 h-14 bg-zinc-900/90 border border-zinc-700 hover:border-red-500 rounded-xl flex flex-col items-center justify-center text-red-500/80 hover:text-red-400 hover:bg-zinc-800 transition-colors z-10 font-bold shadow-md"
              title="Loupé"
            >
              <svg className="w-5 h-5 stroke-[3] mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              <span className="text-[8px] uppercase tracking-widest">Loupé</span>
            </button>

            <button
              onClick={() => handleThrowDirect(0)}
              disabled={isSubmitting}
              className="absolute bottom-1 left-1 w-14 h-14 bg-zinc-900/90 border border-zinc-700 hover:border-red-500 rounded-xl flex flex-col items-center justify-center text-red-500/80 hover:text-red-400 hover:bg-zinc-800 transition-colors z-10 font-bold shadow-md"
              title="Loupé"
            >
              <svg className="w-5 h-5 stroke-[3] mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              <span className="text-[8px] uppercase tracking-widest">Loupé</span>
            </button>

            <button
              onClick={() => handleThrowDirect(0)}
              disabled={isSubmitting}
              className="absolute bottom-1 right-1 w-14 h-14 bg-zinc-900/90 border border-zinc-700 hover:border-red-500 rounded-xl flex flex-col items-center justify-center text-red-500/80 hover:text-red-400 hover:bg-zinc-800 transition-colors z-10 font-bold shadow-md"
              title="Loupé"
            >
              <svg className="w-5 h-5 stroke-[3] mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              <span className="text-[8px] uppercase tracking-widest">Loupé</span>
            </button>

            {(() => {
              const centerX = 200;
              const centerY = 200;
              const radius = 195;

              // Rayons modifiés pour déformer la cible (équilibrage des simples, doubles et triples pour une saisie ultra-facile)
              const rBullInner = radius * (15 / 170);   // Double Bull
              const rBullOuter = radius * (35 / 170);   // Simple Bull
              const rTripleInner = radius * (45 / 170); // Triple début (zone interne ultra réduite)
              const rTripleOuter = radius * (83 / 170); // Triple fin (largeur de 38)
              const rDoubleInner = radius * (131 / 170);// Double début (largeur simple externe de 48)
              const rDoubleOuter = radius;              // Double fin (largeur double de 39)

              const segments: React.ReactNode[] = [];
              const texts: React.ReactNode[] = [];

              SECTORS.forEach((score, index) => {
                const startAngle = index * segmentAngle - 9;
                const endAngle = startAngle + segmentAngle;
                const isEven = index % 2 === 0;

                const colorSingle = isEven ? '#121214' : '#dec59f';
                const colorDoubleTriple = isEven ? '#dc2626' : '#16a34a';

                segments.push(
                  <path
                    key={`single-inner-${score}`}
                    d={describeArc(centerX, centerY, rBullOuter, rTripleInner, startAngle, endAngle)}
                    fill={colorSingle}
                    className="dartboard-segment"
                    onClick={() => handleThrowDirect(score, 'S')}
                  />
                );
                segments.push(
                  <path
                    key={`triple-${score}`}
                    d={describeArc(centerX, centerY, rTripleInner, rTripleOuter, startAngle, endAngle)}
                    fill={colorDoubleTriple}
                    className="dartboard-segment"
                    onClick={() => handleThrowDirect(score, 'T')}
                  />
                );
                segments.push(
                  <path
                    key={`single-outer-${score}`}
                    d={describeArc(centerX, centerY, rTripleOuter, rDoubleInner, startAngle, endAngle)}
                    fill={colorSingle}
                    className="dartboard-segment"
                    onClick={() => handleThrowDirect(score, 'S')}
                  />
                );
                segments.push(
                  <path
                    key={`double-${score}`}
                    d={describeArc(centerX, centerY, rDoubleInner, rDoubleOuter, startAngle, endAngle)}
                    fill={colorDoubleTriple}
                    className="dartboard-segment"
                    onClick={() => handleThrowDirect(score, 'D')}
                  />
                );

                const angleInDegrees = index * segmentAngle;
                const meanRadius = (rTripleOuter + rDoubleInner) / 2;
                const textPos = polarToCartesian(centerX, centerY, meanRadius, angleInDegrees);
                let textRotation = angleInDegrees;
                if (angleInDegrees > 90 && angleInDegrees < 270) textRotation += 180;
                const textColor = isEven ? '#ffffff' : '#000000';

                texts.push(
                  <text
                    key={`text-${score}`}
                    x={textPos.x}
                    y={textPos.y + 5.5}
                    textAnchor="middle"
                    fill={textColor}
                    fontSize="16"
                    fontWeight="900"
                    transform={`rotate(${textRotation}, ${textPos.x}, ${textPos.y})`}
                    className="dartboard-text select-none pointer-events-none"
                  >
                    {score}
                  </text>
                );
              });

              segments.push(
                <circle key="bull-outer" cx={centerX} cy={centerY} r={rBullOuter} fill="#16a34a" className="dartboard-segment" onClick={() => handleThrowDirect(25, 'S')} />
              );
              segments.push(
                <circle key="bull-inner" cx={centerX} cy={centerY} r={rBullInner} fill="#dc2626" className="dartboard-segment" onClick={() => handleThrowDirect(25, 'D')} />
              );

              return (
                <div className="w-full flex items-center justify-center relative select-none mt-1 -mx-2 px-0">
                  <svg className="w-full h-auto" viewBox="0 0 400 400" style={{ overflow: 'visible', maxHeight: 'min(100vw, 46vh)' }}>
                    <style dangerouslySetInnerHTML={{ __html: `
                      .dartboard-segment {
                        transition: filter 0.1s ease-in-out;
                        cursor: pointer;
                        stroke: #27272a;
                        stroke-width: 0.5px;
                      }
                      .dartboard-segment:hover { filter: brightness(1.35) contrast(1.15); }
                      .dartboard-text {
                        font-family: 'Outfit', 'Inter', system-ui, sans-serif;
                        pointer-events: none;
                        user-select: none;
                      }
                    `}} />
                    <circle cx={centerX} cy={centerY} r={rDoubleOuter} fill="none" stroke="#27272a" strokeWidth="1" />
                    {segments}
                    {texts}
                    <circle cx={centerX} cy={centerY} r={rBullOuter} fill="none" stroke="#52525b" strokeWidth="0.75" />
                    <circle cx={centerX} cy={centerY} r={rTripleInner} fill="none" stroke="#52525b" strokeWidth="0.75" />
                    <circle cx={centerX} cy={centerY} r={rTripleOuter} fill="none" stroke="#52525b" strokeWidth="0.75" />
                    <circle cx={centerX} cy={centerY} r={rDoubleInner} fill="none" stroke="#52525b" strokeWidth="0.75" />
                    <circle cx={centerX} cy={centerY} r={rDoubleOuter} fill="none" stroke="#52525b" strokeWidth="1" />
                  </svg>
                </div>
              );
            })()}
          </div>
        ) : (
          /* PAVÉ NUMÉRIQUE CLASSIQUE */
          <div className="flex flex-col gap-2 w-full max-w-lg mx-auto animate-fadeIn">
            
            {/* Ligne d'actions spécifique au clavier : Sélecteur Cible + Grand Loupé */}
            <div className="flex items-center gap-1.5 w-full px-1">
              <button
                onClick={() => handleX01InputMethodChange('target')}
                className="w-16 sm:w-20 min-h-[48px] bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 flex flex-col items-center justify-center rounded-xl transition-all shadow-inner cursor-pointer"
                title="Passer à la cible"
              >
                <Target className="w-5 h-5 mb-0.5" />
                <span className="text-[9px] font-bold uppercase tracking-widest">Cible</span>
              </button>

              <button
                onClick={() => handleThrowDirect(0)}
                disabled={isSubmitting}
                className="flex-1 min-h-[48px] bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-white border-2 border-red-500 font-extrabold rounded-xl text-sm transition-all cursor-pointer disabled:opacity-40 select-none touch-manipulation uppercase tracking-wider flex items-center justify-center gap-2 shadow-md"
              >
                <svg className="w-5 h-5 text-red-500 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Loupé
              </button>
            </div>

            {/* Ligne 1 : Multiplicateurs (DOUBLE, TRIPLE) + Accès direct D-BULL (50) */}
            <div className="grid grid-cols-3 gap-2 w-full px-1">
              <button
                onClick={() => setMultiplier(multiplier === 'D' ? 'S' : 'D')}
                className={`text-black font-extrabold py-3 rounded-xl text-xs tracking-wider transition-all cursor-pointer select-none touch-manipulation ${
                  multiplier === 'D'
                    ? 'bg-yellow-400 ring-2 ring-white scale-95 shadow-[0_0_12px_rgba(250,204,21,0.5)] font-black'
                    : 'bg-yellow-500 hover:bg-yellow-400'
                }`}
              >
                DOUBLE
              </button>

              <button
                onClick={() => setMultiplier(multiplier === 'T' ? 'S' : 'T')}
                className={`text-white font-extrabold py-3 rounded-xl text-xs tracking-wider transition-all cursor-pointer select-none touch-manipulation ${
                  multiplier === 'T'
                    ? 'bg-orange-600 ring-2 ring-white scale-95 shadow-[0_0_12px_rgba(234,88,12,0.5)] font-black'
                    : 'bg-orange-700 hover:bg-orange-600'
                }`}
              >
                TRIPLE
              </button>

              <button
                onClick={() => handleThrowDirect(25, 'D')}
                disabled={isSubmitting}
                className="bg-red-700 hover:bg-red-600 active:scale-95 text-white font-extrabold py-3 rounded-xl text-xs tracking-wider transition-all cursor-pointer disabled:opacity-40 select-none touch-manipulation border border-red-500/50 shadow-md flex items-center justify-center gap-1"
                title="Double Bull direct (50 points)"
              >
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                <span>D-BULL (50)</span>
              </button>
            </div>

            {/* Ligne 2 : Chiffres 1 à 7 */}
            <div className="grid grid-cols-7 gap-2 w-full">
              {[1, 2, 3, 4, 5, 6, 7].map(num => (
                <button
                  key={num}
                  onClick={() => handleThrowDirect(num)}
                  disabled={isSubmitting}
                  className="bg-[#2a2a2a] hover:bg-zinc-700 active:scale-95 text-white font-black py-4 rounded-xl text-base transition-all cursor-pointer disabled:opacity-40 select-none touch-manipulation border border-zinc-800/80 shadow-md"
                >
                  {num}
                </button>
              ))}
            </div>

            {/* Ligne 3 : Chiffres 8 à 14 */}
            <div className="grid grid-cols-7 gap-2 w-full">
              {[8, 9, 10, 11, 12, 13, 14].map(num => (
                <button
                  key={num}
                  onClick={() => handleThrowDirect(num)}
                  disabled={isSubmitting}
                  className="bg-[#2a2a2a] hover:bg-zinc-700 active:scale-95 text-white font-black py-4 rounded-xl text-base transition-all cursor-pointer disabled:opacity-40 select-none touch-manipulation border border-zinc-800/80 shadow-md"
                >
                  {num}
                </button>
              ))}
            </div>

            {/* Ligne 4 : Chiffres 15 à 20 + Bull (25) */}
            <div className="grid grid-cols-7 gap-2 w-full">
              {[15, 16, 17, 18, 19, 20, 25].map(num => {
                const isBull = num === 25;
                const isTripleBullForbidden = isBull && multiplier === 'T';
                return (
                  <button
                    key={num}
                    onClick={() => handleThrowDirect(num)}
                    disabled={isSubmitting || isTripleBullForbidden}
                    className={`font-black py-4 rounded-xl text-base transition-all cursor-pointer select-none touch-manipulation border shadow-md ${
                      isTripleBullForbidden
                        ? 'bg-zinc-900 text-zinc-600 opacity-20 cursor-not-allowed border-zinc-900 shadow-none'
                        : isBull
                          ? 'bg-red-600 hover:bg-red-500 text-white border-red-700 shadow-md shadow-red-950/20'
                          : 'bg-[#2a2a2a] hover:bg-zinc-700 active:scale-95 text-white border-zinc-800/80'
                    }`}
                  >
                    {isBull ? (
                      <span className="flex flex-col items-center justify-center leading-tight">
                        <span className="text-[11px] font-black">BULL</span>
                        <span className="text-[9px] font-bold opacity-80">25</span>
                      </span>
                    ) : num}
                  </button>
                );
              })}
            </div>
          </div>
        )}


      </div>

    </div>
  );
};
