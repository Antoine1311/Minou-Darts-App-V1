import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { Award, Zap, ArrowLeft, Users, Smartphone, Eye, Tv, Maximize2, Sparkles, Settings, Check, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, RotateCcw, Crosshair } from 'lucide-react';
import { roomService, getGameHighlights } from '../services/roomService';
import type { RoomData, CalibrationSettings } from '../services/roomService';
import { BartProjectorGame } from './BartProjectorGame';
import { ClockProjectorGame } from './ClockProjectorGame';
import { getCheckoutSuggestion } from '../services/checkoutSuggestions';

// --- Constantes & Utilitaires pour la géométrie de la cible ---
const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

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

const ProjectorScaleWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const scaleFactor = Math.min(w / 1280, h / 720);
      setScale(scaleFactor);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="w-screen h-screen bg-black flex items-center justify-center overflow-hidden">
      <div
        style={{
          width: '1280px',
          height: '720px',
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          flexShrink: 0,
        }}
        className="relative bg-black overflow-hidden select-none"
      >
        {children}
      </div>
    </div>
  );
};

export const ProjectorView: React.FC = () => {
  const { theme } = useTheme();
  const [room, setRoom] = useState<RoomData | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const isCreatingRoom = useRef(false);

  // Modes d'affichage : 'classic' (séparé), 'fullscreen' (scores seuls), 'ar' (réalité augmentée)
  const [projectorMode, setProjectorMode] = useState<'classic' | 'fullscreen' | 'ar'>(() => {
    const saved = localStorage.getItem('minou_dart_projector_mode');
    if (saved === 'classic' || saved === 'fullscreen' || saved === 'ar') return saved;
    return 'classic';
  });
  const [showModeSelector, setShowModeSelector] = useState<boolean>(false);

  // Synchronisation du mode de vue depuis la télécommande (via storage event)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'minou_dart_projector_mode' && e.newValue) {
        const newMode = e.newValue;
        if (newMode === 'classic' || newMode === 'fullscreen' || newMode === 'ar') {
          setProjectorMode(newMode);
        }
      }
      if (e.key === 'minou_dart_calibration' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setCalibration(parsed);
        } catch (_) {
          // Ignorer les erreurs de parsing
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // --- États et Constantes pour le calibrage de la cible en Réalité Augmentée ---
  const DEFAULT_RADIUS = 350;
  const STANDARD_RATIOS = {
    rBullInner: 6.35 / 170,
    rBullOuter: 15.9 / 170,
    rTripleInner: 99 / 170,
    rTripleOuter: 107 / 170,
    rDoubleInner: 162 / 170,
    rDoubleOuter: 1.0,
  };

  const DEFAULT_CALIBRATION: CalibrationSettings = {
    centerX: 500,
    centerY: 500,
    radius: DEFAULT_RADIUS,
    rBullInner: DEFAULT_RADIUS * STANDARD_RATIOS.rBullInner,
    rBullOuter: DEFAULT_RADIUS * STANDARD_RATIOS.rBullOuter,
    rTripleInner: DEFAULT_RADIUS * STANDARD_RATIOS.rTripleInner,
    rTripleOuter: DEFAULT_RADIUS * STANDARD_RATIOS.rTripleOuter,
    rDoubleInner: DEFAULT_RADIUS * STANDARD_RATIOS.rDoubleInner,
    rDoubleOuter: DEFAULT_RADIUS * STANDARD_RATIOS.rDoubleOuter,
    haloWhiteRadius: DEFAULT_RADIUS * 1.1,
    haloMaxRadius: DEFAULT_RADIUS * 2.5,
    statsFontSize: 16,
    commentsFontSize: 18,
    statsFontScaleX: 1.0,
    statsFontScaleY: 1.0,
  };

  const [calibration, setCalibration] = useState<CalibrationSettings>(() => {
    const saved = localStorage.getItem('minou_dart_calibration');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Erreur lors de la lecture de la calibration :", e);
      }
    }
    return DEFAULT_CALIBRATION;
  });

  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [calibrationStep, setCalibrationStep] = useState<number>(1);
  const [lastCalibrationHit, setLastCalibrationHit] = useState<{ region: string; score: number } | null>(null);
  const [highlightedSegment, setHighlightedSegment] = useState<string | null>(null);
  const [clickToCenterState, setClickToCenterState] = useState<'none' | 'center' | 'radius'>('none');
  const [statsCalibrationState, setStatsCalibrationState] = useState<'none' | 'top-left' | 'bottom-right'>('none');
  const statsStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const [liveStatsRect, setLiveStatsRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const targetCenterRef = useRef<{ x: number; y: number } | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const hitTimeoutRef = useRef<any | null>(null);

  // --- Synchronisation de l'état de calibration avec la télécommande ---
  useEffect(() => {
    if (room?.isCalibrating !== undefined) {
      setIsCalibrating(room.isCalibrating);
    }
  }, [room?.isCalibrating]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'minou_dart_is_calibrating') {
        setIsCalibrating(e.newValue === 'true');
      }
    };
    window.addEventListener('storage', handleStorageChange);
    // Vérifier au montage
    if (localStorage.getItem('minou_dart_is_calibrating') === 'true') {
      setIsCalibrating(true);
    }
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // --- États et refs pour les animations interactives de tir (501) ---
  const [animationActive, setAnimationActive] = useState<boolean>(false);
  const [animatingDarts, setAnimatingDarts] = useState<string[]>([]);
  const [activeAnimationIndex, setActiveAnimationIndex] = useState<number>(-1);
  const lastThrowsCountRef = useRef<number>(0);
  const activePlayerNameRef = useRef<string>('');

  // --- États pour le système d'animations de gamification AR ---
  interface ARParticle {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: string;
    radius: number;
    opacity: number;
  }
  const [globalRoundAnimation, setGlobalRoundAnimation] = useState<{
    type: '180' | 'highscore' | 'bust' | null;
    score?: number;
    active: boolean;
  }>({ type: null, active: false });
  const [particles, setParticles] = useState<ARParticle[]>([]);
  const [showRoundPath, setShowRoundPath] = useState<boolean>(false);

  const firestoreTimeoutRef = useRef<any>(null);

  const saveCalibration = (newCal: CalibrationSettings) => {
    setCalibration(newCal);
    // Utiliser dispatchEvent pour que les autres onglets (télécommande) reçoivent aussi l'event
    localStorage.setItem('minou_dart_calibration', JSON.stringify(newCal));

    if (roomId && roomId !== 'LOCAL') {
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

  const adjustCalibrationToRadius = (newRadius: number) => {
    const newCal = { ...calibration };
    if (targetCenterRef.current) {
      newCal.centerX = targetCenterRef.current.x;
      newCal.centerY = targetCenterRef.current.y;
    }
    const oldRadius = newCal.rDoubleOuter || newCal.radius || 350;
    const newVal = Math.max(50, Math.min(500, newRadius));
    const ratio = newVal / oldRadius;
    
    newCal.radius = Math.round(newVal);
    newCal.rDoubleOuter = Math.round(newVal);
    newCal.rDoubleInner = Math.round(newCal.rDoubleInner * ratio);
    newCal.rTripleOuter = Math.round(newCal.rTripleOuter * ratio);
    newCal.rTripleInner = Math.round(newCal.rTripleInner * ratio);
    newCal.rBullOuter = Math.round(newCal.rBullOuter * ratio);
    newCal.rBullInner = Math.round(newCal.rBullInner * ratio);
    if (newCal.haloWhiteRadius) {
      newCal.haloWhiteRadius = Math.round(newCal.haloWhiteRadius * ratio);
    } else {
      newCal.haloWhiteRadius = Math.round(newVal * 1.1);
    }
    if (newCal.haloMaxRadius) {
      newCal.haloMaxRadius = Math.round(newCal.haloMaxRadius * ratio);
    } else {
      newCal.haloMaxRadius = Math.round(newVal * 2.5);
    }
    
    saveCalibration(newCal);
  };

  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (clickToCenterState === 'none') return;
    
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    
    const W = rect.width;
    const H = rect.height;
    const S = Math.min(W, H);
    const offsetX = W > H ? (W - H) / 2 : 0;
    const offsetY = H > W ? (H - W) / 2 : 0;
    
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const localX = clickX - offsetX;
    const localY = clickY - offsetY;
    
    const x = Math.round(Math.max(0, Math.min(1000, (localX / S) * 1000)));
    const y = Math.round(Math.max(0, Math.min(1000, (localY / S) * 1000)));

    if (clickToCenterState === 'center') {
      const newCal = { ...calibration };
      newCal.centerX = x;
      newCal.centerY = y;
      targetCenterRef.current = { x, y };
      saveCalibration(newCal);
    } else if (clickToCenterState === 'radius') {
      const center = targetCenterRef.current || { x: calibration.centerX, y: calibration.centerY };
      const dx = x - center.x;
      const dy = y - center.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      adjustCalibrationToRadius(distance);
      
      // Verrouiller la taille et terminer la calibration
      setClickToCenterState('none');
      targetCenterRef.current = null;
    }
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (clickToCenterState !== 'radius') return;
    
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    
    const W = rect.width;
    const H = rect.height;
    const S = Math.min(W, H);
    const offsetX = W > H ? (W - H) / 2 : 0;
    const offsetY = H > W ? (H - W) / 2 : 0;
    
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const localX = clickX - offsetX;
    const localY = clickY - offsetY;
    
    const x = (localX / S) * 1000;
    const y = (localY / S) * 1000;

    const center = targetCenterRef.current || { x: calibration.centerX, y: calibration.centerY };
    const dx = x - center.x;
    const dy = y - center.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    adjustCalibrationToRadius(distance);
  };

  const handleStatsPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (statsCalibrationState === 'none') return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);

    if (statsCalibrationState === 'top-left') {
      statsStartPointRef.current = { x, y };
      setLiveStatsRect({ x, y, width: 50, height: 50 });
      setStatsCalibrationState('bottom-right');
    } else if (statsCalibrationState === 'bottom-right') {
      if (statsStartPointRef.current) {
        const x1 = statsStartPointRef.current.x;
        const y1 = statsStartPointRef.current.y;
        const width = Math.max(50, x - x1);
        const height = Math.max(50, y - y1);

        const newCal = { ...calibration };
        newCal.statsPanelX = x1;
        newCal.statsPanelY = y1;
        newCal.statsPanelWidth = width;
        newCal.statsPanelHeight = height;
        newCal.commentsFontSize = Math.round(Math.max(10, Math.min(40, height * 0.065)));
        newCal.statsFontSize = Math.round(Math.max(10, Math.min(40, height * 0.057)));
        saveCalibration(newCal);
      }
      statsStartPointRef.current = null;
      setLiveStatsRect(null);
      setStatsCalibrationState('none');
    }
  };

  const handleStatsPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (statsCalibrationState !== 'bottom-right' || !statsStartPointRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);

    const x1 = statsStartPointRef.current.x;
    const y1 = statsStartPointRef.current.y;
    const width = Math.max(50, x - x1);
    const height = Math.max(50, y - y1);

    setLiveStatsRect({ x: x1, y: y1, width, height });
  };

  const adjustCalibration = (type: 'move-x' | 'move-y' | 'scale-step' | 'stats-move-x' | 'stats-move-y', delta: number) => {
    const newCal = { ...calibration };
    if (type === 'move-x') {
      newCal.centerX = Math.max(0, Math.min(1000, newCal.centerX + delta));
    } else if (type === 'move-y') {
      newCal.centerY = Math.max(0, Math.min(1000, newCal.centerY + delta));
    } else if (type === 'stats-move-x') {
      newCal.statsPanelX = Math.max(-500, Math.min(1000, (newCal.statsPanelX ?? 16) + delta));
    } else if (type === 'stats-move-y') {
      newCal.statsPanelY = Math.max(-500, Math.min(500, (newCal.statsPanelY ?? 0) + delta));
    } else if (type === 'scale-step') {
      switch (calibrationStep) {
        case 1: // Rayon global
        case 2: // Rayon Double Outer (met tout à l'échelle)
          {
            const oldVal = calibrationStep === 1 ? newCal.radius : newCal.rDoubleOuter;
            const newVal = Math.max(50, Math.min(500, oldVal + delta));
            const ratio = newVal / oldVal;
            newCal.radius = newVal;
            newCal.rDoubleOuter = newVal;
            newCal.rDoubleInner = newCal.rDoubleInner * ratio;
            newCal.rTripleOuter = newCal.rTripleOuter * ratio;
            newCal.rTripleInner = newCal.rTripleInner * ratio;
            newCal.rBullOuter = newCal.rBullOuter * ratio;
            newCal.rBullInner = newCal.rBullInner * ratio;
            newCal.haloWhiteRadius = (newCal.haloWhiteRadius ?? (oldVal * 1.1)) * ratio;
            newCal.haloMaxRadius = (newCal.haloMaxRadius ?? (oldVal * 2.5)) * ratio;
          }
          break;
        case 3: // Double Inner
          newCal.rDoubleInner = Math.max(newCal.rTripleOuter + 5, Math.min(newCal.rDoubleOuter - 2, newCal.rDoubleInner + delta));
          break;
        case 4: // Triple Outer
          newCal.rTripleOuter = Math.max(newCal.rTripleInner + 5, Math.min(newCal.rDoubleInner - 5, newCal.rTripleOuter + delta));
          break;
        case 5: // Triple Inner
          newCal.rTripleInner = Math.max(newCal.rBullOuter + 10, Math.min(newCal.rTripleOuter - 5, newCal.rTripleInner + delta));
          break;
        case 6: // Bull Outer
          newCal.rBullOuter = Math.max(newCal.rBullInner + 2, Math.min(newCal.rTripleInner - 10, newCal.rBullOuter + delta));
          break;
        case 7: // Bull Inner
          newCal.rBullInner = Math.max(2, Math.min(newCal.rBullOuter - 2, newCal.rBullInner + delta));
          break;
        case 8: // Dégradé : taille du rond blanc
          newCal.haloWhiteRadius = Math.max(newCal.rDoubleOuter - 20, Math.min((newCal.haloMaxRadius ?? (newCal.rDoubleOuter * 2.5)) - 10, (newCal.haloWhiteRadius ?? (newCal.rDoubleOuter * 1.1)) + delta));
          break;
      }
    }
    saveCalibration(newCal);
  };

  const adjustHaloMaxRadius = (delta: number) => {
    const newCal = { ...calibration };
    const minVal = (newCal.haloWhiteRadius ?? (newCal.rDoubleOuter * 1.1)) + 10;
    newCal.haloMaxRadius = Math.max(minVal, Math.min(1500, (newCal.haloMaxRadius ?? (newCal.rDoubleOuter * 2.5)) + delta));
    saveCalibration(newCal);
  };



  const renderProjectorSliderWithButtons = (
    label: string,
    value: number,
    min: number,
    max: number,
    onChange: (val: number) => void,
    step: number = 1,
    unit: string = '',
    isHighlight: boolean = false
  ) => {
    const handleValueChange = (newVal: number) => {
      if (step < 1) {
        onChange(Number(newVal.toFixed(2)));
      } else {
        onChange(newVal);
      }
    };

    return (
      <div className={`bg-zinc-900/80 border rounded-2xl p-2.5 flex items-center justify-between gap-3 ${
        isHighlight ? 'border-orange-500/40 shadow-[0_0_15px_rgba(234,88,12,0.15)] bg-orange-950/5' : 'border-zinc-800/80'
      }`}>
        <div className="flex flex-col min-w-[120px]">
          <span className={`font-black uppercase tracking-wider ${
            isHighlight ? 'text-orange-400 text-xs md:text-sm' : 'text-zinc-500 text-[10px]'
          }`}>
            {label}
          </span>
          <span className={`font-mono font-black ${
            isHighlight ? 'text-white text-base md:text-lg' : 'text-theme-accent text-sm'
          }`}>
            {step < 1 ? value.toFixed(2) : Math.round(value)}{unit}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-1 justify-end">
          <button
            onClick={() => handleValueChange(Math.max(min, value - step))}
            className="w-8 h-8 rounded-lg bg-zinc-850 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-750 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
          >
            -
          </button>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => handleValueChange(Number(e.target.value))}
            className="w-28 h-1.5 rounded-full accent-theme-accent cursor-pointer"
          />
          <button
            onClick={() => handleValueChange(Math.min(max, value + step))}
            className="w-8 h-8 rounded-lg bg-zinc-850 border border-zinc-700 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-750 hover:text-white transition-colors cursor-pointer active:scale-95 flex-shrink-0"
          >
            +
          </button>
        </div>
      </div>
    );
  };

  const renderProjectorCalibrationInterface = () => {
    const CALIBRATION_STEPS = [
      { step: 1, label: '🎯 CIBLE', desc: 'Centre & Rayon' },
      { step: 8, label: '🔆 DÉGRADÉ', desc: 'Halos Blanc/Noir' },
      { step: 9, label: '📊 STATS / POLICES', desc: 'Positions & Tailles' },
    ];

    return (
      <div className="flex flex-col h-full justify-between gap-4 p-4 md:p-5 bg-zinc-950/40 rounded-3xl border border-zinc-800/80 backdrop-blur-md">
        {/* En-tête du panneau de calibrage */}
        <div className="flex items-center justify-between border-b border-zinc-850 pb-2.5">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-theme-accent animate-spin-slow" />
            <span className="text-sm font-black text-white uppercase tracking-wider">Interface de Calibrage</span>
          </div>
          <span className="text-[10px] text-zinc-500 font-bold bg-zinc-900 border border-zinc-850 px-2 py-0.5 rounded-full uppercase">
            Projecteur 720p
          </span>
        </div>

        {/* Sélecteur d'étapes (la "bulle de sélection" avec gros boutons faciles à lire) */}
        <div className="space-y-1.5">
          <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">
            Étape de calibration
          </p>
          <div className="grid grid-cols-3 gap-2">
            {CALIBRATION_STEPS.map((item) => {
              const isDegrade = item.step === 8;
              const isSelected = calibrationStep === item.step;
              return (
                <button
                  key={item.step}
                  onClick={() => setCalibrationStep(item.step)}
                  className={`py-3 px-2 rounded-2xl border text-center flex flex-col items-center justify-center gap-1 transition-all cursor-pointer select-none active:scale-95 ${
                    isSelected
                      ? isDegrade
                        ? 'bg-orange-500 text-white border-orange-400 shadow-[0_0_15px_rgba(234,88,12,0.4)] scale-105 font-black'
                        : 'bg-theme-accent text-black border-theme-accent shadow-md scale-105 font-black'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800 hover:text-white'
                  }`}
                >
                  <span className={`font-black ${
                    isDegrade 
                      ? 'text-lg md:text-xl lg:text-2xl tracking-wide' 
                      : 'text-base md:text-lg'
                  }`}>
                    {item.label}
                  </span>
                  <span className={`font-bold leading-tight ${
                    isDegrade 
                      ? 'text-[10px] md:text-[11px]' 
                      : 'text-[9px]'
                  } ${isSelected ? (isDegrade ? 'text-white/90' : 'text-black/85') : 'text-zinc-500'}`}>
                    {item.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section dynamique des Sliders (tous à droite !) */}
        <div className="flex-grow flex flex-col justify-start gap-3 py-2 overflow-y-auto min-h-0">
          {calibrationStep === 1 && (
            <div className="space-y-2.5">
              {/* Option Cliquer pour centrer */}
              {clickToCenterState === 'none' ? (
                <button
                  onClick={() => setClickToCenterState('center')}
                  className="w-full py-2.5 px-3 border bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl flex items-center justify-center gap-2 font-black transition-all cursor-pointer select-none active:scale-95 text-xs"
                >
                  <Crosshair className="w-4 h-4" />
                  <span>Choisir le centre sur la cible</span>
                </button>
              ) : clickToCenterState === 'center' ? (
                <div className="space-y-2 w-full animate-fadeIn">
                  <div className="w-full py-2.5 px-3 border bg-yellow-500 border-yellow-400 text-black shadow-[0_0_15px_rgba(234,179,8,0.4)] animate-pulse rounded-xl flex items-center justify-center gap-2 font-black text-xs">
                    <Crosshair className="w-4 h-4 animate-spin-slow" />
                    <span>Sélection active : cliquez pour placer le centre</span>
                  </div>
                  <button
                    onClick={() => setClickToCenterState('radius')}
                    className="w-full py-2.5 px-3 bg-green-500 hover:bg-green-450 text-black rounded-xl flex items-center justify-center gap-2 font-black transition-all cursor-pointer select-none active:scale-95 text-xs shadow-md shadow-green-900/10"
                  >
                    <Check className="w-4 h-4 stroke-[3px]" />
                    <span>Verrouiller le centre & Ajuster le cercle extérieur</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2 w-full animate-fadeIn">
                  <div className="w-full py-2.5 px-3 border bg-yellow-500 border-yellow-400 text-black shadow-[0_0_15px_rgba(234,179,8,0.4)] animate-pulse rounded-xl flex items-center justify-center gap-2 font-black text-xs">
                    <Crosshair className="w-4 h-4 animate-spin-slow" />
                    <span>Déplacez le curseur / cliquez pour régler le rayon</span>
                  </div>
                  <button
                    onClick={() => setClickToCenterState('none')}
                    className="w-full py-2.5 px-3 bg-green-500 hover:bg-green-450 text-black rounded-xl flex items-center justify-center gap-2 font-black transition-all cursor-pointer select-none active:scale-95 text-xs shadow-md shadow-green-900/10"
                  >
                    <Check className="w-4 h-4 stroke-[3px]" />
                    <span>Valider la cible (OK)</span>
                  </button>
                </div>
              )}
              {/* Slider Rayon Global */}
              {renderProjectorSliderWithButtons(
                'Rayon de la cible', 
                calibration.radius, 
                50, 
                500, 
                (val) => {
                  const currentVal = calibration.radius;
                  adjustCalibration('scale-step', val - currentVal);
                },
                1
              )}
              {/* Slider Centre X */}
              {renderProjectorSliderWithButtons(
                'Centre X', 
                calibration.centerX, 
                0, 
                1000, 
                (val) => adjustCalibration('move-x', val - calibration.centerX),
                1
              )}
              {/* Slider Centre Y */}
              {renderProjectorSliderWithButtons(
                'Centre Y', 
                calibration.centerY, 
                0, 
                1000, 
                (val) => adjustCalibration('move-y', val - calibration.centerY),
                1
              )}
            </div>
          )}

          {calibrationStep === 8 && (
            <div className="space-y-2.5">
              {/* Slider Halo Blanc */}
              {renderProjectorSliderWithButtons(
                'Halo Blanc', 
                calibration.haloWhiteRadius ?? (calibration.rDoubleOuter * 1.1), 
                Math.round(calibration.rDoubleOuter - 20), 
                Math.round((calibration.haloMaxRadius ?? (calibration.rDoubleOuter * 2.5)) - 10), 
                (val) => {
                  const currentVal = calibration.haloWhiteRadius ?? (calibration.rDoubleOuter * 1.1);
                  adjustCalibration('scale-step', val - currentVal);
                },
                1,
                '',
                true
              )}
              {/* Slider Halo Noir */}
              {renderProjectorSliderWithButtons(
                'Halo Noir (Dégradé)', 
                calibration.haloMaxRadius ?? (calibration.rDoubleOuter * 2.5), 
                Math.round((calibration.haloWhiteRadius ?? (calibration.rDoubleOuter * 1.1)) + 10), 
                1500, 
                (val) => {
                  const newCal = { ...calibration };
                  newCal.haloMaxRadius = val;
                  saveCalibration(newCal);
                },
                5,
                '',
                true
              )}
            </div>
          )}

          {calibrationStep === 9 && (
            <div className="space-y-2.5">
              {/* Option Définir la zone par clics */}
              {statsCalibrationState === 'none' ? (
                <button
                  onClick={() => setStatsCalibrationState('top-left')}
                  className="w-full py-2.5 px-3 border bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl flex items-center justify-center gap-2 font-black transition-all cursor-pointer select-none active:scale-95 text-xs"
                >
                  <Crosshair className="w-4 h-4" />
                  <span>Tracer la zone de commentaires</span>
                </button>
              ) : statsCalibrationState === 'top-left' ? (
                <div className="w-full py-2.5 px-3 border bg-yellow-500 border-yellow-400 text-black shadow-[0_0_15px_rgba(234,179,8,0.4)] animate-pulse rounded-xl flex items-center justify-center gap-2 font-black text-xs">
                  <Crosshair className="w-4 h-4 animate-spin-slow" />
                  <span>1. Cliquez sur le coin supérieur gauche</span>
                </div>
              ) : (
                <div className="w-full py-2.5 px-3 border bg-yellow-500 border-yellow-400 text-black shadow-[0_0_15px_rgba(234,179,8,0.4)] animate-pulse rounded-xl flex items-center justify-center gap-2 font-black text-xs">
                  <Crosshair className="w-4 h-4 animate-spin-slow" />
                  <span>2. Déplacez & cliquez sur le coin inférieur droit</span>
                </div>
              )}

              {/* Slider Position X Stats */}
              {renderProjectorSliderWithButtons(
                'Position X Stats', 
                calibration.statsPanelX ?? 16, 
                -500, 
                1500, 
                (val) => adjustCalibration('stats-move-x', val - (calibration.statsPanelX ?? 16)),
                1
              )}
              {/* Slider Position Y Stats */}
              {renderProjectorSliderWithButtons(
                'Position Y Stats', 
                calibration.statsPanelY ?? 0, 
                -500, 
                500, 
                (val) => adjustCalibration('stats-move-y', val - (calibration.statsPanelY ?? 0)),
                1
              )}
              {/* Slider Taille Police Stats */}
              {renderProjectorSliderWithButtons(
                'Police Stats', 
                calibration.statsFontSize ?? 16, 
                10, 
                40, 
                (val) => {
                  const newCal = { ...calibration };
                  newCal.statsFontSize = val;
                  saveCalibration(newCal);
                },
                1,
                'px'
              )}
              {/* Slider Largeur Police Stats */}
              {renderProjectorSliderWithButtons(
                'Largeur Stats', 
                calibration.statsFontScaleX ?? 1.0, 
                0.5, 
                2.0, 
                (val) => {
                  const newCal = { ...calibration };
                  newCal.statsFontScaleX = val;
                  saveCalibration(newCal);
                },
                0.05,
                'x'
              )}
              {/* Slider Hauteur Police Stats */}
              {renderProjectorSliderWithButtons(
                'Hauteur Stats', 
                calibration.statsFontScaleY ?? 1.0, 
                0.5, 
                2.0, 
                (val) => {
                  const newCal = { ...calibration };
                  newCal.statsFontScaleY = val;
                  saveCalibration(newCal);
                },
                0.05,
                'x'
              )}
              {/* Slider Taille Police Commentaires */}
              {renderProjectorSliderWithButtons(
                'Police Commentaires', 
                calibration.commentsFontSize ?? 18, 
                10, 
                40, 
                (val) => {
                  const newCal = { ...calibration };
                  newCal.commentsFontSize = val;
                  saveCalibration(newCal);
                },
                1,
                'px'
              )}

              {/* Zone de prévisualisation des polices */}
              <div className="bg-black/60 border border-zinc-800 rounded-2xl p-2.5 space-y-2 mt-1 w-full text-left">
                <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider block">Prévisualisation du texte</span>
                <div className="space-y-2">
                  <div>
                    <span className="text-[8px] text-zinc-400 block mb-0.5">Statistiques (ex. Cricket, X01) :</span>
                    <div className="flex justify-center items-center bg-zinc-950 p-2 rounded-xl border border-zinc-850 overflow-hidden h-10">
                      <div 
                        className="text-white font-black whitespace-nowrap"
                        style={{
                          fontSize: `${calibration.statsFontSize ?? 16}px`,
                          transform: `scale(${calibration.statsFontScaleX ?? 1.0}, ${calibration.statsFontScaleY ?? 1.0})`,
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
                    <div className="flex justify-center items-center bg-zinc-950 p-2 rounded-xl border border-zinc-850 overflow-hidden h-10">
                      <div 
                        className="text-theme-accent font-black whitespace-nowrap animate-pulse"
                        style={{
                          fontSize: `${calibration.commentsFontSize ?? 18}px`,
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
        </div>

        {/* Pied du panneau de calibrage (Flèches, Reset, Valider) */}
        <div className="border-t border-zinc-850 pt-3.5 flex flex-col xl:flex-row items-center justify-between gap-3 flex-shrink-0">
          {/* Flèches de direction */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[9px] text-zinc-500 font-black uppercase tracking-widest select-none">Pavé de direction</span>
            <div className="grid grid-cols-3 gap-0.5 w-24 h-16 relative">
              <button
                onClick={() => {
                  if (calibrationStep === 1) adjustCalibration('move-y', -2);
                  else if (calibrationStep === 9) adjustCalibration('stats-move-y', -2);
                  else {
                    adjustCalibration('scale-step', -1);
                  }
                }}
                className="col-start-2 p-0.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-theme-accent hover:text-white rounded-md flex items-center justify-center transition-all cursor-pointer active:scale-95"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  if (calibrationStep === 1) adjustCalibration('move-x', -2);
                  else if (calibrationStep === 8) adjustHaloMaxRadius(-5);
                  else if (calibrationStep === 9) adjustCalibration('stats-move-x', -2);
                }}
                className="col-start-1 row-start-2 p-0.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-theme-accent hover:text-white rounded-md flex items-center justify-center transition-all cursor-pointer active:scale-95"
                disabled={calibrationStep !== 1 && calibrationStep !== 8 && calibrationStep !== 9}
                style={{ opacity: (calibrationStep === 1 || calibrationStep === 8 || calibrationStep === 9) ? 1 : 0.3 }}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  if (calibrationStep === 1) adjustCalibration('move-x', 2);
                  else if (calibrationStep === 8) adjustHaloMaxRadius(5);
                  else if (calibrationStep === 9) adjustCalibration('stats-move-x', 2);
                }}
                className="col-start-3 row-start-2 p-0.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-theme-accent hover:text-white rounded-md flex items-center justify-center transition-all cursor-pointer active:scale-95"
                disabled={calibrationStep !== 1 && calibrationStep !== 8 && calibrationStep !== 9}
                style={{ opacity: (calibrationStep === 1 || calibrationStep === 8 || calibrationStep === 9) ? 1 : 0.3 }}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  if (calibrationStep === 1) adjustCalibration('move-y', 2);
                  else if (calibrationStep === 9) adjustCalibration('stats-move-y', 2);
                  else {
                    adjustCalibration('scale-step', 1);
                  }
                }}
                className="col-start-2 row-start-2 p-0.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-theme-accent hover:text-white rounded-md flex items-center justify-center transition-all cursor-pointer active:scale-95"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Boutons Reset & Valider */}
          <div className="flex gap-2 w-full xl:w-auto items-center">
            {showResetConfirm ? (
              <div className="bg-red-950/20 border border-red-500/30 rounded-xl p-1.5 flex flex-col items-center justify-center gap-1 text-center w-full xl:w-44 animate-pulse">
                <span className="text-[9px] text-red-400 font-black uppercase tracking-wider block">Réinitialiser ?</span>
                <div className="flex gap-1.5 justify-center">
                  <button
                    onClick={() => {
                      saveCalibration(DEFAULT_CALIBRATION);
                      setCalibrationStep(1);
                      setShowResetConfirm(false);
                      if (firestoreTimeoutRef.current) {
                        clearTimeout(firestoreTimeoutRef.current);
                      }
                      if (roomId && roomId !== 'LOCAL') {
                        roomService.updateRoom(roomId, { calibration: DEFAULT_CALIBRATION }).catch(err =>
                          console.error('Erreur sync calibration Firestore reset:', err)
                        );
                      }
                    }}
                    className="px-2.5 py-1 bg-red-650 text-white text-[9px] font-black rounded-lg cursor-pointer hover:bg-red-700 active:scale-95 transition-all"
                  >
                    Oui
                  </button>
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    className="px-2.5 py-1 bg-zinc-800 text-zinc-350 text-[9px] font-black rounded-lg cursor-pointer hover:bg-zinc-700 active:scale-95 transition-all"
                  >
                    Non
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="flex-1 xl:flex-none px-3.5 py-2 bg-red-650 hover:bg-red-700 text-white font-black rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-red-900/20 hover:scale-105 transition-all text-[11px] cursor-pointer select-none active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}

            <button
              onClick={() => {
                setIsCalibrating(false);
                setLastCalibrationHit(null);
                if (firestoreTimeoutRef.current) {
                  clearTimeout(firestoreTimeoutRef.current);
                }
                if (roomId && roomId !== 'LOCAL') {
                  roomService.updateRoom(roomId, { calibration }).catch(err =>
                    console.error('Erreur sync calibration Firestore finale:', err)
                  );
                }
              }}
              className="flex-1 xl:flex-none px-4 py-2 bg-[#22c55e] text-white font-black rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-green-900/20 hover:scale-105 transition-all text-[11px] cursor-pointer select-none active:scale-95"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Valider</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderCalibratedDartboard = (isCalibrationMode: boolean) => {
    let { centerX, centerY, rBullInner, rBullOuter, rTripleInner, rTripleOuter, rDoubleInner, rDoubleOuter } = calibration;
    if (targetCenterRef.current) {
      centerX = targetCenterRef.current.x;
      centerY = targetCenterRef.current.y;
    }
    const segments: React.ReactNode[] = [];
    const segmentAngle = 360 / 20;

    const isCricket = room?.gameType === 'cricket';
    const isX01 = room?.gameType === 'x01';
    const isBart = room?.gameType === 'bart';
    
    let x01CheckoutDarts: string[] = [];
    if (isX01 && room) {
      const activePlayer = room.players[room.activePlayerIndex];
      if (activePlayer && activePlayer.score <= 180 && activePlayer.score > 1) {
        x01CheckoutDarts = getCheckoutSuggestion(activePlayer.score, !!room.doubleOut) || [];
      }
    }

    const getSegmentFill = (type: 'single-inner' | 'single-outer' | 'triple' | 'double' | 'bull-inner' | 'bull-outer', score: number, segmentId: string) => {
      if (isCalibrationMode) {
        if (highlightedSegment === segmentId) return '#00ffff';
        return 'transparent';
      }

      if (highlightedSegment === segmentId) return '#00ffff';

      // Surlignage pour l'animation individuelle ou persistante de fin de tour
      const activeAnimSegmentId = (activeAnimationIndex !== -1 && animatingDarts[activeAnimationIndex]) 
        ? getSegmentIdFromLabel(animatingDarts[activeAnimationIndex]) 
        : null;
      const isPastRoundThrow = animatingDarts.some(dart => getSegmentIdFromLabel(dart) === segmentId);

      if (activeAnimSegmentId === segmentId || (showRoundPath && isPastRoundThrow)) {
        return '#00ffff';
      }

      if (isBart && room) {
        return '#ffffff';
      }

      const isClock = room?.gameType === 'clock';
      if (isClock && room) {
        const activePlayer = room.players[room.activePlayerIndex];
        const currentTarget = activePlayer?.clockState?.currentTarget ?? 1;
        const effectiveScore = score === 50 ? 25 : score;
        const isTarget = currentTarget === 25 ? (effectiveScore === 25) : (effectiveScore === currentTarget);
        if (isTarget) {
          return '#ffff00'; // Jaune fluo pour le segment visé
        }
        return '#ffffff'; // Blanc pour le reste
      }


      if (isCricket && room) {
        return '#ffffff';
      }

      if (isX01 && room) {
        return '#ffffff';
      }

      const isEven = SECTORS.indexOf(score) % 2 === 0;
      if (type === 'bull-inner') return '#ff0000';
      if (type === 'bull-outer') return '#00ff00';
      if (type === 'triple' || type === 'double') {
        return isEven ? '#ff0000' : '#00ff00';
      }
      return isEven ? '#ffffff' : '#e2c08d';
    };

    const getSegmentProps = (type: 'single-inner' | 'single-outer' | 'triple' | 'double' | 'bull-inner' | 'bull-outer', score: number, segmentId: string) => {
      const activeAnimSegmentId = (activeAnimationIndex !== -1 && animatingDarts[activeAnimationIndex]) 
        ? getSegmentIdFromLabel(animatingDarts[activeAnimationIndex]) 
        : null;

      const isAnimating = activeAnimSegmentId === segmentId;
      const isHighlighted = highlightedSegment === segmentId;
      const isPastRoundThrow = animatingDarts.some(dart => getSegmentIdFromLabel(dart) === segmentId);
      const fill = getSegmentFill(type, score, segmentId);
      
      if (isCalibrationMode) {
        return {
          fill,
          stroke: '#000000',
          strokeWidth: calibrationStep === 1 
            ? 1.5 
            : (type === 'double' && (calibrationStep === 2 || calibrationStep === 3)) ||
              (type === 'triple' && (calibrationStep === 4 || calibrationStep === 5)) ||
              (type === 'bull-outer' && calibrationStep === 6) ||
              (type === 'bull-inner' && calibrationStep === 7)
              ? 4 
              : 1.5,
          className: 'cursor-pointer',
        };
      }

      // Mode Réalité Augmentée
      let isSuggested = false;
      if (isX01 && x01CheckoutDarts.length > 0) {
        const checkMatch = (dart: string) => {
          if (dart === 'BULL' && (type === 'bull-inner' || type === 'bull-outer')) return true;
          if (dart === 'D25' && type === 'bull-inner') return true;
          if (dart === `T${score}` && type === 'triple') return true;
          if (dart === `D${score}` && type === 'double') return true;
          if (dart === `S${score}` && (type === 'single-inner' || type === 'single-outer')) return true;
          return false;
        };
        isSuggested = x01CheckoutDarts.some(checkMatch);
      }

      const isClock = room?.gameType === 'clock';
      let isClockTargetToHit = false;
      if (isClock && room && !isCalibrationMode) {
        const activePlayer = room.players[room.activePlayerIndex];
        const currentTarget = activePlayer?.clockState?.currentTarget ?? 1;
        const effectiveScore = score === 50 ? 25 : score;
        if (currentTarget === 25) {
          if (type === 'bull-inner' || type === 'bull-outer') {
            isClockTargetToHit = true;
          }
        } else {
          if (effectiveScore === currentTarget) {
            isClockTargetToHit = true;
          }
        }
      }

      const isBart = room?.gameType === 'bart';
      let isBartTarget = false;
      if (isBart && room && !isCalibrationMode) {
        const currentTarget = room.bartConfig?.currentTarget;
        if (currentTarget) {
          if (currentTarget.number === 'bull') {
            if (currentTarget.zone === 'inner' && type === 'bull-inner') isBartTarget = true;
            if (currentTarget.zone === 'outer' && type === 'bull-outer') isBartTarget = true;
          } else if (score === currentTarget.number) {
            if (currentTarget.zone === 'inner' && (type === 'single-inner' || type === 'triple')) isBartTarget = true;
            if (currentTarget.zone === 'outer' && (type === 'single-outer' || type === 'double')) isBartTarget = true;
          }
        }
      }

      let isCricketTargetToHit = false;
      if (isCricket && room && !isCalibrationMode) {
        const targets = room.cricketTargets || [20, 19, 18, 17, 16, 15, 25];
        const effectiveScore = score === 50 ? 25 : score;
        const isTarget = targets.includes(effectiveScore);
        if (isTarget) {
          const allClosed = room.players.every(p => (p.cricketMarks?.[String(effectiveScore)] || 0) >= 3);
          if (!allClosed) {
            isCricketTargetToHit = true;
          }
        }
      }

      if (isAnimating || isHighlighted) {
        return {
          fill: '#00ffff',
          stroke: '#ffffff',
          strokeWidth: 2.5,
          className: 'cursor-pointer blink-hit-segment',
        };
      }

      if (showRoundPath && isPastRoundThrow) {
        return {
          fill: '#00ffff',
          stroke: '#ffffff',
          strokeWidth: 2.5,
          className: 'cursor-pointer glow-pulse-segment',
        };
      }

      if (isSuggested) {
        return {
          fill: '#ffffff',
          stroke: '#ffff00',
          strokeWidth: 7,
          className: 'cursor-pointer suggested-finish-segment',
        };
      }

      if (isBartTarget) {
        return {
          fill,
          stroke: '#ffff00',
          strokeWidth: 6,
          className: 'cursor-pointer suggested-finish-segment', // reusing pulse-yellow animation
        };
      }

      if (isCricketTargetToHit) {
        return {
          fill,
          stroke: '#ffff00',
          strokeWidth: 6,
          className: 'cursor-pointer suggested-finish-segment',
        };
      }

      if (isClockTargetToHit) {
        return {
          fill,
          stroke: '#ffff00',
          strokeWidth: 6,
          className: 'cursor-pointer suggested-finish-segment',
        };
      }

      return {
        fill,
        stroke: (isX01 || isCricket) ? '#c8c8c8' : 'none', // Contours gris fin en X01 blanc ou Cricket blanc
        strokeWidth: (isX01 || isCricket) ? 0.5 : 0,
        className: 'cursor-pointer hover:brightness-95 transition-all',
      };
    };

    const handleSegmentClick = (regionName: string, score: number, segmentId: string) => {
      console.log(`Segment cliqué : ${regionName}, Score : ${score}, ID : ${segmentId}`);
      setHighlightedSegment(segmentId);
      setLastCalibrationHit({ region: regionName, score });

      if (hitTimeoutRef.current) {
        clearTimeout(hitTimeoutRef.current);
      }

      hitTimeoutRef.current = setTimeout(() => {
        setHighlightedSegment(null);
        setLastCalibrationHit(null);
      }, 1500);
    };

    if (clickToCenterState === 'none') {
      // 1. Dessiner les tranches
      SECTORS.forEach((score, index) => {
        const startAngle = index * segmentAngle - 9;
        const endAngle = startAngle + segmentAngle;

        const idInnerSingle = `single-inner-${score}`;
        segments.push(
          <path
            key={idInnerSingle}
            d={describeArc(centerX, centerY, rBullOuter, rTripleInner, startAngle, endAngle)}
            {...getSegmentProps('single-inner', score, idInnerSingle)}
            onClick={() => handleSegmentClick(`Simple ${score} (Int)`, score, idInnerSingle)}
          />
        );

        const idTriple = `triple-${score}`;
        segments.push(
          <path
            key={idTriple}
            d={describeArc(centerX, centerY, rTripleInner, rTripleOuter, startAngle, endAngle)}
            {...getSegmentProps('triple', score, idTriple)}
            onClick={() => handleSegmentClick(`Triple ${score}`, score * 3, idTriple)}
          />
        );

        const idOuterSingle = `single-outer-${score}`;
        segments.push(
          <path
            key={idOuterSingle}
            d={describeArc(centerX, centerY, rTripleOuter, rDoubleInner, startAngle, endAngle)}
            {...getSegmentProps('single-outer', score, idOuterSingle)}
            onClick={() => handleSegmentClick(`Simple ${score} (Ext)`, score, idOuterSingle)}
          />
        );

        const idDouble = `double-${score}`;
        segments.push(
          <path
            key={idDouble}
            d={describeArc(centerX, centerY, rDoubleInner, rDoubleOuter, startAngle, endAngle)}
            {...getSegmentProps('double', score, idDouble)}
            onClick={() => handleSegmentClick(`Double ${score}`, score * 2, idDouble)}
          />
        );
      });

      // 2. Dessiner les Bulles par-dessus les tranches pour que leurs contours (jaunes lors de suggestion) soient entièrement visibles
      segments.push(
        <circle
          key="bull-outer"
          cx={centerX}
          cy={centerY}
          r={rBullOuter}
          {...getSegmentProps('bull-outer', 25, 'bull-outer')}
          onClick={() => handleSegmentClick('Simple Bull', 25, 'bull-outer')}
        />
      );

      segments.push(
        <circle
          key="bull-inner"
          cx={centerX}
          cy={centerY}
          r={rBullInner}
          {...getSegmentProps('bull-inner', 50, 'bull-inner')}
          onClick={() => handleSegmentClick('Double Bull', 50, 'bull-inner')}
        />
      );
    }

    const showCross = isCalibrationMode && calibrationStep === 1 && clickToCenterState === 'none';

    // 3. Dessiner les numéros extérieurs projetés (blanc sur la partie sombre extérieure de la cible réelle)
    const boardNumbers: React.ReactNode[] = [];
    const cricketCoches: React.ReactNode[] = [];
    if (!isCalibrationMode) {
      SECTORS.forEach((score, index) => {
        const angleInDegrees = index * segmentAngle;
        const meanRadius = (rTripleOuter + rDoubleInner) / 2;
        const textPos = polarToCartesian(centerX, centerY, meanRadius, angleInDegrees);
        
        let textRotation = angleInDegrees;
        if (angleInDegrees > 90 && angleInDegrees < 270) {
          textRotation += 180;
        }

        boardNumbers.push(
          <text
            key={`num-${score}`}
            x={textPos.x}
            y={textPos.y + 6}
            textAnchor="middle"
            fill="#000000"
            fontSize="24"
            fontWeight="900"
            fontFamily="sans-serif"
            transform={`rotate(${textRotation}, ${textPos.x}, ${textPos.y})`}
            className="select-none pointer-events-none"
          >
            {score}
          </text>
        );

        // Dessiner les coches de Cricket dans le Single Inner
        if (isCricket && room) {
          const targets = room.cricketTargets || [20, 19, 18, 17, 16, 15, 25];
          if (targets.includes(score)) {
            const activePlayer = room.players[room.activePlayerIndex];
            const activeMarks = activePlayer?.cricketMarks?.[String(score)] || 0;
            if (activeMarks > 0) {
              const meanRadiusInner = (rBullOuter + rTripleInner) / 2;
              const symbolPos = polarToCartesian(centerX, centerY, meanRadiusInner, angleInDegrees);
              
              cricketCoches.push(
                <g
                  key={`coche-${score}`}
                  transform={`translate(${symbolPos.x}, ${symbolPos.y}) rotate(${textRotation})`}
                  className="select-none pointer-events-none"
                >
                  {activeMarks === 1 && (
                    <line
                      x1="-6"
                      y1="6"
                      x2="6"
                      y2="-6"
                      stroke="#000000"
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                  )}
                  {activeMarks === 2 && (
                    <>
                      <line
                        x1="-6"
                        y1="-6"
                        x2="6"
                        y2="6"
                        stroke="#000000"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                      <line
                        x1="6"
                        y1="-6"
                        x2="-6"
                        y2="6"
                        stroke="#000000"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                    </>
                  )}
                  {activeMarks >= 3 && (
                    <>
                      <circle
                        cx="0"
                        cy="0"
                        r="8.5"
                        fill="none"
                        stroke="#000000"
                        strokeWidth="3.5"
                      />
                      <line
                        x1="-5"
                        y1="-5"
                        x2="5"
                        y2="5"
                        stroke="#000000"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                      />
                      <line
                        x1="5"
                        y1="-5"
                        x2="-5"
                        y2="5"
                        stroke="#000000"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                      />
                    </>
                  )}
                </g>
              );
            }
          }
        }
      });
    }

    // Dessiner la coche de Cricket pour la bulle (25) sur le 2ème cercle (bull-outer)
    if (!isCalibrationMode && isCricket && room) {
      const targets = room.cricketTargets || [20, 19, 18, 17, 16, 15, 25];
      if (targets.includes(25)) {
        const activePlayer = room.players[room.activePlayerIndex];
        const activeMarksBull = activePlayer?.cricketMarks?.['25'] || 0;
        if (activeMarksBull > 0) {
          cricketCoches.push(
            <g
              key="coche-bull"
              className="select-none pointer-events-none"
            >
              {activeMarksBull === 1 && (
                <line
                  x1={centerX - 11}
                  y1={centerY + 11}
                  x2={centerX + 11}
                  y2={centerY - 11}
                  stroke="#000000"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              )}
              {activeMarksBull === 2 && (
                <>
                  <line
                    x1={centerX - 11}
                    y1={centerY - 11}
                    x2={centerX + 11}
                    y2={centerY + 11}
                    stroke="#000000"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <line
                    x1={centerX + 11}
                    y1={centerY - 11}
                    x2={centerX - 11}
                    y2={centerY + 11}
                    stroke="#000000"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </>
              )}
              {activeMarksBull >= 3 && (
                <>
                  <circle
                    cx={centerX}
                    cy={centerY}
                    r={(rBullInner + rBullOuter) / 2}
                    fill="none"
                    stroke="#000000"
                    strokeWidth="3"
                  />
                  <line
                    x1={centerX - 7}
                    y1={centerY - 7}
                    x2={centerX + 7}
                    y2={centerY + 7}
                    stroke="#000000"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <line
                    x1={centerX + 7}
                    y1={centerY - 7}
                    x2={centerX - 7}
                    y2={centerY + 7}
                    stroke="#000000"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </>
              )}
            </g>
          );
        }
      }
    }

    const arStyleCss = `
          @keyframes pulse-yellow {
            0% { stroke-width: 4px; stroke: #ffff00; filter: drop-shadow(0 0 2px rgba(255,255,0,0.5)); }
            50% { stroke-width: 10px; stroke: #ffea00; filter: drop-shadow(0 0 10px rgba(255,234,0,0.9)); }
            100% { stroke-width: 4px; stroke: #ffff00; filter: drop-shadow(0 0 2px rgba(255,255,0,0.5)); }
          }
          .suggested-finish-segment {
            animation: pulse-yellow 1.2s infinite ease-in-out;
            stroke-linecap: round;
            stroke-linejoin: round;
          }
          @keyframes blink-hit {
            0% { fill: #00ffff; filter: brightness(1.2); }
            50% { fill: #ffffff; filter: brightness(1); }
            100% { fill: #00ffff; filter: brightness(1.2); }
          }
          .blink-hit-segment {
            animation: blink-hit 0.3s ease-in-out infinite;
          }
          @keyframes scorePop {
            0% { transform: scale(0.3) translate(0, 0); opacity: 0; }
            15% { transform: scale(1.3) translate(0, -10px); opacity: 1; }
            30% { transform: scale(1) translate(0, -10px); opacity: 1; }
            85% { transform: scale(1) translate(0, -10px); opacity: 1; }
            100% { transform: scale(0.7) translate(0, 5px); opacity: 0; }
          }
          .animate-scorePop {
            animation: scorePop 2.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
            transform-origin: center;
          }
          
          /* --- NOUVELLES ANIMATIONS DE GAMIFICATION AR --- */
          @keyframes glow-pulse {
            0% { opacity: 0.7; filter: brightness(1) drop-shadow(0 0 1px rgba(0,255,255,0.3)); }
            50% { opacity: 1; filter: brightness(1.7) drop-shadow(0 0 12px rgba(0,255,255,0.9)); }
            100% { opacity: 0.7; filter: brightness(1) drop-shadow(0 0 1px rgba(0,255,255,0.3)); }
          }
          .glow-pulse-segment {
            animation: glow-pulse 1.4s infinite ease-in-out;
          }

          @keyframes dash-flow {
            to { stroke-dashoffset: -40; }
          }
          .round-path-line {
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-dasharray: 8, 8;
            animation: dash-flow 0.8s linear infinite;
          }

          @keyframes ping-impact {
            0% { transform: scale(0.5); opacity: 1; }
            100% { transform: scale(2.0); opacity: 0; }
          }
          .impact-ping {
            animation: ping-impact 1.6s infinite ease-out;
            transform-origin: center;
          }

          @keyframes text-pop-180 {
            0% { transform: scale(0.1); opacity: 0; filter: drop-shadow(0 0 0px rgba(234,179,8,0)); }
            50% { transform: scale(1.4); opacity: 1; filter: drop-shadow(0 0 25px rgba(234,179,8,0.95)); }
            70% { transform: scale(0.95); }
            100% { transform: scale(1); opacity: 1; filter: drop-shadow(0 0 10px rgba(234,179,8,0.7)); }
          }
          .animate-text-180 {
            animation: text-pop-180 1s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
            transform-origin: center;
          }

          @keyframes text-pop-highscore {
            0% { transform: scale(0.1); opacity: 0; }
            55% { transform: scale(1.35); opacity: 1; filter: drop-shadow(0 0 15px rgba(0,240,255,0.8)); }
            75% { transform: scale(0.95); }
            100% { transform: scale(1); opacity: 1; filter: drop-shadow(0 0 6px rgba(0,240,255,0.5)); }
          }
          .animate-text-highscore {
            animation: text-pop-highscore 0.9s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
            transform-origin: center;
          }

          @keyframes energy-rotate {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .energy-ring {
            animation: energy-rotate 6s linear infinite;
            transform-origin: center;
          }

          @keyframes shockwave-expand {
            0% { transform: scale(0.1); opacity: 1; stroke-width: 8px; }
            100% { transform: scale(2.2); opacity: 0; stroke-width: 1px; }
          }
          .animate-shockwave {
            animation: shockwave-expand 1.2s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
            transform-origin: center;
          }

          @keyframes shake-bust {
            0%, 100% { transform: translate(0, 0) scale(1); }
            10%, 30%, 50%, 70%, 90% { transform: translate(-6px, -3px) scale(1.02); filter: drop-shadow(0 0 10px rgba(220,38,38,0.8)); }
            20%, 40%, 60%, 80% { transform: translate(6px, 3px) scale(0.98); filter: drop-shadow(0 0 4px rgba(220,38,38,0.4)); }
          }
          .animate-bust {
            animation: shake-bust 0.8s ease-in-out forwards;
            transform-origin: center;
          }

          @keyframes particle-move-css {
            0% { transform: translate(0, 0) scale(1); opacity: 1; }
            80% { opacity: 0.8; }
            100% { transform: translate(var(--dx), var(--dy)) scale(0.2); opacity: 0; }
          }
          .animate-particle {
            animation: particle-move-css 1.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
            transform-origin: center;
          }
    `;

    return (
      <svg
        className="w-full h-full max-h-full select-none"
        viewBox="0 0 1000 1000"
        style={{ backgroundColor: (isCalibrationMode && calibrationStep !== 8) ? '#ffffff' : 'transparent', overflow: 'visible' }}
        onPointerDown={handleSvgPointerDown}
        onPointerMove={handleSvgPointerMove}
      >
        <style dangerouslySetInnerHTML={{ __html: arStyleCss }} />

        {/* Définitions des dégradés pour le halo de réalité augmentée */}
        {(!isCalibrationMode || calibrationStep === 8) && (
          <defs>
            <radialGradient
              id="targetHalo"
              cx={centerX}
              cy={centerY}
              r={calibration.haloMaxRadius ?? (rDoubleOuter * 2.5)}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset={`${((calibration.haloWhiteRadius ?? (rDoubleOuter * 1.1)) / (calibration.haloMaxRadius ?? (rDoubleOuter * 2.5))) * 100}%`} stopColor="#ffffff" /> {/* Éclairage blanc pur de la cible */}
              <stop offset={`${(((calibration.haloWhiteRadius ?? (rDoubleOuter * 1.1)) / (calibration.haloMaxRadius ?? (rDoubleOuter * 2.5))) + (1 - (calibration.haloWhiteRadius ?? (rDoubleOuter * 1.1)) / (calibration.haloMaxRadius ?? (rDoubleOuter * 2.5))) * 0.5) * 100}%`} stopColor="#e4e4e7" /> {/* Dégradé gris clair */}
              <stop offset="100%" stopColor="#000000" /> {/* Transition vers le noir complet */}
            </radialGradient>
          </defs>
        )}

        {/* Grand rectangle de fond appliquant le dégradé radial */}
        {(!isCalibrationMode || calibrationStep === 8) && (
          <rect
            x="-1000"
            y="-1000"
            width="3000"
            height="3000"
            fill="url(#targetHalo)"
            className="pointer-events-none"
          />
        )}

        {!isCalibrationMode && (
          <circle cx={centerX} cy={centerY} r={rDoubleOuter * 1.01} fill="none" stroke="#4b5563" strokeWidth="2" />
        )}

        {segments}

        <circle
          cx={centerX}
          cy={centerY}
          r={rDoubleOuter}
          fill="none"
          stroke={isCalibrationMode ? '#000000' : '#ffffff'}
          strokeWidth={isCalibrationMode ? (calibrationStep === 2 ? 5 : 2) : 2}
        />

        {boardNumbers}

        {cricketCoches}

        {/* Affichage des points lors de l'animation de fin de tour */}
        {activeAnimationIndex !== -1 && animatingDarts[activeAnimationIndex] && (
          (() => {
            const dartLabel = animatingDarts[activeAnimationIndex];
            const segmentId = getSegmentIdFromLabel(dartLabel);
            if (!segmentId) return null;
            const center = getSegmentCenter(segmentId);
            const scoreVal = getThrowScoreLabel(dartLabel);

            return (
              <g key={`anim-${activeAnimationIndex}`} className="animate-scorePop pointer-events-none" style={{ transformOrigin: `${center.x}px ${center.y}px` }}>
                <text
                  x={center.x}
                  y={center.y + 12}
                  textAnchor="middle"
                  fill="#000000"
                  stroke="#000000"
                  strokeWidth="8"
                  fontSize="42"
                  fontWeight="900"
                  fontFamily="sans-serif"
                >
                  {scoreVal}
                </text>
                <text
                  x={center.x}
                  y={center.y + 12}
                  textAnchor="middle"
                  fill="#ffff00"
                  fontSize="42"
                  fontWeight="900"
                  fontFamily="sans-serif"
                >
                  {scoreVal}
                </text>
              </g>
            );
          })()
        )}

        {/* 1. Le Fil d'Ariane (chemin reliant les lancers du tour) */}
        {showRoundPath && animatingDarts.length > 0 && (() => {
          const pointsCoords = animatingDarts
            .map(dart => {
              const segId = getSegmentIdFromLabel(dart);
              return segId ? getSegmentCenter(segId) : null;
            })
            .filter((p): p is { x: number; y: number } => p !== null);

          if (pointsCoords.length === 0) return null;

          return (
            <g className="pointer-events-none">
              {/* Le tracé lumineux */}
              {pointsCoords.length > 1 && (
                <polyline
                  points={pointsCoords.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="#00ffff"
                  strokeWidth="4.5"
                  className="round-path-line"
                  style={{ filter: 'drop-shadow(0 0 6px #00ffff)' }}
                />
              )}
              
              {/* Ondes concentriques et points d'impact */}
              {pointsCoords.map((p, idx) => (
                <g key={idx}>
                  <circle cx={p.x} cy={p.y} r="14" fill="none" stroke="#ffffff" strokeWidth="2" className="impact-ping" />
                  <circle cx={p.x} cy={p.y} r="5" fill="#00ffff" stroke="#ffffff" strokeWidth="2" />
                  <text
                    x={p.x}
                    y={p.y - 12}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="14"
                    fontWeight="900"
                    fontFamily="sans-serif"
                    style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.8))' }}
                  >
                    #{idx + 1}
                  </text>
                </g>
              ))}
            </g>
          );
        })()}

        {/* 2. Particules d'explosion pour le 180 */}
        {particles.length > 0 && (
          <g className="pointer-events-none">
            {particles.map(p => (
              <circle
                key={p.id}
                cx={p.x}
                cy={p.y}
                r={p.radius}
                fill={p.color}
                opacity={p.opacity}
                className="animate-particle"
                style={{
                  '--dx': `${p.vx}px`,
                  '--dy': `${p.vy}px`,
                } as React.CSSProperties}
              />
            ))}
          </g>
        )}

        {/* 3. Affichage global du score au centre de la cible */}
        {globalRoundAnimation.active && globalRoundAnimation.type && (
          (() => {
            const { type, score } = globalRoundAnimation;
            
            if (type === '180') {
              return (
                <g className="pointer-events-none" style={{ transformOrigin: `${centerX}px ${centerY}px` }}>
                  {/* Onde de choc dorée */}
                  <circle cx={centerX} cy={centerY} r={rDoubleOuter * 0.8} fill="none" stroke="#eab308" strokeWidth="6" className="animate-shockwave" />
                  
                  {/* Texte bondissant 180 */}
                  <g className="animate-text-180">
                    <text
                      x={centerX}
                      y={centerY + 24}
                      textAnchor="middle"
                      fill="#000000"
                      stroke="#000000"
                      strokeWidth="18"
                      fontSize="96"
                      fontWeight="900"
                      fontFamily="sans-serif"
                      style={{ letterSpacing: '4px' }}
                    >
                      180
                    </text>
                    <text
                      x={centerX}
                      y={centerY + 24}
                      textAnchor="middle"
                      fill="#eab308"
                      fontSize="96"
                      fontWeight="900"
                      fontFamily="sans-serif"
                      style={{ letterSpacing: '4px' }}
                    >
                      180
                    </text>
                    
                    <text
                      x={centerX}
                      y={centerY + 68}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="22"
                      fontWeight="900"
                      fontFamily="sans-serif"
                      style={{ letterSpacing: '3px', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.9))' }}
                    >
                      ★ MAGNIFIQUE 180 ★
                    </text>
                  </g>
                </g>
              );
            }

            if (type === 'highscore') {
              return (
                <g className="pointer-events-none" style={{ transformOrigin: `${centerX}px ${centerY}px` }}>
                  {/* Onde de choc cyan */}
                  <circle cx={centerX} cy={centerY} r={rDoubleOuter * 0.6} fill="none" stroke="#00f0ff" strokeWidth="4" className="animate-shockwave" />
                  
                  {/* Anneau d'énergie tournant */}
                  <circle
                    cx={centerX}
                    cy={centerY}
                    r="85"
                    fill="none"
                    stroke="#00f0ff"
                    strokeWidth="3.5"
                    strokeDasharray="15, 10, 5, 10"
                    className="energy-ring"
                  />
                  
                  {/* Texte Highscore */}
                  <g className="animate-text-highscore">
                    <text
                      x={centerX}
                      y={centerY + 16}
                      textAnchor="middle"
                      fill="#000000"
                      stroke="#000000"
                      strokeWidth="14"
                      fontSize="64"
                      fontWeight="900"
                      fontFamily="sans-serif"
                    >
                      {score}
                    </text>
                    <text
                      x={centerX}
                      y={centerY + 16}
                      textAnchor="middle"
                      fill="#00f0ff"
                      fontSize="64"
                      fontWeight="900"
                      fontFamily="sans-serif"
                    >
                      {score}
                    </text>
                    
                    <text
                      x={centerX}
                      y={centerY + 52}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="16"
                      fontWeight="900"
                      fontFamily="sans-serif"
                      style={{ letterSpacing: '2px', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.9))' }}
                    >
                      JOLI COUP !
                    </text>
                  </g>
                </g>
              );
            }

            if (type === 'bust') {
              return (
                <g className="pointer-events-none" style={{ transformOrigin: `${centerX}px ${centerY}px` }}>
                  {/* Séisme de bust */}
                  <g className="animate-bust">
                    <text
                      x={centerX}
                      y={centerY + 20}
                      textAnchor="middle"
                      fill="#000000"
                      stroke="#000000"
                      strokeWidth="16"
                      fontSize="76"
                      fontWeight="900"
                      fontFamily="sans-serif"
                      style={{ letterSpacing: '3px' }}
                    >
                      BUST
                    </text>
                    <text
                      x={centerX}
                      y={centerY + 20}
                      textAnchor="middle"
                      fill="#dc2626"
                      fontSize="76"
                      fontWeight="900"
                      fontFamily="sans-serif"
                      style={{ letterSpacing: '3px' }}
                    >
                      BUST
                    </text>
                    <text
                      x={centerX}
                      y={centerY + 54}
                      textAnchor="middle"
                      fill="#fca5a5"
                      fontSize="15"
                      fontWeight="900"
                      fontFamily="sans-serif"
                      style={{ letterSpacing: '1.5px', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.8))' }}
                    >
                      SCORE ANNULÉ ✗
                    </text>
                  </g>
                </g>
              );
            }

            return null;
          })()
        )}

        {showCross && (
          <>
            <line
              x1="0"
              y1={centerY}
              x2="1000"
              y2={centerY}
              stroke="#000000"
              strokeWidth="4"
              strokeDasharray="10, 10"
            />
            <line
              x1={centerX}
              y1="0"
              x2={centerX}
              y2="1000"
              stroke="#000000"
              strokeWidth="4"
              strokeDasharray="10, 10"
            />
            <circle
              cx={centerX}
              cy={centerY}
              r="20"
              fill="none"
              stroke="#000000"
              strokeWidth="3"
            />
          </>
        )}

        {clickToCenterState === 'center' && (
          <g>
            {/* Ligne horizontale rouge continue traversant tout le SVG */}
            <line
              x1="0"
              y1={centerY}
              x2="1000"
              y2={centerY}
              stroke="#ff0000"
              strokeWidth="4"
            />
            {/* Ligne verticale rouge continue traversant tout le SVG */}
            <line
              x1={centerX}
              y1="0"
              x2={centerX}
              y2="1000"
              stroke="#ff0000"
              strokeWidth="4"
            />
            {/* Cercle rouge au centre */}
            <circle
              cx={centerX}
              cy={centerY}
              r="25"
              fill="none"
              stroke="#ff0000"
              strokeWidth="5"
            />
            {/* Petit point au centre de la croix */}
            <circle
              cx={centerX}
              cy={centerY}
              r="4"
              fill="#ff0000"
            />
          </g>
        )}

        {clickToCenterState === 'radius' && (
          <g>
            {/* Petite croix rouge centrale */}
            <line
              x1={centerX - 30}
              y1={centerY}
              x2={centerX + 30}
              y2={centerY}
              stroke="#ff0000"
              strokeWidth="4"
            />
            <line
              x1={centerX}
              y1={centerY - 30}
              x2={centerX}
              y2={centerY + 30}
              stroke="#ff0000"
              strokeWidth="4"
            />
            <circle
              cx={centerX}
              cy={centerY}
              r="8"
              fill="none"
              stroke="#ff0000"
              strokeWidth="3"
            />
            <circle
              cx={centerX}
              cy={centerY}
              r="2"
              fill="#ff0000"
            />

            {/* Cercle extérieur de la cible */}
            <circle
              cx={centerX}
              cy={centerY}
              r={rDoubleOuter}
              fill="none"
              stroke="#ff0000"
              strokeWidth="6"
              strokeDasharray="15, 10"
            />
          </g>
        )}


      </svg>
    );
  };

  const getSegmentIdFromLabel = (label: string) => {
    if (!label || label === '0' || label === 'Loupé') return null;
    if (label === 'BULL' || label === 'D25' || label === '50') return 'bull-inner';
    if (label === '25' || label === 'S25') return 'bull-outer';

    if (label.startsWith('T')) {
      const score = label.substring(1);
      return `triple-${score}`;
    }
    if (label.startsWith('D')) {
      const score = label.substring(1);
      return `double-${score}`;
    }
    if (label.startsWith('S')) {
      const score = label.substring(1);
      return `single-outer-${score}`;
    }
    return `single-outer-${label}`;
  };

  const getThrowScoreLabel = (dart: string) => {
    if (!dart || dart === '0' || dart === 'Loupé') return '0';
    if (dart === 'BULL' || dart === 'D25') return '+50';
    if (dart === '25' || dart === 'S25') return '+25';
    if (dart.startsWith('T')) {
      const val = parseInt(dart.substring(1));
      return `+${val * 3}`;
    }
    if (dart.startsWith('D')) {
      const val = parseInt(dart.substring(1));
      return `+${val * 2}`;
    }
    if (dart.startsWith('S')) {
      return `+${dart.substring(1)}`;
    }
    return `+${dart}`;
  };

  const getSegmentCenter = (segmentId: string) => {
    const { centerX, centerY, rBullOuter, rTripleInner, rTripleOuter, rDoubleInner, rDoubleOuter } = calibration;
    if (segmentId === 'bull-inner' || segmentId === 'bull-outer') {
      return { x: centerX, y: centerY };
    }

    const parts = segmentId.split('-');
    const type = parts[0];
    const scoreStr = parts[parts.length - 1];
    const score = parseInt(scoreStr);
    
    if (isNaN(score)) return { x: centerX, y: centerY };

    const index = SECTORS.indexOf(score);
    if (index === -1) return { x: centerX, y: centerY };

    const angle = index * 18;
    let meanRadius = 0;
    
    if (type === 'triple') {
      meanRadius = (rTripleInner + rTripleOuter) / 2;
    } else if (type === 'double') {
      meanRadius = (rDoubleInner + rDoubleOuter) / 2;
    } else if (segmentId.includes('single-outer')) {
      meanRadius = (rTripleOuter + rDoubleInner) / 2;
    } else {
      meanRadius = (rBullOuter + rTripleInner) / 2;
    }

    return polarToCartesian(centerX, centerY, meanRadius, angle);
  };

  // --- Effet pour les animations de tir en réalité augmentée ---
  useEffect(() => {
    if (!room || projectorMode !== 'ar') return;
    const activePlayer = room.players[room.activePlayerIndex];
    if (!activePlayer) return;

    const currentThrows = activePlayer.currentRoundThrows || [];
    const throwsCount = activePlayer.throwsCount || 0;

    // Si le joueur actif change, réinitialiser le suivi des lancers
    if (activePlayerNameRef.current !== activePlayer.name) {
      activePlayerNameRef.current = activePlayer.name;
      lastThrowsCountRef.current = throwsCount;
      setAnimationActive(false);
      setActiveAnimationIndex(-1);
      setAnimatingDarts([]);
      setGlobalRoundAnimation({ type: null, active: false });
      setParticles([]);
      setShowRoundPath(false);
      return;
    }

    // 1. Détection d'un nouveau lancer en cours de tour (flash d'impact)
    if (throwsCount > lastThrowsCountRef.current) {
      const latestThrow = currentThrows[throwsCount - 1] || currentThrows[currentThrows.length - 1];
      if (latestThrow && latestThrow !== '0' && latestThrow !== 'Loupé') {
        const segmentId = getSegmentIdFromLabel(latestThrow);
        if (segmentId) {
          setHighlightedSegment(segmentId);
          if (hitTimeoutRef.current) clearTimeout(hitTimeoutRef.current);
          hitTimeoutRef.current = setTimeout(() => {
            setHighlightedSegment(null);
          }, 2000);
        }
      }
      lastThrowsCountRef.current = throwsCount;
    }

    // 2. Détection de la fin du tour (dartsLeft === 0 ou 3 fléchettes lancées)
    const isRoundFinished = activePlayer.dartsLeft === 0 && currentThrows.length > 0;
    if (isRoundFinished && !animationActive && !showRoundPath) {
      setAnimationActive(true);
      setAnimatingDarts(currentThrows);
      setActiveAnimationIndex(0);
      setShowRoundPath(false);
      setGlobalRoundAnimation({ type: null, active: false });
      setParticles([]);

      let idx = 0;
      const interval = setInterval(() => {
        idx++;
        if (idx < currentThrows.length) {
          setActiveAnimationIndex(idx);
        } else {
          clearInterval(interval);
          setActiveAnimationIndex(-1);
          
          // Fin de la révélation individuelle -> Déclencher l'animation globale
          const getDartValue = (dart: string): number => {
            if (!dart || dart === '0' || dart === 'Loupé') return 0;
            if (dart === 'BULL' || dart === 'D25' || dart === '50') return 50;
            if (dart === '25' || dart === 'S25') return 25;
            if (dart.startsWith('T')) return parseInt(dart.substring(1)) * 3;
            if (dart.startsWith('D')) return parseInt(dart.substring(1)) * 2;
            if (dart.startsWith('S')) return parseInt(dart.substring(1));
            return parseInt(dart) || 0;
          };
          
          const roundSum = currentThrows.reduce((sum, dart) => sum + getDartValue(dart), 0);
          const isBust = !!activePlayer.roundBust;

          // Activer le fil d'Ariane de fin de tour
          setShowRoundPath(true);

          if (isBust) {
            setGlobalRoundAnimation({ type: 'bust', active: true });
            setTimeout(() => {
              setGlobalRoundAnimation({ type: null, active: false });
            }, 3000);
          } else if (roundSum === 180) {
            setGlobalRoundAnimation({ type: '180', active: true });
            
            // Générer les particules d'explosion (70 particules jaillissant du centre)
            const tempParticles: ARParticle[] = [];
            for (let i = 0; i < 70; i++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 150 + Math.random() * 300; // vitesse en pixels/sec
              tempParticles.push({
                id: i,
                x: calibration.centerX,
                y: calibration.centerY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color: i % 3 === 0 ? '#ff007f' : (i % 3 === 1 ? '#eab308' : '#ffffff'), // Fuchsia, jaune or, blanc pur
                radius: 3 + Math.random() * 5,
                opacity: 0.95
              });
            }
            setParticles(tempParticles);

            setTimeout(() => {
              setGlobalRoundAnimation({ type: null, active: false });
              setParticles([]);
            }, 4500);
          } else if (roundSum >= 100) {
            setGlobalRoundAnimation({ type: 'highscore', score: roundSum, active: true });
            setTimeout(() => {
              setGlobalRoundAnimation({ type: null, active: false });
            }, 3500);
          }

          setAnimationActive(false);
        }
      }, 1800); // 1.8s par fléchette pour un rythme de révélation dynamique
    }
  }, [room?.activePlayerIndex, room?.players?.[room?.activePlayerIndex ?? 0]?.throwsCount, room?.players?.[room?.activePlayerIndex ?? 0]?.dartsLeft, projectorMode]);

  // 1. Lire le code du salon depuis l'URL au chargement
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
    } else {
      // Aucun salon dans l'URL : on en crée un automatiquement
      const initRoom = async () => {
        if (isCreatingRoom.current) return;
        isCreatingRoom.current = true;
        try {
          setLoading(true);
          const newRoomId = await roomService.createRoom(theme, 501);
          setRoomId(newRoomId);
          // Mettre à jour le hash de l'URL sans recharger la page
          window.location.hash = `#/projector?room=${newRoomId}`;
        } catch (err) {
          console.error("Erreur lors de la création automatique du salon :", err);
          setError("Impossible de créer le salon de jeu. Veuillez réessayer.");
          setLoading(false);
          isCreatingRoom.current = false;
        }
      };
      initRoom();
    }
  }, []); // Retrait de 'theme' pour éviter de recréer un salon au changement de thème

  // 2. S'abonner aux changements Firestore dès qu'on a un roomId
  useEffect(() => {
    if (!roomId) return;

    if (roomId === 'LOCAL') {
      setError("Le mode local s'exécute exclusivement sur l'écran de votre téléphone. Pour utiliser l'affichage sur vidéoprojecteur, veuillez retourner au menu principal et créer un salon de jeu en ligne.");
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = roomService.subscribeToRoom(
      roomId,
      (updatedRoom) => {
        setRoom(updatedRoom);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("Erreur de synchronisation Firestore :", err);
        setError("Erreur de liaison avec la base de données ou salon expiré.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [roomId]);

  // Synchronisation du mode de vue depuis Firestore (prioritaire sur localStorage en mode en ligne)
  useEffect(() => {
    if (!room) return;
    const firestoreMode = room.projectorMode;
    if (firestoreMode && firestoreMode !== projectorMode) {
      setProjectorMode(firestoreMode);
      // Mettre à jour localStorage pour la cohérence
      localStorage.setItem('minou_dart_projector_mode', firestoreMode);
    }
  }, [room?.projectorMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Synchronisation de la calibration depuis Firestore (prioritaire en mode en ligne si non en train de calibrer)
  useEffect(() => {
    if (!room || isCalibrating) return;
    const firestoreCal = room.calibration;
    if (firestoreCal) {
      // Comparer pour éviter des boucles d'update inutiles
      if (JSON.stringify(firestoreCal) !== JSON.stringify(calibration)) {
        setCalibration(firestoreCal);
        localStorage.setItem('minou_dart_calibration', JSON.stringify(firestoreCal));
      }
    }
  }, [room?.calibration, isCalibrating]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nettoyer les timeouts Firestore lors du démontage du projecteur
  useEffect(() => {
    return () => {
      if (firestoreTimeoutRef.current) {
        clearTimeout(firestoreTimeoutRef.current);
      }
    };
  }, []);

  const renderContent = () => {
    // Rendu en cas de chargement
    if (loading && !room) {
      return (
        <div className="w-full h-full overflow-hidden bg-black flex flex-col items-center justify-center text-white">
          <div className="w-16 h-16 border-4 border-theme-accent border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-lg font-medium tracking-wide">Initialisation de la liaison temps réel...</p>
        </div>
      );
    }

    // Rendu en cas d'erreur
    if (error || !roomId) {
      return (
        <div className="w-full h-full overflow-hidden bg-theme-bg text-theme-text-primary flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md bg-black/40 border border-theme-border/40 p-8 rounded-2xl backdrop-blur">
            <h2 className="text-2xl font-bold text-red-500 mb-4">Liaison interrompue</h2>
            <p className="text-theme-text-secondary mb-6">{error || "Salon introuvable"}</p>
            <div className="flex gap-4 justify-center">
              <a href="#/" className="px-6 py-3 bg-theme-accent text-black font-bold rounded-xl transition-all hover:scale-105">
                Retour au menu
              </a>
              <button onClick={() => window.location.reload()} className="px-6 py-3 bg-black/40 border border-theme-border text-theme-text-primary font-bold rounded-xl transition-all hover:bg-black/60">
                Réessayer
              </button>
            </div>
          </div>
        </div>
      );
    }

  const activePlayerIndex = room?.activePlayerIndex ?? 0;
  const players = room?.players ?? [];
  const status = room?.status ?? 'setup';

  const renderProjectorCricketMarkSymbol = (marks: number, allClosed: boolean) => {
    const numPlayers = room?.players.length ?? 0;
    
    // Taille adaptative des symboles selon le nombre de joueurs pour éviter tout chevauchement
    let sizeClass = 'w-7 h-7 md:w-8 md:h-8 lg:w-9 lg:h-9';
    let circleSizeClass = 'w-9 h-9 md:w-10 md:h-10 lg:w-11 lg:h-11';
    
    if (numPlayers > 4) {
      sizeClass = 'w-5 h-5 md:w-6 md:h-6 lg:w-7 lg:h-7';
      circleSizeClass = 'w-7 h-7 md:w-8 md:h-8 lg:w-9 lg:h-9';
    } else if (numPlayers > 2) {
      sizeClass = 'w-6 h-6 md:w-7 md:h-7 lg:w-8 lg:h-8';
      circleSizeClass = 'w-8 h-8 md:w-9 md:h-9 lg:w-10 lg:h-10';
    }

    if (marks === 0) return <span className="text-zinc-700 text-2xl font-extrabold select-none">·</span>;
    if (marks === 1) {
      return (
        <svg className={`${sizeClass} ${allClosed ? 'text-zinc-800/80' : 'text-white'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round">
          <line x1="6" y1="18" x2="18" y2="6" />
        </svg>
      );
    }
    if (marks === 2) {
      return (
        <svg className={`${sizeClass} ${allClosed ? 'text-zinc-800/80' : 'text-white'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round">
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      );
    }
    return (
      <svg className={`${circleSizeClass} ${allClosed ? 'text-zinc-800/60' : 'text-theme-accent'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <line x1="8.5" y1="8.5" x2="15.5" y2="15.5" />
        <line x1="15.5" y1="8.5" x2="8.5" y2="15.5" />
      </svg>
    );
  };

  // --- RENDU 1 : ÉCRAN D'ATTENTE (SETUP) ---
  if (status === 'setup' && room) {
    return (
      <div className="w-full h-full flex m-0 p-0 overflow-hidden bg-black select-none">
        {/* 1. MOITIÉ GAUCHE (50% de l'écran) : Éclairage de la cible physique ou cible de réalité augmentée */}
        <div 
          className={`w-1/2 h-full transition-all duration-500 shadow-[20px_0_40px_rgba(255,255,255,0.15)] z-10 flex flex-col relative overflow-hidden ${
            projectorMode === 'ar'
              ? isCalibrating
                ? 'bg-white justify-center items-center p-0'
                : 'bg-black justify-center items-center p-0'
              : 'bg-white justify-end items-center pb-6'
          }`}
          id="projector-spotlight"
        >
          {projectorMode === 'ar' ? (
            <>
              {/* Cible SVG de réalité augmentée (forcée dans la moitié supérieure, soit le 1/4 supérieur gauche de l'écran total) */}
              <div className="w-full h-1/2 flex items-center justify-center relative overflow-visible">
                {renderCalibratedDartboard(isCalibrating)}
              </div>

              {/* Placeholder Zone Stats pour l'étape 9 (AR Setup) */}
              {isCalibrating && calibrationStep === 9 && statsCalibrationState === 'none' && (
                <div 
                  className="absolute bg-zinc-300/80 border-2 border-dashed border-zinc-500 rounded-3xl p-6 shadow-xl backdrop-blur-md z-40 transition-all duration-200"
                  style={
                    calibration.statsPanelHeight !== undefined
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

              {/* Zone transparente de capture pour tracer le panneau de commentaires */}
              {statsCalibrationState !== 'none' && (
                <div 
                  className="absolute inset-0 z-50 cursor-crosshair bg-black/10"
                  onPointerDown={handleStatsPointerDown}
                  onPointerMove={handleStatsPointerMove}
                >
                  {/* Guide de tracé rouge en direct si on est en train de tracer le second point */}
                  {statsCalibrationState === 'bottom-right' && statsStartPointRef.current && (
                    <div 
                      className="absolute border-2 border-dashed border-red-550 bg-red-500/10 rounded-2xl pointer-events-none"
                      style={{
                        left: `${liveStatsRect ? liveStatsRect.x : (calibration.statsPanelX ?? 0)}px`,
                        top: `${liveStatsRect ? liveStatsRect.y : (calibration.statsPanelY ?? 0)}px`,
                        width: `${liveStatsRect ? liveStatsRect.width : (calibration.statsPanelWidth ?? 0)}px`,
                        height: `${liveStatsRect ? liveStatsRect.height : (calibration.statsPanelHeight ?? 0)}px`
                      }}
                    />
                  )}
                  <div className="absolute top-4 left-4 bg-black/85 text-white border border-red-500/40 px-3.5 py-1.5 rounded-full text-xs font-black shadow-lg animate-pulse pointer-events-none">
                    🎯 {statsCalibrationState === 'top-left' ? 'Cliquez pour le coin HAUT-GAUCHE' : 'Glissez/cliquez pour le coin BAS-DROITE'}
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



                  {/* Notification de toucher pour tester l'adressage */}
                  {lastCalibrationHit && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/90 text-white border-2 border-theme-accent px-4 py-2 rounded-2xl shadow-xl z-30 text-xs font-bold animate-fadeIn pointer-events-none">
                      🎯 Adressage : <span className="text-theme-accent">{lastCalibrationHit.region}</span> &bull; Score : <span className="text-[#22c55e]">{lastCalibrationHit.score}</span>
                    </div>
                  )}

              {/* Notification d'impact de jeu normal (quand non calibration) */}
              {!isCalibrating && lastCalibrationHit && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/90 text-white border-2 border-theme-accent px-4 py-2 rounded-2xl shadow-xl z-30 text-xs font-bold animate-fadeIn pointer-events-none">
                  🎯 Touché : <span className="text-theme-accent">{lastCalibrationHit.region}</span> &bull; Score : <span className="text-[#22c55e]">{lastCalibrationHit.score}</span>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Logo bas gauche - zone blanche */}
              <span
                className="italic text-xl text-zinc-950 font-serif tracking-widest opacity-50 select-none"
                style={{ fontFamily: "'Playfair Display', 'Didot', 'Georgia', serif" }}
              >
                Minou Dart Game
              </span>
            </>
          )}
        </div>

        {/* Interface d'attente à droite */}
        <div className="w-1/2 h-full bg-theme-bg text-theme-text-primary p-5 flex flex-col justify-between relative border-l border-theme-border/30">
          {isCalibrating ? (
            renderProjectorCalibrationInterface()
          ) : (
            <>
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
                <a href="#/" className="p-2 rounded-full bg-black/40 hover:bg-black/80 border border-theme-border/30 hover:border-theme-accent text-theme-text-secondary transition-all">
                  <ArrowLeft className="w-5 h-5" />
                </a>
              </div>

              <div className="flex flex-col items-center justify-center flex-grow py-8 w-full max-w-xl mx-auto animate-fadeIn">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-2 h-2 rounded-full bg-theme-accent animate-ping" />
                  <h2 className="text-xs font-bold tracking-widest text-theme-text-secondary uppercase">
                    Configuration de la partie
                  </h2>
                </div>

                {/* Code du salon et QR Code */}
                <div className="flex flex-col sm:flex-row items-center gap-4 bg-black/30 border border-theme-border/40 p-4 md:p-6 rounded-3xl mb-5 w-full backdrop-blur">
                  {/* Colonne Code */}
                  <div className="text-center flex-grow flex flex-col justify-center">
                    <span className="text-[10px] md:text-xs text-theme-text-secondary uppercase tracking-widest block mb-1">CODE DE CONNEXION</span>
                    <span className="text-5xl md:text-6xl font-black tracking-widest text-theme-accent font-mono block select-all">
                      {room.roomId}
                    </span>
                  </div>

                  {/* Séparateur vertical/horizontal */}
                  <div className="w-full sm:w-[1px] h-[1px] sm:h-24 bg-theme-border/30" />

                  {/* Colonne QR Code */}
                  <div className="flex flex-col items-center justify-center">
                    {(() => {
                      const getQrColors = () => {
                        switch (theme) {
                          case 'arcade': return { color: '00f0ff', bgcolor: '05010a' };
                          case 'modern': return { color: '38bdf8', bgcolor: '0a0a0a' };
                          case 'pub':
                          default:
                            return { color: 'd4af37', bgcolor: '0b2216' };
                        }
                      };
                      const qrColors = getQrColors();
                      const remoteUrl = `${window.location.origin}${window.location.pathname}#/remote?room=${room.roomId}`;
                      const qrCodeApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(remoteUrl)}&color=${qrColors.color}&bgcolor=${qrColors.bgcolor}&margin=6`;
                      return (
                        <div className="p-2 bg-black/40 border border-theme-border/50 rounded-xl relative group flex flex-col items-center">
                          <img 
                            src={qrCodeApiUrl} 
                            alt="QR Code de liaison" 
                            className="w-[110px] h-[110px] rounded-lg transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                          <span className="text-[8px] text-theme-text-secondary uppercase tracking-wider block mt-2 text-center font-bold">
                            OU FLASHEZ ICI 📱
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Liste des joueurs connectés */}
                <div className="w-full max-w-sm">
                  <h3 className="text-sm font-bold text-theme-text-primary mb-4 flex items-center gap-2">
                    <Users className="w-4 h-4 text-theme-accent" /> Joueurs rejoints ({players.length})
                  </h3>
                  
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {players.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 bg-black/20 border border-theme-border/20 rounded-xl">
                        <span className="w-6 h-6 rounded-full bg-theme-accent/20 text-theme-accent text-xs font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="font-semibold text-theme-text-primary">{p.name}</span>
                      </div>
                    ))}
                    {players.length === 0 && (
                      <p className="text-xs text-theme-text-secondary italic text-center py-4">
                        Aucun joueur connecté pour le moment.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-center text-[10px] text-theme-text-secondary/60">
                Lancez la partie depuis la télécommande pour allumer la cible !
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // --- RENDU 2 : FIN DE PARTIE (CÉLÉBRATION) ---
  if (status === 'finished' && room) {
    return (
      <div className="w-full h-full flex m-0 p-0 overflow-hidden bg-black select-none">
        {/* Cible à gauche éclairée à 50% */}
        <div className="w-1/2 h-full bg-white shadow-[20px_0_40px_rgba(255,255,255,0.15)] z-10 flex flex-col justify-end items-center pb-6">
          {/* Logo bas gauche - zone blanche */}
          <span
            className="italic text-xl text-zinc-950 font-serif tracking-widest opacity-50 select-none"
            style={{ fontFamily: "'Playfair Display', 'Didot', 'Georgia', serif" }}
          >
            Minou Dart Game
          </span>
        </div>

        {/* Interface vainqueur à droite */}
        <div className="w-1/2 h-full bg-theme-bg text-theme-text-primary p-5 flex flex-col justify-between relative border-l border-theme-border/30">
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
            <a href="#/" className="p-2 rounded-full bg-black/40 hover:bg-black/80 border border-theme-border/30 hover:border-theme-accent text-theme-text-secondary transition-all">
              <ArrowLeft className="w-5 h-5" />
            </a>
          </div>

          <div className="flex flex-col items-center justify-center flex-grow py-8 text-center">
            <div className="p-4 bg-theme-accent/10 border-2 border-theme-accent rounded-full mb-3 animate-bounce">
              <Award className="w-10 h-10 text-theme-accent" />
            </div>

            <h2 className="text-xs font-bold tracking-widest text-theme-accent uppercase mb-1">Victoire magistrale</h2>
            <h1 className="text-3xl md:text-4xl font-black tracking-wider text-theme-text-primary mb-2 font-serif">
              {room.winnerName}
            </h1>
            <div className="w-24 h-[2px] bg-theme-accent mb-3" />

            <p className="text-xs text-theme-text-secondary max-w-sm mb-3 leading-relaxed">
              {room.gameType === 'cricket' 
                ? "Félicitations ! Toutes les cibles du Cricket ont été fermées."
                : `Félicitations ! Le score cible de ${room.targetScore} a été atteint.`
              }
            </p>

            {/* Statistiques finales et Moments Forts (Vidéoprojecteur) */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full max-w-4xl mt-1 select-none">
              
              {/* Colonne Gauche : Tableau des Stats */}
              <div className="bg-black/35 border border-theme-border/25 p-3 rounded-2xl backdrop-blur shadow-lg">
                <h3 className="text-xs font-black text-theme-accent uppercase tracking-widest mb-2 text-center">
                  Statistiques du Match
                </h3>
                
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs md:text-sm">
                    <thead>
                      {room.gameType === 'cricket' ? (
                        <tr className="border-b border-theme-border/20 text-zinc-500 font-bold uppercase tracking-wider text-[9px] md:text-[10px]">
                          <th className="pb-2">Joueur</th>
                          <th className="pb-2 text-center">MPR</th>
                          <th className="pb-2 text-center">Préc.</th>
                          <th className="pb-2 text-center">Loupées</th>
                          <th className="pb-2 text-center">T. Blancs</th>
                          <th className="pb-2 text-center">Best T.</th>
                        </tr>
                      ) : (
                        <tr className="border-b border-theme-border/20 text-zinc-500 font-bold uppercase tracking-wider text-[9px] md:text-[10px]">
                          <th className="pb-2">Joueur</th>
                          <th className="pb-2 text-center">{room.gameType === 'bart' ? '% Service' : 'Moyenne'}</th>
                          <th className="pb-2 text-center">{room.gameType === 'bart' ? 'Aces/Retours' : 'Score'}</th>
                          <th className="pb-2 text-center">{room.gameType === 'bart' ? 'Sets/Jeux' : 'Lancers'}</th>
                          {room.gameType === 'x01' && <th className="pb-2 text-center">Busts</th>}
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {players.map((p) => (
                        <tr key={p.name} className="border-b border-theme-border/10">
                          <td className="py-2.5 font-bold uppercase text-zinc-200 truncate max-w-[120px]">
                            {p.name}
                          </td>
                          {room.gameType === 'cricket' ? (
                            <>
                              <td className="py-2.5 text-center font-bold text-theme-accent">
                                {p.avg.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-2.5 text-center font-bold text-white">
                                {p.accuracy !== undefined ? `${p.accuracy.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}%` : '-'}
                              </td>
                              <td className="py-2.5 text-center text-red-400">{p.missedDarts || 0}</td>
                              <td className="py-2.5 text-center text-zinc-500">{p.whiteRounds || 0}</td>
                              <td className="py-2.5 text-center text-yellow-500">{p.bestCricketRound || 0}</td>
                            </>
                          ) : (
                            <>
                              <td className="py-2.5 text-center font-bold text-theme-accent">
                                {room.gameType === 'bart' 
                                  ? (p.bartState && p.bartState.servesPlayed > 0 ? `${((p.bartState.servesWon / p.bartState.servesPlayed) * 100).toFixed(0)}%` : '-') 
                                  : p.avg.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-2.5 text-center font-bold text-white">
                                {room.gameType === 'bart' ? `${p.bartState?.acesCount || 0} / ${p.bartState?.returnWinnersCount || 0}` : (p.score === 0 ? 'Fini 🏆' : p.score)}
                              </td>
                              <td className="py-2.5 text-center text-zinc-400">
                                {room.gameType === 'bart' ? `${p.bartState?.setsWon || 0} Sets / ${p.bartState?.gamesWon || 0} Jeux` : p.throwsCount}
                              </td>
                              {room.gameType === 'x01' && (
                                <td className="py-2.5 text-center text-red-400">
                                  {p.bustsCount || 0}
                                </td>
                              )}
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Colonne Droite : Moments Forts */}
              <div className="bg-black/35 border border-theme-border/25 p-3 rounded-2xl backdrop-blur shadow-lg flex flex-col">
                <h3 className="text-xs font-black text-theme-accent uppercase tracking-widest mb-2 text-center">
                  Moments Forts du Match
                </h3>
                
                <div className="space-y-1.5 text-left text-xs overflow-y-auto max-h-[160px] pr-1 flex-grow">
                  {(() => {
                    const renderHighlightText = (text: string) => {
                      const parts = text.split(/\*\*(.*?)\*\*/g);
                      return parts.map((part, i) => i % 2 === 1 ? <strong key={i} className="text-theme-accent font-black">{part}</strong> : part);
                    };
                    return getGameHighlights(room).map((hl, idx) => (
                      <div key={idx} className="flex items-start gap-2 bg-black/20 p-2.5 rounded-xl border border-zinc-900/35">
                        <p className="text-zinc-300 leading-normal">
                          {renderHighlightText(hl)}
                        </p>
                      </div>
                    ));
                  })()}
                </div>
              </div>

            </div>
          </div>

          <div className="text-center text-[10px] text-theme-text-secondary/60">
            Relancez un match depuis la télécommande pour recommencer à jouer !
          </div>
        </div>
      </div>
    );
  }

  // --- RENDU 3 : EN COURS DE JEU (PLAYING) ---
  if (room?.gameType === 'bart') {
    return (
      <BartProjectorGame 
        room={room} 
        projectorMode={projectorMode} 
        setProjectorMode={setProjectorMode} 
        showModeSelector={showModeSelector} 
        setShowModeSelector={setShowModeSelector} 
        renderCalibratedDartboard={renderCalibratedDartboard}
        calibration={calibration}
        isCalibrating={isCalibrating}
        setIsCalibrating={setIsCalibrating}
        calibrationStep={calibrationStep}
        renderProjectorCalibrationInterface={renderProjectorCalibrationInterface}
        lastCalibrationHit={lastCalibrationHit}
      />
    );
  }

  if (room?.gameType === 'clock') {
    return (
      <ClockProjectorGame
        room={room}
        projectorMode={projectorMode}
        setProjectorMode={setProjectorMode}
        showModeSelector={showModeSelector}
        setShowModeSelector={setShowModeSelector}
        renderCalibratedDartboard={renderCalibratedDartboard}
        calibration={calibration}
        isCalibrating={isCalibrating}
        setIsCalibrating={setIsCalibrating}
        calibrationStep={calibrationStep}
        renderProjectorCalibrationInterface={renderProjectorCalibrationInterface}
        lastCalibrationHit={lastCalibrationHit}
      />
    );
  }

  const renderGameAnimationDetails = (isDarkTheme: boolean, isAbsolute: boolean = false) => {
    if (!room) return null;

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
          {room?.gameType === 'x01' && (
            <>
              {/* Encart de suggestion de finition pour le joueur actif (EN HAUT) */}
              {(() => {
                const activePlayer = players[activePlayerIndex];
                if (!activePlayer || activePlayer.score > 180 || activePlayer.score <= 1) return null;
                const suggestion = getCheckoutSuggestion(activePlayer.score, !!room.doubleOut);
                if (!suggestion || suggestion.length === 0) return null;

                const renderProjectorCheckoutDartBadge = (dart: string) => {
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
                    <span 
                      key={dart} 
                      className={`px-4 py-1.5 rounded-xl border font-black uppercase tracking-wider ${bgClass}`}
                      style={{ fontSize: `${Math.round((calibration?.commentsFontSize ?? 18) * 0.85)}px` }}
                    >
                      {display}
                    </span>
                  );
                };

                return (
                  <div className={`w-full bg-zinc-950 text-white p-4 rounded-3xl border-2 border-theme-accent flex items-center justify-between gap-4 ${isDarkTheme ? 'shadow-[0_0_30px_rgba(255,255,255,0.1)] backdrop-blur-md' : 'shadow-[0_0_20px_rgba(255,255,255,0.05)]'}`}>
                    <div className="flex flex-col">
                      <span 
                        className="text-theme-accent font-black uppercase tracking-widest"
                        style={{ fontSize: `${Math.round((calibration?.commentsFontSize ?? 18) * 0.55)}px` }}
                      >
                        Finition Suggérée ({activePlayer.name})
                      </span>
                      <span 
                        className="font-black mt-0.5 tracking-tight text-white"
                        style={{ fontSize: `${calibration?.commentsFontSize ?? 18}px` }}
                      >
                        {activePlayer.score} points restants
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {suggestion.map((dart, idx) => (
                        <React.Fragment key={idx}>
                          {idx > 0 && (
                            <span 
                              className="text-zinc-650 font-black"
                              style={{ fontSize: `${Math.round((calibration?.commentsFontSize ?? 18) * 0.8)}px` }}
                            >
                              ➔
                            </span>
                          )}
                          {renderProjectorCheckoutDartBadge(dart)}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Règle de progression X01 (EN BAS) */}
              <div className="flex flex-col gap-4">
                <div 
                  className={`uppercase tracking-widest text-center flex items-center justify-between border-b pb-2 ${progHeaderClass} ${progDividerClass}`}
                  style={{ fontSize: `${Math.round((calibration?.commentsFontSize ?? 18) * 0.65)}px` }}
                >
                  <span>{room.targetScore} (Départ)</span>
                  <span className={`font-black ${progTitleClass}`} style={{ fontSize: `${Math.round((calibration?.commentsFontSize ?? 18) * 0.75)}px` }}>Progression du Match</span>
                  <span>0 (Arrivée)</span>
                </div>
                
                <div className={`space-y-4 w-full p-5 rounded-2xl border ${progBgClass}`}>
                  {players.map((player, idx) => {
                    const isActive = idx === activePlayerIndex;
                    const progressPercentage = Math.max(0, Math.min(100, (((room.targetScore - player.score) / room.targetScore) * 100)));
                    
                    return (
                      <div key={player.name} className="flex flex-col gap-1.5 w-full">
                        <div 
                          className={`flex justify-between font-bold px-1 ${progTextClass}`}
                          style={{ fontSize: `${Math.round((calibration?.commentsFontSize ?? 18) * 0.7)}px` }}
                        >
                          <span className="uppercase flex items-center gap-1">
                            <span>{player.name}</span>
                            <span>{player.emoji || '🎯'}</span>
                          </span>
                          <span>{player.score} restants</span>
                        </div>
                        <div className={`relative w-full h-2.5 rounded-full overflow-visible border border-zinc-300/30 ${progLineBgClass}`}>
                          <div 
                            className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${
                              isActive ? 'bg-[#22c55e]' : progLineFillClass
                            }`}
                            style={{ width: `${progressPercentage}%` }}
                          />
                          <div 
                            className={`absolute -top-3.5 -translate-x-1/2 w-9 h-9 rounded-full border-2 flex items-center justify-center text-lg shadow-lg transition-all duration-500 cursor-default select-none ${
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
            </>
          )}

          {/* Règle de progression Cricket */}
          {room?.gameType === 'cricket' && (
            <div className="flex flex-col gap-4">
              <div 
                className={`uppercase tracking-widest text-center flex items-center justify-between border-b pb-2 ${progHeaderClass} ${progDividerClass}`}
                style={{ fontSize: `${Math.round((calibration?.commentsFontSize ?? 18) * 0.65)}px` }}
              >
                <span>0 (Début)</span>
                <span className={`font-black ${progTitleClass}`} style={{ fontSize: `${Math.round((calibration?.commentsFontSize ?? 18) * 0.75)}px` }}>Cibles Fermées (Cricket)</span>
                <span>{room.cricketTargets?.length || 7} (Fermé)</span>
              </div>
              
              <div className={`space-y-4 w-full p-5 rounded-2xl border ${progBgClass}`}>
                {players.map((player, idx) => {
                  const isActive = idx === activePlayerIndex;
                  const targets = room.cricketTargets || [];
                  const closedCount = targets.filter(t => (player.cricketMarks?.[String(t)] || 0) >= 3).length;
                  const progressPercentage = targets.length > 0 ? (closedCount / targets.length) * 100 : 0;
                  
                  return (
                    <div key={player.name} className="flex flex-col gap-1.5 w-full">
                      <div 
                        className={`flex justify-between font-bold px-1 ${progTextClass}`}
                        style={{ fontSize: `${Math.round((calibration?.commentsFontSize ?? 18) * 0.7)}px` }}
                      >
                        <span className="uppercase flex items-center gap-1">
                          <span>{player.name}</span>
                          <span>{player.emoji || '🎯'}</span>
                        </span>
                        <span>{closedCount} / {targets.length} cibles</span>
                      </div>
                      <div className={`relative w-full h-2.5 rounded-full overflow-visible border border-zinc-300/30 ${progLineBgClass}`}>
                        <div 
                          className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${
                            isActive ? 'bg-[#22c55e]' : progLineFillClass
                          }`}
                          style={{ width: `${progressPercentage}%` }}
                        />
                        <div 
                          className={`absolute -top-3.5 -translate-x-1/2 w-9 h-9 rounded-full border-2 flex items-center justify-center text-lg shadow-lg transition-all duration-500 cursor-default select-none ${
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
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex m-0 p-0 overflow-hidden bg-black select-none relative">
      
      {/* 1. MOITIÉ GAUCHE (50% de l'écran) : Éclairage de la cible physique */}
      {projectorMode !== 'fullscreen' && (
        <div 
          className={`w-1/2 h-full transition-all duration-500 shadow-[20px_0_40px_rgba(255,255,255,0.15)] z-10 flex flex-col relative overflow-hidden ${
            projectorMode === 'ar'
              ? isCalibrating
                ? 'bg-white justify-center items-center p-0'
                : 'bg-black justify-center items-center p-0'
              : 'bg-white justify-end items-center pb-6'
          }`}
          id="projector-spotlight"
        >
          {projectorMode === 'ar' ? (
            <>
              {/* Cible SVG de réalité augmentée (forcée dans la moitié supérieure, soit le 1/4 supérieur gauche de l'écran total) */}
              <div className="w-full h-1/2 flex items-center justify-center relative overflow-visible">
                {renderCalibratedDartboard(isCalibrating)}
              </div>

              {/* Placeholder Zone Stats pour l'étape 9 (AR Setup) */}
              {isCalibrating && calibrationStep === 9 && statsCalibrationState === 'none' && (
                <div 
                  className="absolute bg-zinc-300/80 border-2 border-dashed border-zinc-500 rounded-3xl p-6 shadow-xl backdrop-blur-md z-40 transition-all duration-200 pointer-events-none"
                  style={
                    calibration.statsPanelHeight !== undefined
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

              {/* Zone transparente de capture pour tracer le panneau de commentaires */}
              {statsCalibrationState !== 'none' && (
                <div 
                  className="absolute inset-0 z-50 cursor-crosshair bg-black/10"
                  onPointerDown={handleStatsPointerDown}
                  onPointerMove={handleStatsPointerMove}
                >
                  {/* Guide de tracé rouge en direct si on est en train de tracer le second point */}
                  {statsCalibrationState === 'bottom-right' && statsStartPointRef.current && (
                    <div 
                      className="absolute border-2 border-dashed border-red-550 bg-red-500/10 rounded-2xl pointer-events-none"
                      style={{
                        left: `${liveStatsRect ? liveStatsRect.x : (calibration.statsPanelX ?? 0)}px`,
                        top: `${liveStatsRect ? liveStatsRect.y : (calibration.statsPanelY ?? 0)}px`,
                        width: `${liveStatsRect ? liveStatsRect.width : (calibration.statsPanelWidth ?? 0)}px`,
                        height: `${liveStatsRect ? liveStatsRect.height : (calibration.statsPanelHeight ?? 0)}px`
                      }}
                    />
                  )}
                  <div className="absolute top-4 left-4 bg-black/85 text-white border border-red-500/40 px-3.5 py-1.5 rounded-full text-xs font-black shadow-lg animate-pulse pointer-events-none">
                    🎯 {statsCalibrationState === 'top-left' ? 'Cliquez pour le coin HAUT-GAUCHE' : 'Glissez/cliquez pour le coin BAS-DROITE'}
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

              {/* Interface de calibration déplacée à droite */}
              
              {/* Notification d'impact de jeu normal (quand non calibration) */}
              {!isCalibrating && lastCalibrationHit && (
                <div 
                  className="absolute bg-black/90 text-white border-2 border-theme-accent px-4 py-2 rounded-2xl shadow-xl z-30 text-xs font-bold animate-fadeIn pointer-events-none"
                  style={{ top: '52%', left: '50%', transform: 'translateX(-50%)' }}
                >
                  🎯 Touché : <span className="text-theme-accent">{lastCalibrationHit.region}</span> &bull; Score : <span className="text-[#22c55e]">{lastCalibrationHit.score}</span>
                </div>
              )}

              {/* Affichage des détails d'animation en AR */}
              {!isCalibrating && renderGameAnimationDetails(true, true)}
            </>
          ) : (
            <>
              {/* RÈGLAGES CLASSIQUES (VUE ANCIENNE) */}
              {/* Logo Minou Dart Game */}
              <span 
                className="italic text-xl text-zinc-950 font-serif tracking-widest opacity-50 select-none mb-4"
                style={{ fontFamily: "'Playfair Display', 'Didot', 'Georgia', serif" }}
              >
                Minou Dart Game
              </span>

              {/* Affichage des détails d'animation en vue Classique */}
              {renderGameAnimationDetails(false, false)}
            </>
          )}
        </div>
      )}

      {/* 2. MOITIÉ DROITE : Interface Sombre */}
      <div 
        className={`${projectorMode === 'fullscreen' ? 'w-full' : 'w-1/2'} h-full bg-theme-bg text-theme-text-primary transition-all duration-300 p-4 md:p-5 flex flex-col justify-between relative border-l border-theme-border/30`}
        id="projector-interface"
      >
        {isCalibrating ? (
          renderProjectorCalibrationInterface()
        ) : (
          <>
            <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
          <a 
            href={`#/remote?room=${room?.roomId}`}
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

        {/* --- ZONE SUPÉRIEURE : Scores & Statistiques (Prend 85% de l'espace disponible) --- */}
        <div className="flex-grow flex flex-col justify-start min-h-0 overflow-hidden">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-theme-accent animate-ping" />
            <h2 className={`text-xs font-bold tracking-widest text-theme-text-secondary uppercase ${
              theme === 'arcade' ? 'neon-glow-pink-text font-mono' : ''
            }`}>
              {room?.gameType === 'cricket' 
                ? `CRICKET ${room?.cricketVariant === 'classic' ? 'CLASSIQUE' : room?.cricketVariant === 'crazy' ? 'CRAZY' : 'TACTICAL'}` 
                : `MODE ${room?.targetScore}`
              } &bull; SALON : {room?.roomId}
            </h2>
          </div>

          {room?.gameType === 'cricket' && room?.cricketTargets ? (
            /* ═══ GRILLE VERTICALE DE CRICKET (STYLISÉE 16/9) ═══ */
            <div className="flex-grow flex flex-col justify-between min-h-0 select-none w-full">
              <table 
                className="w-full border-collapse table-fixed flex-grow"
                style={{ fontSize: `${calibration?.statsFontSize ?? 16}px` }}
              >
                <thead>
                  <tr className="border-b border-theme-border/20">
                    {/* Colonne des cibles (vide en en-tête) */}
                    <th className="w-[80px] md:w-[100px] pb-1"></th>
                    
                    {/* En-têtes Joueurs */}
                    {players.map((player, idx) => {
                      const isActive = idx === activePlayerIndex;
                      const numPlayers = players.length;
                      
                      const baseSize = calibration?.statsFontSize ?? 16;
                      const nameStyle = { fontSize: `${Math.round(baseSize * (numPlayers > 4 ? 0.8 : numPlayers > 2 ? 0.9 : 1.1))}px` };
                      const scoreStyle = { fontSize: `${Math.round(baseSize * (numPlayers > 4 ? 1.1 : numPlayers > 2 ? 1.3 : 1.7))}px` };
                      let headerHeight = 'min-h-[70px]';
                      
                      if (numPlayers > 4) {
                        headerHeight = 'min-h-[55px]';
                      }

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
                              /* Spacer invisible pour maintenir l'alignement vertical */
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
                          {/* Ligne d'activation brillante */}
                          <div className={`absolute bottom-0 left-2 right-2 h-[3px] rounded-full transition-all duration-300 ${
                            isActive ? 'bg-theme-accent' : 'bg-transparent'
                          }`} />
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                
                <tbody>
                  {room.cricketTargets.map((target) => {
                    const isBull = target === 25;
                    const targetLabel = isBull ? 'Bull' : String(target);
                    
                    // Vérifier si tous les joueurs ont fermé cette cible
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
                        {/* Colonne Cibles (Badge vertical compact) */}
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
                            {/* Barre diagonale de fermeture */}
                            {allClosed && (
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-full h-[2px] bg-green-600/50 rotate-[-20deg] rounded-full" />
                              </div>
                            )}
                          </div>
                        </td>
                        
                        {/* Marques des joueurs */}
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

                {/* FOOTER : Statistiques condensées sur une seule ligne */}
                <tfoot>
                  <tr className="border-t-2 border-theme-border/30 bg-black/30">
                    <td className="p-1 text-center align-middle border-r border-theme-border/10">
                      <div 
                        className="font-black text-zinc-500 uppercase tracking-widest leading-tight text-center"
                        style={{ fontSize: `${Math.round((calibration?.statsFontSize ?? 16) * 0.65)}px` }}
                      >
                        Stats
                      </div>
                    </td>
                    {players.map((player, idx) => {
                      const isActive = idx === activePlayerIndex;
                      const roundThrows = player.currentRoundThrows || [];
                      return (
                        <td 
                          key={player.name} 
                          className={`p-1 text-center align-middle transition-colors ${
                            isActive ? 'bg-theme-accent/5' : ''
                          }`}
                        >
                          {/* Ligne des statistiques */}
                          <div 
                            className="flex flex-wrap items-center justify-center gap-x-1.5 md:gap-x-3 gap-y-0.5 font-bold text-zinc-350 mb-1.5 leading-tight"
                            style={{ fontSize: `${Math.round((calibration?.statsFontSize ?? 16) * 0.75)}px` }}
                          >
                            <span>{players.length >= 5 ? 'Lanc.' : 'Lancers'}: <strong className="text-white font-black">{player.throwsCount}</strong></span>
                            <span className="text-zinc-700">|</span>
                            <span>{players.length >= 5 ? 'Loup.' : 'Loupées'}: <strong className="text-red-400 font-black">{player.missedDarts || 0}</strong></span>
                            <span className="text-zinc-700">|</span>
                            <span>Préc.: <strong className="text-white font-black">{player.accuracy !== undefined ? `${player.accuracy.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}%` : '-'}</strong></span>
                            <span className="text-zinc-700">|</span>
                            <span>MPR: <strong className="text-theme-accent font-black">{player.avg.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                          </div>
                          
                          {/* Boîtes de lancer du tour */}
                          <div className="flex gap-1 justify-center mb-0.5">
                            {[0, 1, 2].map((i) => {
                              const throwLabel = roundThrows[i] || '';
                              const displayLabel = throwLabel === '0' ? 'Loupé' : throwLabel;
                              
                              // Tailles adaptatives pour les boîtes de lancer
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

              {/* Indicateur du joueur actif en bas de tableau */}
              <div className="mt-1 text-center">
                <span 
                  className="text-theme-text-secondary uppercase tracking-widest font-black animate-pulse"
                  style={{ fontSize: `${Math.round((calibration?.statsFontSize ?? 16) * 0.65)}px` }}
                >
                  🎯 {players[activePlayerIndex]?.name} à vous de jouer &bull; {players[activePlayerIndex]?.dartsLeft} fléchettes restantes
                </span>
              </div>
            </div>
          ) : (
            /* ═══ LISTE DES JOUEURS X01 (OPTIMISÉE 16/9 1080p) ═══ */
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
                const isLastOddPlayer = (numPlayers === 3 && idx === 2) || (numPlayers === 5 && idx === 4);
                
                // Calcul de la taille dynamique des cartes et polices en fonction du nombre de joueurs
                // Optimisé pour 1080p (hauteur réduite pour tenir sans scroll)
                let cardPadding = 'p-2 md:p-3';
                let dartBoxSize = 'w-10 h-7 rounded-xl';
                let statBoxPadding = 'p-1';
                let rowSpacing = 'mt-2';
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
                  // 5 à 6 joueurs
                  cardPadding = 'p-1 md:p-1.5';
                  dartBoxSize = 'w-9 h-6.5 rounded-md';
                  statBoxPadding = 'p-0.5';
                  rowSpacing = 'mt-1';
                }

                // Calcul de coefficients de redimensionnement basés sur statsFontSize
                const baseSize = calibration?.statsFontSize ?? 16;
                const nameStyle = { fontSize: `${Math.round(baseSize * (numPlayers >= 5 ? 0.85 : numPlayers <= 2 ? 1.3 : 1.1))}px` };
                const scoreStyle = { fontSize: `${Math.round(baseSize * (numPlayers >= 5 ? 1.8 : numPlayers <= 2 ? 4.5 : 3.5))}px` };
                const subLabelStyle = { fontSize: `${Math.round(baseSize * 0.65)}px` };
                const tourStyle = { fontSize: `${Math.round(baseSize * 0.75)}px` };
                const sumStyle = { fontSize: `${Math.round(baseSize * 0.85)}px` };
                const boxStyle = { fontSize: `${Math.round(baseSize * 0.75)}px` };
                const statsValueStyle = { fontSize: `${Math.round(baseSize * 0.85)}px` };

                // Extraire les lancers du joueur pour les 3 cases du tour
                const roundThrows = player.currentRoundThrows || [];
                const dart1 = roundThrows[0] || '';
                const dart2 = roundThrows[1] || '';
                const dart3 = roundThrows[2] || '';
                
                // Calculer le score du tour
                let roundSum = 0;
                if (isActive) {
                  const dartsCount = 3 - player.dartsLeft;
                  const history = player.history || [];
                  const recentThrows = history.slice(history.length - dartsCount);
                  roundSum = recentThrows.reduce((a, b) => a + b, 0);
                } else {
                  // Pour les inactifs, on fait la somme des points de leur lastRound ou currentRoundThrows
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

                // Formatage de la moyenne avec virgule métrique (Règle user_global)
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
                            <span>{player.name}</span>
                            <span>{player.emoji || '🎯'}</span>
                          </span>
                          {isActive && (
                            <span className="flex-shrink-0 flex items-center justify-center w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
                          )}
                          {player.roundBust && (
                            <span 
                              className="flex-shrink-0 bg-red-600/95 text-white font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse"
                              style={{ fontSize: `${Math.round(baseSize * 0.55)}px` }}
                            >
                              Bust
                            </span>
                          )}
                        </div>
                        <span 
                          className="text-zinc-500 font-semibold mt-0.5 truncate"
                          style={subLabelStyle}
                        >
                          {isActive ? `En cours — ${player.dartsLeft} fléchette(s)` : 'En attente'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span 
                          className={`font-black tracking-tighter leading-none ${
                            player.roundBust 
                              ? 'text-red-400/90' 
                              : isActive 
                                ? 'text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.15)]' 
                                : 'text-zinc-400'
                          } ${theme === 'arcade' ? 'neon-glow-text font-mono' : ''}`}
                          style={scoreStyle}
                        >
                          {player.score}
                        </span>
                      </div>
                    </div>

                    {/* Ligne 2 : Fléchettes jetées au cours de ce tour */}
                    <div className={`flex items-center justify-between ${rowSpacing} pt-2 border-t border-zinc-900/40`}>
                      <div className="flex items-center gap-1.5">
                        <span 
                          className="text-zinc-500 font-bold uppercase tracking-wider"
                          style={tourStyle}
                        >
                          Tour :
                        </span>
                        {player.roundBust ? (
                          <span 
                            className="text-red-500 font-black tracking-widest animate-pulse"
                            style={tourStyle}
                          >
                            BUST ❌
                          </span>
                        ) : (
                          (roundSum > 0 || roundThrows.length > 0) ? (
                            <span 
                              className="bg-zinc-900 text-[#22c55e] border border-zinc-850/80 font-black px-2.5 py-0.5 rounded-md"
                              style={sumStyle}
                            >
                              {roundSum} pts
                            </span>
                          ) : (
                            <span 
                              className="text-zinc-650 font-semibold italic"
                              style={tourStyle}
                            >
                              Aucun
                            </span>
                          )
                        )}
                      </div>

                      <div className="flex gap-1">
                        {[dart1, dart2, dart3].map((dart, dIdx) => {
                          const isBustDart = player.roundBust && dart && dIdx === roundThrows.length - 1;
                          return (
                            <div 
                              key={dIdx} 
                              className={`border flex items-center justify-center font-black transition-all duration-300 ${dartBoxSize} ${
                                isBustDart
                                  ? 'border-red-500/60 bg-red-950/20 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.3)]'
                                  : dart 
                                    ? 'border-zinc-700 text-white bg-zinc-900' 
                                    : 'border-zinc-900 text-transparent bg-black/40'
                              }`}
                              style={boxStyle}
                            >
                              {dart}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Ligne 3 : Grille des 4 statistiques en 2 lignes (2x2) */}
                    <div className={`grid grid-cols-2 gap-1.5 ${rowSpacing} pt-2 border-t border-zinc-900/60 text-center`}>
                      <div className={`flex flex-col items-center justify-center ${statBoxPadding} bg-black/25 rounded-xl border border-zinc-900/40`}>
                        <span className="text-zinc-500 font-bold uppercase tracking-wider mb-0.5 font-bold" style={{ fontSize: `${Math.round(baseSize * 0.55)}px` }}>Moyenne</span>
                        <span className="font-extrabold text-white" style={statsValueStyle}>{formattedAvg}</span>
                      </div>

                      <div className={`flex flex-col items-center justify-center ${statBoxPadding} bg-black/25 rounded-xl border border-zinc-900/40`}>
                        <span className="text-zinc-500 font-bold uppercase tracking-wider mb-0.5 font-bold" style={{ fontSize: `${Math.round(baseSize * 0.55)}px` }}>Dernier</span>
                        <span className="font-extrabold text-[#22c55e]" style={statsValueStyle}>
                          {player.lastRoundScore !== undefined && player.lastRoundScore > 0 ? player.lastRoundScore : '-'}
                        </span>
                      </div>

                      <div className={`flex flex-col items-center justify-center ${statBoxPadding} bg-black/25 rounded-xl border border-zinc-900/40`}>
                        <span className="text-zinc-500 font-bold uppercase tracking-wider mb-0.5 font-bold" style={{ fontSize: `${Math.round(baseSize * 0.55)}px` }}>Meilleur</span>
                        <span className="font-extrabold text-yellow-500" style={statsValueStyle}>
                          {player.bestRound !== undefined && player.bestRound > 0 ? player.bestRound : '-'}
                        </span>
                      </div>

                      <div className={`flex flex-col items-center justify-center ${statBoxPadding} bg-black/25 rounded-xl border border-zinc-900/40`}>
                        <span className="text-zinc-500 font-bold uppercase tracking-wider mb-0.5 font-bold" style={{ fontSize: `${Math.round(baseSize * 0.55)}px` }}>Lancers</span>
                        <span className="font-extrabold text-zinc-300" style={statsValueStyle}>{player.throwsCount}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* --- PIED DE PAGE : Logo & Infos de salon discrets et premium --- */}
        <div className="mt-2 pt-2 border-t border-theme-border/20 flex flex-row justify-between items-center text-[10px] text-theme-text-secondary/80 select-none">
          <div className="flex items-center gap-2">
            <span className="font-extrabold tracking-widest text-theme-accent">MINOU DARTS</span>
            <span className="text-zinc-700">|</span>
            <span className="uppercase tracking-wider text-[9px]">Est. 2026</span>
          </div>
          <div className="text-center font-mono">
            SALON : <span className="font-black text-theme-accent">{room?.roomId}</span>
          </div>
          <div className="text-right hidden sm:block">
            {room?.gameType === 'cricket' ? 'CRICKET' : `CIBLE : ${room?.targetScore}`} &bull; METRIC PWA
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
    </div>
  );
};

  return (
    <ProjectorScaleWrapper>
      {renderContent()}
    </ProjectorScaleWrapper>
  );
};
