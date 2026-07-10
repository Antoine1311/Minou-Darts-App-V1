import React, { useState, useEffect } from 'react';
import { RemoteFinishedPhase } from './RemoteFinishedPhase';
import { CricketRemoteGame } from './CricketRemoteGame';
import { X01RemoteGame } from './X01RemoteGame';
import { RemoteProjectorSettings } from './RemoteProjectorSettings';
import { RemoteSetupPhase } from './RemoteSetupPhase';
import { useTheme } from '../context/ThemeContext';
import { X, ArrowLeft, Play, RotateCcw, Check, Plus, Trash2, Smartphone, Users, Target, Crosshair, Tv, Copy, ExternalLink, Loader2, Settings, Sparkles, Maximize2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Clock, Trophy, AlertCircle, User } from 'lucide-react';
import { roomService, getGameHighlights } from '../services/roomService';
import { useAuth } from '../context/AuthContext';
import type { RoomData, GameType, CricketVariant, CalibrationSettings } from '../services/roomService';
import { generateCricketTargets, createEmptyMarks, processCricketThrow } from '../services/cricketEngine';
import { createEmptyBartState } from '../services/bartEngine';
import { BartRemoteGame } from './BartRemoteGame';
import { ClockRemoteGame } from './ClockRemoteGame';
import { getCheckoutSuggestion } from '../services/checkoutSuggestions';
import { playerService } from '../services/playerService';
import type { GlobalPlayer } from '../services/playerService';
import { useGameStore } from '../store/gameStore';
// Helpers moved to X01RemoteGame.tsx


