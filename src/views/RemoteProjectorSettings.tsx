import React from 'react';
import { ArrowLeft, Settings, X, Tv, Maximize2, Sparkles, ChevronRight, RotateCcw, ChevronLeft, ChevronDown, ChevronUp, Check, Crosshair } from 'lucide-react';
import type { RoomData, CalibrationSettings } from '../services/roomService';
import { roomService } from '../services/roomService';
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
  remoteCalibrationStep: number;
  setRemoteCalibrationStep: (v: number) => void;
  remoteCalibration: CalibrationSettings;
  getRemoteStepSliderValue: () => number;
  handleRemoteSliderChange: (val: number) => void;
  adjustRemoteCalibration: (type: 'move-x' | 'move-y' | 'scale-step' | 'stats-move-x' | 'stats-move-y', delta: number, forceSync?: boolean) => void;
  saveRemoteCalibration: (cal: CalibrationSettings, forceSync?: boolean) => void;
  resetRemoteTabParameters: (step: number) => void;
}

export const RemoteProjectorSettings: React.FC<RemoteProjectorSettingsProps> = ({
  roomId,
  isLocalMode,
  showProjectorSettingsModal,
  setShowProjectorSettingsModal,
  showCalibrationPanel,
  setShowCalibrationPanel,
  updateRoomState,
  remoteProjectorMode,
  setRemoteProjectorModeAndSync,
  remoteCalibrationStep,
  setRemoteCalibrationStep,
  remoteCalibration,
  getRemoteStepSliderValue,
  handleRemoteSliderChange,
  adjustRemoteCalibration,
  saveRemoteCalibration,
  resetRemoteTabParameters
}) => {
  const [wizardStep, setWizardStep] = React.useState<0|1|2>(0);
  const [showResetConfirm, setShowResetConfirm] = React.useState<boolean>(false);
  const firestoreTimeoutRef = React.useRef<any>(null);

  if (!showProjectorSettingsModal) return null;

    const CALIBRATION_STEPS = [
      { step: 1, label: '🎯 Cible', desc: 'Centre & Rayon' },
      { step: 8, label: '🔆 Dégradé', desc: 'Halos' },
      { step: 9, label: '💬 Commentaires', desc: 'Position & Taille' },
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
                      max={850}
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
                        const val = Math.min(850, current + 5);
                        const newCal = { ...remoteCalibration };
                        newCal.haloMaxRadius = val;
                        saveRemoteCalibration(newCal);
                      }}
                      className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => resetRemoteTabParameters(8)}
                    className="w-full mt-2 py-2 border border-red-900/50 bg-red-950/20 text-red-500 hover:bg-red-950/50 hover:text-red-400 rounded-xl flex items-center justify-center gap-2 font-bold transition-all cursor-pointer active:scale-95 text-[10px] uppercase tracking-wider"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Réinitialiser cet onglet
                  </button>
                </div>
              )}

              {/* Sliders Stats X / Stats Y (étape 9 uniquement) */}
              {remoteCalibrationStep === 9 && (
                <div className="space-y-2">
                  {/* Position X */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between gap-3">
                    <div className="flex flex-col min-w-[120px]">
                      <span className="text-zinc-500 font-bold text-[10px] uppercase tracking-wider">Position X</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-theme-accent font-mono font-black text-sm">{Math.round(remoteCalibration.statsPanelX ?? 16)}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => adjustRemoteCalibration('stats-move-x', -10)}
                            className="w-7 h-5 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer text-[9px]"
                          >-10</button>
                          <button
                            onClick={() => adjustRemoteCalibration('stats-move-x', 10)}
                            className="w-7 h-5 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer text-[9px]"
                          >+10</button>
                        </div>
                      </div>
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
                        min={-500} max={850}
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
                    <div className="flex flex-col min-w-[120px]">
                      <span className="text-zinc-500 font-bold text-[10px] uppercase tracking-wider">Position Y</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-theme-accent font-mono font-black text-sm">{Math.round(remoteCalibration.statsPanelY ?? 0)}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => adjustRemoteCalibration('stats-move-y', -10)}
                            className="w-7 h-5 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer text-[9px]"
                          >-10</button>
                          <button
                            onClick={() => adjustRemoteCalibration('stats-move-y', 10)}
                            className="w-7 h-5 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer text-[9px]"
                          >+10</button>
                        </div>
                      </div>
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
                  {/* Slider Largeur */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between gap-3">
                    <div className="flex flex-col min-w-[120px]">
                      <span className="text-zinc-500 font-bold text-[10px] uppercase tracking-wider">Largeur</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-theme-accent font-mono font-black text-sm">{Math.round(remoteCalibration.statsPanelWidth ?? 320)}px</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              const current = remoteCalibration.statsPanelWidth ?? 320;
                              const newCal = { ...remoteCalibration };
                              newCal.statsPanelWidth = Math.max(50, current - 50);
                              saveRemoteCalibration(newCal);
                            }}
                            className="w-7 h-5 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer text-[9px]"
                          >-50</button>
                          <button
                            onClick={() => {
                              const current = remoteCalibration.statsPanelWidth ?? 320;
                              const newCal = { ...remoteCalibration };
                              newCal.statsPanelWidth = Math.min(1000, current + 50);
                              saveRemoteCalibration(newCal);
                            }}
                            className="w-7 h-5 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer text-[9px]"
                          >+50</button>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-1 justify-end">
                      <button
                        onClick={() => {
                          const current = remoteCalibration.statsPanelWidth ?? 320;
                          const newCal = { ...remoteCalibration };
                          newCal.statsPanelWidth = Math.max(50, current - 10);
                          saveRemoteCalibration(newCal);
                        }}
                        className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
                      >
                        -
                      </button>
                      <input
                        type="range"
                        min={50} max={1000} step={10}
                        value={remoteCalibration.statsPanelWidth ?? 320}
                        onChange={(e) => {
                          const newCal = { ...remoteCalibration };
                          newCal.statsPanelWidth = Number(e.target.value);
                          saveRemoteCalibration(newCal);
                        }}
                        className="w-28 h-1.5 rounded-full accent-theme-accent cursor-pointer"
                      />
                      <button
                        onClick={() => {
                          const current = remoteCalibration.statsPanelWidth ?? 320;
                          const newCal = { ...remoteCalibration };
                          newCal.statsPanelWidth = Math.min(1000, current + 10);
                          saveRemoteCalibration(newCal);
                        }}
                        className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  {/* Slider Hauteur */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between gap-3">
                    <div className="flex flex-col min-w-[120px]">
                      <span className="text-zinc-500 font-bold text-[10px] uppercase tracking-wider">Hauteur</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-theme-accent font-mono font-black text-sm">{Math.round(remoteCalibration.statsPanelHeight ?? 280)}px</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              const current = remoteCalibration.statsPanelHeight ?? 280;
                              const newCal = { ...remoteCalibration };
                              newCal.statsPanelHeight = Math.max(50, current - 50);
                              saveRemoteCalibration(newCal);
                            }}
                            className="w-7 h-5 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer text-[9px]"
                          >-50</button>
                          <button
                            onClick={() => {
                              const current = remoteCalibration.statsPanelHeight ?? 280;
                              const newCal = { ...remoteCalibration };
                              newCal.statsPanelHeight = Math.min(1000, current + 50);
                              saveRemoteCalibration(newCal);
                            }}
                            className="w-7 h-5 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer text-[9px]"
                          >+50</button>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-1 justify-end">
                      <button
                        onClick={() => {
                          const current = remoteCalibration.statsPanelHeight ?? 280;
                          const val = Math.max(50, current - 10);
                          const newCal = { ...remoteCalibration };
                          newCal.statsPanelHeight = val;
                          newCal.commentsFontSize = Math.round(Math.max(10, Math.min(40, val * 0.065)));
                          newCal.statsFontSize = Math.round(Math.max(10, Math.min(40, val * 0.057)));
                          saveRemoteCalibration(newCal);
                        }}
                        className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
                      >
                        -
                      </button>
                      <input
                        type="range"
                        min={50} max={1000} step={10}
                        value={remoteCalibration.statsPanelHeight ?? 280}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const newCal = { ...remoteCalibration };
                          newCal.statsPanelHeight = val;
                          newCal.commentsFontSize = Math.round(Math.max(10, Math.min(40, val * 0.065)));
                          newCal.statsFontSize = Math.round(Math.max(10, Math.min(40, val * 0.057)));
                          saveRemoteCalibration(newCal);
                        }}
                        className="w-28 h-1.5 rounded-full accent-theme-accent cursor-pointer"
                      />
                      <button
                        onClick={() => {
                          const current = remoteCalibration.statsPanelHeight ?? 280;
                          const val = Math.min(1000, current + 10);
                          const newCal = { ...remoteCalibration };
                          newCal.statsPanelHeight = val;
                          newCal.commentsFontSize = Math.round(Math.max(10, Math.min(40, val * 0.065)));
                          newCal.statsFontSize = Math.round(Math.max(10, Math.min(40, val * 0.057)));
                          saveRemoteCalibration(newCal);
                        }}
                        className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => resetRemoteTabParameters(9)}
                    className="w-full mt-2 py-2 border border-red-900/50 bg-red-950/20 text-red-500 hover:bg-red-950/50 hover:text-red-400 rounded-xl flex items-center justify-center gap-2 font-bold transition-all cursor-pointer active:scale-95 text-[10px] uppercase tracking-wider"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Réinitialiser cet onglet
                  </button>

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
                  <button
                    onClick={() => resetRemoteTabParameters(1)}
                    className="w-full mt-2 py-2 border border-red-900/50 bg-red-950/20 text-red-500 hover:bg-red-950/50 hover:text-red-400 rounded-xl flex items-center justify-center gap-2 font-bold transition-all cursor-pointer active:scale-95 text-[10px] uppercase tracking-wider"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Réinitialiser cet onglet
                  </button>

                  {/* Option Afficher Repères AR */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between gap-3 mt-4">
                    <div className="flex flex-col">
                      <span className="font-black uppercase tracking-wider text-zinc-500 text-[10px]">
                        Affichage Complémentaire
                      </span>
                      <span className="text-zinc-300 text-xs mt-0.5">
                        Traits et Nombres AR
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        const newCal = { ...remoteCalibration };
                        newCal.arShowExtraOverlays = remoteCalibration.arShowExtraOverlays === false ? true : false;
                        saveRemoteCalibration(newCal, true);
                      }}
                      className={`relative w-12 h-6 rounded-full transition-colors ${
                        remoteCalibration.arShowExtraOverlays !== false ? 'bg-theme-accent' : 'bg-zinc-700'
                      }`}
                    >
                      <div
                        className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${
                          remoteCalibration.arShowExtraOverlays !== false ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Bouton pour activer/désactiver l'Assistant */}
                  <div className="flex justify-center mt-4">
                    <button
                      onClick={() => setWizardStep(wizardStep === 0 ? 1 : 0)}
                      className={`py-3 px-6 rounded-xl font-black uppercase tracking-wider text-xs transition-colors w-full border ${
                        wizardStep !== 0
                          ? 'bg-red-950/20 text-red-400 border-red-900/50 hover:bg-red-900/40'
                          : 'bg-theme-accent text-black border-theme-accent hover:bg-theme-accent/80'
                      }`}
                    >
                      {wizardStep !== 0 ? 'Annuler l\'assistant' : 'Démarrer le Calibrage Assisté'}
                    </button>
                  </div>

                  {/* Nouveau D-Pad et Ajustement du Rayon */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-4 mt-4 items-center relative overflow-hidden">
                    {wizardStep === 1 && (
                      <div className="absolute top-0 left-0 w-full bg-theme-accent text-black py-1 text-center text-[10px] font-black uppercase tracking-widest">
                        Étape 1 : Placez le centre
                      </div>
                    )}
                    {wizardStep === 2 && (
                      <div className="absolute top-0 left-0 w-full bg-theme-accent text-black py-1 text-center text-[10px] font-black uppercase tracking-widest">
                        Étape 2 : Ajustez le rayon
                      </div>
                    )}
                    
                    <p className={`text-[10px] text-zinc-500 uppercase font-black tracking-widest text-center w-full mb-1 ${wizardStep !== 0 ? 'mt-4' : ''}`}>
                      Contrôles Directionnels Immédiats
                    </p>
                    <div className="flex w-full items-center justify-center gap-6">
                      
                      {/* D-Pad pour Centre X/Y */}
                      {(wizardStep === 0 || wizardStep === 1) && (
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] text-zinc-500 mb-2">Centre Cible</span>
                        
                        {/* Row 1: Up */}
                        <div className="flex items-center justify-center gap-1 mb-1">
                           <button onClick={() => adjustRemoteCalibration('move-y', -5, true)} className="w-10 h-6 bg-zinc-800 hover:bg-zinc-700 rounded text-theme-accent active:scale-95 flex items-center justify-center font-bold text-xs">⇈ 5</button>
                           <button onClick={() => adjustRemoteCalibration('move-y', -3, true)} className="w-10 h-7 bg-zinc-800 hover:bg-zinc-700 rounded text-theme-accent active:scale-95 flex items-center justify-center font-bold text-sm">⇈ 3</button>
                        </div>
                        <div className="flex items-center justify-center gap-1 mb-1">
                           <button onClick={() => adjustRemoteCalibration('move-y', -1, true)} className="w-12 h-10 bg-zinc-700 hover:bg-zinc-600 rounded text-theme-accent active:scale-95 flex items-center justify-center"><ChevronUp className="w-5 h-5"/></button>
                        </div>

                        {/* Row 2: Left - Center - Right */}
                        <div className="flex items-center justify-center gap-1 mb-1">
                           <div className="flex flex-col gap-1">
                             <button onClick={() => adjustRemoteCalibration('move-x', -5, true)} className="w-6 h-10 bg-zinc-800 hover:bg-zinc-700 rounded text-theme-accent active:scale-95 flex items-center justify-center font-bold text-xs"><span className="rotate-0">⇇</span></button>
                             <button onClick={() => adjustRemoteCalibration('move-x', -3, true)} className="w-7 h-10 bg-zinc-800 hover:bg-zinc-700 rounded text-theme-accent active:scale-95 flex items-center justify-center font-bold text-sm">⇇</button>
                           </div>
                           <button onClick={() => adjustRemoteCalibration('move-x', -1, true)} className="w-10 h-12 bg-zinc-700 hover:bg-zinc-600 rounded text-theme-accent active:scale-95 flex items-center justify-center"><ChevronLeft className="w-5 h-5"/></button>
                           
                           {wizardStep === 1 ? (
                             <button onClick={() => setWizardStep(2)} className="w-16 h-12 flex items-center justify-center bg-theme-accent hover:bg-theme-accent/80 rounded text-black font-black text-[10px] leading-tight active:scale-95 text-center px-1">Valider<br/>Centre</button>
                           ) : (
                             <div className="w-10 h-12 flex items-center justify-center bg-zinc-900/50 rounded"><Crosshair className="w-5 h-5 text-zinc-500" /></div>
                           )}

                           <button onClick={() => adjustRemoteCalibration('move-x', 1, true)} className="w-10 h-12 bg-zinc-700 hover:bg-zinc-600 rounded text-theme-accent active:scale-95 flex items-center justify-center"><ChevronRight className="w-5 h-5"/></button>
                           <div className="flex flex-col gap-1">
                             <button onClick={() => adjustRemoteCalibration('move-x', 3, true)} className="w-7 h-10 bg-zinc-800 hover:bg-zinc-700 rounded text-theme-accent active:scale-95 flex items-center justify-center font-bold text-sm">⇉</button>
                             <button onClick={() => adjustRemoteCalibration('move-x', 5, true)} className="w-6 h-10 bg-zinc-800 hover:bg-zinc-700 rounded text-theme-accent active:scale-95 flex items-center justify-center font-bold text-xs">⇉</button>
                           </div>
                        </div>

                        {/* Row 3: Down */}
                        <div className="flex items-center justify-center gap-1 mb-1">
                           <button onClick={() => adjustRemoteCalibration('move-y', 1, true)} className="w-12 h-10 bg-zinc-700 hover:bg-zinc-600 rounded text-theme-accent active:scale-95 flex items-center justify-center"><ChevronDown className="w-5 h-5"/></button>
                        </div>
                        <div className="flex items-center justify-center gap-1">
                           <button onClick={() => adjustRemoteCalibration('move-y', 3, true)} className="w-10 h-7 bg-zinc-800 hover:bg-zinc-700 rounded text-theme-accent active:scale-95 flex items-center justify-center font-bold text-sm">⇊ 3</button>
                           <button onClick={() => adjustRemoteCalibration('move-y', 5, true)} className="w-10 h-6 bg-zinc-800 hover:bg-zinc-700 rounded text-theme-accent active:scale-95 flex items-center justify-center font-bold text-xs">⇊ 5</button>
                        </div>
                      </div>
                      )}

                      {/* Boutons Rayon */}
                      {(wizardStep === 0 || wizardStep === 2) && (
                      <div className="flex flex-col items-center h-full justify-center gap-2">
                        <span className="text-[10px] text-zinc-500 mb-1">Taille</span>
                        <div className="flex gap-2">
                          <button onClick={() => adjustRemoteCalibration('scale-step', 5, true)} className="w-10 h-10 bg-zinc-800 hover:bg-zinc-700 rounded text-theme-accent active:scale-95 font-black text-sm">+5</button>
                          <button onClick={() => adjustRemoteCalibration('scale-step', 3, true)} className="w-10 h-10 bg-zinc-800 hover:bg-zinc-700 rounded text-theme-accent active:scale-95 font-bold text-sm">+3</button>
                        </div>
                        <button onClick={() => adjustRemoteCalibration('scale-step', 1, true)} className="w-20 h-10 bg-zinc-700 hover:bg-zinc-600 rounded text-theme-accent active:scale-95 font-bold">+</button>
                        
                        {wizardStep === 2 && (
                           <button onClick={() => setWizardStep(0)} className="w-20 h-10 bg-theme-accent hover:bg-theme-accent/80 rounded text-black active:scale-95 font-black text-[10px] leading-tight flex items-center justify-center px-1 text-center">Terminer<br/>Calibrage</button>
                        )}

                        <button onClick={() => adjustRemoteCalibration('scale-step', -1, true)} className="w-20 h-10 bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-300 active:scale-95 font-bold">-</button>
                        <div className="flex gap-2">
                          <button onClick={() => adjustRemoteCalibration('scale-step', -3, true)} className="w-10 h-10 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 active:scale-95 font-bold text-sm">-3</button>
                          <button onClick={() => adjustRemoteCalibration('scale-step', -5, true)} className="w-10 h-10 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 active:scale-95 font-black text-sm">-5</button>
                        </div>
                      </div>
                      )}

                    </div>
                  </div>

                </div>
              )}

              {/* Boutons directionnels d'ajustement fin (étapes autres que 1) */}
              {remoteCalibrationStep !== 1 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                  <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-3 text-center">
                    Ajustement fin (±1px)
                  </p>
                  <div className="grid grid-cols-3 gap-2 w-36 mx-auto">
                    <div />
                    <button
                      onClick={() => { if (remoteCalibrationStep === 9) adjustRemoteCalibration('stats-move-y', -2, true); else adjustRemoteCalibration('scale-step', -1, true); }}
                      className="p-3 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-theme-accent rounded-xl flex items-center justify-center transition-all cursor-pointer active:scale-95"
                    >
                      <ChevronUp className="w-5 h-5" />
                    </button>
                    <div />
                    <button
                      onClick={() => { if (remoteCalibrationStep === 8) { const newCal = { ...remoteCalibration }; newCal.haloMaxRadius = Math.max((newCal.haloWhiteRadius ?? (newCal.rDoubleOuter * 1.1)) + 10, (newCal.haloMaxRadius ?? (newCal.rDoubleOuter * 2.5)) - 5); saveRemoteCalibration(newCal, true); } else if (remoteCalibrationStep === 9) adjustRemoteCalibration('stats-move-x', -2, true); }}
                      className={`p-3 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-theme-accent rounded-xl flex items-center justify-center transition-all cursor-pointer active:scale-95 ${remoteCalibrationStep !== 8 && remoteCalibrationStep !== 9 ? 'opacity-30 pointer-events-none' : ''}`}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => { if (remoteCalibrationStep === 9) adjustRemoteCalibration('stats-move-y', 2, true); else adjustRemoteCalibration('scale-step', 1, true); }}
                      className="p-3 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-theme-accent rounded-xl flex items-center justify-center transition-all cursor-pointer active:scale-95"
                    >
                      <ChevronDown className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => { if (remoteCalibrationStep === 8) { const newCal = { ...remoteCalibration }; newCal.haloMaxRadius = Math.min(850, (newCal.haloMaxRadius ?? (newCal.rDoubleOuter * 2.5)) + 5); saveRemoteCalibration(newCal, true); } else if (remoteCalibrationStep === 9) adjustRemoteCalibration('stats-move-x', 2, true); }}
                      className={`p-3 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-theme-accent rounded-xl flex items-center justify-center transition-all cursor-pointer active:scale-95 ${remoteCalibrationStep !== 8 && remoteCalibrationStep !== 9 ? 'opacity-30 pointer-events-none' : ''}`}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}

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
