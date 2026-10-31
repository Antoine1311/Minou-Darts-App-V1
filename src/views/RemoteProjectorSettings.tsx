import React, { useState, useRef } from 'react';
import { 
  ArrowLeft, Settings, X, Tv, Maximize2, Sparkles, ChevronRight, 
  RotateCcw, ChevronLeft, ChevronDown, ChevronUp, 
  Crosshair, CheckCircle2 
} from 'lucide-react';
import type { RoomData, CalibrationSettings } from '../services/roomService';

const DEFAULT_RADIUS_REMOTE = 350;
const DEFAULT_CALIBRATION_REMOTE: CalibrationSettings = {
  centerX: 500, 
  centerY: 500, 
  radius: DEFAULT_RADIUS_REMOTE,
  rBullInner: DEFAULT_RADIUS_REMOTE * (6.35 / 170),
  rBullOuter: DEFAULT_RADIUS_REMOTE * (15.9 / 170),
  rTripleInner: DEFAULT_RADIUS_REMOTE * (99 / 170),
  rTripleOuter: DEFAULT_RADIUS_REMOTE * (107 / 170),
  rDoubleInner: DEFAULT_RADIUS_REMOTE * (162 / 170),
  rDoubleOuter: DEFAULT_RADIUS_REMOTE * 1.0,
  rotationAngle: 0,
  haloWhiteRadius: DEFAULT_RADIUS_REMOTE * 1.1,
  haloMaxRadius: DEFAULT_RADIUS_REMOTE * 2.5,
  arShowExtraOverlays: true,
  arNumbersPosition: 'inside',
  statsFontSize: 16,
  commentsFontSize: 18,
  statsFontScaleX: 1.0,
  statsFontScaleY: 1.0,
};

interface RemoteProjectorSettingsProps {
  roomId: string | null;
  isLocalMode: boolean;
  showProjectorSettingsModal: boolean;
  setShowProjectorSettingsModal: (v: boolean) => void;
  showCalibrationPanel: boolean;
  setShowCalibrationPanel: (v: boolean) => void;
  updateRoomState: (data: Partial<RoomData>) => void;
  remoteProjectorMode: 'classic' | 'fullscreen' | 'ar';
  setRemoteProjectorModeAndSync: (mode: 'classic' | 'fullscreen' | 'ar') => void;
  remoteTargetPosition?: 'left' | 'right';
  setRemoteTargetPositionAndSync?: (pos: 'left' | 'right') => void;
  remoteCalibrationStep: number;
  setRemoteCalibrationStep: (v: number) => void;
  remoteCalibration: CalibrationSettings;
  getRemoteStepSliderValue: () => number;
  handleRemoteSliderChange: (val: number) => void;
  adjustRemoteCalibration: (type: 'move-x' | 'move-y' | 'scale-step' | 'stats-move-x' | 'stats-move-y' | 'rotate', delta: number, forceSync?: boolean) => void;
  saveRemoteCalibration: (cal: CalibrationSettings, forceSync?: boolean) => void;
  resetRemoteTabParameters: (step: number) => void;
  remoteCalibrationSubMode?: 'laser' | 'white';
  toggleRemoteCalibrationSubMode?: () => void;
  triggerRemoteTestHit?: (region: string, score: number, segmentId: string) => void;
}

