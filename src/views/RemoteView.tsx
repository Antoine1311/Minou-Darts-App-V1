import React, { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { X, ArrowLeft, Play, RotateCcw, Check, Plus, Trash2, Smartphone, Users, Target, Crosshair, Tv, Copy, ExternalLink, Loader2, Settings, Sparkles, Maximize2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
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


export const RemoteView: React.FC = () => {
  const { theme } = useTheme();
  const { user, loading: authLoading, loginWithGoogle } = useAuth();
  
  // États de la télécommande
  const [roomIdInput, setRoomIdInput] = useState<string>('');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Mode local (sans salon connecté)
  const [isLocalMode, setIsLocalMode] = useState<boolean>(false);
  const [localRoom, setLocalRoom] = useState<RoomData | null>(null);

  // Source de données résolue
  const currentRoom = isLocalMode ? localRoom : room;

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

  // États pour l'édition de la partie dans la phase Setup
  const [setupStep, setSetupStep] = useState<'players' | 'game'>('players');
  const [newPlayerName, setNewPlayerName] = useState<string>('');
  
  // Liste globale de smileys disponibles
  const AVAILABLE_EMOJIS = ['🎯', '😎', '🚀', '👾', '👑', '🔥', '🦁', '🦉', '👻', '😜', '🍀', '⭐'];
  const [selectedEmoji, setSelectedEmoji] = useState<string>('🎯');
  
  // Liste globale de joueurs sauvegardée dans le Cloud
  const [savedPlayers, setSavedPlayers] = useState<GlobalPlayer[]>([]);

  const [isPlayersLoaded, setIsPlayersLoaded] = useState(false);

  // Charger les joueurs depuis Firebase
  useEffect(() => {
    if (user) {
      playerService.getPlayersByOwner(user.uid)
        .then(players => {
          setSavedPlayers(players);
          setIsPlayersLoaded(true);
        })
        .catch(err => {
          console.error(err);
          setIsPlayersLoaded(true);
        });
    } else {
      setSavedPlayers([]);
      setIsPlayersLoaded(true);
    }
  }, [user]);

  // Joueurs sélectionnés pour la partie — restaurés depuis localStorage (dernière partie)
  const [selectedPlayerNames, setSelectedPlayerNames] = useState<string[]>(() => {
    const saved = localStorage.getItem('minou-dart-last-selected-players');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed as string[];
      } catch (e) {
        console.error('Erreur de lecture des derniers joueurs sélectionnés :', e);
      }
    }
    return [];
  });

  // Nettoyer les joueurs sélectionnés qui n'existent plus dans la liste
  useEffect(() => {
    if (!isPlayersLoaded) return;
    const validNames = selectedPlayerNames.filter(name => savedPlayers.some(p => p.name === name));
    if (validNames.length !== selectedPlayerNames.length) {
      setSelectedPlayerNames(validNames);
      localStorage.setItem('minou-dart-last-selected-players', JSON.stringify(validNames));
    }
  }, [savedPlayers, selectedPlayerNames, isPlayersLoaded]);

  // Configuration locale du jeu
  const [selectedGameType, setSelectedGameType] = useState<GameType>('x01');
  const [selectedTargetScore, setSelectedTargetScore] = useState<number>(501);
  const [selectedDoubleOut, setSelectedDoubleOut] = useState<boolean>(false);
  const [selectedRandomOrder, setSelectedRandomOrder] = useState<boolean>(false);
  const [selectedCricketScoringMode, setSelectedCricketScoringMode] = useState<'standard' | 'cutthroat'>('standard');
  const [selectedCricketVariant, setSelectedCricketVariant] = useState<CricketVariant>('classic');
  const [selectedCricketDistribution, setSelectedCricketDistribution] = useState<'random' | 'non_adjacent' | 'adjacent'>('random');
  const [selectedCricketWithBull, setSelectedCricketWithBull] = useState<boolean>(true);
  const [selectedBartSets, setSelectedBartSets] = useState<number>(1);
  const [selectedBartInputMethod, setSelectedBartInputMethod] = useState<'keyboard' | 'target'>('target');
  const [selectedClockIncludeBull, setSelectedClockIncludeBull] = useState<boolean>(true);
  
  const [x01InputMethod, setX01InputMethod] = useState<'keyboard' | 'target'>(() => {
    return (localStorage.getItem('minou_dart_x01_input_method') as 'keyboard' | 'target') || 'keyboard';
  });

  const handleX01InputMethodChange = (method: 'keyboard' | 'target') => {
    setX01InputMethod(method);
    localStorage.setItem('minou_dart_x01_input_method', method);
  };
  
  const [multiplier, setMultiplier] = useState<'S' | 'D' | 'T'>('S'); // Simple, Double, Triple
  const [showExitModal, setShowExitModal] = useState<boolean>(false);
  const [savedGameData, setSavedGameData] = useState<RoomData | null>(null);
  const [showProjectionModal, setShowProjectionModal] = useState<boolean>(false);
  const [linkCopied, setLinkCopied] = useState<boolean>(false);

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
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
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
  const saveRemoteCalibration = (newCal: CalibrationSettings) => {
    setRemoteCalibration(newCal);
    localStorage.setItem('minou_dart_calibration', JSON.stringify(newCal));

    if (!isLocalMode && roomId) {
      if (firestoreTimeoutRef.current) {
        clearTimeout(firestoreTimeoutRef.current);
      }
      firestoreTimeoutRef.current = setTimeout(() => {
        roomService.updateRoom(roomId, { calibration: newCal }).catch(err =>
          console.error('Erreur sync calibration Firestore:', err)
        );
      }, 150);
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
  const adjustRemoteCalibration = (type: 'move-x' | 'move-y' | 'scale-step' | 'stats-move-x' | 'stats-move-y', delta: number) => {
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

  // --- POP-UP PARAMÈTRES PROJECTEUR (⚙️) ---
  const renderProjectorSettingsModal = () => {
    if (!showProjectorSettingsModal) return null;

    const CALIBRATION_STEPS = [
      { step: 1, label: '🎯 Cible', desc: 'Centre & Rayon' },
      { step: 8, label: '🔆 Dégradé', desc: 'Halos' },
      { step: 9, label: '📊 Stats', desc: 'Position Stats' },
    ];

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950/97 backdrop-blur-md overflow-y-auto">
        {/* En-tête de la pop-up */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-zinc-950/95 border-b border-zinc-800 backdrop-blur-md flex-shrink-0">
          {showCalibrationPanel ? (
            <button
              onClick={() => {
                setShowCalibrationPanel(false);
                updateRoomState({ isCalibrating: false });
                localStorage.setItem('minou_dart_is_calibrating', 'false');
              }}
              className="flex items-center gap-2 text-theme-accent hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Paramètres Vue</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-theme-accent" />
              <span className="text-sm font-black text-white uppercase tracking-wider">Paramètres Projecteur</span>
            </div>
          )}
          <button
            onClick={() => {
              setShowProjectorSettingsModal(false);
              setShowCalibrationPanel(false);
              updateRoomState({ isCalibrating: false });
              localStorage.setItem('minou_dart_is_calibrating', 'false');
            }}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-full transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-grow p-5 space-y-5 max-w-lg mx-auto w-full">

          {/* --- PANNEAU SÉLECTION MODE DE VUE --- */}
          {!showCalibrationPanel && (
            <>
              <div>
                <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-3">
                  Vue diffusée sur le projecteur
                </p>
                <div className="space-y-2.5">
                  {/* Bouton Vue Classique */}
                  <button
                    onClick={() => setRemoteProjectorModeAndSync('classic')}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer text-left ${
                      remoteProjectorMode === 'classic'
                        ? 'border-theme-accent bg-theme-accent/10'
                        : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-900'
                    }`}
                  >
                    <div className={`p-2.5 rounded-xl ${remoteProjectorMode === 'classic' ? 'bg-theme-accent/20' : 'bg-zinc-800'}`}>
                      <Tv className={`w-5 h-5 ${remoteProjectorMode === 'classic' ? 'text-theme-accent' : 'text-zinc-400'}`} />
                    </div>
                    <div className="flex-1">
                      <div className={`text-sm font-extrabold ${remoteProjectorMode === 'classic' ? 'text-theme-accent' : 'text-white'}`}>
                        Vue Classique
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">Scores + cible blanche côte à côte</div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      remoteProjectorMode === 'classic' ? 'border-theme-accent' : 'border-zinc-700'
                    }`}>
                      {remoteProjectorMode === 'classic' && <div className="w-2.5 h-2.5 rounded-full bg-theme-accent" />}
                    </div>
                  </button>

                  {/* Bouton Plein Écran */}
                  <button
                    onClick={() => setRemoteProjectorModeAndSync('fullscreen')}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer text-left ${
                      remoteProjectorMode === 'fullscreen'
                        ? 'border-theme-accent bg-theme-accent/10'
                        : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-900'
                    }`}
                  >
                    <div className={`p-2.5 rounded-xl ${remoteProjectorMode === 'fullscreen' ? 'bg-theme-accent/20' : 'bg-zinc-800'}`}>
                      <Maximize2 className={`w-5 h-5 ${remoteProjectorMode === 'fullscreen' ? 'text-theme-accent' : 'text-zinc-400'}`} />
                    </div>
                    <div className="flex-1">
                      <div className={`text-sm font-extrabold ${remoteProjectorMode === 'fullscreen' ? 'text-theme-accent' : 'text-white'}`}>
                        Plein Écran
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">Scores joueurs en grand format</div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      remoteProjectorMode === 'fullscreen' ? 'border-theme-accent' : 'border-zinc-700'
                    }`}>
                      {remoteProjectorMode === 'fullscreen' && <div className="w-2.5 h-2.5 rounded-full bg-theme-accent" />}
                    </div>
                  </button>

                  {/* Bouton Réalité Augmentée */}
                  <button
                    onClick={() => setRemoteProjectorModeAndSync('ar')}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer text-left ${
                      remoteProjectorMode === 'ar'
                        ? 'border-theme-accent bg-theme-accent/10'
                        : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-900'
                    }`}
                  >
                    <div className={`p-2.5 rounded-xl ${remoteProjectorMode === 'ar' ? 'bg-theme-accent/20' : 'bg-zinc-800'}`}>
                      <Sparkles className={`w-5 h-5 ${remoteProjectorMode === 'ar' ? 'text-theme-accent' : 'text-zinc-400'}`} />
                    </div>
                    <div className="flex-1">
                      <div className={`text-sm font-extrabold ${remoteProjectorMode === 'ar' ? 'text-theme-accent' : 'text-white'}`}>
                        Réalité Augmentée
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">Cible SVG superposée à la vraie cible</div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      remoteProjectorMode === 'ar' ? 'border-theme-accent' : 'border-zinc-700'
                    }`}>
                      {remoteProjectorMode === 'ar' && <div className="w-2.5 h-2.5 rounded-full bg-theme-accent" />}
                    </div>
                  </button>
                </div>
              </div>

              {/* Bouton Calibrer (visible seulement si mode AR) */}
              {remoteProjectorMode === 'ar' && (
                <div className="pt-1">
                  <div className="w-full h-[1px] bg-zinc-800 mb-4" />
                  <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-3">
                    Calibration de la cible augmentée
                  </p>
                  <button
                    onClick={() => {
                      setShowCalibrationPanel(true);
                      updateRoomState({ isCalibrating: true });
                      localStorage.setItem('minou_dart_is_calibrating', 'true');
                    }}
                    className="w-full flex items-center justify-between gap-3 p-4 bg-theme-accent/5 border-2 border-theme-accent/30 hover:border-theme-accent hover:bg-theme-accent/10 rounded-2xl transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-theme-accent/15 rounded-xl">
                        <Settings className="w-5 h-5 text-theme-accent" />
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-extrabold text-theme-accent">Calibrer le Mode Augmenté</div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">Ajuster le cercle sur la vraie cible</div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-theme-accent group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              )}
            </>
          )}

          {/* --- PANNEAU CALIBRATION --- */}
          {showCalibrationPanel && (
            <div className="space-y-4">
              {/* Titre + info */}
              <div className="p-3 bg-theme-accent/10 border border-theme-accent/30 rounded-xl text-[11px] text-zinc-400 leading-relaxed">
                🎯 Les ajustements sont visibles <strong className="text-theme-accent">en temps réel sur le projecteur</strong>. Ouvrez le projecteur en mode Réalité Augmentée pour voir les modifications.
              </div>

              {/* Sélecteur d'étape (1 à 8) */}
              <div>
                <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-2">
                  Paramètre à calibrer
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {CALIBRATION_STEPS.map((item) => (
                    <button
                      key={item.step}
                      onClick={() => setRemoteCalibrationStep(item.step)}
                      className={`py-2 px-1 rounded-xl border text-center flex flex-col items-center gap-0.5 transition-all cursor-pointer ${
                        remoteCalibrationStep === item.step
                          ? 'bg-theme-accent text-black border-theme-accent shadow-md scale-105'
                          : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-white'
                      }`}
                    >
                      <span className="text-[11px] font-extrabold">{item.label}</span>
                      <span className={`text-[8px] font-medium ${remoteCalibrationStep === item.step ? 'text-black/70' : 'text-zinc-600'}`}>
                        {item.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Slider principal (rayon / valeur de l'étape) */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between gap-3">
                <div className="flex flex-col min-w-[80px]">
                  <span className="text-zinc-500 font-bold text-[10px] uppercase tracking-wider">
                    {remoteCalibrationStep === 8 ? 'Halo Blanc' : 'Rayon'}
                  </span>
                  <span className="text-theme-accent font-mono font-black text-sm">
                    {Math.round(getRemoteStepSliderValue())}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-1 justify-end">
                  <button
                    onClick={() => {
                      const minVal = remoteCalibrationStep === 8 ? Math.round(remoteCalibration.rDoubleOuter - 20) : 50;
                      handleRemoteSliderChange(Math.max(minVal, getRemoteStepSliderValue() - 1));
                    }}
                    className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
                  >
                    -
                  </button>
                  <input
                    type="range"
                    min={remoteCalibrationStep === 8 ? Math.round(remoteCalibration.rDoubleOuter - 20) : 50}
                    max={remoteCalibrationStep === 8 ? Math.round((remoteCalibration.haloMaxRadius ?? (remoteCalibration.rDoubleOuter * 2.5)) - 10) : 500}
                    value={getRemoteStepSliderValue()}
                    onChange={(e) => handleRemoteSliderChange(Number(e.target.value))}
                    className="w-28 h-1.5 rounded-full accent-theme-accent cursor-pointer"
                  />
                  <button
                    onClick={() => {
                      const maxVal = remoteCalibrationStep === 8 ? Math.round((remoteCalibration.haloMaxRadius ?? (remoteCalibration.rDoubleOuter * 2.5)) - 10) : 500;
                      handleRemoteSliderChange(Math.min(maxVal, getRemoteStepSliderValue() + 1));
                    }}
                    className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Slider Dégradé Noir (étape 8 uniquement) */}
              {remoteCalibrationStep === 8 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between gap-3">
                  <div className="flex flex-col min-w-[80px]">
                    <span className="text-zinc-500 font-bold text-[10px] uppercase tracking-wider">Halo Noir</span>
                    <span className="text-theme-accent font-mono font-black text-sm">
                      {Math.round(remoteCalibration.haloMaxRadius ?? (remoteCalibration.rDoubleOuter * 2.5))}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-1 justify-end">
                    <button
                      onClick={() => {
                        const current = remoteCalibration.haloMaxRadius ?? (remoteCalibration.rDoubleOuter * 2.5);
                        const minVal = (remoteCalibration.haloWhiteRadius ?? (remoteCalibration.rDoubleOuter * 1.1)) + 10;
                        const val = Math.max(minVal, current - 5);
                        const newCal = { ...remoteCalibration };
                        newCal.haloMaxRadius = val;
                        saveRemoteCalibration(newCal);
                      }}
                      className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
                    >
                      -
                    </button>
                    <input
                      type="range"
                      min={Math.round((remoteCalibration.haloWhiteRadius ?? (remoteCalibration.rDoubleOuter * 1.1)) + 10)}
                      max={1500}
                      value={remoteCalibration.haloMaxRadius ?? (remoteCalibration.rDoubleOuter * 2.5)}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        const newCal = { ...remoteCalibration };
                        newCal.haloMaxRadius = Math.max((newCal.haloWhiteRadius ?? (newCal.rDoubleOuter * 1.1)) + 10, val);
                        saveRemoteCalibration(newCal);
                      }}
                      className="w-28 h-1.5 rounded-full accent-theme-accent cursor-pointer"
                    />
                    <button
                      onClick={() => {
                        const current = remoteCalibration.haloMaxRadius ?? (remoteCalibration.rDoubleOuter * 2.5);
                        const val = Math.min(1500, current + 5);
                        const newCal = { ...remoteCalibration };
                        newCal.haloMaxRadius = val;
                        saveRemoteCalibration(newCal);
                      }}
                      className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              {/* Sliders Stats X / Stats Y (étape 9 uniquement) */}
              {remoteCalibrationStep === 9 && (
                <div className="space-y-2">
                  {/* Position X */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between gap-3">
                    <div className="flex flex-col min-w-[80px]">
                      <span className="text-zinc-500 font-bold text-[10px] uppercase tracking-wider">Position X</span>
                      <span className="text-theme-accent font-mono font-black text-sm">{Math.round(remoteCalibration.statsPanelX ?? 16)}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-1 justify-end">
                      <button
                        onClick={() => adjustRemoteCalibration('stats-move-x', -1)}
                        className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
                      >
                        -
                      </button>
                      <input
                        type="range"
                        min={-500} max={1500}
                        value={remoteCalibration.statsPanelX ?? 16}
                        onChange={(e) => adjustRemoteCalibration('stats-move-x', Number(e.target.value) - (remoteCalibration.statsPanelX ?? 16))}
                        className="w-28 h-1.5 rounded-full accent-theme-accent cursor-pointer"
                      />
                      <button
                        onClick={() => adjustRemoteCalibration('stats-move-x', 1)}
                        className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  {/* Position Y */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between gap-3">
                    <div className="flex flex-col min-w-[80px]">
                      <span className="text-zinc-500 font-bold text-[10px] uppercase tracking-wider">Position Y</span>
                      <span className="text-theme-accent font-mono font-black text-sm">{Math.round(remoteCalibration.statsPanelY ?? 0)}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-1 justify-end">
                      <button
                        onClick={() => adjustRemoteCalibration('stats-move-y', -1)}
                        className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
                      >
                        -
                      </button>
                      <input
                        type="range"
                        min={-500} max={500}
                        value={remoteCalibration.statsPanelY ?? 0}
                        onChange={(e) => adjustRemoteCalibration('stats-move-y', Number(e.target.value) - (remoteCalibration.statsPanelY ?? 0))}
                        className="w-28 h-1.5 rounded-full accent-theme-accent cursor-pointer"
                      />
                      <button
                        onClick={() => adjustRemoteCalibration('stats-move-y', 1)}
                        className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  {/* Slider Taille Police Stats */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between gap-3">
                    <div className="flex flex-col min-w-[80px]">
                      <span className="text-zinc-500 font-bold text-[10px] uppercase tracking-wider">Police Stats</span>
                      <span className="text-theme-accent font-mono font-black text-sm">{Math.round(remoteCalibration.statsFontSize ?? 16)}px</span>
                    </div>
                    <div className="flex items-center gap-2 flex-1 justify-end">
                      <button
                        onClick={() => {
                          const current = remoteCalibration.statsFontSize ?? 16;
                          const newCal = { ...remoteCalibration };
                          newCal.statsFontSize = Math.max(10, current - 1);
                          saveRemoteCalibration(newCal);
                        }}
                        className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
                      >
                        -
                      </button>
                      <input
                        type="range"
                        min={10} max={40}
                        value={remoteCalibration.statsFontSize ?? 16}
                        onChange={(e) => {
                          const newCal = { ...remoteCalibration };
                          newCal.statsFontSize = Number(e.target.value);
                          saveRemoteCalibration(newCal);
                        }}
                        className="w-28 h-1.5 rounded-full accent-theme-accent cursor-pointer"
                      />
                      <button
                        onClick={() => {
                          const current = remoteCalibration.statsFontSize ?? 16;
                          const newCal = { ...remoteCalibration };
                          newCal.statsFontSize = Math.min(40, current + 1);
                          saveRemoteCalibration(newCal);
                        }}
                        className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  {/* Slider Largeur Texte Stats */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between gap-3">
                    <div className="flex flex-col min-w-[80px]">
                      <span className="text-zinc-500 font-bold text-[10px] uppercase tracking-wider">Largeur Stats</span>
                      <span className="text-theme-accent font-mono font-black text-sm">{(remoteCalibration.statsFontScaleX ?? 1.0).toFixed(2)}x</span>
                    </div>
                    <div className="flex items-center gap-2 flex-1 justify-end">
                      <button
                        onClick={() => {
                          const current = remoteCalibration.statsFontScaleX ?? 1.0;
                          const newCal = { ...remoteCalibration };
                          newCal.statsFontScaleX = Math.max(0.5, Number((current - 0.05).toFixed(2)));
                          saveRemoteCalibration(newCal);
                        }}
                        className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
                      >
                        -
                      </button>
                      <input
                        type="range"
                        min={0.5} max={2.0} step={0.05}
                        value={remoteCalibration.statsFontScaleX ?? 1.0}
                        onChange={(e) => {
                          const newCal = { ...remoteCalibration };
                          newCal.statsFontScaleX = Number(e.target.value);
                          saveRemoteCalibration(newCal);
                        }}
                        className="w-28 h-1.5 rounded-full accent-theme-accent cursor-pointer"
                      />
                      <button
                        onClick={() => {
                          const current = remoteCalibration.statsFontScaleX ?? 1.0;
                          const newCal = { ...remoteCalibration };
                          newCal.statsFontScaleX = Math.min(2.0, Number((current + 0.05).toFixed(2)));
                          saveRemoteCalibration(newCal);
                        }}
                        className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  {/* Slider Hauteur Texte Stats */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between gap-3">
                    <div className="flex flex-col min-w-[80px]">
                      <span className="text-zinc-500 font-bold text-[10px] uppercase tracking-wider">Hauteur Stats</span>
                      <span className="text-theme-accent font-mono font-black text-sm">{(remoteCalibration.statsFontScaleY ?? 1.0).toFixed(2)}x</span>
                    </div>
                    <div className="flex items-center gap-2 flex-1 justify-end">
                      <button
                        onClick={() => {
                          const current = remoteCalibration.statsFontScaleY ?? 1.0;
                          const newCal = { ...remoteCalibration };
                          newCal.statsFontScaleY = Math.max(0.5, Number((current - 0.05).toFixed(2)));
                          saveRemoteCalibration(newCal);
                        }}
                        className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
                      >
                        -
                      </button>
                      <input
                        type="range"
                        min={0.5} max={2.0} step={0.05}
                        value={remoteCalibration.statsFontScaleY ?? 1.0}
                        onChange={(e) => {
                          const newCal = { ...remoteCalibration };
                          newCal.statsFontScaleY = Number(e.target.value);
                          saveRemoteCalibration(newCal);
                        }}
                        className="w-28 h-1.5 rounded-full accent-theme-accent cursor-pointer"
                      />
                      <button
                        onClick={() => {
                          const current = remoteCalibration.statsFontScaleY ?? 1.0;
                          const newCal = { ...remoteCalibration };
                          newCal.statsFontScaleY = Math.min(2.0, Number((current + 0.05).toFixed(2)));
                          saveRemoteCalibration(newCal);
                        }}
                        className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  {/* Slider Taille Police Commentaires */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between gap-3">
                    <div className="flex flex-col min-w-[80px]">
                      <span className="text-zinc-500 font-bold text-[10px] uppercase tracking-wider">Police Comm.</span>
                      <span className="text-theme-accent font-mono font-black text-sm">{Math.round(remoteCalibration.commentsFontSize ?? 18)}px</span>
                    </div>
                    <div className="flex items-center gap-2 flex-1 justify-end">
                      <button
                        onClick={() => {
                          const current = remoteCalibration.commentsFontSize ?? 18;
                          const newCal = { ...remoteCalibration };
                          newCal.commentsFontSize = Math.max(10, current - 1);
                          saveRemoteCalibration(newCal);
                        }}
                        className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
                      >
                        -
                      </button>
                      <input
                        type="range"
                        min={10} max={40}
                        value={remoteCalibration.commentsFontSize ?? 18}
                        onChange={(e) => {
                          const newCal = { ...remoteCalibration };
                          newCal.commentsFontSize = Number(e.target.value);
                          saveRemoteCalibration(newCal);
                        }}
                        className="w-28 h-1.5 rounded-full accent-theme-accent cursor-pointer"
                      />
                      <button
                        onClick={() => {
                          const current = remoteCalibration.commentsFontSize ?? 18;
                          const newCal = { ...remoteCalibration };
                          newCal.commentsFontSize = Math.min(40, current + 1);
                          saveRemoteCalibration(newCal);
                        }}
                        className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Zone de prévisualisation des polices */}
                  <div className="bg-black/60 border border-zinc-800 rounded-2xl p-3 space-y-2 mt-2">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider block">Prévisualisation du texte</span>
                    <div className="space-y-2.5">
                      <div>
                        <span className="text-[8px] text-zinc-400 block mb-0.5">Statistiques (ex. Cricket, X01) :</span>
                        <div className="flex justify-center items-center bg-zinc-950 p-2.5 rounded-xl border border-zinc-850 overflow-hidden h-12">
                          <div 
                            className="text-white font-black whitespace-nowrap"
                            style={{
                              fontSize: `${remoteCalibration.statsFontSize ?? 16}px`,
                              transform: `scale(${remoteCalibration.statsFontScaleX ?? 1.0}, ${remoteCalibration.statsFontScaleY ?? 1.0})`,
                              transformOrigin: 'center',
                              display: 'inline-block'
                            }}
                          >
                            180 points restants
                          </div>
                        </div>
                      </div>
                      <div>
                        <span className="text-[8px] text-zinc-400 block mb-0.5">Commentaires (ex. Checkout) :</span>
                        <div className="flex justify-center items-center bg-zinc-950 p-2.5 rounded-xl border border-zinc-850 overflow-hidden h-12">
                          <div 
                            className="text-theme-accent font-black whitespace-nowrap animate-pulse"
                            style={{
                              fontSize: `${remoteCalibration.commentsFontSize ?? 18}px`,
                              display: 'inline-block'
                            }}
                          >
                            Finition : T20 ➔ D20
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {/* Sliders Centre X / Centre Y (étape 1 uniquement) */}
              {remoteCalibrationStep === 1 && (
                <div className="space-y-2">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between gap-3">
                    <div className="flex flex-col min-w-[80px]">
                      <span className="text-zinc-500 font-bold text-[10px] uppercase tracking-wider">Centre X</span>
                      <span className="text-theme-accent font-mono font-black text-sm">{Math.round(remoteCalibration.centerX)}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-1 justify-end">
                      <button
                        onClick={() => adjustRemoteCalibration('move-x', -1)}
                        className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
                      >
                        -
                      </button>
                      <input
                        type="range"
                        min={0} max={1000}
                        value={remoteCalibration.centerX}
                        onChange={(e) => adjustRemoteCalibration('move-x', Number(e.target.value) - remoteCalibration.centerX)}
                        className="w-28 h-1.5 rounded-full accent-theme-accent cursor-pointer"
                      />
                      <button
                        onClick={() => adjustRemoteCalibration('move-x', 1)}
                        className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between gap-3">
                    <div className="flex flex-col min-w-[80px]">
                      <span className="text-zinc-500 font-bold text-[10px] uppercase tracking-wider">Centre Y</span>
                      <span className="text-theme-accent font-mono font-black text-sm">{Math.round(remoteCalibration.centerY)}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-1 justify-end">
                      <button
                        onClick={() => adjustRemoteCalibration('move-y', -1)}
                        className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
                      >
                        -
                      </button>
                      <input
                        type="range"
                        min={0} max={1000}
                        value={remoteCalibration.centerY}
                        onChange={(e) => adjustRemoteCalibration('move-y', Number(e.target.value) - remoteCalibration.centerY)}
                        className="w-28 h-1.5 rounded-full accent-theme-accent cursor-pointer"
                      />
                      <button
                        onClick={() => adjustRemoteCalibration('move-y', 1)}
                        className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Boutons directionnels d'ajustement fin */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-3 text-center">
                  Ajustement fin (±{remoteCalibrationStep === 1 ? '2px' : '1px'})
                </p>
                <div className="grid grid-cols-3 gap-2 w-36 mx-auto">
                  <div />
                  <button
                    onClick={() => { if (remoteCalibrationStep === 1) adjustRemoteCalibration('move-y', -2); else if (remoteCalibrationStep === 9) adjustRemoteCalibration('stats-move-y', -2); else adjustRemoteCalibration('scale-step', -1); }}
                    className="p-3 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-theme-accent rounded-xl flex items-center justify-center transition-all cursor-pointer active:scale-95"
                  >
                    <ChevronUp className="w-5 h-5" />
                  </button>
                  <div />
                  <button
                    onClick={() => { if (remoteCalibrationStep === 1) adjustRemoteCalibration('move-x', -2); else if (remoteCalibrationStep === 8) { const newCal = { ...remoteCalibration }; newCal.haloMaxRadius = Math.max((newCal.haloWhiteRadius ?? (newCal.rDoubleOuter * 1.1)) + 10, (newCal.haloMaxRadius ?? (newCal.rDoubleOuter * 2.5)) - 5); saveRemoteCalibration(newCal); } else if (remoteCalibrationStep === 9) adjustRemoteCalibration('stats-move-x', -2); }}
                    className={`p-3 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-theme-accent rounded-xl flex items-center justify-center transition-all cursor-pointer active:scale-95 ${remoteCalibrationStep !== 1 && remoteCalibrationStep !== 8 && remoteCalibrationStep !== 9 ? 'opacity-30 pointer-events-none' : ''}`}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => { if (remoteCalibrationStep === 1) adjustRemoteCalibration('move-y', 2); else if (remoteCalibrationStep === 9) adjustRemoteCalibration('stats-move-y', 2); else adjustRemoteCalibration('scale-step', 1); }}
                    className="p-3 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-theme-accent rounded-xl flex items-center justify-center transition-all cursor-pointer active:scale-95"
                  >
                    <ChevronDown className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => { if (remoteCalibrationStep === 1) adjustRemoteCalibration('move-x', 2); else if (remoteCalibrationStep === 8) { const newCal = { ...remoteCalibration }; newCal.haloMaxRadius = Math.min(1500, (newCal.haloMaxRadius ?? (newCal.rDoubleOuter * 2.5)) + 5); saveRemoteCalibration(newCal); } else if (remoteCalibrationStep === 9) adjustRemoteCalibration('stats-move-x', 2); }}
                    className={`p-3 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-theme-accent rounded-xl flex items-center justify-center transition-all cursor-pointer active:scale-95 ${remoteCalibrationStep !== 1 && remoteCalibrationStep !== 8 && remoteCalibrationStep !== 9 ? 'opacity-30 pointer-events-none' : ''}`}
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Boutons Reset & Valider */}
              {showResetConfirm ? (
                <div className="bg-red-950/20 border border-red-500/30 rounded-2xl p-3.5 space-y-2.5 text-center animate-pulse col-span-2 w-full">
                  <span className="text-xs text-red-400 font-black uppercase tracking-wider block">Réinitialiser la calibration ?</span>
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={() => {
                        saveRemoteCalibration(DEFAULT_CALIBRATION_REMOTE);
                        setRemoteCalibrationStep(1);
                        setShowResetConfirm(false);
                        if (firestoreTimeoutRef.current) {
                          clearTimeout(firestoreTimeoutRef.current);
                        }
                        if (!isLocalMode && roomId) {
                          roomService.updateRoom(roomId, { calibration: DEFAULT_CALIBRATION_REMOTE }).catch(err =>
                            console.error('Erreur sync calibration Firestore reset:', err)
                          );
                        }
                      }}
                      className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-black rounded-xl cursor-pointer active:scale-95 transition-all"
                    >
                      Oui, réinitialiser
                    </button>
                    <button
                      onClick={() => setShowResetConfirm(false)}
                      className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-black rounded-xl cursor-pointer active:scale-95 transition-all"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 pt-1 w-full">
                  <button
                    onClick={() => setShowResetConfirm(true)}
                    className="py-3.5 px-4 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 hover:border-red-500 text-red-400 font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Réinitialiser
                  </button>
                  <button
                    onClick={() => {
                      setShowCalibrationPanel(false);
                      updateRoomState({ isCalibrating: false });
                      localStorage.setItem('minou_dart_is_calibrating', 'false');
                      if (firestoreTimeoutRef.current) {
                        clearTimeout(firestoreTimeoutRef.current);
                      }
                      if (!isLocalMode && roomId) {
                        roomService.updateRoom(roomId, { calibration: remoteCalibration }).catch(err =>
                          console.error('Erreur sync calibration Firestore finale:', err)
                        );
                      }
                    }}
                    className="py-3.5 px-4 bg-green-500 hover:bg-green-400 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-green-900/20"
                  >
                    <Check className="w-4 h-4 stroke-[3px]" />
                    VALIDER CALIBRATION
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

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

  // Charger la partie sauvegardée s'il y en a une au chargement ou lors d'un retour au lobby
  useEffect(() => {
    const saved = localStorage.getItem('minou-darts-saved-active-game');
    if (saved) {
      try {
        setSavedGameData(JSON.parse(saved));
      } catch (e) {
        console.error("Erreur de parsing de la partie sauvegardée :", e);
      }
    } else {
      setSavedGameData(null);
    }
  }, [currentRoom?.status]);

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
      setSetupStep('game'); // On retourne à la sélection de jeu par défaut
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
      setSelectedPlayerNames(names);
    }
    const resetData = { status: 'setup' } as const;
    if (isLocalMode) {
      setLocalRoom(prev => ({ ...prev!, ...resetData } as RoomData));
    } else if (roomId) {
      await roomService.updateRoom(roomId, resetData);
    }
    setSetupStep('game');
    setShowExitModal(false);
  };

  // 3. Quitter et retourner à la sélection des joueurs
  const handleExitToPlayerSelection = async () => {
    // Mémoriser les joueurs de la partie en cours pour la prochaine sélection
    if (currentRoom?.players && currentRoom.players.length > 0) {
      const names = currentRoom.players.map((p: { name: string }) => p.name);
      localStorage.setItem('minou-dart-last-selected-players', JSON.stringify(names));
      setSelectedPlayerNames(names);
    }
    const resetData = { status: 'setup' } as const;
    if (isLocalMode) {
      setLocalRoom(prev => ({ ...prev!, ...resetData } as RoomData));
    } else if (roomId) {
      await roomService.updateRoom(roomId, resetData);
    }
    setSetupStep('players');
    setShowExitModal(false);
  };

  // S'abonner au salon une fois connecté
  useEffect(() => {
    if (!roomId || isLocalMode) return;

    setLoading(true);
    const unsubscribe = roomService.subscribeToRoom(
      roomId,
      (updatedRoom) => {
        setRoom(updatedRoom);
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

  // Ajouter un joueur à la liste globale persistée
  const handleAddNewPlayer = async () => {
    const name = newPlayerName.trim();
    if (!name) return;
    if (!user) {
      setError("Vous n'êtes pas authentifié avec Firebase. Vérifiez que la connexion anonyme est activée dans la console Firebase.");
      return;
    }
    
    if (!savedPlayers.some(p => p.name === name)) {
      try {
        const newPlayer = await playerService.createPlayer(user.uid, name, selectedEmoji);
        setSavedPlayers(prev => [...prev, newPlayer].sort((a, b) => a.name.localeCompare(b.name)));
        // Sélectionner automatiquement le nouveau joueur
        setSelectedPlayerNames(prev => [...prev, name]);
      } catch (err) {
        console.error("Erreur création joueur:", err);
      }
    }
    setNewPlayerName('');
  };

  // Supprimer définitivement un joueur de la liste globale
  const handleRemoveSavedPlayer = async (name: string) => {
    const playerToRemove = savedPlayers.find(p => p.name === name);
    if (playerToRemove) {
      try {
        await playerService.deletePlayer(playerToRemove.id);
        setSavedPlayers(prev => prev.filter(p => p.id !== playerToRemove.id));
        // Retirer de la sélection s'il y était
        setSelectedPlayerNames(prev => prev.filter(p => p !== name));
      } catch (err) {
        console.error("Erreur suppression joueur:", err);
      }
    }
  };

  // Mettre à jour l'émoji d'un joueur existant
  const handleUpdatePlayerEmoji = async (name: string, newEmoji: string) => {
    const playerToUpdate = savedPlayers.find(p => p.name === name);
    if (playerToUpdate) {
      try {
        await playerService.updatePlayerEmoji(playerToUpdate.id, newEmoji);
        setSavedPlayers(prev => prev.map(p => p.id === playerToUpdate.id ? { ...p, emoji: newEmoji } : p));
      } catch (err) {
        console.error("Erreur mise à jour emoji:", err);
      }
    }
  };



  // Cocher/Décocher un joueur (remonte automatiquement en haut via le tri dynamique)
  const handleToggleSelectPlayer = (name: string) => {
    if (selectedPlayerNames.includes(name)) {
      setSelectedPlayerNames(selectedPlayerNames.filter(p => p !== name));
    } else {
      setSelectedPlayerNames([...selectedPlayerNames, name]);
    }
  };

  // Persister la liste des joueurs sélectionnés pour la partie suivante
  const saveLastSelectedPlayers = (names: string[]) => {
    localStorage.setItem('minou-dart-last-selected-players', JSON.stringify(names));
  };

  // Lancer officiellement la partie (Setup -> Playing) et initialiser Firestore
  const handleStartGame = async () => {
    if (!currentRoom || selectedPlayerNames.length === 0) return;
    
    setIsSubmitting(true);
    try {
      const targets = generateCricketTargets(
        selectedCricketVariant,
        selectedCricketVariant === 'crazy'
          ? { distribution: selectedCricketDistribution, withBull: selectedCricketWithBull }
          : undefined
      );
      
      // Mélanger aléatoirement l'ordre des joueurs au début de la partie (Fisher-Yates) si l'option est activée et que c'est x01 ou cricket
      const shuffledPlayerNames = [...selectedPlayerNames];
      const isRandomOrderEnabled = selectedRandomOrder && (selectedGameType === 'x01' || selectedGameType === 'cricket');
      if (isRandomOrderEnabled && shuffledPlayerNames.length > 1) {
        for (let i = shuffledPlayerNames.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledPlayerNames[i], shuffledPlayerNames[j]] = [shuffledPlayerNames[j], shuffledPlayerNames[i]];
        }
      }

      const initialPlayers = shuffledPlayerNames.map(name => {
        const playerObj = savedPlayers.find(p => p.name === name);
        return {
          globalId: playerObj?.id,
          name,
          emoji: playerObj?.emoji || '🎯',
          score: selectedGameType === 'x01' ? selectedTargetScore : 0,
          scoreBeforeRound: selectedGameType === 'x01' ? selectedTargetScore : 0,
          avg: 0,
          dartsLeft: 3,
          throwsCount: 0,
          totalPoints: 0,
          history: [],
          bestRound: 0,
          lastRoundScore: 0,
          roundScores: [],
          missedDarts: 0,
          accuracy: 0,
          whiteRounds: 0,
          bestCricketRound: 0,
          bustsCount: 0,
          currentRoundThrows: [],
          ...(selectedGameType === 'cricket' ? { cricketMarks: createEmptyMarks(targets) } : {}),
          ...(selectedGameType === 'bart' ? { bartState: createEmptyBartState() } : {}),
          ...(selectedGameType === 'clock' ? {
            clockState: {
              currentTarget: 1,
              throwsCount: 0,
              hitsCount: 0,
              accuracy: 0,
              targetHistory: [],
              throwHistory: []
            }
          } : {})
        };
      });

      const newRoomData: Partial<RoomData> = {
        status: 'playing',
        gameType: selectedGameType,
        targetScore: selectedTargetScore,
        doubleOut: selectedDoubleOut,
        cricketScoringMode: selectedCricketScoringMode,
        cricketVariant: selectedCricketVariant,
        cricketTargets: selectedGameType === 'cricket' ? targets : [],
        players: initialPlayers as any,
        activePlayerIndex: 0,
        winnerName: '',
        ...(selectedGameType === 'bart' ? {
          bartConfig: {
            setsToWin: selectedBartSets,
            serverIndex: 0,
            resolutionStep: 'waiting_for_target',
            isTieBreak: false,
            inputMethod: selectedBartInputMethod
          }
        } : {}),
        ...(selectedGameType === 'clock' ? {
          clockConfig: {
            includeBull: selectedClockIncludeBull
          }
        } : {})
      };

      if (isLocalMode) {
        setLocalRoom(prev => {
          if (!prev) return null;
          return {
            ...prev,
            ...newRoomData
          } as RoomData;
        });
      } else if (roomId) {
        await roomService.updateRoom(roomId, newRoomData);
      } else {
        throw new Error("L'identifiant du salon (roomId) est manquant.");
      }
      
      // Sauvegarder les joueurs de cette partie pour la prochaine sélection
      saveLastSelectedPlayers(selectedPlayerNames);
      // Réinitialiser l'étape de setup pour une prochaine partie
      setSetupStep('players');
    } catch (err) {
      console.error(err);
      setError("Erreur lors de l'initialisation de la partie.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Enregistrer le score d'une fléchette lancée instantanément — X01 (sans bouton OK)
  const handleThrowDirect = async (basePoints: number, customMultiplier?: 'S' | 'D' | 'T') => {
    if (!currentRoom || isSubmitting) return;

    setIsSubmitting(true);
    let points = basePoints;
    const targetMult = customMultiplier || multiplier;
    const isDouble = targetMult === 'D';

    // Construire le libellé exact du lancer
    let label = '';
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
      // Rétablir le multiplicateur par défaut pour la fléchette suivante
      setMultiplier('S');

      // Analyser si ce lancer termine le tour du joueur actif
      const activePlayer = currentRoom.players[activePlayerIndex];
      const isLastDart = activePlayer.dartsLeft === 1;

      // Calculer le nouveau score et vérifier si bust
      const newScore = activePlayer.score - points;
      let isBust = false;
      if (newScore < 0) {
        isBust = true;
      } else if (currentRoom.doubleOut) {
        if (newScore === 1) {
          isBust = true;
        } else if (newScore === 0 && !isDouble) {
          isBust = true;
        }
      }

      const isGameWon = !isBust && newScore === 0;
      const isTurnEnding = (isLastDart || isBust) && !isGameWon;

      if (isTurnEnding) {
        // ÉTAPE 1 : Créer et enregistrer l'état intermédiaire (le joueur a fini de lancer mais le tour n'a pas encore changé)
        const intermediateRoom: RoomData = {
          ...currentRoom,
          players: currentRoom.players.map((p, idx) => {
            if (idx !== activePlayerIndex) return p;
            
            // Mettre à jour le joueur actif
            const updatedPlayer = {
              ...p,
              history: [...p.history, points],
              currentRoundThrows: [...(p.currentRoundThrows || []), label],
              dartsLeft: 0,
              throwsCount: p.throwsCount + 1,
              totalPoints: p.totalPoints + points,
            };

            if (isBust) {
              updatedPlayer.score = p.scoreBeforeRound ?? p.score;
              updatedPlayer.roundBust = true;
              updatedPlayer.bustsCount = (p.bustsCount || 0) + 1;
            } else {
              updatedPlayer.score = newScore;
              updatedPlayer.roundBust = false;
            }

            // Calculer la moyenne
            if (updatedPlayer.throwsCount > 0) {
              updatedPlayer.avg = parseFloat(((updatedPlayer.totalPoints / updatedPlayer.throwsCount) * 3).toFixed(1));
            }

            // Calcul du score du round et stats
            const roundScore = isBust ? 0 : ((p.scoreBeforeRound ?? p.score) - updatedPlayer.score);
            updatedPlayer.roundScores = [...(p.roundScores || []), roundScore];
            updatedPlayer.lastRoundScore = roundScore;
            updatedPlayer.bestRound = Math.max(0, ...(updatedPlayer.roundScores || []));

            return updatedPlayer;
          })
        };

        // Enregistrer l'état intermédiaire
        if (isLocalMode) {
          setLocalRoom(intermediateRoom);
        } else if (roomId) {
          await roomService.updateRoom(roomId, {
            players: intermediateRoom.players,
            activePlayerIndex: intermediateRoom.activePlayerIndex,
            status: intermediateRoom.status,
            winnerName: intermediateRoom.winnerName
          });
        }

        // ÉTAPE 2 : Lancer le timer de 2 secondes pour changer de joueur
        if (turnTransitionTimeoutRef.current) {
          clearTimeout(turnTransitionTimeoutRef.current);
        }
        
        turnTransitionTimeoutRef.current = setTimeout(async () => {
          try {
            // Créer l'état final (passage au joueur suivant)
            const finalRoom: RoomData = {
              ...intermediateRoom,
              players: intermediateRoom.players.map((p, idx) => {
                if (idx === activePlayerIndex) {
                  return {
                    ...p,
                    dartsLeft: 3
                  };
                }
                return p;
              })
            };

            const nextPlayerIndex = (activePlayerIndex + 1) % finalRoom.players.length;
            finalRoom.activePlayerIndex = nextPlayerIndex;

            // Configurer le joueur suivant
            finalRoom.players[nextPlayerIndex] = {
              ...finalRoom.players[nextPlayerIndex],
              scoreBeforeRound: finalRoom.players[nextPlayerIndex].score,
              currentRoundThrows: [],
              roundBust: false
            };

            // Enregistrer l'état final
            if (isLocalMode) {
              setLocalRoom(finalRoom);
            } else if (roomId) {
              await roomService.updateRoom(roomId, {
                players: finalRoom.players,
                activePlayerIndex: finalRoom.activePlayerIndex,
                status: finalRoom.status,
                winnerName: finalRoom.winnerName
              });
            }
          } catch (err) {
            console.error("Erreur lors de la transition de tour :", err);
          } finally {
            setIsSubmitting(false);
          }
        }, 2000);

      } else {
        // Cas standard : le joueur n'a pas fini son tour (1er ou 2ème lancer)
        if (isLocalMode) {
          const nextState = roomService.calculateNextX01State(currentRoom, points, isDouble, label);
          setLocalRoom(nextState);
        } else if (roomId && room) {
          await roomService.recordThrow(roomId, room, points, isDouble, label);
        }
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error(err);
      setError("Erreur lors de la validation du lancer.");
      setIsSubmitting(false);
    }
  };

  // Enregistrer un lancer en mode Cricket
  const handleCricketThrow = async (baseNumber: number) => {
    if (!currentRoom || isSubmitting) return;
    setIsSubmitting(true);

    // Convertir le multiplicateur lettre en chiffre
    const multMap = { 'S': 1, 'D': 2, 'T': 3 } as const;
    const mult = multMap[multiplier];

    try {
      if (isLocalMode) {
        const { updatedRoom } = processCricketThrow(currentRoom, baseNumber, mult);
        setLocalRoom(prev => {
          if (!prev) return null;
          return {
            ...prev,
            ...updatedRoom
          } as RoomData;
        });
      } else if (roomId && room) {
        await roomService.recordCricketThrow(roomId, room, baseNumber, mult);
      }
      setMultiplier('S');
    } catch (err) {
      console.error(err);
      setError("Erreur lors de la validation du lancer Cricket.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Undo Cricket
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
      setError("Erreur lors de l'annulation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Annulation ultra-robuste en direct du dernier coup (gère aussi le retour au joueur précédent si tour fini)
  const handleUndo = async () => {
    if (!currentRoom || isSubmitting) return;

    setIsSubmitting(true);
    const updatedPlayers = [...currentRoom.players];
    
    // Déterminer le joueur à annuler
    let targetPlayerIndex = currentRoom.activePlayerIndex;
    let player = { ...updatedPlayers[targetPlayerIndex] };

    // Si on vient juste de changer de tour et que le joueur actif a ses 3 fléchettes en attente,
    // ou si le statut est fini (la partie s'est arrêtée sur une victoire),
    // l'annulation concerne la dernière fléchette du JOUEUR PRÉCÉDENT (ou du joueur actif si partie finie) !
    let crossedRoundBoundary = false;
    if (player.dartsLeft === 3 && currentRoom.status !== 'finished') {
      // Trouver l'index du joueur précédent
      const prevPlayerIndex = (currentRoom.activePlayerIndex - 1 + currentRoom.players.length) % currentRoom.players.length;
      const prevPlayer = { ...updatedPlayers[prevPlayerIndex] };

      if (prevPlayer.history.length > 0) {
        targetPlayerIndex = prevPlayerIndex;
        player = prevPlayer;
        crossedRoundBoundary = true;
      } else {
        // Personne n'a encore joué de coup
        setIsSubmitting(false);
        return;
      }
    }

    // Copie profonde des tableaux pour éviter les mutations d'état React
    player = {
      ...player,
      history: [...player.history],
      currentRoundThrows: player.currentRoundThrows ? [...player.currentRoundThrows] : [],
      roundScores: player.roundScores ? [...player.roundScores] : []
    };

    // Retirer le dernier coup de l'historique du joueur cible
    const lastThrow = player.history.pop();
    if (lastThrow !== undefined) {
      player.throwsCount = Math.max(0, player.throwsCount - 1);
      player.totalPoints = Math.max(0, player.totalPoints - lastThrow);
      
      // Retirer le dernier libellé du tour
      if (player.currentRoundThrows && player.currentRoundThrows.length > 0) {
        player.currentRoundThrows.pop();
      }
      
      // Réinitialiser le bust lors de la correction
      player.roundBust = false;
      
      // Si on a traversé une limite de tour ou si la partie était finie, 
      // on doit retirer la manche complétée de roundScores
      const shouldPopRound = crossedRoundBoundary || currentRoom.status === 'finished';
      if (shouldPopRound && player.roundScores && player.roundScores.length > 0) {
        player.roundScores.pop();
      }

      // Rétablir ses fléchettes restantes
      // La formule est dartsLeft = 3 - currentRoundThrows.length (après pop)
      const currentRoundThrowsLen = player.currentRoundThrows ? player.currentRoundThrows.length : 0;
      player.dartsLeft = 3 - currentRoundThrowsLen;

      // Calculer le score du joueur
      const targetScore = currentRoom.targetScore;
      const roundScoresList = player.roundScores || [];
      const sumRoundScores = roundScoresList.reduce((sum, val) => sum + val, 0);
      const scoreBeforeRound = targetScore - sumRoundScores;
      
      // Somme des lancers restants dans le tour en cours
      const currentRoundCount = player.currentRoundThrows ? player.currentRoundThrows.length : 0;
      const remainingThrows = player.history.slice(player.history.length - currentRoundCount);
      const sumRemaining = remainingThrows.reduce((sum, val) => sum + val, 0);
      
      player.score = scoreBeforeRound - sumRemaining;
      player.scoreBeforeRound = scoreBeforeRound;

      // Mettre à jour lastRoundScore et bestRound
      if (player.roundScores && player.roundScores.length > 0) {
        player.lastRoundScore = player.roundScores[player.roundScores.length - 1] ?? 0;
        player.bestRound = Math.max(0, ...player.roundScores);
      } else {
        player.lastRoundScore = 0;
        player.bestRound = 0;
      }

      // Recalculer sa moyenne
      if (player.throwsCount > 0) {
        player.avg = parseFloat(((player.totalPoints / player.throwsCount) * 3).toFixed(1));
      } else {
        player.avg = 0;
      }

      updatedPlayers[targetPlayerIndex] = player;

      const updateData: Partial<RoomData> = {
        players: updatedPlayers,
        activePlayerIndex: targetPlayerIndex,
        status: 'playing', // Rétablir le statut en cours au cas où la partie était finie
        winnerName: ''
      };

      try {
        if (isLocalMode) {
          setLocalRoom(prev => {
            if (!prev) return null;
            return {
              ...prev,
              ...updateData
            } as RoomData;
          });
        } else if (roomId) {
          await roomService.updateRoom(roomId, updateData);
        }
      } catch (err) {
        console.error("Erreur lors de l'annulation :", err);
        setError("Erreur lors de l'annulation du lancer.");
      }
    }
    setIsSubmitting(false);
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
      <div className="remote-view-container h-svh max-h-svh overflow-hidden bg-theme-bg text-theme-text-primary transition-all duration-300 flex flex-col justify-between select-none">
        <header className="p-4 bg-black/40 border-b border-theme-border/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                if (setupStep === 'game') {
                  setSetupStep('players');
                } else {
                  setRoomId(null);
                  setRoom(null);
                  setIsLocalMode(false);
                  setLocalRoom(null);
                }
              }} 
              className="p-1.5 rounded-lg bg-black/20 text-theme-text-secondary border border-theme-border/20 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
             <div>
              <h1 className="text-sm font-black tracking-wide">SALON : {currentRoom?.roomId}</h1>
              <p className="text-[9px] text-theme-text-secondary uppercase">
                {setupStep === 'players' ? "Sélection des joueurs" : "Configuration du jeu"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isLocalMode && (
              <button
                onClick={() => setShowProjectionModal(true)}
                title="Synchroniser le Visualisateur"
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] bg-theme-accent/10 border border-theme-accent/30 hover:border-theme-accent hover:bg-theme-accent/20 text-theme-accent font-black rounded-lg transition-all cursor-pointer uppercase tracking-wider"
              >
                <Tv className="w-3.5 h-3.5" />
                <span>Visualisateur</span>
              </button>
            )}
            {/* Bouton ⚙️ Paramètres Projecteur — visible uniquement sur l'écran de sélection du jeu */}
            {setupStep === 'game' && (
              <button
                onClick={() => {
                  setShowProjectorSettingsModal(true);
                  setShowCalibrationPanel(false);
                  updateRoomState({ isCalibrating: false });
                  localStorage.setItem('minou_dart_is_calibrating', 'false');
                }}
                title="Paramètres du projecteur"
                className="p-1.5 bg-zinc-900/80 border border-zinc-700/50 hover:border-theme-accent/60 hover:bg-zinc-800 text-zinc-400 hover:text-theme-accent rounded-lg transition-all cursor-pointer"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
            <span className="text-[10px] bg-theme-accent/20 text-theme-accent font-bold px-2 py-0.5 rounded">
              En Attente
            </span>
          </div>
        </header>

        {error && (
          <div className="bg-red-500/10 border-b border-red-500/30 py-2.5 px-4 text-xs text-red-400 text-center font-medium flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {error}
          </div>
        )}

        {setupStep === 'players' ? (
          /* ── ÉTAPE 1 : SÉLECTION DYNAMIQUE DES JOUEURS ── */
          <>
            <main className="flex-grow p-6 max-w-md mx-auto w-full space-y-6 overflow-y-auto">
              <div className="space-y-4">
                <label className="block text-xs font-bold text-theme-text-secondary uppercase tracking-widest flex items-center gap-2">
                  <Users className="w-4 h-4 text-theme-accent" /> Ajouter un nouveau joueur
                </label>
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Nom du joueur (ex: Rozan)"
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddNewPlayer()}
                    className="flex-grow p-3.5 bg-black/40 border border-theme-border rounded-xl focus:border-theme-accent focus:outline-none font-semibold text-sm"
                  />
                  <select
                    value={selectedEmoji}
                    onChange={(e) => setSelectedEmoji(e.target.value)}
                    className="p-3 bg-black/40 border border-theme-border rounded-xl text-lg focus:border-theme-accent focus:outline-none cursor-pointer"
                  >
                    {AVAILABLE_EMOJIS.map((emoji) => (
                      <option key={emoji} value={emoji} className="bg-zinc-950 text-white">
                        {emoji}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddNewPlayer}
                    className="p-3.5 bg-theme-accent text-black font-extrabold rounded-xl transition-all active:scale-95 cursor-pointer"
                  >
                    <Plus className="w-5 h-5 stroke-[3px]" />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-bold text-theme-text-secondary uppercase tracking-widest">
                  Joueurs enregistrés ({selectedPlayerNames.length} actifs)
                </label>
                
                <div className="space-y-2 pr-1">
                  {(() => {
                    const sortedPlayersList = [...savedPlayers].sort((a, b) => {
                      const aSelected = selectedPlayerNames.includes(a.name);
                      const bSelected = selectedPlayerNames.includes(b.name);
                      if (aSelected && !bSelected) return -1;
                      if (!aSelected && bSelected) return 1;
                      return a.name.localeCompare(b.name);
                    });

                    return sortedPlayersList.map((player) => {
                      const isSelected = selectedPlayerNames.includes(player.name);
                      return (
                        <div
                          key={player.name}
                          onClick={() => handleToggleSelectPlayer(player.name)}
                          className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-theme-accent/15 border-theme-accent shadow-lg'
                              : 'bg-black/20 border-theme-border/20 opacity-70 hover:opacity-100 hover:border-theme-accent/50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                              isSelected ? 'bg-theme-accent border-theme-accent text-black' : 'border-theme-border/40'
                            }`}>
                              {isSelected && <Check className="w-3.5 h-3.5 stroke-[3px]" />}
                            </span>
                            <span className={`font-bold flex items-center gap-2 ${isSelected ? 'text-theme-accent' : 'text-theme-text-primary'}`}>
                              <span>{player.name}</span>
                              <select
                                value={player.emoji || '🎯'}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleUpdatePlayerEmoji(player.name, e.target.value);
                                }}
                                className="text-sm bg-black/40 hover:bg-black/60 border border-theme-border/20 rounded-md p-0.5 px-1 cursor-pointer focus:outline-none"
                              >
                                {AVAILABLE_EMOJIS.map((emoji) => (
                                  <option key={emoji} value={emoji} className="bg-zinc-950 text-white">
                                    {emoji}
                                  </option>
                                ))}
                              </select>
                            </span>
                          </div>
                          
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveSavedPlayer(player.name);
                            }}
                            className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    });
                  })()}
                  {savedPlayers.length === 0 && (
                    <p className="text-xs text-theme-text-secondary italic text-center py-6">
                      Aucun joueur enregistré. Saisissez un nom ci-dessus.
                    </p>
                  )}
                </div>
              </div>
            </main>

            <footer className="p-6 max-w-md mx-auto w-full">
              <button
                onClick={() => setSetupStep('game')}
                disabled={selectedPlayerNames.length === 0}
                className="w-full py-4 bg-theme-accent hover:bg-theme-accent-hover text-black font-black text-sm rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
              >
                CHOISIR LE JEU ({selectedPlayerNames.length} sélectionnés)
              </button>
            </footer>
          </>
        ) : (
          /* ── ÉTAPE 2 : CONFIGURATION DU JEU & OPTIONS ── */
          <>
            <main className="flex-grow p-6 max-w-md mx-auto w-full space-y-6 overflow-y-auto">
              
              {/* Reprendre partie en cours */}
              {savedGameData && (
                <div 
                  className="p-5 rounded-2xl border border-green-500/40 bg-green-500/10 hover:bg-green-500/15 transition-all cursor-pointer shadow-lg animate-fadeIn flex flex-col gap-3 relative overflow-hidden group"
                  onClick={async () => {
                    setIsSubmitting(true);
                    try {
                      if (isLocalMode) {
                        setLocalRoom({
                          ...savedGameData,
                          roomId: 'LOCAL',
                          status: 'playing'
                        });
                      } else if (roomId) {
                        await roomService.updateRoom(roomId, {
                          status: 'playing',
                          gameType: savedGameData.gameType,
                          targetScore: savedGameData.targetScore,
                          doubleOut: savedGameData.doubleOut,
                          cricketScoringMode: savedGameData.cricketScoringMode,
                          cricketVariant: savedGameData.cricketVariant,
                          cricketTargets: savedGameData.cricketTargets,
                          players: savedGameData.players,
                          activePlayerIndex: savedGameData.activePlayerIndex,
                          winnerName: savedGameData.winnerName || '',
                          bartConfig: savedGameData.bartConfig,
                          clockConfig: savedGameData.clockConfig || undefined
                        });
                      }
                      localStorage.removeItem('minou-darts-saved-active-game');
                      setSavedGameData(null);
                    } catch (err) {
                      console.error("Erreur lors de la reprise de la partie :", err);
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                >
                  <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                    <RotateCcw className="w-24 h-24 text-green-500" />
                  </div>
                  <div className="flex items-center justify-between z-10">
                    <h3 className="font-extrabold text-sm uppercase tracking-wider flex items-center gap-2 text-green-400">
                      <RotateCcw className="w-5 h-5 text-green-400" />
                      <span>Reprendre la partie en cours</span>
                    </h3>
                    <span className="text-[9px] bg-green-500 text-black font-black px-2 py-0.5 rounded uppercase tracking-wider animate-pulse">
                      Actif
                    </span>
                  </div>
                  
                  <div className="text-xs text-zinc-300 z-10 space-y-1">
                    <p>Mode : <strong className="text-white capitalize">{
                      savedGameData.gameType === 'x01' ? `X01 (${savedGameData.targetScore})` : 
                      savedGameData.gameType === 'clock' ? "Tour de l'horloge" :
                      savedGameData.gameType
                    }</strong></p>
                    <p>Joueurs : <strong className="text-white">{savedGameData.players.map(p => p.name).join(', ')}</strong></p>
                  </div>
                  <div className="text-[10px] text-green-400/80 font-bold z-10 flex items-center gap-1 mt-1 group-hover:translate-x-1 transition-transform">
                    <span>Cliquez ici pour reprendre la partie</span> &rarr;
                  </div>
                </div>
              )}

              {/* Option 1 : X01 */}
              <div 
                className={`p-5 rounded-2xl border transition-all cursor-pointer ${
                  selectedGameType === 'x01' ? 'border-theme-accent bg-theme-accent/5' : 'border-theme-border/30 bg-black/10 opacity-70 hover:opacity-100'
                }`}
                onClick={() => setSelectedGameType('x01')}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-extrabold text-sm uppercase tracking-wider flex items-center gap-2">
                    <Target className={`w-5 h-5 ${selectedGameType === 'x01' ? 'text-theme-accent' : 'text-theme-text-secondary'}`} />
                    <span>Jeu X01</span>
                  </h3>
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    selectedGameType === 'x01' ? 'border-theme-accent text-theme-accent' : 'border-theme-border/40'
                  }`}>
                    {selectedGameType === 'x01' && <div className="w-2.5 h-2.5 rounded-full bg-theme-accent animate-pulse" />}
                  </span>
                </div>
                
                {selectedGameType === 'x01' && (
                  <div className="space-y-4 pt-3 border-t border-theme-border/25 animate-fadeIn">
                    <div>
                      <label className="text-[10px] text-theme-text-secondary uppercase tracking-wider block mb-2 font-bold">Score de départ</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[101, 201, 301, 401, 501, 601, 701, 1001].map(score => (
                          <button
                            key={score}
                            onClick={(e) => { e.stopPropagation(); setSelectedTargetScore(score); }}
                            className={`py-2 px-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                              selectedTargetScore === score
                                ? 'bg-theme-accent border-theme-accent text-black font-extrabold shadow-sm'
                                : 'bg-black/30 border-theme-border/20 text-theme-text-primary hover:border-theme-accent/40'
                            }`}
                          >
                            {score}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    <div 
                      onClick={(e) => { e.stopPropagation(); setSelectedDoubleOut(!selectedDoubleOut); }}
                      className="flex items-center justify-between bg-black/20 p-3 rounded-xl border border-theme-border/10 cursor-pointer hover:bg-black/40"
                    >
                      <span className="text-xs font-bold text-theme-text-primary">Finition Double Out</span>
                      <button
                        className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                          selectedDoubleOut ? 'bg-theme-accent' : 'bg-black/50 border border-theme-border/30'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full absolute top-1 transition-transform ${
                            selectedDoubleOut ? 'translate-x-6 bg-black' : 'translate-x-1 bg-theme-text-secondary'
                          }`}
                        />
                      </button>
                    </div>

                    <div 
                      onClick={(e) => { e.stopPropagation(); setSelectedRandomOrder(!selectedRandomOrder); }}
                      className="flex items-center justify-between bg-black/20 p-3 rounded-xl border border-theme-border/10 cursor-pointer hover:bg-black/40"
                    >
                      <span className="text-xs font-bold text-theme-text-primary">Ordre de jeu aléatoire</span>
                      <button
                        className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                          selectedRandomOrder ? 'bg-theme-accent' : 'bg-black/50 border border-theme-border/30'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full absolute top-1 transition-transform ${
                            selectedRandomOrder ? 'translate-x-6 bg-black' : 'translate-x-1 bg-theme-text-secondary'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Option 2 : Cricket */}
              <div 
                className={`p-5 rounded-2xl border transition-all cursor-pointer ${
                  selectedGameType === 'cricket' ? 'border-theme-accent bg-theme-accent/5' : 'border-theme-border/30 bg-black/10 opacity-70 hover:opacity-100'
                }`}
                onClick={() => setSelectedGameType('cricket')}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-extrabold text-sm uppercase tracking-wider flex items-center gap-2">
                    <Crosshair className={`w-5 h-5 ${selectedGameType === 'cricket' ? 'text-theme-accent' : 'text-theme-text-secondary'}`} />
                    <span>Jeu Cricket</span>
                  </h3>
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    selectedGameType === 'cricket' ? 'border-theme-accent text-theme-accent' : 'border-theme-border/40'
                  }`}>
                    {selectedGameType === 'cricket' && <div className="w-2.5 h-2.5 rounded-full bg-theme-accent animate-pulse" />}
                  </span>
                </div>
                
                {selectedGameType === 'cricket' && (
                  <div className="space-y-5 pt-3 border-t border-theme-border/25 animate-fadeIn">
                    
                    {/* Règle de Scoring - Slider Premium */}
                    <div className="flex items-center justify-between bg-black/20 p-3 rounded-xl border border-theme-border/10">
                      <span className="text-xs font-bold text-theme-text-primary">Règle de Scoring</span>
                      <div 
                        onClick={(e) => { e.stopPropagation(); setSelectedCricketScoringMode(selectedCricketScoringMode === 'standard' ? 'cutthroat' : 'standard'); }}
                        className="flex items-center bg-black/50 border border-theme-border/30 rounded-lg p-0.5 relative cursor-pointer w-44 select-none"
                      >
                        <div 
                          className={`absolute top-0.5 bottom-0.5 rounded bg-theme-accent transition-all duration-300 w-[84px] ${
                            selectedCricketScoringMode === 'cutthroat' ? 'translate-x-[88px]' : 'translate-x-0.5'
                          }`}
                        />
                        <span className={`flex-1 text-center text-[9px] font-black tracking-wide py-1.5 z-10 transition-colors ${selectedCricketScoringMode === 'standard' ? 'text-black font-extrabold' : 'text-theme-text-secondary hover:text-white'}`}>
                          NORMAL
                        </span>
                        <span className={`flex-1 text-center text-[9px] font-black tracking-wide py-1.5 z-10 transition-colors ${selectedCricketScoringMode === 'cutthroat' ? 'text-black font-extrabold' : 'text-theme-text-secondary hover:text-white'}`}>
                          CUT THROAT
                        </span>
                      </div>
                    </div>
                    
                    {/* Variante de Cibles - Boutons Classique / Crazy */}
                    <div>
                      <label className="text-[10px] text-theme-text-secondary uppercase tracking-wider block mb-2 font-bold">Variante de Cibles</label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedCricketVariant('classic'); }}
                          className={`py-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                            selectedCricketVariant === 'classic'
                              ? 'bg-theme-accent border-theme-accent text-black font-extrabold shadow-sm'
                              : 'bg-black/30 border-theme-border/20 text-theme-text-primary hover:border-theme-accent/40'
                          }`}
                        >
                          <span className="font-extrabold text-[10px] uppercase tracking-wide">Classique</span>
                          <span className="text-[8px] opacity-70">15-20 + Bull</span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedCricketVariant('crazy'); }}
                          className={`py-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                            selectedCricketVariant === 'crazy'
                              ? 'bg-theme-accent border-theme-accent text-black font-extrabold shadow-sm'
                              : 'bg-black/30 border-theme-border/20 text-theme-text-primary hover:border-theme-accent/40'
                          }`}
                        >
                          <span className="font-extrabold text-[10px] uppercase tracking-wide">Crazy</span>
                          <span className="text-[8px] opacity-70">Personnalisable</span>
                        </button>
                      </div>
                    </div>

                    <div 
                      onClick={(e) => { e.stopPropagation(); setSelectedRandomOrder(!selectedRandomOrder); }}
                      className="flex items-center justify-between bg-black/20 p-3 rounded-xl border border-theme-border/10 cursor-pointer hover:bg-black/40"
                    >
                      <span className="text-xs font-bold text-theme-text-primary">Ordre de jeu aléatoire</span>
                      <button
                        className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                          selectedRandomOrder ? 'bg-theme-accent' : 'bg-black/50 border border-theme-border/30'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full absolute top-1 transition-transform ${
                            selectedRandomOrder ? 'translate-x-6 bg-black' : 'translate-x-1 bg-theme-text-secondary'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Options Crazy Personnalisées */}
                    {selectedCricketVariant === 'crazy' && (
                      <div className="space-y-4 p-4 bg-black/20 rounded-2xl border border-theme-border/10 animate-fadeIn">
                        
                        {/* Option 1 : Distribution (Slider horizontal à 3 positions) */}
                        <div className="space-y-2">
                          <label className="text-[9px] text-theme-text-secondary uppercase tracking-wider block font-bold">Distribution des Cibles</label>
                          <div className="flex bg-black/40 border border-theme-border/20 rounded-xl p-0.5 relative w-full overflow-hidden select-none">
                            {/* Curseur coulissant */}
                            <div 
                              className="absolute top-0.5 bottom-0.5 rounded bg-theme-accent transition-all duration-300"
                              style={{
                                width: 'calc(33.333% - 1.5px)',
                                left: selectedCricketDistribution === 'random' 
                                  ? '0.5px' 
                                  : selectedCricketDistribution === 'non_adjacent' 
                                    ? '33.333%' 
                                    : 'calc(66.666% + 0.5px)'
                              }}
                            />
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedCricketDistribution('random'); }}
                              className={`flex-1 py-2 text-center text-[8px] font-black tracking-wider z-10 transition-colors rounded cursor-pointer ${
                                selectedCricketDistribution === 'random' ? 'text-black font-black' : 'text-theme-text-secondary hover:text-white'
                              }`}
                            >
                              100% ALÉATOIRE
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedCricketDistribution('non_adjacent'); }}
                              className={`flex-1 py-2 text-center text-[8px] font-black tracking-wider z-10 transition-colors rounded cursor-pointer ${
                                selectedCricketDistribution === 'non_adjacent' ? 'text-black font-black' : 'text-theme-text-secondary hover:text-white'
                              }`}
                            >
                              NON-ADJACENTS
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedCricketDistribution('adjacent'); }}
                              className={`flex-1 py-2 text-center text-[8px] font-black tracking-wider z-10 transition-colors rounded cursor-pointer ${
                                selectedCricketDistribution === 'adjacent' ? 'text-black font-black' : 'text-theme-text-secondary hover:text-white'
                              }`}
                            >
                              ADJACENTS
                            </button>
                          </div>
                        </div>

                        {/* Option 2 : Bulle (Avec/Sans) */}
                        <div className="flex items-center justify-between bg-black/30 p-2.5 rounded-xl border border-theme-border/5">
                          <span className="text-[10px] font-bold text-theme-text-secondary uppercase tracking-wider">Bulle d'Espace (Bull's Eye)</span>
                          <div 
                            onClick={(e) => { e.stopPropagation(); setSelectedCricketWithBull(!selectedCricketWithBull); }}
                            className="flex items-center bg-black/60 border border-theme-border/20 rounded-lg p-0.5 relative cursor-pointer w-32 select-none"
                          >
                            <div 
                              className={`absolute top-0.5 bottom-0.5 rounded bg-theme-accent transition-all duration-300 w-[60px] ${
                                selectedCricketWithBull ? 'translate-x-0.5' : 'translate-x-[64px]'
                              }`}
                            />
                            <span className={`flex-1 text-center text-[8px] font-black tracking-wide py-1.5 z-10 transition-colors ${selectedCricketWithBull ? 'text-black font-extrabold' : 'text-theme-text-secondary hover:text-white'}`}>
                              AVEC
                            </span>
                            <span className={`flex-1 text-center text-[8px] font-black tracking-wide py-1.5 z-10 transition-colors ${!selectedCricketWithBull ? 'text-black font-extrabold' : 'text-theme-text-secondary hover:text-white'}`}>
                              SANS
                            </span>
                          </div>
                        </div>

                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Option 3 : Bart */}
              <div 
                className={`p-5 rounded-2xl border transition-all cursor-pointer ${
                  selectedGameType === 'bart' ? 'border-theme-accent bg-theme-accent/5' : 'border-theme-border/30 bg-black/10 opacity-70 hover:opacity-100'
                }`}
                onClick={() => setSelectedGameType('bart')}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-extrabold text-sm uppercase tracking-wider flex items-center gap-2">
                    <Tv className={`w-5 h-5 ${selectedGameType === 'bart' ? 'text-theme-accent' : 'text-theme-text-secondary'}`} />
                    <span>Jeu Bart (Tennis)</span>
                  </h3>
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    selectedGameType === 'bart' ? 'border-theme-accent text-theme-accent' : 'border-theme-border/40'
                  }`}>
                    {selectedGameType === 'bart' && <div className="w-2.5 h-2.5 rounded-full bg-theme-accent animate-pulse" />}
                  </span>
                </div>
                
                {selectedGameType === 'bart' && (
                  <div className="space-y-4 pt-3 border-t border-theme-border/25 animate-fadeIn">
                    <div>
                      <label className="text-[10px] text-theme-text-secondary uppercase tracking-wider block mb-2 font-bold">Nombre de sets gagnants</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[1, 2, 3].map(sets => (
                          <button
                            key={sets}
                            onClick={(e) => { e.stopPropagation(); setSelectedBartSets(sets); }}
                            className={`py-2 px-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                              selectedBartSets === sets
                                ? 'bg-theme-accent border-theme-accent text-black font-extrabold shadow-sm'
                                : 'bg-black/30 border-theme-border/20 text-theme-text-primary hover:border-theme-accent/40'
                            }`}
                          >
                            {sets} Set{sets > 1 ? 's' : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="text-[10px] text-theme-text-secondary uppercase tracking-wider block mb-2 font-bold">Mode de saisie des scores</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedBartInputMethod('target'); }}
                          className={`py-2 px-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                            selectedBartInputMethod === 'target'
                              ? 'bg-theme-accent border-theme-accent text-black font-extrabold shadow-sm'
                              : 'bg-black/30 border-theme-border/20 text-theme-text-primary hover:border-theme-accent/40'
                          }`}
                        >
                          Cible Interactive
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedBartInputMethod('keyboard'); }}
                          className={`py-2 px-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                            selectedBartInputMethod === 'keyboard'
                              ? 'bg-theme-accent border-theme-accent text-black font-extrabold shadow-sm'
                              : 'bg-black/30 border-theme-border/20 text-theme-text-primary hover:border-theme-accent/40'
                          }`}
                        >
                          Boutons Clavier
                        </button>
                      </div>
                    </div>
                    {selectedPlayerNames.length !== 2 && (
                      <p className="text-[10px] text-red-400 font-semibold text-center mt-2 bg-red-500/10 rounded-lg p-2 border border-red-500/20">
                        Le mode Bart nécessite exactement 2 joueurs.
                      </p>
                    )}
                  </div>
                )}
              </div>
              
              {/* Option 4 : Tour de l'horloge */}
              <div 
                className={`p-5 rounded-2xl border transition-all cursor-pointer ${
                  selectedGameType === 'clock' ? 'border-theme-accent bg-theme-accent/5' : 'border-theme-border/30 bg-black/10 opacity-70 hover:opacity-100'
                }`}
                onClick={() => setSelectedGameType('clock')}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-extrabold text-sm uppercase tracking-wider flex items-center gap-2">
                    <Clock className={`w-5 h-5 ${selectedGameType === 'clock' ? 'text-theme-accent' : 'text-theme-text-secondary'}`} />
                    <span>Tour de l'horloge</span>
                  </h3>
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    selectedGameType === 'clock' ? 'border-theme-accent text-theme-accent' : 'border-theme-border/40'
                  }`}>
                    {selectedGameType === 'clock' && <div className="w-2.5 h-2.5 rounded-full bg-theme-accent animate-pulse" />}
                  </span>
                </div>
                
                {selectedGameType === 'clock' && (
                  <div className="space-y-4 pt-3 border-t border-theme-border/25 animate-fadeIn">
                    <div className="flex items-center justify-between bg-black/20 p-3 rounded-xl border border-theme-border/10">
                      <span className="text-xs font-bold text-theme-text-primary">Inclure la bulle (25)</span>
                      <div 
                        onClick={(e) => { e.stopPropagation(); setSelectedClockIncludeBull(!selectedClockIncludeBull); }}
                        className="flex items-center bg-black/50 border border-theme-border/30 rounded-lg p-0.5 relative cursor-pointer w-32 select-none"
                      >
                        <div 
                          className={`absolute top-0.5 bottom-0.5 rounded bg-theme-accent transition-all duration-300 w-[60px] ${
                            selectedClockIncludeBull ? 'translate-x-0.5' : 'translate-x-[64px]'
                          }`}
                        />
                        <span className={`flex-1 text-center text-[8px] font-black tracking-wide py-1.5 z-10 transition-colors ${selectedClockIncludeBull ? 'text-black font-extrabold' : 'text-theme-text-secondary hover:text-white'}`}>
                          AVEC
                        </span>
                        <span className={`flex-1 text-center text-[8px] font-black tracking-wide py-1.5 z-10 transition-colors ${!selectedClockIncludeBull ? 'text-black font-extrabold' : 'text-theme-text-secondary hover:text-white'}`}>
                          SANS
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </main>

            <footer className="p-6 max-w-md mx-auto w-full">
              <button
                onClick={handleStartGame}
                disabled={isSubmitting}
                className="w-full py-4 bg-theme-accent hover:bg-theme-accent-hover text-black font-black text-sm rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
              >
                <Play className="w-5 h-5 fill-current" /> ALLUMER LA CIBLE & COMMENCER
              </button>
            </footer>
          </>
        )}
        {renderProjectionModal()}
        {renderProjectorSettingsModal()}
      </div>
    );
  }

  // --- RENDU 3 : PARTIE TERMINÉE (FIN) ---
  if (currentRoom?.status === 'finished') {
    const isRoomCricket = currentRoom.gameType === 'cricket';
    
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
            Le vainqueur de ce salon est :
          </p>
          <span className="text-2xl font-black text-theme-accent tracking-widest mb-5 uppercase">
            {currentRoom.winnerName}
          </span>

          {/* Tableau Récapitulatif des Statistiques */}
          {isRoomCricket ? (
            <div className="w-full bg-black/45 border border-theme-border/20 rounded-2xl p-3 mb-4">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2 text-center">Statistiques Finales</h3>
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
                          {p.accuracy !== undefined ? `${p.accuracy.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}%` : '-'}
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
                  setIsSubmitting(true);
                  try {
                    const { undoBartAction } = await import('../services/bartEngine');
                    const updatedRoom = undoBartAction(currentRoom);
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
                onClick={handleCricketUndo}
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
                  winnerName: ''
                });
              }}
              className="w-full py-3.5 bg-theme-accent hover:bg-theme-accent-hover text-black font-black text-xs rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              <RotateCcw className="w-4 h-4 stroke-[3]" /> CONFIGURER NOUVEAU MATCH
            </button>

            <button
              onClick={() => {
                setRoomId(null);
                setRoom(null);
                window.location.hash = '#/remote';
              }}
              className="w-full py-3.5 bg-black/40 border border-theme-border text-theme-text-primary font-bold text-xs rounded-xl transition-all hover:bg-black/60 cursor-pointer"
            >
              QUITTER LE SALON
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDU 4 : EN COURS DE JEU ---
  const isCricket = currentRoom?.gameType === 'cricket';
  const cricketTargets = currentRoom?.cricketTargets || [];

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
    const renderCricketMarkSymbol = (marks: number) => {
      if (marks === 0) return null;
      if (marks === 1) {
        return (
          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
            <line x1="6" y1="18" x2="18" y2="6" />
          </svg>
        );
      }
      if (marks === 2) {
        return (
          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        );
      }
      return (
        <svg className="w-6 h-6 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <line x1="8.5" y1="8.5" x2="15.5" y2="15.5" />
          <line x1="15.5" y1="8.5" x2="8.5" y2="15.5" />
        </svg>
      );
    };

    return (
      <div className="remote-view-container h-svh bg-black text-white flex flex-col relative overflow-hidden select-none font-sans">
        
        {/* En-tête Cricket avec retour vert et boutons utilitaires verts */}
        <header className="p-3 bg-black flex items-center justify-between border-b border-zinc-800 z-10">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowExitModal(true)} 
              className="text-[#22c55e] hover:text-[#4ade80] transition-colors cursor-pointer focus:outline-none"
            >
              <ArrowLeft className="w-6 h-6 stroke-[2.5]" />
            </button>
            <h1 className="text-xl font-bold tracking-tight text-white">Cricket</h1>
          </div>
          
          <div className="flex items-center gap-4 text-[#22c55e]">
            {!isLocalMode && (
              <button
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#22c55e]/10 border border-[#22c55e]/30 hover:border-[#22c55e] hover:bg-[#22c55e]/20 transition-all cursor-pointer"
                title="Synchroniser le Visualisateur"
                onClick={() => setShowProjectionModal(true)}
              >
                <Tv className="w-4 h-4 stroke-[2.5] text-[#22c55e]" />
                <span className="text-[9px] font-black text-[#22c55e] uppercase tracking-wider">Sync</span>
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
              className="p-1.5 bg-zinc-900/80 border border-zinc-700/50 hover:border-[#22c55e]/60 hover:bg-zinc-800 text-zinc-500 hover:text-[#22c55e] rounded-lg transition-all cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {error && (
          <div className="bg-red-500/10 border-b border-red-500/30 py-2.5 px-4 text-xs text-red-400 text-center font-medium flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {error}
          </div>
        )}

        {/* Bandeau de description du mode de jeu */}
        <div className="bg-[#121212] py-2 px-4 border-b border-zinc-900 text-xs text-zinc-400 font-medium tracking-wide">
          {currentRoom?.cricketScoringMode === 'cutthroat' ? 'Points Off (Cut Throat)' : 'Points On'}, Normal, First to 1 Set 1 Leg
        </div>

        {/* Table comparative du Cricket avec défilement des colonnes joueurs */}
        <div className="flex-1 overflow-hidden bg-black p-1 flex flex-col min-h-0">
          <div className="w-full flex-1 overflow-auto relative min-h-0">
            <table className="w-full h-full border-collapse table-fixed select-none min-w-[320px]">
              <thead>
                <tr className="bg-zinc-950">
                  {/* Case vide en haut à gauche - collée - élargie */}
                  <th className="sticky left-0 z-20 bg-zinc-950 w-32 min-w-[120px] h-10 border-b border-zinc-800"></th>
                  {players.map((p, idx) => {
                    const isActive = idx === activePlayerIndex;
                    return (
                      <th key={p.name} className="p-1 text-center border-b border-zinc-800 min-w-[72px] h-10 relative align-bottom">
                        <div className="text-zinc-400 text-xs font-semibold truncate capitalize">{p.name}</div>
                        <div className="text-white text-base font-extrabold tracking-tight leading-tight">{p.score}</div>
                        {/* Ligne d'activation verte sous le joueur actif */}
                        <div className={`absolute bottom-0 left-0 right-0 h-[3px] transition-all duration-300 ${
                          isActive ? 'bg-[#22c55e]' : 'bg-transparent'
                        }`} />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {cricketTargets.map((target) => {
                  const isBull = target === 25;
                  const targetLabel = isBull ? 'Bull' : String(target);
                  const isTripleBullForbidden = isBull && multiplier === 'T';
                  // Vérifier si tous les joueurs ont fermé cette cible
                  const allClosed = players.every(p => (p.cricketMarks?.[String(target)] || 0) >= 3);
                  
                  // Style et couleur dynamiques en fonction du multiplicateur (User global : Sales orientation, premium look)
                  const targetBgClass = allClosed
                    ? 'bg-green-950/60 text-green-800 border border-green-900/50 cursor-not-allowed'
                    : isTripleBullForbidden
                      ? 'bg-zinc-900 text-zinc-650 opacity-20 cursor-not-allowed border border-zinc-800'
                      : multiplier === 'D'
                        ? 'bg-yellow-500 text-black hover:bg-yellow-400 shadow-sm shadow-yellow-600/25'
                        : multiplier === 'T'
                          ? 'bg-red-600 text-white hover:bg-red-500 shadow-sm shadow-red-600/25'
                          : isBull
                            ? 'bg-[#e53e3e] text-white hover:bg-[#c53030] shadow-sm shadow-red-600/25'
                            : 'bg-[#48bb78] text-white hover:bg-[#388e3c] shadow-sm shadow-green-600/25';

                  return (
                    <tr 
                      key={target} 
                      className={`border-b transition-all duration-500 ${
                        allClosed 
                          ? 'border-green-900/40 bg-green-950/20 opacity-60' 
                          : 'border-zinc-900'
                      }`}
                    >
                      {/* Cibles fixes collées à gauche (cliquables directement) - Agrandies pour la vision */}
                      <td className={`sticky left-0 z-10 p-1 text-center border-r border-zinc-900/50 w-32 min-w-[120px] ${allClosed ? 'bg-green-950/80' : 'bg-zinc-950'}`}>
                        <button
                          onClick={() => handleCricketThrow(target)}
                          disabled={isSubmitting || allClosed || isTripleBullForbidden}
                          className={`w-full py-2 px-1 rounded-xl font-black text-lg text-center cursor-pointer transition-all active:scale-95 disabled:opacity-50 relative overflow-hidden ${targetBgClass}`}
                        >
                          {targetLabel}
                          {allClosed && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="w-full h-[2px] bg-green-600/60 rotate-[-20deg] rounded-full" />
                            </div>
                          )}
                        </button>
                      </td>
                      {/* Cellules des joueurs */}
                      {players.map((player) => {
                        const marks = player.cricketMarks?.[String(target)] || 0;
                        return (
                          <td key={player.name} className={`p-1 text-center align-middle border-r border-zinc-900/30 ${allClosed ? 'bg-green-950/10' : 'bg-black'}`}>
                            <div className="flex justify-center items-center h-7">
                              {renderCricketMarkSymbol(marks)}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                
                {/* Ligne des lancers joués */}
                <tr className="bg-zinc-950/20">
                  {/* Bouton Loupé dans la cellule sticky gauche, couvre les 3 lignes de stats */}
                  <td rowSpan={3} className="sticky left-0 z-10 bg-zinc-950 p-1 border-r border-zinc-900/50 align-middle">
                    <button
                      onClick={() => handleCricketThrow(0)}
                      disabled={isSubmitting}
                      className="w-full h-full min-h-[56px] bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-white border-2 border-red-500 font-extrabold rounded-lg text-2xl transition-all cursor-pointer disabled:opacity-40 select-none touch-manipulation flex items-center justify-center"
                    >
                      0
                    </button>
                  </td>
                  {players.map((player) => (
                    <td key={player.name} className="p-1 py-1 text-center border-r border-zinc-900/30">
                      <div className="flex items-center justify-center gap-1 text-[10px] text-zinc-400 font-bold">
                        <svg className="w-3 h-3 text-zinc-500 transform rotate-45" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <line x1="2" y1="22" x2="22" y2="2" strokeLinecap="round" />
                          <polygon points="22,2 17,2 17,7" fill="currentColor" />
                          <line x1="12" y1="12" x2="6" y2="18" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                        <span>{player.throwsCount}</span>
                      </div>
                    </td>
                  ))}
                </tr>

                {/* Ligne MPR */}
                <tr className="bg-zinc-950/20">
                  {players.map((player) => (
                    <td key={player.name} className="p-1 py-1 text-center text-[10px] text-zinc-400 font-bold whitespace-nowrap border-r border-zinc-900/30">
                      MPR: {player.avg.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  ))}
                </tr>

                {/* Ligne des lancers du tour courant */}
                <tr className="bg-zinc-950/20">
                  {players.map((player) => {
                    const roundThrows = player.currentRoundThrows || [];
                    return (
                      <td key={player.name} className="p-1 py-1 border-r border-zinc-900/30 align-middle">
                        <div className="flex gap-1 justify-center">
                          {[0, 1, 2].map((i) => {
                            const throwLabel = roundThrows[i] || '';
                            const displayLabel = throwLabel === '0' ? 'Loupé' : throwLabel;
                            return (
                              <div key={i} className={`w-8 h-6 rounded border flex items-center justify-center font-black ${
                                throwLabel 
                                  ? throwLabel === '0'
                                    ? 'border-zinc-800/80 bg-zinc-900/40 text-zinc-500 text-[6.5px]'
                                    : 'border-zinc-700 bg-zinc-900 text-white text-[9px] shadow-sm' 
                                  : 'border-zinc-800/80 bg-zinc-950/40 text-transparent text-[9px]'
                              }`}>
                                {displayLabel}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Pavé de saisie Cricket unifié */}
        <div
          className="bg-[#121212] p-2 border-t border-zinc-900 flex flex-col gap-1.5 relative"
          style={{ paddingBottom: 'max(1.75rem, env(safe-area-inset-bottom))' }}
        >
          {/* Overlay de soumission */}
          {isSubmitting && (
            <div className="absolute inset-0 z-20 bg-black/40 flex items-center justify-center rounded-t-xl">
              <div className="w-6 h-6 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Ligne 1 : Multiplicateurs (DOUBLE, TRIPLE) à largeur égale - PLACÉE EN HAUT ET DOUBLEMENT HAUTE */}
          <div className="grid grid-cols-2 gap-1.5 max-w-lg mx-auto w-full px-1">
            <button
              onClick={() => setMultiplier(multiplier === 'D' ? 'S' : 'D')}
              className={`text-black font-extrabold py-4 rounded-xl text-xs sm:text-sm tracking-wider transition-all cursor-pointer select-none touch-manipulation uppercase ${
                multiplier === 'D' 
                  ? 'bg-yellow-400 ring-2 ring-white scale-95 shadow-[0_0_12px_rgba(250,204,21,0.5)]' 
                  : 'bg-yellow-500 hover:bg-yellow-400'
              }`}
            >
              DOUBLE
            </button>

            <button
              onClick={() => setMultiplier(multiplier === 'T' ? 'S' : 'T')}
              className={`text-white font-extrabold py-4 rounded-xl text-xs sm:text-sm tracking-wider transition-all cursor-pointer select-none touch-manipulation uppercase ${
                multiplier === 'T' 
                  ? 'bg-orange-600 ring-2 ring-white scale-95 shadow-[0_0_12px_rgba(234,88,12,0.5)]' 
                  : 'bg-orange-700 hover:bg-orange-600'
              }`}
            >
              TRIPLE
            </button>
          </div>

          {/* Ligne 2 : Actions (Loupé, Retour) - HAUTEUR ACCRUE */}
          <div className="grid grid-cols-7 gap-1.5 max-w-lg mx-auto w-full px-1">
            {/* Bouton Loupé (grand bandeau) avec liseré rouge */}
            <button
              onClick={() => handleCricketThrow(0)}
              disabled={isSubmitting}
              className="col-span-5 bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-white border-2 border-red-500 font-extrabold py-3.5 rounded-xl text-2xl transition-all cursor-pointer disabled:opacity-40 select-none touch-manipulation flex items-center justify-center"
            >
              0
            </button>
            
            {/* Bouton Retour (Correction) */}
            <button
              onClick={handleCricketUndo}
              disabled={isSubmitting}
              className="col-span-2 bg-[#dc2626] hover:bg-red-500 active:scale-95 text-white font-extrabold py-3.5 rounded-xl text-sm flex items-center justify-center transition-all cursor-pointer disabled:opacity-40 select-none touch-manipulation gap-1.5"
              title="Corriger le dernier lancer"
            >
              <ArrowLeft className="w-4 h-4 stroke-[3.5]" />
              Retour
            </button>
          </div>

          {/* Ligne 3 : Cibles du Cricket dynamiques par rapport aux jeux sélectionnés et bulles agrandies */}
          <div 
            className="grid gap-1.5 max-w-lg mx-auto w-full"
            style={{ gridTemplateColumns: `repeat(${cricketTargets.length || 7}, minmax(0, 1fr))` }}
          >
            {cricketTargets.map((target) => {
              const isBull = target === 25;
              const targetLabel = isBull ? '25' : String(target);
              const isTripleBullForbidden = isBull && multiplier === 'T';
              
              // Couleur dynamique pour les touches rapides en bas (Sales orientation, premium look)
              const quickBgClass = isTripleBullForbidden
                ? 'bg-zinc-900 text-zinc-650 opacity-20 cursor-not-allowed border border-zinc-800'
                : multiplier === 'D'
                  ? 'bg-yellow-500 text-black hover:bg-yellow-400 shadow-md shadow-yellow-900/20'
                  : multiplier === 'T'
                    ? 'bg-red-600 text-white hover:bg-red-500 shadow-md shadow-red-900/20'
                    : isBull
                      ? 'bg-red-600 hover:bg-red-500 text-white disabled:opacity-40 shadow-red-900/20'
                      : 'bg-[#2a2a2a] hover:bg-zinc-700 active:scale-95 text-white disabled:opacity-40 shadow-black/30';

              return (
                <button
                  key={target}
                  onClick={() => handleCricketThrow(target)}
                  disabled={isSubmitting || isTripleBullForbidden}
                  className={`font-black py-4.5 rounded-2xl text-xl sm:text-2xl transition-all cursor-pointer select-none touch-manipulation shadow-md ${quickBgClass}`}
                >
                  {targetLabel}
                </button>
              );
            })}
          </div>

        </div>

        {/* Pied de page informatif très discret */}
        <footer className="py-1 bg-black text-center text-[7px] text-zinc-600 border-t border-zinc-950">
          <span>Minou Darts &bull; {isLocalMode ? 'Mode Local' : 'En Ligne'} &bull; Salon {currentRoom?.roomId}</span>
        </footer>

        {renderProjectionModal()}
        {renderExitModal()}
        {renderProjectorSettingsModal()}
      </div>
    );
  }

  // --- Fonction utilitaire : badge de lancer en cours ---
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

  // --- RENDU X01 (Inspiré de la capture d'écran - très similaire, premium) ---
  return (
    <div className="remote-view-container h-svh bg-black text-white flex flex-col justify-between relative overflow-hidden select-none font-sans">
      
      {/* En-tête X01 avec retour vert et boutons utilitaires verts */}
      <header className="p-3 bg-black flex items-center justify-between border-b border-zinc-800 z-10">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowExitModal(true)} 
            className="text-[#22c55e] hover:text-[#4ade80] transition-colors cursor-pointer focus:outline-none"
          >
            <ArrowLeft className="w-6 h-6 stroke-[2.5]" />
          </button>
          <h1 className="text-xl font-bold tracking-tight text-white">X01</h1>
        </div>
        
        <div className="flex items-center gap-4 text-[#22c55e]">
          {!isLocalMode && (
            <button
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#22c55e]/10 border border-[#22c55e]/30 hover:border-[#22c55e] hover:bg-[#22c55e]/20 transition-all cursor-pointer"
              title="Synchroniser le Visualisateur"
              onClick={() => setShowProjectionModal(true)}
            >
              <Tv className="w-4 h-4 stroke-[2.5] text-[#22c55e]" />
              <span className="text-[9px] font-black text-[#22c55e] uppercase tracking-wider">Sync</span>
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
            className="p-1.5 bg-zinc-900/80 border border-zinc-700/50 hover:border-[#22c55e]/60 hover:bg-zinc-800 text-zinc-500 hover:text-[#22c55e] rounded-lg transition-all cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-red-500/10 border-b border-red-500/30 py-2.5 px-4 text-xs text-red-400 text-center font-medium flex items-center justify-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          {error}
        </div>
      )}

      {/* Bandeau de description du mode de jeu (ex: 301, Double Out...) avec le salon intégré */}
      <div className="bg-[#121212] py-1.5 px-4 border-b border-zinc-900 text-xs text-zinc-400 font-medium tracking-wide flex justify-between items-center">
        <span>{currentRoom?.targetScore}, {currentRoom?.doubleOut ? 'Double Out' : 'Normal'}, First to 1 Set 1 Leg</span>
        <span className="text-[10px] text-zinc-500 font-bold bg-zinc-900/60 px-2 py-0.5 rounded border border-zinc-850/50">Salon {currentRoom?.roomId}</span>
      </div>

      {/* Liste des joueurs adaptative (grille ou flex) - avec min-h-0 pour forcer le rétrécissement flexbox */}
      <div 
        ref={playerListRef}
        className={`flex-grow overflow-y-auto min-h-0 p-3 bg-black ${
          players.length >= 2
            ? 'grid grid-cols-2 gap-2 content-start'
            : 'flex flex-col space-y-3'
        }`}
      >
        {players.map((player, idx) => {
          const isActive = activePlayerIndex === idx;
          const numPlayers = players.length;
          const isLastOddPlayer = (numPlayers % 2 !== 0) && (idx === numPlayers - 1);
          
          // Extraire les lancers du joueur pour les 3 cases du tour
          const roundThrows = player.currentRoundThrows || [];
          const dart1 = roundThrows[0] || '';
          const dart2 = roundThrows[1] || '';
          const dart3 = roundThrows[2] || '';
          
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

          const isGrid = numPlayers >= 2;
          const scoreSizeClass = isGrid 
            ? 'text-3xl sm:text-4xl font-black' 
            : 'text-5xl sm:text-6xl font-black';
          const nameSizeClass = isGrid
            ? 'text-xs font-extrabold'
            : 'text-sm sm:text-base font-extrabold';
          const cardPaddingClass = isGrid
            ? 'p-2 rounded-xl'
            : 'p-3 rounded-2xl';

          // --- RENDU PLEINE LARGEUR (1 JOUEUR) ---
          if (!isGrid) {
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
                {/* Ligne 1 : Nom, Tour (badge + 3 cases fléchettes), et Score géant */}
                <div className="flex items-center justify-between gap-4">
                  {/* Nom & Statut (gauche) */}
                  <div className="flex flex-col justify-center min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`${nameSizeClass} font-extrabold tracking-wide uppercase truncate flex items-center gap-1.5 ${
                        isActive ? 'text-[#22c55e]' : 'text-zinc-300'
                      }`}>
                        <span>{player.name}</span>
                        <span>{player.emoji || '🎯'}</span>
                      </span>
                      {isActive && (
                        <span className="flex-shrink-0 flex items-center justify-center w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
                      )}
                      {player.roundBust && (
                        <span className="flex-shrink-0 text-[8px] bg-red-600/95 text-white font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">
                          Bust
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-500 font-semibold mt-0.5 truncate">
                      {isActive ? `En cours — ${player.dartsLeft} fléchette(s)` : 'En attente'}
                    </span>
                  </div>

                  {/* Volée en cours : Les 4 carrés (centre) */}
                  <div className="flex items-center gap-2 px-1">
                    {player.roundBust ? (
                      <span className="text-xs text-red-500 font-black tracking-widest animate-pulse">
                        BUST ❌
                      </span>
                    ) : (
                      <>
                        {(roundSum > 0 || roundThrows.length > 0) ? (
                          <span className="text-xs bg-zinc-900 text-[#22c55e] border border-zinc-850/80 font-black px-2 py-0.5 rounded-md">
                            {roundSum} pts
                          </span>
                        ) : (
                          <span className="text-[10px] text-zinc-650 font-bold uppercase tracking-wider">Tour : Aucun</span>
                        )}

                        <div className="flex gap-1">
                          {[dart1, dart2, dart3].map((dart, dIdx) => {
                            const isBustDart = player.roundBust && dart && dIdx === roundThrows.length - 1;
                            return (
                              <div 
                                key={dIdx} 
                                className={`w-8 h-6.5 rounded-md border flex items-center justify-center text-[9px] font-black transition-all duration-300 ${
                                  isBustDart
                                    ? 'border-red-500/60 bg-red-950/20 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.3)]'
                                    : dart 
                                      ? 'border-zinc-700 text-white bg-zinc-900' 
                                      : 'border-zinc-900 text-transparent bg-black/40'
                                }`}
                              >
                                {dart}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Score restant géant (droite) */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`tracking-tighter leading-none ${
                      player.roundBust 
                        ? 'text-red-400/90' 
                        : isActive 
                          ? 'text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.15)]' 
                          : 'text-zinc-400'
                    } ${scoreSizeClass}`}>
                      {player.score}
                    </span>
                  </div>
                </div>

                {/* Ligne 2 : Statistiques en 1 ligne horizontale de 4 colonnes ultra-compacte */}
                <div className="flex justify-between items-center text-[9px] text-zinc-400 mt-2 pt-2 border-t border-zinc-900/40 px-1 font-bold">
                  <span>Moyenne: <strong className="text-white font-extrabold">{formattedAvg}</strong></span>
                  <span>Dernier: <strong className="text-[#22c55e] font-extrabold">{player.lastRoundScore !== undefined && player.lastRoundScore > 0 ? player.lastRoundScore : '-'}</strong></span>
                  <span>Meilleur: <strong className="text-yellow-500 font-extrabold">{player.bestRound !== undefined && player.bestRound > 0 ? player.bestRound : '-'}</strong></span>
                  <span>Lancers: <strong className="text-zinc-300 font-extrabold">{player.throwsCount}</strong></span>
                </div>
              </div>
            );
          }

          // --- RENDU EN GRILLE (2 JOUEURS ET PLUS) ---
          return (
            <div 
              key={player.name} 
              data-active-player={isActive ? "true" : "false"}
              className={`relative flex flex-col transition-all border ${
                players.length >= 4 ? 'p-1.5 rounded-lg' : cardPaddingClass
              } ${
                isActive 
                  ? 'active-player-card bg-zinc-900/95 border-[#22c55e] shadow-[0_0_12px_rgba(34,197,94,0.15)] ring-1 ring-[#22c55e]/25' 
                  : player.roundBust
                    ? 'bg-[#1a0f0f] border-red-500/30 opacity-90'
                    : 'bg-zinc-950 border-zinc-900/60 opacity-80'
              } ${isLastOddPlayer ? 'col-span-2' : ''}`}
            >
              {/* Ligne 1 : Nom et Score restant */}
              <div className="flex items-center justify-between gap-2">
                {/* Nom & Statut (gauche) */}
                <div className="flex flex-col justify-center min-w-0 flex-1 pr-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`${nameSizeClass} font-extrabold tracking-wide uppercase truncate flex items-center gap-1 ${
                      isActive ? 'text-[#22c55e]' : 'text-zinc-300'
                    }`}>
                      <span>{player.name}</span>
                      <span>{player.emoji || '🎯'}</span>
                    </span>
                    {isActive && (
                      <span className="flex-shrink-0 flex items-center justify-center w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
                    )}
                    {player.roundBust && (
                      <span className="flex-shrink-0 text-[7px] bg-red-600/95 text-white font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">
                        Bust
                      </span>
                    )}
                  </div>
                  <span className="text-[8px] text-zinc-500 font-semibold mt-0.5 truncate">
                    {isActive ? `${player.dartsLeft} fléchettes` : 'En attente'}
                  </span>
                </div>

                {/* Score (droite) */}
                <div className="flex items-center flex-shrink-0">
                  <span className={`tracking-tighter leading-none ${
                    player.roundBust 
                      ? 'text-red-400/90' 
                      : isActive 
                        ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.15)]' 
                        : 'text-zinc-400'
                  } ${scoreSizeClass}`}>
                    {player.score}
                  </span>
                </div>
              </div>

              {/* Ligne 2 : Volée en cours (score du tour + 3 cases) - Masquée si inactif ET >= 4 joueurs ET aucun lancer ni bust */}
              {(isActive || players.length < 4 || roundSum > 0 || roundThrows.length > 0 || player.roundBust) && (
                <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-zinc-900/40">
                  <div className="flex items-center gap-1">
                    {player.roundBust ? (
                      <span className="text-[8px] text-red-500 font-black tracking-widest animate-pulse">
                        BUST ❌
                      </span>
                    ) : (
                      (roundSum > 0 || roundThrows.length > 0) ? (
                        <span className="text-[9px] bg-zinc-900 text-[#22c55e] border border-zinc-850/80 font-black px-1.5 py-0.5 rounded-md">
                          {roundSum} pts
                        </span>
                      ) : (
                        <span className="text-[8px] text-zinc-650 font-bold uppercase tracking-wider">Tour: Aucun</span>
                      )
                    )}
                  </div>

                  <div className="flex gap-0.5">
                    {[dart1, dart2, dart3].map((dart, dIdx) => {
                      const isBustDart = player.roundBust && dart && dIdx === roundThrows.length - 1;
                      return (
                        <div 
                          key={dIdx} 
                          className={`w-7 h-5.5 rounded border flex items-center justify-center text-[8px] font-black transition-all duration-300 ${
                            isBustDart
                              ? 'border-red-500/60 bg-red-950/20 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.3)]'
                              : dart 
                                ? 'border-zinc-700 text-white bg-zinc-900' 
                                : 'border-zinc-900 text-transparent bg-black/40'
                          }`}
                        >
                          {dart}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Ligne 3 : Statistiques en 1 ligne horizontale ultra-compacte - Masquée si inactif ET >= 4 joueurs */}
              {(isActive || players.length < 4) && (
                <div className="flex justify-between items-center text-[7.5px] text-zinc-400 mt-1 pt-1 border-t border-zinc-900/40 px-0.5 font-bold">
                  <span>Moy: {formattedAvg}</span>
                  <span>Dernier: {player.lastRoundScore !== undefined && player.lastRoundScore > 0 ? player.lastRoundScore : '-'}</span>
                  <span>Lancers: {player.throwsCount}</span>
                </div>
              )}
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

        {/* === HEADER UNIFIÉ : Finition + Sélecteur compact === */}
        <div className="w-full max-w-lg mx-auto flex items-center justify-between gap-2 mb-0.5">

          {/* Suggestion de finition X01 (à gauche, si disponible) */}
          {currentRoom?.gameType === 'x01' && (() => {
            const activePlayer = players[activePlayerIndex];
            if (!activePlayer || activePlayer.score > 180 || activePlayer.score <= 1) return (
              <div className="flex-1" />
            );
            const suggestion = getCheckoutSuggestion(activePlayer.score, !!currentRoom.doubleOut);
            if (!suggestion || suggestion.length === 0) return (
              <div className="flex-1" />
            );

            const renderCheckoutDartBadge = (dart: string) => {
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
              return (
                <span key={dart} className={`px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-wider ${bgClass}`}>
                  {display}
                </span>
              );
            };

            return (
              <div className="flex-1 px-2 py-1.5 bg-black/40 border border-zinc-800/70 rounded-xl backdrop-blur-sm flex items-center gap-1.5 overflow-hidden">
                <Target className="w-3 h-3 text-[#22c55e] flex-shrink-0" />
                <span className="text-[9px] text-zinc-400 font-extrabold tracking-wider uppercase flex-shrink-0">Finition :</span>
                <div className="flex items-center gap-1 overflow-hidden">
                  {suggestion.map((dart, idx) => (
                    <React.Fragment key={idx}>
                      {idx > 0 && <span className="text-zinc-600 text-[9px] font-black flex-shrink-0">›</span>}
                      {renderCheckoutDartBadge(dart)}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Sélecteur compact de clavier (icône capsule, à droite) */}
          <div className="flex-shrink-0 bg-black/50 p-0.5 rounded-xl border border-zinc-800/80 flex gap-0.5 shadow-inner">
            <button
              onClick={() => handleX01InputMethodChange('keyboard')}
              title="Saisie par chiffres"
              className={`p-2 rounded-lg transition-all flex items-center justify-center cursor-pointer select-none touch-manipulation ${
                x01InputMethod === 'keyboard'
                  ? 'bg-[#22c55e] text-black shadow'
                  : 'text-zinc-500 hover:text-white'
              }`}
            >
              <Smartphone className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleX01InputMethodChange('target')}
              title="Saisie par cible"
              className={`p-2 rounded-lg transition-all flex items-center justify-center cursor-pointer select-none touch-manipulation ${
                x01InputMethod === 'target'
                  ? 'bg-[#22c55e] text-black shadow'
                  : 'text-zinc-500 hover:text-white'
              }`}
            >
              <Target className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* === FLÉCHETTES EN COURS (3 badges) === */}
        {currentRoom?.gameType === 'x01' && (() => {
          const activePlayer = players[activePlayerIndex];
          if (!activePlayer) return null;
          const throws = activePlayer.currentRoundThrows || [];
          const dartCount = 3 - (activePlayer.dartsLeft ?? 3);

          return (
            <div className="w-full max-w-lg mx-auto flex items-center justify-center gap-2 py-1">
              {[0, 1, 2].map((i) => {
                const dartLabel = throws[i] ?? '';
                const isActive = i === dartCount;
                return (
                  <div key={i} className="flex-1">
                    {renderLargeThrowBadge(dartLabel, i, isActive)}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* === LIGNE D'ACTIONS UNIFIÉE (Loupé + Retour) === */}
        <div className="grid grid-cols-7 gap-1.5 w-full max-w-lg mx-auto px-1">
          <button
            onClick={() => handleThrowDirect(0)}
            disabled={isSubmitting}
            className="col-span-5 bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-white border-2 border-red-500 font-extrabold py-2.5 rounded-xl text-sm transition-all cursor-pointer disabled:opacity-40 select-none touch-manipulation uppercase tracking-wider flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4 text-red-500 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Loupé
          </button>
          <button
            onClick={handleUndo}
            disabled={isSubmitting}
            className="col-span-2 bg-[#dc2626] hover:bg-red-500 active:scale-95 text-white font-extrabold py-2.5 rounded-xl text-sm flex items-center justify-center transition-all cursor-pointer disabled:opacity-40 select-none touch-manipulation gap-1.5"
            title="Corriger le dernier lancer"
          >
            <ArrowLeft className="w-4 h-4 stroke-[3.5]" />
            Retour
          </button>
        </div>

        {/* === CLAVIER CONDITIONNEL (Cible ou Chiffres) === */}
        {x01InputMethod === 'target' ? (
          /* CIBLE INTERACTIVE SVG DÉFORMÉE */
          <div className="w-full max-w-lg mx-auto animate-fadeIn">
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
            {/* Ligne 1 : Multiplicateurs (DOUBLE, TRIPLE) */}
            <div className="grid grid-cols-2 gap-2 w-full px-1">
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
                    {isBull ? 'BULL' : num}
                  </button>
                );
              })}
            </div>
          </div>
        )}


      </div>



      {renderProjectionModal()}
      {renderExitModal()}
      {renderProjectorSettingsModal()}
    </div>
  );
};