export const RemoteView: React.FC = () => {
  const { theme } = useTheme();
  const { user, loading: authLoading, loginWithGoogle } = useAuth();
  
  // États de la télécommande
  const [roomIdInput, setRoomIdInput] = useState<string>('');
  const [roomId, setRoomId] = useState<string | null>(null);
  
  const currentRoom = useGameStore(state => state.localRoom);
  const setLocalRoom = useGameStore(state => state.setLocalRoom);
  const syncFromFirebase = useGameStore(state => state.syncFromFirebase);
  const recordThrowX01 = useGameStore(state => state.recordThrowX01);
  const undoX01 = useGameStore(state => state.undoX01);

  // Rétrocompatibilité temporaire pendant le découpage
  const room = currentRoom;
  const setRoom = setLocalRoom;

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Mode local (sans salon connecté)
  const [isLocalMode, setIsLocalMode] = useState<boolean>(false);

  // Joueurs et scores (déclarés au début pour respecter les règles des hooks de React)
  const players = currentRoom?.players || [];
  const activePlayerIndex = currentRoom?.activePlayerIndex ?? 0;

  // Effet de défilement automatique vers le joueur actif
  useEffect(() => {
    if (!playerListRef.current) return;
    const activeCard = playerListRef.current.querySelector('[data-active-player="true"]');
    if (activeCard) {
      activeCard.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [activePlayerIndex, players]);

  const [showExitModal, setShowExitModal] = useState<boolean>(false);
  const [showProjectionModal, setShowProjectionModal] = useState<boolean>(false);

  // --- États pour la pop-up Paramètres Projecteur (⚙️) ---
  const [showProjectorSettingsModal, setShowProjectorSettingsModal] = useState<boolean>(false);
  const [showCalibrationPanel, setShowCalibrationPanel] = useState<boolean>(false);
  // Mode de vue du projecteur, synchronisé via localStorage
  const [remoteProjectorMode, setRemoteProjectorMode] = useState<'classic' | 'fullscreen' | 'ar'>(() => {
    const saved = localStorage.getItem('minou_dart_projector_mode');
    if (saved === 'classic' || saved === 'fullscreen' || saved === 'ar') return saved;
    return 'classic';
  });

  // --- États pour la calibration depuis la télécommande ---
  const DEFAULT_RADIUS_REMOTE = 350;
  const DEFAULT_CALIBRATION_REMOTE: CalibrationSettings = {
    centerX: 500, centerY: 500, radius: DEFAULT_RADIUS_REMOTE,
    rBullInner: DEFAULT_RADIUS_REMOTE * (6.35 / 170),
    rBullOuter: DEFAULT_RADIUS_REMOTE * (15.9 / 170),
    rTripleInner: DEFAULT_RADIUS_REMOTE * (99 / 170),
    rTripleOuter: DEFAULT_RADIUS_REMOTE * (107 / 170),
    rDoubleInner: DEFAULT_RADIUS_REMOTE * (162 / 170),
    rDoubleOuter: DEFAULT_RADIUS_REMOTE * 1.0,
    haloWhiteRadius: DEFAULT_RADIUS_REMOTE * 1.1,
    haloMaxRadius: DEFAULT_RADIUS_REMOTE * 2.5,
    arShowExtraOverlays: true,
    statsFontSize: 16,
    commentsFontSize: 18,
    statsFontScaleX: 1.0,
    statsFontScaleY: 1.0,
  };
  const [remoteCalibration, setRemoteCalibration] = useState<CalibrationSettings>(() => {
    const saved = localStorage.getItem('minou_dart_calibration');
    if (saved) { try { return JSON.parse(saved); } catch (_) {} }
    return DEFAULT_CALIBRATION_REMOTE;
  });
  const [remoteCalibrationStep, setRemoteCalibrationStep] = useState<number>(1);
  const [linkCopied, setLinkCopied] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [multiplier, setMultiplier] = useState<'S' | 'D' | 'T'>('S');
  const firestoreTimeoutRef = React.useRef<any>(null);
  const playerListRef = React.useRef<HTMLDivElement>(null);
  const turnTransitionTimeoutRef = React.useRef<any>(null);

  // Nettoyage du timer de transition de tour lors du démontage du composant
  useEffect(() => {
    return () => {
      if (turnTransitionTimeoutRef.current) {
        clearTimeout(turnTransitionTimeoutRef.current);
      }
    };
  }, []);

  // Sauvegarder la calibration en localStorage (le Projecteur l'écoutera via storage event) et Firestore (avec debounce)
  const saveRemoteCalibration = (newCal: CalibrationSettings, forceSync: boolean = false) => {
    setRemoteCalibration(newCal);
    localStorage.setItem('minou_dart_calibration', JSON.stringify(newCal));

    if (!isLocalMode && roomId) {
      if (firestoreTimeoutRef.current) {
        clearTimeout(firestoreTimeoutRef.current);
      }
      if (forceSync) {
        roomService.updateRoom(roomId, { calibration: newCal }).catch(err =>
          console.error('Erreur sync calibration Firestore:', err)
        );
      } else {
        firestoreTimeoutRef.current = setTimeout(() => {
          roomService.updateRoom(roomId, { calibration: newCal }).catch(err =>
            console.error('Erreur sync calibration Firestore:', err)
          );
        }, 150);
      }
    }
  };

  // Changer le mode de vue du projecteur (écrit en localStorage → ProjectorView l'écoute)
  const setRemoteProjectorModeAndSync = (mode: 'classic' | 'fullscreen' | 'ar') => {
    setRemoteProjectorMode(mode);
    // Toujours écrire en localStorage (fallback mode local / même navigateur)
    localStorage.setItem('minou_dart_projector_mode', mode);
    // En mode en ligne : écrire dans Firestore pour synchroniser entre appareils différents
    if (!isLocalMode && roomId) {
      roomService.updateRoom(roomId, { projectorMode: mode }).catch(err =>
        console.error('Erreur sync mode projecteur Firestore:', err)
      );
    }
  };

  // Ajustement de calibration (logique identique au ProjectorView)
  const adjustRemoteCalibration = (type: 'move-x' | 'move-y' | 'scale-step' | 'stats-move-x' | 'stats-move-y', delta: number, forceSync: boolean = false) => {
    const newCal = { ...remoteCalibration };
    if (type === 'move-x') {
      newCal.centerX = Math.max(0, Math.min(1000, newCal.centerX + delta));
    } else if (type === 'move-y') {
      newCal.centerY = Math.max(0, Math.min(1000, newCal.centerY + delta));
    } else if (type === 'stats-move-x') {
      newCal.statsPanelX = Math.max(-500, Math.min(1500, (newCal.statsPanelX ?? 16) + delta));
    } else if (type === 'stats-move-y') {
      newCal.statsPanelY = Math.max(-500, Math.min(500, (newCal.statsPanelY ?? 0) + delta));
    } else if (type === 'scale-step') {
      switch (remoteCalibrationStep) {
        case 1: case 2: {
          const oldVal = remoteCalibrationStep === 1 ? newCal.radius : newCal.rDoubleOuter;
          const newVal = Math.max(50, Math.min(500, oldVal + delta));
          const ratio = newVal / oldVal;
          newCal.radius = newVal; newCal.rDoubleOuter = newVal;
          newCal.rDoubleInner *= ratio; newCal.rTripleOuter *= ratio;
          newCal.rTripleInner *= ratio; newCal.rBullOuter *= ratio;
          newCal.rBullInner *= ratio;
          newCal.haloWhiteRadius = (newCal.haloWhiteRadius ?? (oldVal * 1.1)) * ratio;
          newCal.haloMaxRadius = (newCal.haloMaxRadius ?? (oldVal * 2.5)) * ratio;
          break;
        }
        case 3: newCal.rDoubleInner = Math.max(newCal.rTripleOuter + 5, Math.min(newCal.rDoubleOuter - 2, newCal.rDoubleInner + delta)); break;
        case 4: newCal.rTripleOuter = Math.max(newCal.rTripleInner + 5, Math.min(newCal.rDoubleInner - 5, newCal.rTripleOuter + delta)); break;
        case 5: newCal.rTripleInner = Math.max(newCal.rBullOuter + 10, Math.min(newCal.rTripleOuter - 5, newCal.rTripleInner + delta)); break;
        case 6: newCal.rBullOuter = Math.max(newCal.rBullInner + 2, Math.min(newCal.rTripleInner - 10, newCal.rBullOuter + delta)); break;
        case 7: newCal.rBullInner = Math.max(2, Math.min(newCal.rBullOuter - 2, newCal.rBullInner + delta)); break;
        case 8: newCal.haloWhiteRadius = Math.max(newCal.rDoubleOuter - 20, Math.min((newCal.haloMaxRadius ?? (newCal.rDoubleOuter * 2.5)) - 10, (newCal.haloWhiteRadius ?? (newCal.rDoubleOuter * 1.1)) + delta)); break;
      }
    }
    saveRemoteCalibration(newCal, forceSync);
  };

  const resetRemoteTabParameters = (step: number) => {
    const newCal = { ...remoteCalibration };
    if (step === 1) {
      newCal.centerX = DEFAULT_CALIBRATION_REMOTE.centerX;
      newCal.centerY = DEFAULT_CALIBRATION_REMOTE.centerY;
      newCal.radius = DEFAULT_CALIBRATION_REMOTE.radius;
      newCal.rDoubleOuter = DEFAULT_CALIBRATION_REMOTE.rDoubleOuter;
      newCal.rDoubleInner = DEFAULT_CALIBRATION_REMOTE.rDoubleInner;
      newCal.rTripleOuter = DEFAULT_CALIBRATION_REMOTE.rTripleOuter;
      newCal.rTripleInner = DEFAULT_CALIBRATION_REMOTE.rTripleInner;
      newCal.rBullOuter = DEFAULT_CALIBRATION_REMOTE.rBullOuter;
      newCal.rBullInner = DEFAULT_CALIBRATION_REMOTE.rBullInner;
      newCal.arShowExtraOverlays = DEFAULT_CALIBRATION_REMOTE.arShowExtraOverlays;
    } else if (step === 8) {
      newCal.haloWhiteRadius = DEFAULT_CALIBRATION_REMOTE.haloWhiteRadius;
      newCal.haloMaxRadius = DEFAULT_CALIBRATION_REMOTE.haloMaxRadius;
    } else if (step === 9) {
      newCal.statsPanelX = DEFAULT_CALIBRATION_REMOTE.statsPanelX;
      newCal.statsPanelY = DEFAULT_CALIBRATION_REMOTE.statsPanelY;
      newCal.statsPanelWidth = 320;
      newCal.statsPanelHeight = 280;
      newCal.statsFontSize = DEFAULT_CALIBRATION_REMOTE.statsFontSize;
      newCal.commentsFontSize = DEFAULT_CALIBRATION_REMOTE.commentsFontSize;
    }
    saveRemoteCalibration(newCal);
  };

  const getRemoteStepSliderValue = () => {
    switch (remoteCalibrationStep) {
      case 1: return remoteCalibration.radius;
      case 2: return remoteCalibration.rDoubleOuter;
      case 3: return remoteCalibration.rDoubleInner;
      case 4: return remoteCalibration.rTripleOuter;
      case 5: return remoteCalibration.rTripleInner;
      case 6: return remoteCalibration.rBullOuter;
      case 7: return remoteCalibration.rBullInner;
      case 8: return remoteCalibration.haloWhiteRadius ?? (remoteCalibration.rDoubleOuter * 1.1);
      default: return DEFAULT_RADIUS_REMOTE;
    }
  };

  const handleRemoteSliderChange = (val: number) => {
    const currentVal = getRemoteStepSliderValue();
    adjustRemoteCalibration('scale-step', val - currentVal);
  };


  // Fonction utilitaire pour mettre à jour l'état de la salle en ligne ou localement
  const updateRoomState = async (data: Partial<RoomData>) => {
    if (isLocalMode) {
      setLocalRoom(prev => {
        if (!prev) return null;
        return {
          ...prev,
          ...data,
          lastUpdate: new Date()
        } as RoomData;
      });
    } else if (roomId) {
      await roomService.updateRoom(roomId, data);
    }
  };

  const handleCricketUndo = async () => {
    if (!currentRoom || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { undoCricketThrow } = await import('../services/cricketEngine');
      const result = undoCricketThrow(currentRoom);
      if (result) {
        if (isLocalMode) {
          setLocalRoom(prev => {
            if (!prev) return null;
            return {
              ...prev,
              ...result
            } as RoomData;
          });
        } else if (roomId) {
          await roomService.updateRoom(roomId, result);
        }
      }
    } catch (err) {
      console.error("Erreur undo Cricket :", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- POP-UP PARAMÈTRES PROJECTEUR (⚙️) ---
  const renderProjectorSettingsModal = () => (
    <RemoteProjectorSettings
      roomId={roomId}
      isLocalMode={isLocalMode}
      showProjectorSettingsModal={showProjectorSettingsModal}
      setShowProjectorSettingsModal={setShowProjectorSettingsModal}
      showCalibrationPanel={showCalibrationPanel}
      setShowCalibrationPanel={setShowCalibrationPanel}
      updateRoomState={updateRoomState}
      remoteProjectorMode={remoteProjectorMode}
      setRemoteProjectorModeAndSync={setRemoteProjectorModeAndSync}
      remoteCalibrationStep={remoteCalibrationStep}
      setRemoteCalibrationStep={setRemoteCalibrationStep}
      remoteCalibration={remoteCalibration}
      getRemoteStepSliderValue={getRemoteStepSliderValue}
      handleRemoteSliderChange={handleRemoteSliderChange}
      adjustRemoteCalibration={adjustRemoteCalibration}
      saveRemoteCalibration={saveRemoteCalibration}
      resetRemoteTabParameters={resetRemoteTabParameters}
    />
  );

  const renderProjectionModal = () => {
    if (!showProjectionModal || !currentRoom) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
        <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl relative font-sans text-white">
          <button
            onClick={() => { setShowProjectionModal(false); setLinkCopied(false); }}
            className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-full transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-col items-center text-center mt-2">
            <div className="p-3 bg-theme-accent/15 text-theme-accent rounded-full mb-3">
              <Tv className="w-7 h-7" />
            </div>

            <h2 className="text-lg font-black tracking-wide text-white mb-1 uppercase">Synchroniser le Visualisateur</h2>
            <p className="text-[11px] text-zinc-500 mb-5 max-w-xs leading-relaxed">
              Connectez le vidéoprojecteur à cette partie en cours.
            </p>

            {isLocalMode ? (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl text-xs text-yellow-400 font-medium leading-relaxed">
                ⚠️ Le mode local fonctionne uniquement sur cet écran. Pour projeter les scores, retournez à l'accueil et créez une partie en ligne.
              </div>
            ) : (
              <div className="w-full space-y-3">

                {/* ── CODE SALON EN TRÈS GRAND ── */}
                <div className="relative flex flex-col items-center px-5 py-5 bg-black rounded-2xl border-2 border-theme-accent/50 overflow-hidden">
                  {/* Halo de fond */}
                  <div className="absolute inset-0 bg-gradient-to-b from-theme-accent/10 to-transparent" />
                  <p className="text-[9px] text-zinc-500 uppercase font-black tracking-[0.25em] mb-2 z-10">
                    Code de la partie — à saisir sur le projecteur
                  </p>
                  <span
                    className="z-10 text-8xl font-black font-mono tracking-[0.35em] text-theme-accent leading-none"
                    style={{ textShadow: '0 0 30px rgba(56,189,248,0.7), 0 0 60px rgba(56,189,248,0.3)' }}
                  >
                    {currentRoom.roomId}
                  </span>
                  <p className="text-[10px] text-zinc-500 mt-3 z-10">
                    Depuis l'accueil sur le projecteur → &ldquo;Rejoindre une partie&rdquo;
                  </p>
                </div>

                {/* ── QR CODE ── */}
                <div className="flex items-center gap-4 p-4 bg-black/40 border border-zinc-800/80 rounded-2xl">
                  {(() => {
                    const projectorUrl = `${window.location.origin}${window.location.pathname}#/projector?room=${currentRoom.roomId}`;
                    const qrCodeApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(projectorUrl)}&color=38bdf8&bgcolor=0a0a0a&margin=8`;
                    return (
                      <div className="p-1.5 bg-black border border-zinc-800 rounded-xl flex-shrink-0">
                        <img
                          src={qrCodeApiUrl}
                          alt="QR Code Projecteur"
                          className="w-[90px] h-[90px] rounded-lg"
                        />
                      </div>
                    );
                  })()}
                  <div className="text-left flex flex-col gap-1">
                    <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">
                      Alternative rapide
                    </span>
                    <p className="text-[11px] text-zinc-300 leading-relaxed">
                      Flashez ce QR code depuis la caméra du téléphone sur lequel tourne le projecteur pour l'ouvrir directement.
                    </p>
                  </div>
                </div>

                {/* ── SÉLECTEUR VUE DU PROJECTEUR ── */}
                <div className="w-full">
                  <p className="text-[9px] text-zinc-500 uppercase font-black tracking-[0.2em] mb-2 text-left">
                    Vue du projecteur
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      { mode: 'classic' as const, label: 'Classique', icon: <Tv className="w-4 h-4" /> },
                      { mode: 'fullscreen' as const, label: 'Plein Écran', icon: <Maximize2 className="w-4 h-4" /> },
                      { mode: 'ar' as const, label: 'AR', icon: <Sparkles className="w-4 h-4" /> },
                    ]).map(({ mode, label, icon }) => (
                      <button
                        key={mode}
                        onClick={() => setRemoteProjectorModeAndSync(mode)}
                        className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border text-center transition-all cursor-pointer ${
                          remoteProjectorMode === mode
                            ? 'bg-theme-accent/10 border-theme-accent text-theme-accent'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
                        }`}
                      >
                        {icon}
                        <span className="text-[9px] font-extrabold uppercase tracking-wide leading-none">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── BOUTONS D'ACTION ── */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => {
                      const projectorUrl = `${window.location.origin}${window.location.pathname}#/projector?room=${currentRoom.roomId}`;
                      window.open(projectorUrl, '_blank');
                    }}
                    className="flex-1 py-3 px-4 bg-theme-accent hover:bg-theme-accent-hover text-black font-extrabold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>OUVRIR NOUVEL ONGLET</span>
                  </button>

                  <button
                    onClick={() => {
                      const projectorUrl = `${window.location.origin}${window.location.pathname}#/projector?room=${currentRoom.roomId}`;
                      navigator.clipboard.writeText(projectorUrl);
                      setLinkCopied(true);
                      setTimeout(() => setLinkCopied(false), 2000);
                    }}
                    className="py-3 px-4 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 text-white font-extrabold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 relative overflow-hidden"
                  >
                    <span className={`transition-all duration-300 flex items-center gap-1.5 ${linkCopied ? 'opacity-100 scale-100' : 'opacity-0 scale-50 absolute pointer-events-none'}`}>
                      <Check className="w-4 h-4 text-green-500" />
                      COPIÉ !
                    </span>
                    <span className={`transition-all duration-300 flex items-center gap-1.5 ${!linkCopied ? 'opacity-100 scale-100' : 'opacity-0 scale-50 absolute pointer-events-none'}`}>
                      <Copy className="w-4 h-4" />
                      COPIER
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderExitModal = () => {
    if (!showExitModal) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
        <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl relative font-sans text-white animate-scaleIn">
          
          <h2 className="text-xl font-black tracking-wide text-center uppercase mb-2">Partie en cours</h2>
          <p className="text-xs text-zinc-400 text-center mb-6 leading-relaxed">
            Que souhaitez-vous faire de la partie actuelle ?
          </p>

          <div className="space-y-3.5">
            {/* Option 1 : Enregistrer et reprendre plus tard */}
            <button
              onClick={handleSaveAndExit}
              className="w-full p-4 bg-green-500/10 hover:bg-green-500/25 border border-green-500/30 hover:border-green-500 rounded-2xl transition-all flex items-start gap-3.5 cursor-pointer text-left group"
            >
              <div className="p-2.5 bg-green-500/20 text-green-400 rounded-xl group-hover:scale-110 transition-transform">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-extrabold text-sm text-green-400">Enregistrer & reprendre plus tard</div>
                <div className="text-[10px] text-zinc-400 mt-0.5 leading-snug">Sauvegarde la partie pour y revenir depuis le lobby.</div>
              </div>
            </button>

            {/* Option 2 : Quitter et retourner à la sélection du jeu */}
            <button
              onClick={handleExitToGameSelection}
              className="w-full p-4 bg-zinc-900/50 hover:bg-zinc-800/80 border border-zinc-800 rounded-2xl transition-all flex items-start gap-3.5 cursor-pointer text-left group"
            >
              <div className="p-2.5 bg-zinc-800 text-zinc-300 rounded-xl group-hover:scale-110 transition-transform">
                <Target className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-extrabold text-sm text-zinc-100">Quitter & choisir un jeu</div>
                <div className="text-[10px] text-zinc-400 mt-0.5 leading-snug">Retourne au lobby pour changer de mode de jeu.</div>
              </div>
            </button>

            {/* Option 3 : Quitter et sélectionner les joueurs */}
            <button
              onClick={handleExitToPlayerSelection}
              className="w-full p-4 bg-zinc-900/50 hover:bg-zinc-800/80 border border-zinc-800 rounded-2xl transition-all flex items-start gap-3.5 cursor-pointer text-left group"
            >
              <div className="p-2.5 bg-zinc-800 text-zinc-300 rounded-xl group-hover:scale-110 transition-transform">
                <Users className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-extrabold text-sm text-zinc-100">Quitter & choisir les joueurs</div>
                <div className="text-[10px] text-zinc-400 mt-0.5 leading-snug">Retourne à l'écran de sélection des joueurs.</div>
              </div>
            </button>
          </div>

          <button
            onClick={() => setShowExitModal(false)}
            className="w-full mt-6 py-3 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 font-bold text-xs rounded-xl transition-all cursor-pointer text-center"
          >
            Retour au jeu
          </button>

        </div>
      </div>
    );
  };

  // Lire le roomId depuis l'URL au chargement s'il y est (ex: suite à un scan de QR Code ou partage de lien)
  useEffect(() => {
    const getRoomIdFromUrl = () => {
      const hash = window.location.hash;
      const params = hash.split('?')[1];
      if (params) {
        const roomParam = params.split('&').find(p => p.startsWith('room='));
        if (roomParam) {
          return roomParam.split('=')[1].toUpperCase();
        }
      }
      return null;
    };

    const id = getRoomIdFromUrl();
    if (id) {
      setRoomId(id);
    }
  }, []);

  // 1. Enregistrer la partie
  const handleSaveAndExit = async () => {
    if (!currentRoom) return;
    try {
      // Sauvegarder l'état actuel de la partie dans localStorage
      const gameToSave = {
        ...currentRoom,
        status: 'playing' as const
      };
      localStorage.setItem('minou-darts-saved-active-game', JSON.stringify(gameToSave));

      // Mettre à jour la partie en cours pour la remettre en setup
      const resetData = { status: 'setup' } as const;
      if (isLocalMode) {
        setLocalRoom(prev => ({ ...prev!, ...resetData } as RoomData));
      } else if (roomId) {
        await roomService.updateRoom(roomId, resetData);
      }
      
      setShowExitModal(false);
    } catch (err) {
      console.error("Erreur lors de la sauvegarde :", err);
    }
  };

  // 2. Quitter et retourner à la sélection du jeu
  const handleExitToGameSelection = async () => {
    // Mémoriser les joueurs de la partie en cours pour la prochaine sélection
    if (currentRoom?.players && currentRoom.players.length > 0) {
      const names = currentRoom.players.map((p: { name: string }) => p.name);
      localStorage.setItem('minou-dart-last-selected-players', JSON.stringify(names));
      
    }
    const resetData = { status: 'setup' } as const;
    if (isLocalMode) {
      setLocalRoom(prev => ({ ...prev!, ...resetData } as RoomData));
    } else if (roomId) {
      await roomService.updateRoom(roomId, resetData);
    }
    
    setShowExitModal(false);
  };

  // 3. Quitter et retourner à la sélection des joueurs
  const handleExitToPlayerSelection = async () => {
    // Mémoriser les joueurs de la partie en cours pour la prochaine sélection
    if (currentRoom?.players && currentRoom.players.length > 0) {
      const names = currentRoom.players.map((p: { name: string }) => p.name);
      localStorage.setItem('minou-dart-last-selected-players', JSON.stringify(names));
      
    }
    const resetData = { status: 'setup' } as const;
    if (isLocalMode) {
      setLocalRoom(prev => ({ ...prev!, ...resetData } as RoomData));
    } else if (roomId) {
      await roomService.updateRoom(roomId, resetData);
    }
    
    setShowExitModal(false);
  };

  // S'abonner au salon une fois connecté
  useEffect(() => {
    if (!roomId || isLocalMode) return;

    setLoading(true);
    const unsubscribe = roomService.subscribeToRoom(
      roomId,
      (updatedRoom) => {
        syncFromFirebase(updatedRoom);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("Erreur de liaison Firestore :", err);
        const isFatal = err.message === "Le salon n'existe pas ou a été supprimé." || err.code === "permission-denied";
        if (isFatal) {
          setError("Code de salon invalide ou session expirée.");
          setRoomId(null);
          setRoom(null);
        } else {
          setError("Connexion réseau perturbée. Reconnexion en cours...");
        }
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [roomId, isLocalMode]);

  // Synchroniser remoteProjectorMode depuis Firestore quand le salon change
  useEffect(() => {
    const firestoreMode = currentRoom?.projectorMode;
    if (firestoreMode && firestoreMode !== remoteProjectorMode) {
      setRemoteProjectorMode(firestoreMode);
      localStorage.setItem('minou_dart_projector_mode', firestoreMode);
    }
  }, [currentRoom?.projectorMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Synchroniser la calibration depuis Firestore quand le salon change (si le panneau de calibration n'est pas actif)
  useEffect(() => {
    if (showCalibrationPanel) return;
    const firestoreCal = currentRoom?.calibration;
    if (firestoreCal) {
      if (JSON.stringify(firestoreCal) !== JSON.stringify(remoteCalibration)) {
        setRemoteCalibration(firestoreCal);
        localStorage.setItem('minou_dart_calibration', JSON.stringify(firestoreCal));
      }
    }
  }, [currentRoom?.calibration, showCalibrationPanel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nettoyer les timeouts Firestore lors du démontage de la télécommande
  useEffect(() => {
    return () => {
      if (firestoreTimeoutRef.current) {
        clearTimeout(firestoreTimeoutRef.current);
      }
    };
  }, []);

  // Détection et liaison automatique du salon si l'utilisateur est connecté à Google
  useEffect(() => {
    // Si on a déjà un roomId, ou si on est en mode local, ou si l'utilisateur n'est pas connecté via Google
    if (roomId || isLocalMode || !user || user.isAnonymous) return;

    const autoConnectActiveRoom = async () => {
      try {
        const rooms = await roomService.getUserActiveRooms(user.uid);
        if (rooms.length > 0) {
          const activeRoom = rooms[0];
          setRoomId(activeRoom.roomId);
          // Mettre à jour le hash d'URL pour correspondre
          window.location.hash = `#/remote?room=${activeRoom.roomId}`;
        }
      } catch (err) {
        console.error("Erreur lors de la liaison automatique :", err);
      }
    };

    autoConnectActiveRoom();
    
    // Vérifier également toutes les 5 secondes si une partie démarre
    const interval = setInterval(autoConnectActiveRoom, 5000);
    return () => clearInterval(interval);
  }, [user, roomId, isLocalMode]);

  // Se connecter à un salon existant
  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomIdInput.trim() || roomIdInput.length !== 4) {
      setError("Le code doit comporter 4 caractères.");
      return;
    }

    const code = roomIdInput.trim().toUpperCase();
    setLoading(true);
    setError(null);

    try {
      const exists = await roomService.checkRoomExists(code);
      if (exists) {
        setRoomId(code);
        // Mettre à jour le hash
        window.location.hash = `#/remote?room=${code}`;
      } else {
        setError("Ce salon n'existe pas. Vérifiez le code sur le projecteur.");
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
      setError("Erreur réseau lors de la vérification du salon.");
      setLoading(false);
    }
  };

  // --- RENDU 1 : ÉCRAN DE CONNEXION AU SALON (LIAISON) ---
  if (!isLocalMode && (!roomId || !room)) {
    return (
      <div className="remote-view-container min-h-svh bg-theme-bg text-theme-text-primary transition-all duration-300 flex flex-col justify-center items-center p-6 select-none">
        <div className="w-full max-w-md bg-black/30 border border-theme-border/50 rounded-3xl p-8 backdrop-blur-md shadow-2xl flex flex-col items-center">
          
          <div className="p-4 bg-theme-accent/15 text-theme-accent rounded-full mb-6">
            <Smartphone className="w-12 h-12" />
          </div>

          <h1 className={`text-2xl font-black mb-2 tracking-wide text-center ${theme === 'arcade' ? 'font-mono text-theme-accent' : ''}`}>
            LIAISON TÉLÉCOMMANDE
          </h1>
          <p className="text-xs text-theme-text-secondary text-center mb-6 max-w-xs leading-relaxed">
            Pour vous connecter instantanément, <strong className="text-theme-accent font-extrabold">flashez le QR Code</strong> sur le vidéoprojecteur avec votre smartphone.
          </p>
          <p className="text-[10px] text-theme-text-secondary/70 text-center mb-6 max-w-xs leading-relaxed border-t border-theme-border/20 pt-4 w-full">
            Ou saisissez manuellement le code à 4 lettres ci-dessous :
          </p>

          <div className="w-full flex flex-col gap-4">
            {user && !user.isAnonymous ? (
              <div className="p-3.5 bg-theme-accent/10 border border-theme-accent/30 rounded-xl text-xs text-center text-theme-accent font-medium flex flex-col items-center justify-center gap-2">
                <div className="flex items-center gap-1.5 justify-center">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span>Connecté : <strong>{user.email}</strong></span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-theme-text-secondary">
                  <Loader2 className="w-3 h-3 animate-spin text-theme-accent" />
                  <span>Recherche de partie en cours...</span>
                </div>
              </div>
            ) : (
              <button
                onClick={loginWithGoogle}
                disabled={authLoading}
                className="w-full py-3.5 bg-zinc-900 border border-zinc-800 hover:border-theme-accent/50 hover:bg-zinc-800 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
              >
                {authLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-theme-accent" />
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>LIAISON AUTOMATIQUE GOOGLE</span>
                  </>
                )}
              </button>
            )}
            <form onSubmit={handleJoinRoom} className="w-full space-y-4">
              <div>
                <input
                  type="text"
                  placeholder="----"
                  maxLength={4}
                  autoFocus
                  value={roomIdInput}
                  onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
                  className="w-full py-4 bg-black/40 border-2 border-theme-border rounded-xl text-center text-3xl font-bold tracking-[0.4em] uppercase text-theme-accent focus:border-theme-accent focus:outline-none transition-all placeholder:text-theme-border/30"
                />
              </div>

              {error && (
                <p className="text-xs text-red-500 font-semibold text-center mt-2 bg-red-500/10 py-2 rounded-lg border border-red-500/20">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-theme-accent hover:bg-theme-accent-hover text-black font-black rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                ) : (
                  "SE CONNECTER AU SALON"
                )}
              </button>
            </form>

            <div className="flex items-center my-1 w-full text-theme-text-secondary/30">
              <div className="flex-grow h-[1px] bg-theme-border/20" />
              <span className="px-3 text-[10px] uppercase font-bold tracking-wider">Ou</span>
              <div className="flex-grow h-[1px] bg-theme-border/20" />
            </div>

            <button
              onClick={() => {
                setIsLocalMode(true);
                setRoomId('LOCAL');
                setLocalRoom({
                  roomId: 'LOCAL',
                  theme: 'modern',
                  gameType: 'x01',
                  targetScore: 501,
                  doubleOut: false,
                  cricketScoringMode: 'standard',
                  activePlayerIndex: 0,
                  status: 'setup',
                  players: [],
                  createdAt: new Date(),
                  creatorId: 'local-user'
                });
              }}
              className="w-full py-4 bg-black/40 border border-theme-border/40 text-theme-text-primary hover:border-theme-accent hover:bg-theme-accent/10 font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              JOUER EN LOCAL SUR LE TÉLÉPHONE
            </button>
          </div>

          <a href="#/" className="mt-6 text-xs text-theme-text-secondary/70 hover:text-theme-accent transition-colors flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Retour à l'accueil
          </a>
        </div>
      </div>
    );
  }



  // --- RENDU 2 : FORMULAIRE DE CONFIGURATION DU SALON (SETUP) ---
  if (currentRoom?.status === 'setup') {
    return (
      <>
        <RemoteSetupPhase
          roomId={roomId}
          isLocalMode={isLocalMode}
          currentRoom={currentRoom}
          onUpdateRoom={async (data) => {
            if (isLocalMode) {
              setLocalRoom(prev => prev ? { ...prev, ...data } as RoomData : null);
            } else if (roomId) {
              await roomService.updateRoom(roomId, data);
            }
          }}
          onExit={() => {
            setRoomId(null);
            setRoom(null);
            setIsLocalMode(false);
            setLocalRoom(null);
          }}
          setShowProjectorSettingsModal={setShowProjectorSettingsModal}
          setShowProjectionModal={setShowProjectionModal}
          showCalibrationPanel={showCalibrationPanel}
          setShowCalibrationPanel={setShowCalibrationPanel}
          remoteProjectorMode={remoteProjectorMode}
          setRemoteProjectorModeAndSync={setRemoteProjectorModeAndSync}
        />
        {renderProjectionModal()}
        {renderProjectorSettingsModal()}
        {renderExitModal()}
      </>
    );
  }
  // --- RENDU 3 : PARTIE TERMINÉE (FIN) ---
  if (currentRoom?.status === 'finished') {
    return (
      <RemoteFinishedPhase
        currentRoom={currentRoom}
        isLocalMode={isLocalMode}
        roomId={roomId}
        setLocalRoom={setLocalRoom}
        updateRoomState={updateRoomState}
        setRoomId={setRoomId}
        setRoom={setRoom}
        handleCricketUndo={handleCricketUndo}
      />
    );
  }

  // --- RENDU 4 : EN COURS DE JEU ---
  const isCricket = currentRoom?.gameType === 'cricket';

  // Rendu spécifique au Bart
  if (currentRoom?.gameType === 'bart') {
    return (
      <>
        <BartRemoteGame
          room={currentRoom}
          isLocalMode={isLocalMode}
          setLocalRoom={setLocalRoom}
          roomId={roomId}
          setShowProjectionModal={setShowProjectionModal}
          onExitTrigger={() => setShowExitModal(true)}
        />
        {renderExitModal()}
      </>
    );
  }

  // Rendu spécifique au Tour de l'horloge
  if (currentRoom?.gameType === 'clock') {
    return (
      <>
        <ClockRemoteGame
          room={currentRoom}
          isLocalMode={isLocalMode}
          setLocalRoom={setLocalRoom}
          roomId={roomId}
          setShowProjectionModal={setShowProjectionModal}
          onExitTrigger={() => setShowExitModal(true)}
          onOpenProjectorSettings={() => {
            setShowProjectorSettingsModal(true);
            setShowCalibrationPanel(false);
            updateRoomState({ isCalibrating: false });
            localStorage.setItem('minou_dart_is_calibrating', 'false');
          }}
        />
        {renderExitModal()}
      </>
    );
  }

  // Rendu spécifique au Cricket
  if (isCricket) {
    return (
      <>
        <CricketRemoteGame
          currentRoom={currentRoom as RoomData}
          isLocalMode={isLocalMode}
          roomId={roomId}
          setLocalRoom={setLocalRoom}
          setShowExitModal={setShowExitModal}
          setShowProjectionModal={setShowProjectionModal}
          setShowProjectorSettingsModal={setShowProjectorSettingsModal}
          setShowCalibrationPanel={setShowCalibrationPanel}
          updateRoomState={updateRoomState}
          error={error}
          multiplier={multiplier}
          setMultiplier={setMultiplier}
          handleCricketUndo={handleCricketUndo}
        />
        {renderExitModal()}
      </>
    );
  }

  // --- RENDU X01 ---
  return (
    <>
      <X01RemoteGame
        currentRoom={currentRoom as RoomData}
        isLocalMode={isLocalMode}
        setShowExitModal={setShowExitModal}
        setShowProjectionModal={setShowProjectionModal}
        setShowProjectorSettingsModal={setShowProjectorSettingsModal}
        setShowCalibrationPanel={setShowCalibrationPanel}
        updateRoomState={updateRoomState}
        error={error}
      />
      {renderProjectionModal()}
      {renderExitModal()}
    </>
  );
};