export const RemoteProjectorSettings: React.FC<RemoteProjectorSettingsProps> = ({
  showProjectorSettingsModal,
  setShowProjectorSettingsModal,
  showCalibrationPanel,
  setShowCalibrationPanel,
  updateRoomState,
  remoteProjectorMode,
  setRemoteProjectorModeAndSync,
  remoteTargetPosition = 'left',
  setRemoteTargetPositionAndSync,
  remoteCalibrationStep,
  setRemoteCalibrationStep,
  remoteCalibration,
  adjustRemoteCalibration,
  saveRemoteCalibration,
  resetRemoteTabParameters,
  remoteCalibrationSubMode = 'laser',
  toggleRemoteCalibrationSubMode,
  triggerRemoteTestHit
}) => {
  // Mode de calibrage : 'wizard' (guidé 3 étapes) ou 'advanced' (halos, encart stats)
  const [calibrationModeView, setCalibrationModeView] = useState<'wizard' | 'advanced'>('wizard');
  // Sensibilité de déplacement (pas en pixels)
  const [stepSensitivity, setStepSensitivity] = useState<number>(5);
  // Sensibilité de redimensionnement
  const [scaleSensitivity, setScaleSensitivity] = useState<number>(5);
  // État de confirmation de reset
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  // Dernier test déclenché
  const [activeTestRegion, setActiveTestRegion] = useState<string | null>(null);

  // Position tactile pour le trackpad virtuel (déplacement fluide X + Y cumulé)
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const hasTouchMoved = useRef<boolean>(false);

  if (!showProjectorSettingsModal) return null;

  // Déclencher un test d'impact
  const handleTestHit = (region: string, score: number, segmentId: string) => {
    setActiveTestRegion(region);
    if (triggerRemoteTestHit) {
      triggerRemoteTestHit(region, score, segmentId);
    } else {
      updateRoomState({
        calibrationTestHit: { region, score, segmentId, timestamp: Date.now() }
      });
    }
    setTimeout(() => {
      setActiveTestRegion(null);
    }, 1800);
  };

  // Fermer et valider la calibration
  const handleFinishCalibration = () => {
    setShowCalibrationPanel(false);
    updateRoomState({ isCalibrating: false });
    localStorage.setItem('minou_dart_is_calibrating', 'false');
    saveRemoteCalibration(remoteCalibration, true);
  };

  // Gestion du trackpad virtuel avec support diagonal et debounce Firestore pendant le glissement
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    hasTouchMoved.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartPos.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartPos.current.x;
    const dy = touch.clientY - touchStartPos.current.y;

    const threshold = 12; // seuil de déclenchement
    if (Math.abs(dx) > threshold) {
      adjustRemoteCalibration('move-x', dx > 0 ? stepSensitivity : -stepSensitivity, false);
      touchStartPos.current.x = touch.clientX;
      hasTouchMoved.current = true;
    }
    if (Math.abs(dy) > threshold) {
      adjustRemoteCalibration('move-y', dy > 0 ? stepSensitivity : -stepSensitivity, false);
      touchStartPos.current.y = touch.clientY;
      hasTouchMoved.current = true;
    }
  };

  const handleTouchEnd = () => {
    if (hasTouchMoved.current) {
      // Forcer la synchronisation finale vers Firestore au relâchement du doigt
      adjustRemoteCalibration('move-x', 0, true);
      hasTouchMoved.current = false;
    }
    touchStartPos.current = null;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950/98 backdrop-blur-lg overflow-y-auto select-none">
      {/* En-tête de la pop-up */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3.5 bg-zinc-950/95 border-b border-zinc-800 backdrop-blur-md flex-shrink-0">
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
            <span className="text-xs font-bold uppercase tracking-wider">Modes d'Affichage</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-theme-accent" />
            <span className="text-sm font-black text-white uppercase tracking-wider">Paramètres Vidéoprojecteur</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          {showCalibrationPanel && toggleRemoteCalibrationSubMode && (
            <button
              onClick={toggleRemoteCalibrationSubMode}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors cursor-pointer active:scale-95 ${
                remoteCalibrationSubMode === 'laser'
                  ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
                  : 'bg-white/20 text-white border-white/40'
              }`}
              title="Changer le style de projection (laser ou fond blanc)"
            >
              {remoteCalibrationSubMode === 'laser' ? '⚡ Mire Laser' : '💡 Fond Blanc'}
            </button>
          )}

          <button
            onClick={() => {
              setShowProjectorSettingsModal(false);
              setShowCalibrationPanel(false);
              updateRoomState({ isCalibrating: false });
              localStorage.setItem('minou_dart_is_calibrating', 'false');
            }}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-full transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-grow p-4 md:p-5 space-y-4 max-w-md mx-auto w-full">

        {/* ======================================================== */}
        {/* --- PANNEAU SÉLECTION DU MODE DE VUE (HORS CALIBRATION) --- */}
        {/* ======================================================== */}
        {!showCalibrationPanel && (
          <div className="space-y-4">
            <div>
              <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-3">
                Mode de diffusion au mur
              </p>
              <div className="space-y-2.5">
                {/* Vue Classique */}
                <button
                  onClick={() => setRemoteProjectorModeAndSync('classic')}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer text-left ${
                    remoteProjectorMode === 'classic'
                      ? 'border-theme-accent bg-theme-accent/10'
                      : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900'
                  }`}
                >
                  <div className={`p-2.5 rounded-xl ${remoteProjectorMode === 'classic' ? 'bg-theme-accent/20' : 'bg-zinc-800'}`}>
                    <Tv className={`w-5 h-5 ${remoteProjectorMode === 'classic' ? 'text-theme-accent' : 'text-zinc-400'}`} />
                  </div>
                  <div className="flex-1">
                    <div className={`text-sm font-extrabold ${remoteProjectorMode === 'classic' ? 'text-theme-accent' : 'text-white'}`}>
                      Vue Classique
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">Scores + cible lumineuse côte à côte</div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    remoteProjectorMode === 'classic' ? 'border-theme-accent' : 'border-zinc-700'
                  }`}>
                    {remoteProjectorMode === 'classic' && <div className="w-2.5 h-2.5 rounded-full bg-theme-accent" />}
                  </div>
                </button>

                {/* Plein Écran */}
                <button
                  onClick={() => setRemoteProjectorModeAndSync('fullscreen')}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer text-left ${
                    remoteProjectorMode === 'fullscreen'
                      ? 'border-theme-accent bg-theme-accent/10'
                      : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900'
                  }`}
                >
                  <div className={`p-2.5 rounded-xl ${remoteProjectorMode === 'fullscreen' ? 'bg-theme-accent/20' : 'bg-zinc-800'}`}>
                    <Maximize2 className={`w-5 h-5 ${remoteProjectorMode === 'fullscreen' ? 'text-theme-accent' : 'text-zinc-400'}`} />
                  </div>
                  <div className="flex-1">
                    <div className={`text-sm font-extrabold ${remoteProjectorMode === 'fullscreen' ? 'text-theme-accent' : 'text-white'}`}>
                      Plein Écran
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">Grands scores pour les spectateurs</div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    remoteProjectorMode === 'fullscreen' ? 'border-theme-accent' : 'border-zinc-700'
                  }`}>
                    {remoteProjectorMode === 'fullscreen' && <div className="w-2.5 h-2.5 rounded-full bg-theme-accent" />}
                  </div>
                </button>

                {/* Réalité Augmentée (AR) */}
                <button
                  onClick={() => setRemoteProjectorModeAndSync('ar')}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer text-left ${
                    remoteProjectorMode === 'ar'
                      ? 'border-theme-accent bg-theme-accent/10 shadow-lg shadow-theme-accent/5'
                      : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900'
                  }`}
                >
                  <div className={`p-2.5 rounded-xl ${remoteProjectorMode === 'ar' ? 'bg-theme-accent/20' : 'bg-zinc-800'}`}>
                    <Sparkles className={`w-5 h-5 ${remoteProjectorMode === 'ar' ? 'text-theme-accent' : 'text-zinc-400'}`} />
                  </div>
                  <div className="flex-1">
                    <div className={`text-sm font-extrabold ${remoteProjectorMode === 'ar' ? 'text-theme-accent' : 'text-white'}`}>
                      Réalité Augmentée (AR)
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">Projection interactive sur votre cible réelle</div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    remoteProjectorMode === 'ar' ? 'border-theme-accent' : 'border-zinc-700'
                  }`}>
                    {remoteProjectorMode === 'ar' && <div className="w-2.5 h-2.5 rounded-full bg-theme-accent" />}
                  </div>
                </button>
              </div>
            </div>

            {/* Disposition de l'écran (Position de la cible) */}
            {remoteProjectorMode !== 'fullscreen' && setRemoteTargetPositionAndSync && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">
                    Position de la cible au mur
                  </p>
                  <span className="text-[10px] text-zinc-400 font-bold bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-full">
                    {remoteTargetPosition === 'left' ? 'Cible à gauche' : 'Cible à droite'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {/* Cible à gauche (Standard) */}
                  <button
                    onClick={() => setRemoteTargetPositionAndSync('left')}
                    className={`flex flex-col items-center gap-2.5 p-3.5 rounded-2xl border-2 transition-all cursor-pointer text-center relative ${
                      remoteTargetPosition === 'left'
                        ? 'border-theme-accent bg-theme-accent/10 shadow-md shadow-theme-accent/5'
                        : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900'
                    }`}
                  >
                    {/* Schéma visuel miniature */}
                    <div className="w-full h-12 bg-zinc-950 rounded-xl border border-zinc-800 flex overflow-hidden p-1 gap-1">
                      <div className="w-1/2 h-full rounded-lg bg-theme-accent/20 border border-theme-accent/40 flex items-center justify-center">
                        <span className="text-xs">🎯</span>
                      </div>
                      <div className="w-1/2 h-full rounded-lg bg-zinc-900 flex flex-col justify-center gap-1 px-1.5">
                        <div className="w-full h-1.5 rounded-full bg-zinc-700" />
                        <div className="w-2/3 h-1.5 rounded-full bg-zinc-750" />
                      </div>
                    </div>
                    <div>
                      <div className={`text-xs font-extrabold ${remoteTargetPosition === 'left' ? 'text-theme-accent' : 'text-white'}`}>
                        Cible à gauche
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">Scores à droite (Standard)</div>
                    </div>
                    {remoteTargetPosition === 'left' && (
                      <span className="text-[9px] uppercase tracking-wider font-black text-theme-accent">Actif</span>
                    )}
                  </button>

                  {/* Cible à droite (Inversé) */}
                  <button
                    onClick={() => setRemoteTargetPositionAndSync('right')}
                    className={`flex flex-col items-center gap-2.5 p-3.5 rounded-2xl border-2 transition-all cursor-pointer text-center relative ${
                      remoteTargetPosition === 'right'
                        ? 'border-theme-accent bg-theme-accent/10 shadow-md shadow-theme-accent/5'
                        : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900'
                    }`}
                  >
                    {/* Schéma visuel miniature */}
                    <div className="w-full h-12 bg-zinc-950 rounded-xl border border-zinc-800 flex overflow-hidden p-1 gap-1">
                      <div className="w-1/2 h-full rounded-lg bg-zinc-900 flex flex-col justify-center gap-1 px-1.5">
                        <div className="w-full h-1.5 rounded-full bg-zinc-700" />
                        <div className="w-2/3 h-1.5 rounded-full bg-zinc-750" />
                      </div>
                      <div className="w-1/2 h-full rounded-lg bg-theme-accent/20 border border-theme-accent/40 flex items-center justify-center">
                        <span className="text-xs">🎯</span>
                      </div>
                    </div>
                    <div>
                      <div className={`text-xs font-extrabold ${remoteTargetPosition === 'right' ? 'text-theme-accent' : 'text-white'}`}>
                        Cible à droite
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">Scores à gauche (Inversé)</div>
                    </div>
                    {remoteTargetPosition === 'right' && (
                      <span className="text-[9px] uppercase tracking-wider font-black text-theme-accent">Actif</span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Bouton d'accès au calibrage */}
            {remoteProjectorMode === 'ar' && (
              <div className="pt-2">
                <div className="w-full h-[1px] bg-zinc-850 mb-4" />
                <button
                  onClick={() => {
                    setShowCalibrationPanel(true);
                    setRemoteCalibrationStep(1);
                    setCalibrationModeView('wizard');
                    updateRoomState({ isCalibrating: true, calibrationStep: 1 });
                    localStorage.setItem('minou_dart_is_calibrating', 'true');
                    localStorage.setItem('minou_dart_calibration_step', '1');
                  }}
                  className="w-full flex items-center justify-between gap-3 p-4 bg-gradient-to-r from-theme-accent/20 to-theme-accent/5 border-2 border-theme-accent/50 hover:border-theme-accent hover:from-theme-accent/30 rounded-2xl transition-all cursor-pointer group shadow-lg shadow-theme-accent/10"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-theme-accent text-black rounded-xl shadow-md">
                      <Crosshair className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-black text-white group-hover:text-theme-accent transition-colors">
                        Calibrer la Cible
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        Assistant guidé rapide en 3 étapes
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-theme-accent group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* --- PANNEAU DE CALIBRATION ERGONOMIQUE --- */}
        {/* ======================================================== */}
        {showCalibrationPanel && (
          <div className="space-y-4">

            {/* Sélecteur de mode : Assistant Guidé vs Mode Avancé */}
            <div className="flex p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
              <button
                onClick={() => {
                  setCalibrationModeView('wizard');
                  setRemoteCalibrationStep(1);
                }}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  calibrationModeView === 'wizard'
                    ? 'bg-theme-accent text-black shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Assistant Express
              </button>
              <button
                onClick={() => {
                  setCalibrationModeView('advanced');
                  setRemoteCalibrationStep(8);
                }}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  calibrationModeView === 'advanced'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Réglages Avancés
              </button>
            </div>

            {/* ============================================== */}
            {/* --- PARCOURS 1 : ASSISTANT GUIDÉ EN 3 ÉTAPES --- */}
            {/* ============================================== */}
            {calibrationModeView === 'wizard' && (
              <div className="space-y-4">
                {/* Barre de progression des 3 étapes */}
                <div className="grid grid-cols-3 gap-1.5 bg-zinc-900/60 p-1.5 border border-zinc-850 rounded-2xl">
                  {[
                    { step: 1, title: '1. Centre', desc: 'Bulle' },
                    { step: 2, title: '2. Taille', desc: 'Doubles' },
                    { step: 3, title: '3. Finition', desc: 'Test' },
                  ].map((item) => {
                    const isCurrent = remoteCalibrationStep === item.step;
                    const isDone = remoteCalibrationStep > item.step;
                    return (
                      <button
                        key={item.step}
                        onClick={() => setRemoteCalibrationStep(item.step)}
                        className={`py-2 px-1 rounded-xl text-center flex flex-col items-center justify-center transition-all cursor-pointer ${
                          isCurrent
                            ? 'bg-theme-accent text-black font-black shadow-md scale-102'
                            : isDone
                            ? 'bg-zinc-850/80 text-zinc-300 font-bold border border-zinc-750'
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        <span className="text-xs leading-tight">{item.title}</span>
                        <span className={`text-[9px] ${isCurrent ? 'text-black/75' : 'text-zinc-500'}`}>
                          {item.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* ------------------------------------------ */}
                {/* ÉTAPE 1 : CENTRAGE (BULLSEYE) */}
                {/* ------------------------------------------ */}
                {remoteCalibrationStep === 1 && (
                  <div className="space-y-3.5 bg-zinc-900/70 border border-zinc-800 rounded-3xl p-4">
                    <div className="flex items-center gap-2.5 pb-1 border-b border-zinc-800">
                      <div className="w-7 h-7 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center font-black text-xs">
                        1
                      </div>
                      <div>
                        <h3 className="text-xs font-black text-white uppercase tracking-wider">
                          Centrez la cible sur le mur
                        </h3>
                        <p className="text-[10px] text-zinc-400">
                          Alignez le réticule lumineux pile sur la bulle rouge.
                        </p>
                      </div>
                    </div>

                    {/* Sélecteur de vitesse de déplacement */}
                    <div className="flex items-center justify-between gap-1 text-[10px] font-bold">
                      <span className="text-zinc-500 uppercase tracking-widest text-[9px]">Sensibilité :</span>
                      <div className="flex gap-1">
                        {[
                          { val: 1, label: '1 px (Fin)' },
                          { val: 5, label: '5 px (Moyen)' },
                          { val: 15, label: '15 px (Rapide)' },
                        ].map(s => (
                          <button
                            key={s.val}
                            onClick={() => setStepSensitivity(s.val)}
                            className={`px-2 py-1 rounded-lg border transition-all cursor-pointer ${
                              stepSensitivity === s.val
                                ? 'bg-theme-accent text-black border-theme-accent font-black'
                                : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Grand Pavé Directionnel (D-Pad) ergonomique */}
                    <div className="flex flex-col items-center justify-center py-2">
                      <div className="grid grid-cols-3 gap-2 w-52 h-44">
                        {/* Haut */}
                        <div />
                        <button
                          onClick={() => adjustRemoteCalibration('move-y', -stepSensitivity, true)}
                          className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 active:scale-95 text-theme-accent rounded-2xl flex items-center justify-center shadow-lg transition-all cursor-pointer"
                        >
                          <ChevronUp className="w-8 h-8" />
                        </button>
                        <div />

                        {/* Gauche - Centre - Droite */}
                        <button
                          onClick={() => adjustRemoteCalibration('move-x', -stepSensitivity, true)}
                          className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 active:scale-95 text-theme-accent rounded-2xl flex items-center justify-center shadow-lg transition-all cursor-pointer"
                        >
                          <ChevronLeft className="w-8 h-8" />
                        </button>
                        <button
                          onClick={() => {
                            const newCal = { ...remoteCalibration, centerX: 500, centerY: 500 };
                            saveRemoteCalibration(newCal, true);
                          }}
                          className="bg-zinc-900 border border-zinc-750 text-zinc-400 hover:text-white active:scale-95 rounded-2xl flex flex-col items-center justify-center text-[9px] font-bold p-1 cursor-pointer transition-all"
                          title="Recentrer au milieu de l'écran (500, 500)"
                        >
                          <Crosshair className="w-4 h-4 text-theme-accent mb-0.5" />
                          <span>Reset</span>
                        </button>
                        <button
                          onClick={() => adjustRemoteCalibration('move-x', stepSensitivity, true)}
                          className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 active:scale-95 text-theme-accent rounded-2xl flex items-center justify-center shadow-lg transition-all cursor-pointer"
                        >
                          <ChevronRight className="w-8 h-8" />
                        </button>

                        {/* Bas */}
                        <div />
                        <button
                          onClick={() => adjustRemoteCalibration('move-y', stepSensitivity, true)}
                          className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 active:scale-95 text-theme-accent rounded-2xl flex items-center justify-center shadow-lg transition-all cursor-pointer"
                        >
                          <ChevronDown className="w-8 h-8" />
                        </button>
                        <div />
                      </div>

                      {/* Coordonnées en direct */}
                      <div className="flex items-center gap-3 mt-3 text-zinc-500 font-mono text-xs">
                        <span>X: <strong className="text-theme-accent">{Math.round(remoteCalibration.centerX)}</strong></span>
                        <span>•</span>
                        <span>Y: <strong className="text-theme-accent">{Math.round(remoteCalibration.centerY)}</strong></span>
                      </div>
                    </div>

                    {/* Zone Trackpad virtuel tactile */}
                    <div 
                      onTouchStart={handleTouchStart}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      className="w-full py-2.5 px-3 bg-zinc-950/70 border border-dashed border-zinc-750 rounded-2xl text-center cursor-move active:bg-theme-accent/5 active:border-theme-accent transition-colors"
                    >
                      <p className="text-[10px] text-zinc-400 font-bold">
                        🖐️ Ou glissez votre doigt ici pour déplacer la cible en direct
                      </p>
                    </div>

                    {/* Bouton d'action suivant */}
                    <button
                      onClick={() => setRemoteCalibrationStep(2)}
                      className="w-full py-3.5 bg-theme-accent hover:bg-theme-accent/90 text-black font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-theme-accent/20 flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all"
                    >
                      <span>Valider le centre ➔ Passer à la taille</span>
                      <ChevronRight className="w-4 h-4 stroke-[3px]" />
                    </button>
                  </div>
                )}

                {/* ------------------------------------------ */}
                {/* ÉTAPE 2 : ÉCHELLE / RAYON (DOUBLES) */}
                {/* ------------------------------------------ */}
                {remoteCalibrationStep === 2 && (
                  <div className="space-y-3.5 bg-zinc-900/70 border border-zinc-800 rounded-3xl p-4">
                    <div className="flex items-center gap-2.5 pb-1 border-b border-zinc-800">
                      <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-black text-xs">
                        2
                      </div>
                      <div>
                        <h3 className="text-xs font-black text-white uppercase tracking-wider">
                          Ajustez la taille de la cible
                        </h3>
                        <p className="text-[10px] text-zinc-400">
                          Faites correspondre le cercle lumineux sur le fil extérieur des doubles.
                        </p>
                      </div>
                    </div>

                    {/* Sensibilité de redimensionnement */}
                    <div className="flex items-center justify-between gap-1 text-[10px] font-bold">
                      <span className="text-zinc-500 uppercase tracking-widest text-[9px]">Sensibilité :</span>
                      <div className="flex gap-1">
                        {[
                          { val: 1, label: '1 px' },
                          { val: 5, label: '5 px' },
                          { val: 15, label: '15 px' },
                        ].map(s => (
                          <button
                            key={s.val}
                            onClick={() => setScaleSensitivity(s.val)}
                            className={`px-2 py-1 rounded-lg border transition-all cursor-pointer ${
                              scaleSensitivity === s.val
                                ? 'bg-cyan-500 text-black border-cyan-500 font-black'
                                : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Grands boutons d'ajustement direct */}
                    <div className="grid grid-cols-2 gap-3 py-2">
                      <button
                        onClick={() => adjustRemoteCalibration('scale-step', -scaleSensitivity, true)}
                        className="py-5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 active:scale-95 text-white rounded-2xl flex flex-col items-center justify-center gap-1 shadow-lg transition-all cursor-pointer"
                      >
                        <span className="text-2xl font-black text-red-400">- {scaleSensitivity}</span>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Réduire</span>
                      </button>

                      <button
                        onClick={() => adjustRemoteCalibration('scale-step', scaleSensitivity, true)}
                        className="py-5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 active:scale-95 text-white rounded-2xl flex flex-col items-center justify-center gap-1 shadow-lg transition-all cursor-pointer"
                      >
                        <span className="text-2xl font-black text-theme-accent">+ {scaleSensitivity}</span>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Agrandir</span>
                      </button>
                    </div>

                    {/* Curseur Slider précis */}
                    <div className="bg-zinc-950 p-3 rounded-2xl border border-zinc-800 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-zinc-400 font-bold uppercase tracking-wider text-[10px]">Rayon actuel</span>
                        <span className="font-mono font-black text-cyan-400 text-sm">
                          {Math.round(remoteCalibration.radius)} px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={100}
                        max={500}
                        value={remoteCalibration.radius}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const delta = val - remoteCalibration.radius;
                          adjustRemoteCalibration('scale-step', delta, true);
                        }}
                        className="w-full h-2 rounded-full accent-cyan-400 cursor-pointer"
                      />
                    </div>

                    {/* Boutons d'action : Retour / Suivant */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => setRemoteCalibrationStep(1)}
                        className="py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-black text-xs uppercase tracking-wider rounded-2xl border border-zinc-700 flex items-center justify-center gap-1 cursor-pointer active:scale-98 transition-all"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Centre</span>
                      </button>
                      <button
                        onClick={() => setRemoteCalibrationStep(3)}
                        className="py-3 bg-theme-accent hover:bg-theme-accent/90 text-black font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-theme-accent/20 flex items-center justify-center gap-1 cursor-pointer active:scale-98 transition-all"
                      >
                        <span>Rotation & Test</span>
                        <ChevronRight className="w-4 h-4 stroke-[3px]" />
                      </button>
                    </div>
                  </div>
                )}

                {/* ------------------------------------------ */}
                {/* ÉTAPE 3 : ROTATION & TESTS D'ALIGNEMENT */}
                {/* ------------------------------------------ */}
                {remoteCalibrationStep === 3 && (
                  <div className="space-y-3.5 bg-zinc-900/70 border border-zinc-800 rounded-3xl p-4">
                    <div className="flex items-center gap-2.5 pb-1 border-b border-zinc-800">
                      <div className="w-7 h-7 rounded-lg bg-yellow-500/20 text-yellow-400 flex items-center justify-center font-black text-xs">
                        3
                      </div>
                      <div>
                        <h3 className="text-xs font-black text-white uppercase tracking-wider">
                          Orientation & Test d'alignement
                        </h3>
                        <p className="text-[10px] text-zinc-400">
                          Ajustez l'angle si besoin et testez les secteurs en temps réel.
                        </p>
                      </div>
                    </div>

                    {/* Contrôle de la Rotation fine */}
                    <div className="bg-zinc-950 p-3 rounded-2xl border border-zinc-800 space-y-2.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-zinc-400 font-bold uppercase tracking-wider text-[10px]">Inclinaison de la cible</span>
                        <span className="font-mono font-black text-yellow-400 text-sm">
                          {((remoteCalibration.rotationAngle ?? 0) >= 0 ? '+' : '') + (remoteCalibration.rotationAngle ?? 0).toFixed(1)}°
                        </span>
                      </div>

                      <div className="grid grid-cols-5 gap-1.5 items-center">
                        <button
                          onClick={() => adjustRemoteCalibration('rotate', -2, true)}
                          className="py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs rounded-xl border border-zinc-750 transition-all cursor-pointer active:scale-95"
                        >
                          -2°
                        </button>
                        <button
                          onClick={() => adjustRemoteCalibration('rotate', -0.5, true)}
                          className="py-2 bg-zinc-800 hover:bg-zinc-700 text-yellow-400 font-bold text-xs rounded-xl border border-zinc-750 transition-all cursor-pointer active:scale-95"
                        >
                          -0.5°
                        </button>
                        <button
                          onClick={() => {
                            const newCal = { ...remoteCalibration, rotationAngle: 0 };
                            saveRemoteCalibration(newCal, true);
                          }}
                          className="py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white font-black text-[10px] rounded-xl border border-zinc-750 transition-all cursor-pointer active:scale-95"
                        >
                          0°
                        </button>
                        <button
                          onClick={() => adjustRemoteCalibration('rotate', 0.5, true)}
                          className="py-2 bg-zinc-800 hover:bg-zinc-700 text-yellow-400 font-bold text-xs rounded-xl border border-zinc-750 transition-all cursor-pointer active:scale-95"
                        >
                          +0.5°
                        </button>
                        <button
                          onClick={() => adjustRemoteCalibration('rotate', 2, true)}
                          className="py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs rounded-xl border border-zinc-750 transition-all cursor-pointer active:scale-95"
                        >
                          +2°
                        </button>
                      </div>
                    </div>

                    {/* Position des numéros 1 à 20 projetés en Réalité Augmentée */}
                    <div className="bg-zinc-950 p-3 rounded-2xl border border-zinc-800 space-y-2">
                      <span className="text-zinc-400 font-bold uppercase tracking-wider text-[10px] block">
                        Position des numéros 1 à 20 (AR) :
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {([
                          { value: 'inside', label: 'Intérieur', sub: 'Sur simples' },
                          { value: 'outside', label: 'Extérieur', sub: 'Hors doubles' },
                          { value: 'hidden', label: 'Masqués', sub: 'Cible nue' },
                        ] as const).map((opt) => {
                          const currentPos = remoteCalibration.arNumbersPosition ?? 'inside';
                          const isSelected = currentPos === opt.value;
                          return (
                            <button
                              key={opt.value}
                              onClick={() => {
                                const newCal = { ...remoteCalibration, arNumbersPosition: opt.value };
                                saveRemoteCalibration(newCal, true);
                              }}
                              className={`py-2 px-1.5 rounded-xl border text-center flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer active:scale-95 ${
                                isSelected
                                  ? 'bg-theme-accent text-black border-theme-accent font-black shadow-md'
                                  : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800 hover:text-white font-bold'
                              }`}
                            >
                              <span className="text-xs leading-tight">{opt.label}</span>
                              <span className={`text-[8px] leading-tight ${isSelected ? 'text-black/80 font-bold' : 'text-zinc-500'}`}>
                                {opt.sub}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Banc de test instantané */}
                    <div className="bg-zinc-950 p-3 rounded-2xl border border-zinc-800 space-y-2">
                      <span className="text-zinc-400 font-bold uppercase tracking-wider text-[10px] block">
                        Testez les impacts sur la vraie cible :
                      </span>
                      <div className="grid grid-cols-4 gap-1.5">
                        <button
                          onClick={() => handleTestHit('Triple 20', 60, 'triple-20')}
                          className={`py-2.5 px-1 rounded-xl border font-black text-xs flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer active:scale-95 ${
                            activeTestRegion === 'Triple 20'
                              ? 'bg-yellow-400 text-black border-yellow-300 shadow-md shadow-yellow-500/20'
                              : 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30 hover:bg-yellow-500/25'
                          }`}
                        >
                          <span>T20</span>
                          <span className="text-[8px] font-normal opacity-75">60 pts</span>
                        </button>

                        <button
                          onClick={() => handleTestHit('Double Bull', 50, 'bull-inner')}
                          className={`py-2.5 px-1 rounded-xl border font-black text-xs flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer active:scale-95 ${
                            activeTestRegion === 'Double Bull'
                              ? 'bg-red-500 text-white border-red-400 shadow-md shadow-red-500/20'
                              : 'bg-red-500/15 text-red-300 border-red-500/30 hover:bg-red-500/25'
                          }`}
                        >
                          <span>BULL</span>
                          <span className="text-[8px] font-normal opacity-75">50 pts</span>
                        </button>

                        <button
                          onClick={() => handleTestHit('Double 16', 32, 'double-16')}
                          className={`py-2.5 px-1 rounded-xl border font-black text-xs flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer active:scale-95 ${
                            activeTestRegion === 'Double 16'
                              ? 'bg-cyan-400 text-black border-cyan-300 shadow-md shadow-cyan-500/20'
                              : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/25'
                          }`}
                        >
                          <span>D16</span>
                          <span className="text-[8px] font-normal opacity-75">32 pts</span>
                        </button>

                        <button
                          onClick={() => handleTestHit('Simple 19', 19, 'single-outer-19')}
                          className={`py-2.5 px-1 rounded-xl border font-black text-xs flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer active:scale-95 ${
                            activeTestRegion === 'Simple 19'
                              ? 'bg-emerald-400 text-black border-emerald-300 shadow-md shadow-emerald-500/20'
                              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                          }`}
                        >
                          <span>S19</span>
                          <span className="text-[8px] font-normal opacity-75">19 pts</span>
                        </button>
                      </div>
                    </div>

                    {/* Bouton de validation finale */}
                    <button
                      onClick={handleFinishCalibration}
                      className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider rounded-2xl shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all"
                    >
                      <CheckCircle2 className="w-5 h-5 stroke-[2.5px]" />
                      <span>C'est parfait, enregistrer et jouer !</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ============================================== */}
            {/* --- PARCOURS 2 : RÉGLAGES AVANCÉS (HALO & STATS) --- */}
            {/* ============================================== */}
            {calibrationModeView === 'advanced' && (
              <div className="space-y-4">
                {/* Sélecteur d'onglet avancé */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setRemoteCalibrationStep(8)}
                    className={`py-2 px-3 rounded-xl border text-center transition-all cursor-pointer text-xs font-black ${
                      remoteCalibrationStep === 8
                        ? 'bg-orange-500 text-white border-orange-400'
                        : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                    }`}
                  >
                    🔆 Halos Dégradés
                  </button>
                  <button
                    onClick={() => setRemoteCalibrationStep(9)}
                    className={`py-2 px-3 rounded-xl border text-center transition-all cursor-pointer text-xs font-black ${
                      remoteCalibrationStep === 9
                        ? 'bg-theme-accent text-black border-theme-accent'
                        : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                    }`}
                  >
                    💬 Encart Statistiques
                  </button>
                </div>

                {/* Réglage du Dégradé (Étape 8) */}
                {remoteCalibrationStep === 8 && (
                  <div className="space-y-3 bg-zinc-900/70 border border-zinc-800 rounded-3xl p-4">
                    <p className="text-[10px] text-zinc-400">
                      Ajustez l'étendue du halo d'éclairage autour de la cible physique.
                    </p>

                    {/* Halo Blanc */}
                    <div className="bg-zinc-950 p-3 rounded-2xl border border-zinc-800 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-zinc-400 font-bold uppercase tracking-wider text-[10px]">Halo Blanc</span>
                        <span className="font-mono font-black text-theme-accent">
                          {Math.round(remoteCalibration.haloWhiteRadius ?? (remoteCalibration.rDoubleOuter * 1.1))} px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={Math.round(remoteCalibration.rDoubleOuter - 20)}
                        max={Math.round((remoteCalibration.haloMaxRadius ?? (remoteCalibration.rDoubleOuter * 2.5)) - 10)}
                        value={remoteCalibration.haloWhiteRadius ?? (remoteCalibration.rDoubleOuter * 1.1)}
                        onChange={(e) => {
                          const newCal = { ...remoteCalibration, haloWhiteRadius: Number(e.target.value) };
                          saveRemoteCalibration(newCal, true);
                        }}
                        className="w-full h-1.5 rounded-full accent-theme-accent cursor-pointer"
                      />
                    </div>

                    {/* Halo Noir */}
                    <div className="bg-zinc-950 p-3 rounded-2xl border border-zinc-800 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-zinc-400 font-bold uppercase tracking-wider text-[10px]">Halo Noir (Dégradé)</span>
                        <span className="font-mono font-black text-theme-accent">
                          {Math.round(remoteCalibration.haloMaxRadius ?? (remoteCalibration.rDoubleOuter * 2.5))} px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={Math.round((remoteCalibration.haloWhiteRadius ?? (remoteCalibration.rDoubleOuter * 1.1)) + 10)}
                        max={850}
                        value={remoteCalibration.haloMaxRadius ?? (remoteCalibration.rDoubleOuter * 2.5)}
                        onChange={(e) => {
                          const newCal = { ...remoteCalibration, haloMaxRadius: Number(e.target.value) };
                          saveRemoteCalibration(newCal, true);
                        }}
                        className="w-full h-1.5 rounded-full accent-theme-accent cursor-pointer"
                      />
                    </div>

                    <button
                      onClick={() => resetRemoteTabParameters(8)}
                      className="w-full py-2 bg-red-950/20 text-red-400 border border-red-900/50 hover:bg-red-900/30 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Réinitialiser les halos
                    </button>
                  </div>
                )}

                {/* Réglage de la Zone Stats & Commentaires (Étape 9) */}
                {remoteCalibrationStep === 9 && (
                  <div className="space-y-3 bg-zinc-900/70 border border-zinc-800 rounded-3xl p-4">
                    <p className="text-[10px] text-zinc-400">
                      Positionnez la zone où s'affichent les commentaires de fin de volée et les statistiques.
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-zinc-950 p-2.5 rounded-2xl border border-zinc-800 space-y-1">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase">Position X</span>
                        <div className="flex items-center justify-between">
                          <button onClick={() => adjustRemoteCalibration('stats-move-x', -20, true)} className="px-2 py-1 bg-zinc-800 rounded font-bold text-xs">-</button>
                          <span className="font-mono font-bold text-xs text-theme-accent">{Math.round(remoteCalibration.statsPanelX ?? 16)}</span>
                          <button onClick={() => adjustRemoteCalibration('stats-move-x', 20, true)} className="px-2 py-1 bg-zinc-800 rounded font-bold text-xs">+</button>
                        </div>
                      </div>

                      <div className="bg-zinc-950 p-2.5 rounded-2xl border border-zinc-800 space-y-1">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase">Position Y</span>
                        <div className="flex items-center justify-between">
                          <button onClick={() => adjustRemoteCalibration('stats-move-y', -20, true)} className="px-2 py-1 bg-zinc-800 rounded font-bold text-xs">-</button>
                          <span className="font-mono font-bold text-xs text-theme-accent">{Math.round(remoteCalibration.statsPanelY ?? 0)}</span>
                          <button onClick={() => adjustRemoteCalibration('stats-move-y', 20, true)} className="px-2 py-1 bg-zinc-800 rounded font-bold text-xs">+</button>
                        </div>
                      </div>

                      <div className="bg-zinc-950 p-2.5 rounded-2xl border border-zinc-800 space-y-1">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase">Largeur</span>
                        <div className="flex items-center justify-between">
                          <button onClick={() => {
                            const current = remoteCalibration.statsPanelWidth ?? 320;
                            saveRemoteCalibration({ ...remoteCalibration, statsPanelWidth: Math.max(100, current - 20) }, true);
                          }} className="px-2 py-1 bg-zinc-800 rounded font-bold text-xs">-</button>
                          <span className="font-mono font-bold text-xs text-theme-accent">{Math.round(remoteCalibration.statsPanelWidth ?? 320)}</span>
                          <button onClick={() => {
                            const current = remoteCalibration.statsPanelWidth ?? 320;
                            saveRemoteCalibration({ ...remoteCalibration, statsPanelWidth: Math.min(800, current + 20) }, true);
                          }} className="px-2 py-1 bg-zinc-800 rounded font-bold text-xs">+</button>
                        </div>
                      </div>

                      <div className="bg-zinc-950 p-2.5 rounded-2xl border border-zinc-800 space-y-1">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase">Hauteur</span>
                        <div className="flex items-center justify-between">
                          <button onClick={() => {
                            const current = remoteCalibration.statsPanelHeight ?? 280;
                            saveRemoteCalibration({ ...remoteCalibration, statsPanelHeight: Math.max(100, current - 20) }, true);
                          }} className="px-2 py-1 bg-zinc-800 rounded font-bold text-xs">-</button>
                          <span className="font-mono font-bold text-xs text-theme-accent">{Math.round(remoteCalibration.statsPanelHeight ?? 280)}</span>
                          <button onClick={() => {
                            const current = remoteCalibration.statsPanelHeight ?? 280;
                            saveRemoteCalibration({ ...remoteCalibration, statsPanelHeight: Math.min(600, current + 20) }, true);
                          }} className="px-2 py-1 bg-zinc-800 rounded font-bold text-xs">+</button>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => resetRemoteTabParameters(9)}
                      className="w-full py-2 bg-red-950/20 text-red-400 border border-red-900/50 hover:bg-red-900/30 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Réinitialiser la zone stats
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Réinitialisation complète & Validation */}
            {showResetConfirm ? (
              <div className="bg-red-950/20 border border-red-500/30 rounded-2xl p-3 text-center space-y-2 animate-pulse">
                <span className="text-xs text-red-400 font-black uppercase tracking-wider block">
                  Réinitialiser toute la calibration ?
                </span>
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={() => {
                      saveRemoteCalibration(DEFAULT_CALIBRATION_REMOTE, true);
                      setRemoteCalibrationStep(1);
                      setShowResetConfirm(false);
                    }}
                    className="px-3.5 py-1.5 bg-red-500 text-white font-black text-xs rounded-xl cursor-pointer"
                  >
                    Oui, réinitialiser
                  </button>
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    className="px-3.5 py-1.5 bg-zinc-800 text-zinc-300 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => setShowResetConfirm(true)}
                  className="text-zinc-500 hover:text-red-400 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Réinitialiser tout</span>
                </button>

                <button
                  onClick={handleFinishCalibration}
                  className="px-4 py-2 bg-theme-accent text-black font-black text-xs uppercase tracking-wider rounded-xl shadow-md cursor-pointer transition-all active:scale-95"
                >
                  Terminer
                </button>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
};
