import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useTheme } from '../context/ThemeContext';
import { Award, ArrowLeft, Users, Smartphone, Settings, Check, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, RotateCcw, Crosshair, ArrowLeftRight } from 'lucide-react';
import { roomService, getGameHighlights } from '../services/roomService';
import type { RoomData, CalibrationSettings } from '../services/roomService';
import { BartProjectorGame } from './BartProjectorGame';
import { ClockProjectorGame } from './ClockProjectorGame';
import { X01ProjectorGame } from './X01ProjectorGame';
import { CricketProjectorGame } from './CricketProjectorGame';
import { getCheckoutSuggestion } from '../services/checkoutSuggestions';

// --- Constantes & Utilitaires pour la géométrie de la cible ---
const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number, rotationAngle: number = 0) => {
  const angleInRadians = (angleInDegrees - 90 + rotationAngle) * Math.PI / 180.0;
  return {
    x: centerX + (radius * Math.cos(angleInRadians)),
    y: centerY + (radius * Math.sin(angleInRadians)),
  };
};

const describeArc = (x: number, y: number, innerRadius: number, outerRadius: number, startAngle: number, endAngle: number, rotationAngle: number = 0) => {
  const startOuter = polarToCartesian(x, y, outerRadius, endAngle, rotationAngle);
  const endOuter = polarToCartesian(x, y, outerRadius, startAngle, rotationAngle);
  const startInner = polarToCartesian(x, y, innerRadius, endAngle, rotationAngle);
  const endInner = polarToCartesian(x, y, innerRadius, startAngle, rotationAngle);

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

  // Disposition de l'écran : 'left' (cible à gauche, scores à droite) ou 'right' (cible à droite, scores à gauche)
  const [targetPosition, setTargetPosition] = useState<'left' | 'right'>(() => {
    const saved = localStorage.getItem('minou_dart_target_position');
    if (saved === 'left' || saved === 'right') return saved;
    return 'left';
  });

  const handleToggleTargetPosition = (newPos?: 'left' | 'right') => {
    const nextPos = newPos ?? (targetPosition === 'left' ? 'right' : 'left');
    setTargetPosition(nextPos);
    localStorage.setItem('minou_dart_target_position', nextPos);
    if (roomId && roomId !== 'LOCAL') {
      roomService.updateRoom(roomId, { targetPosition: nextPos }).catch(err =>
        console.error('Erreur sync position cible Firestore:', err)
      );
    }
  };

  // Synchronisation du mode de vue depuis la télécommande (via storage event)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'minou_dart_projector_mode' && e.newValue) {
        const newMode = e.newValue;
        if (newMode === 'classic' || newMode === 'fullscreen' || newMode === 'ar') {
          setProjectorMode(newMode);
        }
      }
      if (e.key === 'minou_dart_target_position' && (e.newValue === 'left' || e.newValue === 'right')) {
        setTargetPosition(e.newValue);
      }
      if (e.key === 'minou_dart_calibration' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setCalibration(parsed);
        } catch (_) {
          // Ignorer les erreurs de parsing
        }
      }
      if (e.key === 'minou_dart_calibration_step' && e.newValue) {
        const step = parseInt(e.newValue);
        if (!isNaN(step)) setCalibrationStep(step);
      }
      if (e.key === 'minou_dart_calibration_submode' && (e.newValue === 'laser' || e.newValue === 'white')) {
        setCalibrationSubMode(e.newValue);
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
    rotationAngle: 0,
    haloWhiteRadius: DEFAULT_RADIUS * 1.1,
    haloMaxRadius: DEFAULT_RADIUS * 2.5,
    arShowExtraOverlays: true,
    arNumbersPosition: 'inside',
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
  const [calibrationSubMode, setCalibrationSubMode] = useState<'laser' | 'white'>(() => {
    const saved = localStorage.getItem('minou_dart_calibration_submode');
    return (saved === 'white' || saved === 'laser') ? saved : 'laser';
  });
  const [lastCalibrationHit, setLastCalibrationHit] = useState<{ region: string; score: number } | null>(null);
  const [highlightedSegment, setHighlightedSegment] = useState<string | null>(null);
  const [clickToCenterState, setClickToCenterState] = useState<'none' | 'center' | 'radius'>('none');
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const [statsPointerPos, setStatsPointerPos] = useState<{ x: number; y: number } | null>(null);
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
    if (room?.calibrationStep !== undefined) {
      setCalibrationStep(room.calibrationStep);
    }
    if (room?.calibrationSubMode !== undefined) {
      setCalibrationSubMode(room.calibrationSubMode);
    }
    if (room?.calibrationTestHit) {
      setHighlightedSegment(room.calibrationTestHit.segmentId);
      setLastCalibrationHit({
        region: room.calibrationTestHit.region,
        score: room.calibrationTestHit.score,
      });
      if (hitTimeoutRef.current) clearTimeout(hitTimeoutRef.current);
      hitTimeoutRef.current = setTimeout(() => {
        setHighlightedSegment(null);
        setLastCalibrationHit(null);
      }, 2000);
    }
  }, [room?.isCalibrating, room?.calibrationStep, room?.calibrationSubMode, room?.calibrationTestHit]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'minou_dart_is_calibrating') {
        setIsCalibrating(e.newValue === 'true');
      }
      if (e.key === 'minou_dart_calibration_step' && e.newValue) {
        const step = parseInt(e.newValue);
        if (!isNaN(step)) setCalibrationStep(step);
      }
      if (e.key === 'minou_dart_calibration_submode' && (e.newValue === 'laser' || e.newValue === 'white')) {
        setCalibrationSubMode(e.newValue);
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
  const [animatingDarts, setAnimatingDarts] = useState<string[]>([]);
  const [activeAnimationIndex, setActiveAnimationIndex] = useState<number>(-1);
  const lastThrowsCountRef = useRef<number>(0);
  const activePlayerNameRef = useRef<string>('');
  const lastAnimatedRoundIdRef = useRef<string | null | undefined>(undefined);
  const totalMatchThrowsRef = useRef<number>(0);
  const roundAnimIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const roundAnimTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

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

  const stopRoundAnimations = () => {
    if (roundAnimIntervalRef.current) {
      clearInterval(roundAnimIntervalRef.current);
      roundAnimIntervalRef.current = null;
    }
    roundAnimTimersRef.current.forEach(t => clearTimeout(t));
    roundAnimTimersRef.current = [];
    setActiveAnimationIndex(-1);
    setAnimatingDarts([]);
    setGlobalRoundAnimation({ type: null, active: false });
    setParticles([]);
    setShowRoundPath(false);
  };

  const handleSetIsCalibrating = (val: boolean) => {
    setIsCalibrating(val);
    localStorage.setItem('minou_dart_is_calibrating', String(val));
    if (roomId && roomId !== 'LOCAL') {
      roomService.updateRoom(roomId, { isCalibrating: val }).catch(err =>
        console.error('Erreur sync isCalibrating Firestore:', err)
      );
    }
  };

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
      setClickToCenterState('radius');
    } else if (clickToCenterState === 'radius') {
      const center = targetCenterRef.current || { x: calibration.centerX, y: calibration.centerY };
      const dx = x - center.x;
      const dy = y - center.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      adjustCalibrationToRadius(distance);
      
      // Verrouiller la taille et terminer la calibration
      setClickToCenterState('none');
      setPointerPos(null);
      targetCenterRef.current = null;
    }
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
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
    
    const x = (localX / S) * 1000;
    const y = (localY / S) * 1000;
    
    setPointerPos({ x, y });

    if (clickToCenterState === 'radius') {
      const center = targetCenterRef.current || { x: calibration.centerX, y: calibration.centerY };
      const dx = x - center.x;
      const dy = y - center.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      adjustCalibrationToRadius(distance);
    }
  };

  const handleStatsPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (statsCalibrationState === 'none') return;

    const x = Math.round(e.nativeEvent.offsetX);
    const y = Math.round(e.nativeEvent.offsetY);

    if (statsCalibrationState === 'top-left') {
      statsStartPointRef.current = { x, y };
      setLiveStatsRect({ x, y, width: 0, height: 0 });
      setStatsCalibrationState('bottom-right');
    } else if (statsCalibrationState === 'bottom-right') {
      if (statsStartPointRef.current) {
        const x1 = statsStartPointRef.current.x;
        const y1 = statsStartPointRef.current.y;
        
        const finalX = Math.min(x, x1);
        const finalY = Math.min(y, y1);
        const width = Math.max(10, Math.abs(x - x1));
        const height = Math.max(10, Math.abs(y - y1));

        const newCal = { ...calibration };
        newCal.statsPanelX = finalX;
        newCal.statsPanelY = finalY;
        newCal.statsPanelWidth = width;
        newCal.statsPanelHeight = height;
        newCal.commentsFontSize = Math.round(Math.max(10, Math.min(40, height * 0.065)));
        newCal.statsFontSize = Math.round(Math.max(10, Math.min(40, height * 0.057)));
        saveCalibration(newCal);
      }
      statsStartPointRef.current = null;
      setLiveStatsRect(null);
      setStatsCalibrationState('none');
      setStatsPointerPos(null);
    }
  };

  const handleStatsPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (statsCalibrationState === 'none') return;

    const x = Math.round(e.nativeEvent.offsetX);
    const y = Math.round(e.nativeEvent.offsetY);

    setStatsPointerPos({ x, y });

    if (statsCalibrationState === 'bottom-right' && statsStartPointRef.current) {
      const x1 = statsStartPointRef.current.x;
      const y1 = statsStartPointRef.current.y;
      
      const left = Math.min(x, x1);
      const top = Math.min(y, y1);
      const width = Math.max(10, Math.abs(x - x1));
      const height = Math.max(10, Math.abs(y - y1));
      
      setLiveStatsRect({ x: left, y: top, width, height });
    }
  };

  const adjustCalibration = (type: 'move-x' | 'move-y' | 'scale-step' | 'stats-move-x' | 'stats-move-y' | 'rotate', delta: number) => {
    const newCal = { ...calibration };
    if (type === 'move-x') {
      newCal.centerX = Math.max(0, Math.min(1000, newCal.centerX + delta));
    } else if (type === 'move-y') {
      newCal.centerY = Math.max(0, Math.min(1000, newCal.centerY + delta));
    } else if (type === 'rotate') {
      newCal.rotationAngle = Math.max(-15, Math.min(15, Number(((newCal.rotationAngle ?? 0) + delta).toFixed(1))));
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
    newCal.haloMaxRadius = Math.max(minVal, Math.min(850, (newCal.haloMaxRadius ?? (newCal.rDoubleOuter * 2.5)) + delta));
    saveCalibration(newCal);
  };

  const resetTabParameters = (step: number) => {
    const newCal = { ...calibration };
    if (step === 1) {
      newCal.centerX = DEFAULT_CALIBRATION.centerX;
      newCal.centerY = DEFAULT_CALIBRATION.centerY;
      newCal.radius = DEFAULT_CALIBRATION.radius;
      newCal.rDoubleOuter = DEFAULT_CALIBRATION.rDoubleOuter;
      newCal.rDoubleInner = DEFAULT_CALIBRATION.rDoubleInner;
      newCal.rTripleOuter = DEFAULT_CALIBRATION.rTripleOuter;
      newCal.rTripleInner = DEFAULT_CALIBRATION.rTripleInner;
      newCal.rBullOuter = DEFAULT_CALIBRATION.rBullOuter;
      newCal.rBullInner = DEFAULT_CALIBRATION.rBullInner;
      newCal.arShowExtraOverlays = DEFAULT_CALIBRATION.arShowExtraOverlays;
      newCal.arNumbersPosition = DEFAULT_CALIBRATION.arNumbersPosition;
    } else if (step === 3) {
      newCal.rotationAngle = 0;
    } else if (step === 8) {
      newCal.haloWhiteRadius = DEFAULT_CALIBRATION.haloWhiteRadius;
      newCal.haloMaxRadius = DEFAULT_CALIBRATION.haloMaxRadius;
    } else if (step === 9) {
      newCal.statsPanelX = DEFAULT_CALIBRATION.statsPanelX;
      newCal.statsPanelY = DEFAULT_CALIBRATION.statsPanelY;
      newCal.statsPanelWidth = 320;
      newCal.statsPanelHeight = 280;
      newCal.statsFontSize = DEFAULT_CALIBRATION.statsFontSize;
      newCal.commentsFontSize = DEFAULT_CALIBRATION.commentsFontSize;
    }
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
    isHighlight: boolean = false,
    largeStep?: number
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
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`font-mono font-black ${
              isHighlight ? 'text-white text-base md:text-lg' : 'text-theme-accent text-sm'
            }`}>
              {step < 1 ? value.toFixed(2) : Math.round(value)}{unit}
              <span className="text-zinc-500 font-normal text-xs ml-1">/ {max}{unit}</span>
            </span>
            {largeStep && (
              <div className="flex items-center gap-1 ml-1">
                <button
                  onClick={() => handleValueChange(Math.max(min, value - largeStep))}
                  className="w-7 h-5 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer text-[9px]"
                >
                  -{largeStep}
                </button>
                <button
                  onClick={() => handleValueChange(Math.min(max, value + largeStep))}
                  className="w-7 h-5 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 flex items-center justify-center font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer text-[9px]"
                >
                  +{largeStep}
                </button>
              </div>
            )}
          </div>
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
      { step: 3, label: '🔄 ROTATION', desc: 'Angle & Test' },
      { step: 8, label: '🔆 DÉGRADÉ', desc: 'Halos' },
      { step: 9, label: '💬 STATS', desc: 'Commentaires' },
    ];

    return (
      <div className="flex flex-col h-full justify-between gap-4 p-4 md:p-5 bg-zinc-950/40 rounded-3xl border border-zinc-800/80 backdrop-blur-md">
        {/* En-tête du panneau de calibrage */}
        <div className="flex items-center justify-between border-b border-zinc-850 pb-2.5">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-theme-accent animate-spin-slow" />
            <span className="text-sm font-black text-white uppercase tracking-wider">Interface de Calibrage</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const next = calibrationSubMode === 'laser' ? 'white' : 'laser';
                setCalibrationSubMode(next);
                localStorage.setItem('minou_dart_calibration_submode', next);
                if (roomId && roomId !== 'LOCAL') {
                  roomService.updateRoom(roomId, { calibrationSubMode: next }).catch(console.error);
                }
              }}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors cursor-pointer active:scale-95 ${
                calibrationSubMode === 'laser'
                  ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 hover:bg-cyan-500/30'
                  : 'bg-white/20 text-white border-white/40 hover:bg-white/30'
              }`}
            >
              {calibrationSubMode === 'laser' ? '⚡ Mire Laser' : '💡 Fond Blanc'}
            </button>
            <span className="text-[10px] text-zinc-500 font-bold bg-zinc-900 border border-zinc-850 px-2 py-0.5 rounded-full uppercase">
              720p
            </span>
          </div>
        </div>

        {/* Sélecteur d'étapes (la "bulle de sélection" avec gros boutons faciles à lire) */}
        <div className="space-y-1.5">
          <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">
            Étape de calibration
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {CALIBRATION_STEPS.map((item) => {
              const isDegrade = item.step === 8;
              const isSelected = calibrationStep === item.step;
              return (
                <button
                  key={item.step}
                  onClick={() => {
                    setCalibrationStep(item.step);
                    localStorage.setItem('minou_dart_calibration_step', String(item.step));
                    if (roomId && roomId !== 'LOCAL') {
                      roomService.updateRoom(roomId, { calibrationStep: item.step }).catch(console.error);
                    }
                  }}
                  className={`py-2.5 px-1.5 rounded-2xl border text-center flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer select-none active:scale-95 ${
                    isSelected
                      ? isDegrade
                        ? 'bg-orange-500 text-white border-orange-400 shadow-[0_0_15px_rgba(234,88,12,0.4)] scale-105 font-black'
                        : 'bg-theme-accent text-black border-theme-accent shadow-md scale-105 font-black'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800 hover:text-white'
                  }`}
                >
                  <span className={`font-black ${
                    isDegrade 
                      ? 'text-base md:text-lg tracking-wide' 
                      : 'text-sm md:text-base'
                  }`}>
                    {item.label}
                  </span>
                  <span className={`font-bold leading-tight text-[8px] md:text-[9px] ${
                    isSelected ? (isDegrade ? 'text-white/90' : 'text-black/85') : 'text-zinc-500'
                  }`}>
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
                  <span>Calibrer la Cible (2 clics)</span>
                </button>
              ) : clickToCenterState === 'center' ? (
                <div className="space-y-2 w-full animate-fadeIn">
                  <div className="w-full py-2.5 px-3 border bg-yellow-500 border-yellow-400 text-black shadow-[0_0_15px_rgba(234,179,8,0.4)] animate-pulse rounded-xl flex items-center justify-center gap-2 font-black text-xs">
                    <Crosshair className="w-4 h-4 animate-spin-slow" />
                    <span>1. Cliquez au CENTRE exact de la cible</span>
                  </div>
                  <button
                    onClick={() => { setClickToCenterState('none'); setPointerPos(null); }}
                    className="w-full py-2 px-3 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white rounded-xl flex items-center justify-center gap-2 font-bold transition-all cursor-pointer select-none active:scale-95 text-[10px]"
                  >
                    Annuler
                  </button>
                </div>
              ) : (
                <div className="space-y-2 w-full animate-fadeIn">
                  <div className="w-full py-2.5 px-3 border bg-orange-500 border-orange-400 text-white shadow-[0_0_15px_rgba(249,115,22,0.4)] animate-pulse rounded-xl flex items-center justify-center gap-2 font-black text-xs">
                    <Crosshair className="w-4 h-4 animate-spin-slow" />
                    <span>2. Écartez le rayon au bord, puis cliquez</span>
                  </div>
                  <button
                    onClick={() => { setClickToCenterState('none'); setPointerPos(null); }}
                    className="w-full py-2 px-3 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white rounded-xl flex items-center justify-center gap-2 font-bold transition-all cursor-pointer select-none active:scale-95 text-[10px]"
                  >
                    Annuler
                  </button>
                </div>
              )}
              {/* Option Afficher Repères AR */}
              <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-2.5 flex items-center justify-between gap-3">
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
                    const newCal = { ...calibration };
                    newCal.arShowExtraOverlays = calibration.arShowExtraOverlays === false ? true : false;
                    saveCalibration(newCal);
                  }}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    calibration.arShowExtraOverlays !== false ? 'bg-theme-accent' : 'bg-zinc-700'
                  }`}
                >
                  <div
                    className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${
                      calibration.arShowExtraOverlays !== false ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              {/* Position des numéros 1 à 20 projetés en Réalité Augmentée */}
              <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-2.5 space-y-1.5">
                <span className="font-black uppercase tracking-wider text-zinc-500 text-[10px] block">
                  Position des numéros 1 à 20 (AR)
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { value: 'inside', label: 'Intérieur', desc: 'Sur simples' },
                    { value: 'outside', label: 'Extérieur', desc: 'Hors doubles' },
                    { value: 'hidden', label: 'Masqués', desc: 'Cible nue' },
                  ] as const).map((opt) => {
                    const currentPos = calibration.arNumbersPosition ?? 'inside';
                    const isSelected = currentPos === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => {
                          saveCalibration({ ...calibration, arNumbersPosition: opt.value });
                        }}
                        className={`py-1.5 px-1.5 rounded-xl border text-center flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer select-none active:scale-95 ${
                          isSelected
                            ? 'bg-theme-accent text-black border-theme-accent font-black shadow-md'
                            : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:bg-zinc-800 hover:text-white font-bold'
                        }`}
                      >
                        <span className="text-xs leading-tight">{opt.label}</span>
                        <span className={`text-[8px] leading-tight ${isSelected ? 'text-black/80 font-bold' : 'text-zinc-500'}`}>
                          {opt.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
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
              <button
                onClick={() => resetTabParameters(1)}
                className="w-full mt-2 py-2 border border-red-900/50 bg-red-950/20 text-red-500 hover:bg-red-950/50 hover:text-red-400 rounded-xl flex items-center justify-center gap-2 font-bold transition-all cursor-pointer active:scale-95 text-[10px] uppercase tracking-wider"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Réinitialiser cet onglet
              </button>
            </div>
          )}

          {calibrationStep === 3 && (
            <div className="space-y-2.5">
              {/* Slider Rotation Angle */}
              {renderProjectorSliderWithButtons(
                'Rotation fine', 
                calibration.rotationAngle ?? 0, 
                -15, 
                15, 
                (val) => {
                  const currentVal = calibration.rotationAngle ?? 0;
                  adjustCalibration('rotate', val - currentVal);
                },
                0.5,
                '°',
                true,
                1
              )}

              {/* Boutons de test d'alignement */}
              <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-2.5 space-y-2">
                <span className="font-black uppercase tracking-wider text-zinc-500 text-[10px] block">
                  Test d'alignement rapide
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    onClick={() => {
                      setHighlightedSegment('triple-20');
                      setLastCalibrationHit({ region: 'Triple 20', score: 60 });
                      setTimeout(() => { setHighlightedSegment(null); setLastCalibrationHit(null); }, 2000);
                    }}
                    className="py-2 bg-yellow-500/20 hover:bg-yellow-500 text-yellow-300 hover:text-black font-black text-xs rounded-xl border border-yellow-500/40 transition-all cursor-pointer active:scale-95"
                  >
                    T20
                  </button>
                  <button
                    onClick={() => {
                      setHighlightedSegment('bull-inner');
                      setLastCalibrationHit({ region: 'Double Bull', score: 50 });
                      setTimeout(() => { setHighlightedSegment(null); setLastCalibrationHit(null); }, 2000);
                    }}
                    className="py-2 bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white font-black text-xs rounded-xl border border-red-500/40 transition-all cursor-pointer active:scale-95"
                  >
                    BULL
                  </button>
                  <button
                    onClick={() => {
                      setHighlightedSegment('double-16');
                      setLastCalibrationHit({ region: 'Double 16', score: 32 });
                      setTimeout(() => { setHighlightedSegment(null); setLastCalibrationHit(null); }, 2000);
                    }}
                    className="py-2 bg-cyan-500/20 hover:bg-cyan-500 text-cyan-300 hover:text-black font-black text-xs rounded-xl border border-cyan-500/40 transition-all cursor-pointer active:scale-95"
                  >
                    D16
                  </button>
                  <button
                    onClick={() => {
                      setHighlightedSegment('single-outer-19');
                      setLastCalibrationHit({ region: 'Simple 19', score: 19 });
                      setTimeout(() => { setHighlightedSegment(null); setLastCalibrationHit(null); }, 2000);
                    }}
                    className="py-2 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-black font-black text-xs rounded-xl border border-emerald-500/40 transition-all cursor-pointer active:scale-95"
                  >
                    S19
                  </button>
                </div>
              </div>

              <button
                onClick={() => resetTabParameters(3)}
                className="w-full mt-2 py-2 border border-red-900/50 bg-red-950/20 text-red-500 hover:bg-red-950/50 hover:text-red-400 rounded-xl flex items-center justify-center gap-2 font-bold transition-all cursor-pointer active:scale-95 text-[10px] uppercase tracking-wider"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Réinitialiser la rotation (0°)
              </button>
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
                850, 
                (val) => {
                  const newCal = { ...calibration };
                  newCal.haloMaxRadius = val;
                  saveCalibration(newCal);
                },
                5,
                '',
                true
              )}
              <button
                onClick={() => resetTabParameters(8)}
                className="w-full mt-2 py-2 border border-red-900/50 bg-red-950/20 text-red-500 hover:bg-red-950/50 hover:text-red-400 rounded-xl flex items-center justify-center gap-2 font-bold transition-all cursor-pointer active:scale-95 text-[10px] uppercase tracking-wider"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Réinitialiser cet onglet
              </button>
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
                850, 
                (val) => adjustCalibration('stats-move-x', val - (calibration.statsPanelX ?? 16)),
                1,
                '',
                false,
                10
              )}
              {/* Slider Position Y Stats */}
              {renderProjectorSliderWithButtons(
                'Position Y Stats', 
                calibration.statsPanelY ?? 0, 
                -500, 
                500, 
                (val) => adjustCalibration('stats-move-y', val - (calibration.statsPanelY ?? 0)),
                1,
                '',
                false,
                10
              )}
              {/* Slider Largeur Stats */}
              {renderProjectorSliderWithButtons(
                'Largeur', 
                calibration.statsPanelWidth ?? 320, 
                50, 
                1000, 
                (val) => {
                  const newCal = { ...calibration };
                  newCal.statsPanelWidth = val;
                  saveCalibration(newCal);
                },
                10,
                '',
                false,
                50
              )}
              {/* Slider Hauteur Stats */}
              {renderProjectorSliderWithButtons(
                'Hauteur', 
                calibration.statsPanelHeight ?? 280, 
                50, 
                1000, 
                (val) => {
                  const newCal = { ...calibration };
                  newCal.statsPanelHeight = val;
                  newCal.commentsFontSize = Math.round(Math.max(10, Math.min(40, val * 0.065)));
                  newCal.statsFontSize = Math.round(Math.max(10, Math.min(40, val * 0.057)));
                  saveCalibration(newCal);
                },
                10,
                '',
                false,
                50
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
              <button
                onClick={() => resetTabParameters(9)}
                className="w-full mt-2 py-2 border border-red-900/50 bg-red-950/20 text-red-500 hover:bg-red-950/50 hover:text-red-400 rounded-xl flex items-center justify-center gap-2 font-bold transition-all cursor-pointer active:scale-95 text-[10px] uppercase tracking-wider"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Réinitialiser cet onglet
              </button>
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
                localStorage.setItem('minou_dart_is_calibrating', 'false');
                setLastCalibrationHit(null);
                if (firestoreTimeoutRef.current) {
                  clearTimeout(firestoreTimeoutRef.current);
                }
                if (roomId && roomId !== 'LOCAL') {
                  roomService.updateRoom(roomId, { calibration, isCalibrating: false }).catch(err =>
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

  const renderCalibratedDartboard = (isCalibrationMode: boolean, extraSvgOverlays?: React.ReactNode) => {
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
    const isClock = room?.gameType === 'clock';
    
    let x01CheckoutDarts: string[] = [];
    if (isX01 && room) {
      const activePlayer = room.players[room.activePlayerIndex];
      const minFinish = room.doubleOut ? 2 : 1;
      if (activePlayer && activePlayer.score <= 180 && activePlayer.score >= minFinish) {
        x01CheckoutDarts = getCheckoutSuggestion(activePlayer.score, !!room.doubleOut, activePlayer.dartsLeft) || [];
      }
    }

    // Détection précise du segment visé au Tour de l'Horloge selon le mode (standard / double / triple)
    const isClockSegmentTargeted = (
      type: 'single-inner' | 'single-outer' | 'triple' | 'double' | 'bull-inner' | 'bull-outer',
      score: number
    ): boolean => {
      if (!isClock || !room) return false;
      const activePlayer = room.players[room.activePlayerIndex];
      const currentTarget = activePlayer?.clockState?.currentTarget ?? 1;
      const clockMode = room.clockConfig?.mode || 'standard';
      const effectiveScore = score === 50 ? 25 : score;

      if (currentTarget === 25) {
        if (clockMode === 'double') return type === 'bull-inner';
        return type === 'bull-inner' || type === 'bull-outer';
      }
      if (effectiveScore !== currentTarget) return false;
      if (clockMode === 'double') return type === 'double';
      if (clockMode === 'triple') return type === 'triple';
      return true;
    };

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

      if (isClock && room) {
        return isClockSegmentTargeted(type, score) ? '#ffff00' : '#ffffff';
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
        const isLaser = calibrationSubMode === 'laser';
        let strokeColor = isLaser ? 'rgba(255, 255, 255, 0.45)' : '#000000';
        let strokeW = 1.5;
        let segFill = fill;

        if (isLaser) {
          if (type === 'double') {
            strokeColor = calibrationStep === 2 ? '#00f0ff' : 'rgba(0, 240, 255, 0.85)';
            strokeW = calibrationStep === 2 ? 4.5 : 2;
            if (calibrationStep === 2) segFill = 'rgba(0, 240, 255, 0.2)';
          } else if (type === 'triple') {
            strokeColor = 'rgba(234, 179, 8, 0.85)';
            strokeW = 2;
          } else if (type === 'bull-outer') {
            strokeColor = '#22c55e';
            strokeW = 2.5;
            segFill = 'rgba(34, 197, 94, 0.2)';
          } else if (type === 'bull-inner') {
            strokeColor = '#ff0055';
            strokeW = 3;
            segFill = 'rgba(255, 0, 85, 0.5)';
          }
        } else {
          strokeW = calibrationStep === 1 
            ? 1.5 
            : (type === 'double' && (calibrationStep === 2 || calibrationStep === 3)) ||
              (type === 'triple' && (calibrationStep === 4 || calibrationStep === 5)) ||
              (type === 'bull-outer' && calibrationStep === 6) ||
              (type === 'bull-inner' && calibrationStep === 7)
              ? 4 
              : 1.5;
        }

        if (highlightedSegment === segmentId) {
          segFill = '#00ffff';
          strokeColor = '#ffffff';
          strokeW = 4.5;
        }

        return {
          fill: segFill,
          stroke: strokeColor,
          strokeWidth: strokeW,
          className: 'cursor-pointer',
        };
      }

      // Mode Réalité Augmentée — Guidage bicolore des suggestions de Checkout X01
      let isPrimarySuggested = false;
      let isSecondarySuggested = false;
      if (isX01 && x01CheckoutDarts.length > 0) {
        const checkMatch = (dart: string) => {
          if ((dart === 'BULL' || dart === 'D25' || dart === '50') && type === 'bull-inner') return true;
          if ((dart === '25' || dart === 'S25') && type === 'bull-outer') return true;
          if (dart === `T${score}` && type === 'triple') return true;
          if (dart === `D${score}` && type === 'double') return true;
          if (dart === `S${score}` && (type === 'single-inner' || type === 'single-outer')) return true;
          return false;
        };
        isPrimarySuggested = checkMatch(x01CheckoutDarts[0]);
        if (!isPrimarySuggested && x01CheckoutDarts.length > 1) {
          isSecondarySuggested = x01CheckoutDarts.slice(1).some(checkMatch);
        }
      }

      const isClockTargetToHit = !isCalibrationMode && isClockSegmentTargeted(type, score);

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

      if (isPrimarySuggested) {
        return {
          fill: '#fef08a',
          stroke: '#ffea00',
          strokeWidth: 7,
          className: 'cursor-pointer suggested-finish-segment',
        };
      }

      if (isSecondarySuggested) {
        return {
          fill: '#cffafe',
          stroke: '#06b6d4',
          strokeWidth: 4.5,
          className: 'cursor-pointer suggested-secondary-segment',
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

    const rot = calibration.rotationAngle ?? 0;

    if (clickToCenterState === 'none') {
      // 1. Dessiner les tranches
      SECTORS.forEach((score, index) => {
        const startAngle = index * segmentAngle - 9;
        const endAngle = startAngle + segmentAngle;

        const idInnerSingle = `single-inner-${score}`;
        segments.push(
          <path
            key={idInnerSingle}
            d={describeArc(centerX, centerY, rBullOuter, rTripleInner, startAngle, endAngle, rot)}
            {...getSegmentProps('single-inner', score, idInnerSingle)}
            onClick={() => handleSegmentClick(`Simple ${score} (Int)`, score, idInnerSingle)}
          />
        );

        const idTriple = `triple-${score}`;
        segments.push(
          <path
            key={idTriple}
            d={describeArc(centerX, centerY, rTripleInner, rTripleOuter, startAngle, endAngle, rot)}
            {...getSegmentProps('triple', score, idTriple)}
            onClick={() => handleSegmentClick(`Triple ${score}`, score * 3, idTriple)}
          />
        );

        const idOuterSingle = `single-outer-${score}`;
        segments.push(
          <path
            key={idOuterSingle}
            d={describeArc(centerX, centerY, rTripleOuter, rDoubleInner, startAngle, endAngle, rot)}
            {...getSegmentProps('single-outer', score, idOuterSingle)}
            onClick={() => handleSegmentClick(`Simple ${score} (Ext)`, score, idOuterSingle)}
          />
        );

        const idDouble = `double-${score}`;
        segments.push(
          <path
            key={idDouble}
            d={describeArc(centerX, centerY, rDoubleInner, rDoubleOuter, startAngle, endAngle, rot)}
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

    // 3. Dessiner les numéros 1 à 20 projetés selon le réglage (intérieur / extérieur / masqués)
    const boardNumbers: React.ReactNode[] = [];
    const cricketCoches: React.ReactNode[] = [];
    const numbersPosition = calibration.arNumbersPosition ?? 'inside';
    const isLaserCal = isCalibrationMode && calibrationSubMode === 'laser';
    if (!isCalibrationMode || calibrationStep === 3 || isLaserCal) {
      SECTORS.forEach((score, index) => {
        const angleInDegrees = index * segmentAngle;
        let textRotation = angleInDegrees + rot;
        if (textRotation > 90 && textRotation < 270) {
          textRotation += 180;
        }

        if (numbersPosition !== 'hidden') {
          const isOutside = numbersPosition === 'outside';
          const meanRadius = isOutside ? rDoubleOuter * 1.11 : (rTripleOuter + rDoubleInner) / 2;
          const textPos = polarToCartesian(centerX, centerY, meanRadius, angleInDegrees, rot);

          boardNumbers.push(
            <text
              key={`num-${score}`}
              x={textPos.x}
              y={textPos.y + 6}
              textAnchor="middle"
              fill={isLaserCal ? '#00f0ff' : '#000000'}
              stroke={!isLaserCal && isOutside ? '#ffffff' : undefined}
              strokeWidth={!isLaserCal && isOutside ? 6 : undefined}
              strokeLinejoin={!isLaserCal && isOutside ? 'round' : undefined}
              fontSize="24"
              fontWeight="900"
              fontFamily="sans-serif"
              transform={`rotate(${textRotation}, ${textPos.x}, ${textPos.y})`}
              className="select-none pointer-events-none"
              style={
                isLaserCal
                  ? { filter: 'drop-shadow(0 0 3px rgba(0,240,255,0.7))' }
                  : isOutside
                    ? { paintOrder: 'stroke' }
                    : undefined
              }
            >
              {score}
            </text>
          );
        }

        // Dessiner les coches de Cricket dans le Single Inner
        if (isCricket && room) {
          const targets = room.cricketTargets || [20, 19, 18, 17, 16, 15, 25];
          if (targets.includes(score)) {
            const activePlayer = room.players[room.activePlayerIndex];
            const activeMarks = activePlayer?.cricketMarks?.[String(score)] || 0;
            if (activeMarks > 0) {
              const meanRadiusInner = (rBullOuter + rTripleInner) / 2;
              const symbolPos = polarToCartesian(centerX, centerY, meanRadiusInner, angleInDegrees, rot);
              
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
          @keyframes pulse-secondary-cyan {
            0% { stroke-width: 3.5px; stroke: #06b6d4; filter: drop-shadow(0 0 2px rgba(6,182,212,0.45)); }
            50% { stroke-width: 6.5px; stroke: #22d3ee; filter: drop-shadow(0 0 8px rgba(34,211,238,0.85)); }
            100% { stroke-width: 3.5px; stroke: #06b6d4; filter: drop-shadow(0 0 2px rgba(6,182,212,0.45)); }
          }
          .suggested-secondary-segment {
            animation: pulse-secondary-cyan 1.6s infinite ease-in-out;
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
        style={{ 
          backgroundColor: (isCalibrationMode && calibrationSubMode === 'white' && calibrationStep !== 8) ? '#ffffff' : 'transparent', 
          overflow: 'visible',
          cursor: clickToCenterState !== 'none' ? 'none' : 'default'
        }}
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

        {calibration.arShowExtraOverlays !== false && segments}

        {/* Cercles de référence lumineux en mode calibration Laser */}
        {isCalibrationMode && calibrationSubMode === 'laser' && (
          <>
            <circle cx={centerX} cy={centerY} r={rDoubleInner} fill="none" stroke="rgba(0, 240, 255, 0.6)" strokeWidth="2" />
            <circle cx={centerX} cy={centerY} r={rTripleOuter} fill="none" stroke="rgba(234, 179, 8, 0.75)" strokeWidth="2.5" />
            <circle cx={centerX} cy={centerY} r={rTripleInner} fill="none" stroke="rgba(234, 179, 8, 0.5)" strokeWidth="1.5" />
            <circle cx={centerX} cy={centerY} r={rBullOuter} fill="none" stroke="#22c55e" strokeWidth="2.5" />
            <circle cx={centerX} cy={centerY} r={rBullInner} fill="none" stroke="#ff0055" strokeWidth="3" />
          </>
        )}

        <circle
          cx={centerX}
          cy={centerY}
          r={rDoubleOuter}
          fill="none"
          stroke={isCalibrationMode ? (calibrationSubMode === 'laser' ? (calibrationStep === 2 ? '#00f0ff' : 'rgba(0, 240, 255, 0.85)') : '#000000') : '#ffffff'}
          strokeWidth={isCalibrationMode ? (calibrationStep === 2 ? 6 : 2.5) : 2}
        />

        {calibration.arShowExtraOverlays !== false && boardNumbers}

        {calibration.arShowExtraOverlays !== false && cricketCoches}

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

        {/* Repères spécifiques selon l'étape de calibration */}
        {isCalibrationMode && clickToCenterState === 'none' && (
          <>
            {/* Étape 1 : Réticule Laser de centrage du Bullseye */}
            {calibrationStep === 1 && (
              <g className="pointer-events-none animate-pulse">
                <line x1="0" y1={centerY} x2="1000" y2={centerY} stroke="#ff0055" strokeWidth="2.5" strokeDasharray="12, 6" opacity="0.85" />
                <line x1={centerX} y1="0" x2={centerX} y2="1000" stroke="#ff0055" strokeWidth="2.5" strokeDasharray="12, 6" opacity="0.85" />
                <line x1={centerX - 50} y1={centerY} x2={centerX + 50} y2={centerY} stroke="#00ffff" strokeWidth="4" />
                <line x1={centerX} y1={centerY - 50} x2={centerX} y2={centerY + 50} stroke="#00ffff" strokeWidth="4" />
                <circle cx={centerX} cy={centerY} r={rBullInner * 2.5} fill="none" stroke="#00ffff" strokeWidth="2.5" strokeDasharray="6, 4" />
                <circle cx={centerX} cy={centerY} r={rBullInner} fill="#ff0055" stroke="#ffffff" strokeWidth="2.5" />
                <circle cx={centerX} cy={centerY} r="3" fill="#ffffff" />
                <text x={centerX} y={centerY - rBullOuter * 2.2} textAnchor="middle" fill="#00ffff" fontSize="18" fontWeight="900" style={{ filter: 'drop-shadow(0 0 4px #00ffff)' }}>
                  ALIGNER SUR LA BULLE ROUGE
                </text>
              </g>
            )}

            {/* Étape 2 : Anneau renforcé des Doubles */}
            {calibrationStep === 2 && (
              <g className="pointer-events-none">
                <circle cx={centerX} cy={centerY} r={rDoubleOuter} fill="none" stroke="#00f0ff" strokeWidth="6" strokeDasharray="12, 6" />
                <circle cx={centerX} cy={centerY} r={rDoubleInner} fill="none" stroke="#22c55e" strokeWidth="3" />
                <circle cx={centerX} cy={centerY - rDoubleOuter} r="8" fill="#00f0ff" stroke="#ffffff" strokeWidth="2" />
                <circle cx={centerX} cy={centerY + rDoubleOuter} r="8" fill="#00f0ff" stroke="#ffffff" strokeWidth="2" />
                <circle cx={centerX - rDoubleOuter} cy={centerY} r="8" fill="#00f0ff" stroke="#ffffff" strokeWidth="2" />
                <circle cx={centerX + rDoubleOuter} cy={centerY} r="8" fill="#00f0ff" stroke="#ffffff" strokeWidth="2" />
                <text x={centerX} y={centerY - rDoubleOuter - 18} textAnchor="middle" fill="#00f0ff" fontSize="18" fontWeight="900" style={{ filter: 'drop-shadow(0 0 4px #00f0ff)' }}>
                  AJUSTER LE RAYON AUX DOUBLES
                </text>
              </g>
            )}

            {/* Étape 3 : Axe d'alignement du 20 */}
            {calibrationStep === 3 && (
              <g className="pointer-events-none">
                {(() => {
                  const rot = calibration.rotationAngle ?? 0;
                  const topPos = polarToCartesian(centerX, centerY, rDoubleOuter * 1.15, 0, rot);
                  return (
                    <g>
                      <line x1={centerX} y1={centerY} x2={topPos.x} y2={topPos.y} stroke="#eab308" strokeWidth="3.5" strokeDasharray="6, 4" />
                      <circle cx={topPos.x} cy={topPos.y} r="12" fill="#eab308" stroke="#000000" strokeWidth="2" />
                      <text x={topPos.x} y={topPos.y - 18} textAnchor="middle" fill="#eab308" fontSize="16" fontWeight="900" style={{ filter: 'drop-shadow(0 0 4px #eab308)' }}>
                        AXE DU 20 : {(rot >= 0 ? '+' : '') + rot.toFixed(1)}°
                      </text>
                    </g>
                  );
                })()}
              </g>
            )}
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

        {/* Curseur personnalisé pour la calibration du centre */}
        {clickToCenterState === 'center' && pointerPos && (
          <g style={{ pointerEvents: 'none' }}>
            <line x1={0} y1={pointerPos.y} x2={1000} y2={pointerPos.y} stroke="black" strokeWidth="1" opacity={0.3} />
            <line x1={pointerPos.x} y1={0} x2={pointerPos.x} y2={1000} stroke="black" strokeWidth="1" opacity={0.3} />
            <path d={`M ${pointerPos.x - 40} ${pointerPos.y} L ${pointerPos.x + 40} ${pointerPos.y} M ${pointerPos.x} ${pointerPos.y - 40} L ${pointerPos.x} ${pointerPos.y + 40}`} stroke="black" strokeWidth="1.5" />
          </g>
        )}

        {/* Overlays personnalisés (par ex: texte centré pour le jeu Bart) */}
        {extraSvgOverlays}
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

    return polarToCartesian(centerX, centerY, meanRadius, angle, calibration.rotationAngle ?? 0);
  };

  // --- Effet 1 : Flash d'impact en cours de tour (1ère et 2ème fléchettes) ---
  useEffect(() => {
    if (!room || projectorMode !== 'ar') return;
    const activePlayer = room.players[room.activePlayerIndex];
    if (!activePlayer) return;

    const currentThrows = activePlayer.currentRoundThrows || [];
    const throwsCount = activePlayer.throwsCount || 0;

    // Si le joueur actif change, synchroniser le compteur sans couper l'animation de fin de tour du joueur précédent
    if (activePlayerNameRef.current !== activePlayer.name) {
      activePlayerNameRef.current = activePlayer.name;
      lastThrowsCountRef.current = throwsCount;
      return;
    }

    // Détection d'une annulation (Undo) sur le joueur courant
    if (throwsCount < lastThrowsCountRef.current) {
      lastThrowsCountRef.current = throwsCount;
      return;
    }

    // Détection d'un nouveau lancer en cours de tour (flash d'impact cyan)
    if (throwsCount > lastThrowsCountRef.current) {
      // Dès qu'une nouvelle fléchette d'un nouveau tour est lancée, effacer le fil d'Ariane du tour précédent
      stopRoundAnimations();

      const latestThrow = currentThrows[currentThrows.length - 1];
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
  }, [room?.activePlayerIndex, room?.players?.[room?.activePlayerIndex ?? 0]?.throwsCount, projectorMode]);

  // --- Effet 2 : Animations AR de fin de tour X01 (180, Highscore 100+, Bust & Fil d'Ariane) ---
  useEffect(() => {
    if (!room) return;

    const totalMatchThrows = (room.players || []).reduce((acc, p) => acc + (p.throwsCount || 0), 0);
    const completed = room.lastCompletedRound ?? null;
    const currentRoundId = completed?.roundId ?? null;

    // Si on n'est pas en X01 en cours de jeu, réinitialiser proprement
    if (room.gameType !== 'x01' || (room.status !== 'playing' && room.status !== 'finished')) {
      lastAnimatedRoundIdRef.current = currentRoundId;
      totalMatchThrowsRef.current = totalMatchThrows;
      stopRoundAnimations();
      return;
    }

    // Initialisation au premier chargement du salon : ne pas rejouer un ancien tour déjà terminé
    if (lastAnimatedRoundIdRef.current === undefined) {
      lastAnimatedRoundIdRef.current = currentRoundId;
      totalMatchThrowsRef.current = totalMatchThrows;
      return;
    }

    // Si le nombre total de lancers a diminué (Undo), stopper toute animation sans rejouer le tour précédent
    if (totalMatchThrows < totalMatchThrowsRef.current) {
      totalMatchThrowsRef.current = totalMatchThrows;
      lastAnimatedRoundIdRef.current = currentRoundId;
      stopRoundAnimations();
      return;
    }

    totalMatchThrowsRef.current = totalMatchThrows;

    if (currentRoundId === lastAnimatedRoundIdRef.current) return;
    lastAnimatedRoundIdRef.current = currentRoundId;

    if (!completed || !currentRoundId || projectorMode !== 'ar' || completed.throws.length === 0) {
      stopRoundAnimations();
      return;
    }

    // Lancement de la séquence de révélation fléchette par fléchette du tour terminé
    stopRoundAnimations();
    const roundThrows = [...completed.throws];
    setAnimatingDarts(roundThrows);
    setActiveAnimationIndex(0);

    const finishRevelation = () => {
      if (roundAnimIntervalRef.current) {
        clearInterval(roundAnimIntervalRef.current);
        roundAnimIntervalRef.current = null;
      }
      setActiveAnimationIndex(-1);
      setShowRoundPath(true);

      // Extinction automatique du fil d'Ariane après 4,5 s si le joueur suivant n'a pas encore lancé
      const pathTimer = setTimeout(() => {
        setShowRoundPath(false);
        setAnimatingDarts([]);
      }, 4500);
      roundAnimTimersRef.current.push(pathTimer);

      if (completed.isBust) {
        setGlobalRoundAnimation({ type: 'bust', active: true });
        const t = setTimeout(() => {
          setGlobalRoundAnimation({ type: null, active: false });
        }, 3000);
        roundAnimTimersRef.current.push(t);
      } else if (completed.score === 180) {
        setGlobalRoundAnimation({ type: '180', active: true });

        // Générer 70 particules d'explosion jaillissant du centre calibré
        const tempParticles: ARParticle[] = [];
        for (let i = 0; i < 70; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 150 + Math.random() * 300;
          tempParticles.push({
            id: i,
            x: calibration.centerX,
            y: calibration.centerY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color: i % 3 === 0 ? '#ff007f' : (i % 3 === 1 ? '#eab308' : '#ffffff'),
            radius: 3 + Math.random() * 5,
            opacity: 0.95,
          });
        }
        setParticles(tempParticles);

        const t = setTimeout(() => {
          setGlobalRoundAnimation({ type: null, active: false });
          setParticles([]);
        }, 4500);
        roundAnimTimersRef.current.push(t);
      } else if (completed.score >= 100) {
        setGlobalRoundAnimation({ type: 'highscore', score: completed.score, active: true });
        const t = setTimeout(() => {
          setGlobalRoundAnimation({ type: null, active: false });
        }, 3500);
        roundAnimTimersRef.current.push(t);
      }
    };

    let idx = 0;
    roundAnimIntervalRef.current = setInterval(() => {
      idx++;
      if (idx < roundThrows.length) {
        setActiveAnimationIndex(idx);
      } else {
        finishRevelation();
      }
    }, 1100);
  }, [room?.lastCompletedRound?.roundId, room?.gameType, room?.status, projectorMode, calibration.centerX, calibration.centerY]);

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

  // Synchronisation de la position de la cible (gauche/droite) depuis Firestore
  useEffect(() => {
    if (!room) return;
    const firestoreTargetPos = room.targetPosition;
    if (firestoreTargetPos && firestoreTargetPos !== targetPosition) {
      setTargetPosition(firestoreTargetPos);
      localStorage.setItem('minou_dart_target_position', firestoreTargetPos);
    }
  }, [room?.targetPosition]); // eslint-disable-line react-hooks/exhaustive-deps

  // Synchronisation de la calibration depuis Firestore (prioritaire en mode en ligne si non en train de calibrer localement)
  useEffect(() => {
    if (!room) return;
    const firestoreCal = room.calibration;
    if (firestoreCal) {
      // Comparer pour éviter des boucles d'update inutiles
      if (JSON.stringify(firestoreCal) !== JSON.stringify(calibration)) {
        setCalibration(firestoreCal);
        localStorage.setItem('minou_dart_calibration', JSON.stringify(firestoreCal));
      }
    }
  }, [room?.calibration, isCalibrating]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nettoyer les timeouts Firestore et d'animations lors du démontage du projecteur
  useEffect(() => {
    return () => {
      if (firestoreTimeoutRef.current) {
        clearTimeout(firestoreTimeoutRef.current);
      }
      if (roundAnimIntervalRef.current) {
        clearInterval(roundAnimIntervalRef.current);
      }
      roundAnimTimersRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  const renderContent = () => {
    // Rendu en cas d'erreur explicite (vérifié avant loading/!room pour ne jamais masquer une erreur)
    if (error || (!loading && !roomId)) {
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

    // Rendu en cas de chargement ou d'attente du premier snapshot du salon
    if (loading || !room) {
      return (
        <div className="w-full h-full overflow-hidden bg-black flex flex-col items-center justify-center text-white">
          <div className="w-16 h-16 border-4 border-theme-accent border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-lg font-medium tracking-wide">Initialisation de la liaison temps réel...</p>
        </div>
      );
    }

  const players = room.players ?? [];
  const status = room.status ?? 'setup';

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
      <div className={`w-full h-full flex ${targetPosition === 'right' ? 'flex-row-reverse' : 'flex-row'} m-0 p-0 overflow-hidden bg-black select-none`}>
        {/* 1. Éclairage de la cible physique ou cible de réalité augmentée */}
        <div 
          className={`w-1/2 h-full transition-all duration-500 ${
            targetPosition === 'right' ? 'shadow-[-20px_0_40px_rgba(255,255,255,0.15)]' : 'shadow-[20px_0_40px_rgba(255,255,255,0.15)]'
          } z-10 flex flex-col relative overflow-hidden ${
            projectorMode === 'ar'
              ? isCalibrating && calibrationSubMode === 'white'
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
                  className="absolute bg-zinc-300/80 border-2 border-dashed border-zinc-500 p-6 shadow-xl backdrop-blur-md z-40 transition-all duration-200"
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
                  <div 
                    className="font-black text-zinc-800 uppercase text-center w-full truncate"
                    style={{ fontSize: `${calibration.statsFontSize ?? 16}px`, marginBottom: '10px' }}
                  >
                    EXEMPLE DE TITRE
                  </div>
                  <div 
                    className="font-bold text-zinc-700 leading-snug overflow-hidden text-ellipsis"
                    style={{ fontSize: `${calibration.commentsFontSize ?? 14}px` }}
                  >
                    Ceci est une phrase de commentaire générée automatiquement. Elle s'adapte à la taille de la boîte pour que le joueur puisse la lire facilement depuis le pas de tir.
                  </div>
                  <div 
                    className="font-medium text-zinc-600 leading-snug mt-2 overflow-hidden text-ellipsis"
                    style={{ fontSize: `${calibration.commentsFontSize ?? 14}px` }}
                  >
                    Une autre information importante apparaîtra ici selon les besoins du jeu.
                  </div>
                </div>
              )}

              {/* Zone transparente de capture pour tracer le panneau de commentaires */}
              {statsCalibrationState !== 'none' && (
                <div 
                  className="absolute inset-0 z-50 cursor-none"
                  onPointerDown={handleStatsPointerDown}
                  onPointerMove={handleStatsPointerMove}
                >
                  {/* Croix de visée fine et noire */}
                  {statsPointerPos && (
                    <svg className="absolute inset-0 pointer-events-none z-50" style={{ width: '100%', height: '100%' }}>
                      <line x1={0} y1={statsPointerPos.y} x2="100%" y2={statsPointerPos.y} stroke="black" strokeWidth="1" />
                      <line x1={statsPointerPos.x} y1={0} x2={statsPointerPos.x} y2="100%" stroke="black" strokeWidth="1" />
                      <circle cx={statsPointerPos.x} cy={statsPointerPos.y} r="5" fill="none" stroke="black" strokeWidth="1" />
                    </svg>
                  )}
                  {/* Guide de tracé rouge en direct si on est en train de tracer le second point */}
                  {statsCalibrationState === 'bottom-right' && statsStartPointRef.current && (
                    <div 
                      className="absolute border-2 border-dashed border-red-550 bg-red-500/10 pointer-events-none"
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
                  onClick={() => handleSetIsCalibrating(true)}
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

        {/* Interface d'attente (Scores & configuration) */}
        <div className={`w-1/2 h-full bg-theme-bg text-theme-text-primary p-5 flex flex-col justify-between relative ${targetPosition === 'right' ? 'border-r' : 'border-l'} border-theme-border/30`}>
          {isCalibrating ? (
            renderProjectorCalibrationInterface()
          ) : (
            <>
              <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
                <button
                  onClick={() => handleToggleTargetPosition()}
                  className="flex items-center gap-1.5 p-2 px-3 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 font-bold text-xs transition-all cursor-pointer shadow-md"
                  title={targetPosition === 'left' ? "Passer la cible à droite" : "Passer la cible à gauche"}
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-theme-accent" />
                  <span className="hidden sm:inline">{targetPosition === 'left' ? 'Cible à droite' : 'Cible à gauche'}</span>
                </button>
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
                      return (
                        <div className="p-2.5 bg-black/40 border border-theme-border/50 rounded-xl relative group flex flex-col items-center">
                          <div
                            className="p-1.5 rounded-lg transition-transform duration-300 group-hover:scale-105"
                            style={{ backgroundColor: `#${qrColors.bgcolor}` }}
                          >
                            <QRCodeSVG
                              value={remoteUrl}
                              size={104}
                              fgColor={`#${qrColors.color}`}
                              bgColor={`#${qrColors.bgcolor}`}
                              level="M"
                            />
                          </div>
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
      <div className={`w-full h-full flex ${targetPosition === 'right' ? 'flex-row-reverse' : 'flex-row'} m-0 p-0 overflow-hidden bg-black select-none`}>
        {/* Cible éclairée à 50% */}
        <div className={`w-1/2 h-full bg-white ${
          targetPosition === 'right' ? 'shadow-[-20px_0_40px_rgba(255,255,255,0.15)]' : 'shadow-[20px_0_40px_rgba(255,255,255,0.15)]'
        } z-10 flex flex-col justify-end items-center pb-6`}>
          {/* Logo bas - zone blanche */}
          <span
            className="italic text-xl text-zinc-950 font-serif tracking-widest opacity-50 select-none"
            style={{ fontFamily: "'Playfair Display', 'Didot', 'Georgia', serif" }}
          >
            Minou Dart Game
          </span>
        </div>

        {/* Interface vainqueur */}
        <div className={`w-1/2 h-full bg-theme-bg text-theme-text-primary p-5 flex flex-col justify-between relative ${targetPosition === 'right' ? 'border-r' : 'border-l'} border-theme-border/30`}>
          <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
            <button
              onClick={() => handleToggleTargetPosition()}
              className="flex items-center gap-1.5 p-2 px-3 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 font-bold text-xs transition-all cursor-pointer shadow-md"
              title={targetPosition === 'left' ? "Passer la cible à droite" : "Passer la cible à gauche"}
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-theme-accent" />
              <span className="hidden sm:inline">{targetPosition === 'left' ? 'Cible à droite' : 'Cible à gauche'}</span>
            </button>
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
                : room.gameType === 'clock'
                  ? "Félicitations ! Le tour complet de l'horloge a été validé."
                  : room.gameType === 'bart'
                    ? "Félicitations ! Le match de Bart a été remporté."
                    : `Félicitations ! Le score cible de ${room.targetScore} points a été atteint.`
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
                      ) : room.gameType === 'clock' ? (
                        <tr className="border-b border-theme-border/20 text-zinc-500 font-bold uppercase tracking-wider text-[9px] md:text-[10px]">
                          <th className="pb-2">Joueur</th>
                          <th className="pb-2 text-center">Progression</th>
                          <th className="pb-2 text-center">Précision</th>
                          <th className="pb-2 text-center">Fléchettes</th>
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
                                {p.accuracy !== undefined ? `${p.accuracy.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} %` : '-'}
                              </td>
                              <td className="py-2.5 text-center text-red-400">{p.missedDarts || 0}</td>
                              <td className="py-2.5 text-center text-zinc-500">{p.whiteRounds || 0}</td>
                              <td className="py-2.5 text-center text-yellow-500">{p.bestCricketRound || 0}</td>
                            </>
                          ) : room.gameType === 'clock' ? (
                            <>
                              <td className="py-2.5 text-center font-bold text-white">
                                {p.name === room.winnerName
                                  ? 'Fini 🏆'
                                  : `Cible ${p.clockState?.currentTarget === 25 ? 'Bulle' : (p.clockState?.currentTarget ?? 1)}`}
                              </td>
                              <td className="py-2.5 text-center font-bold text-theme-accent">
                                {(p.clockState?.accuracy ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %
                              </td>
                              <td className="py-2.5 text-center text-zinc-400">
                                {p.clockState?.throwsCount ?? p.throwsCount}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="py-2.5 text-center font-bold text-theme-accent">
                                {room.gameType === 'bart' 
                                  ? (p.bartState && p.bartState.servesPlayed > 0
                                      ? `${((p.bartState.servesWon / p.bartState.servesPlayed) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} %`
                                      : '-') 
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

  const renderStatsCalibrationOverlay = () => {
    if (statsCalibrationState === 'none') return null;
    return (
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
              left: `${liveStatsRect ? liveStatsRect.x : (calibration?.statsPanelX ?? 0)}px`,
              top: `${liveStatsRect ? liveStatsRect.y : (calibration?.statsPanelY ?? 0)}px`,
              width: `${liveStatsRect ? liveStatsRect.width : (calibration?.statsPanelWidth ?? 0)}px`,
              height: `${liveStatsRect ? liveStatsRect.height : (calibration?.statsPanelHeight ?? 0)}px`
            }}
          />
        )}
        <div className="absolute top-4 left-4 bg-black/85 text-white border border-red-500/40 px-3.5 py-1.5 rounded-full text-xs font-black shadow-lg animate-pulse pointer-events-none">
          🎯 {statsCalibrationState === 'top-left' ? 'Cliquez pour le coin HAUT-GAUCHE' : 'Glissez/cliquez pour le coin BAS-DROITE'}
        </div>
      </div>
    );
  };

  // --- RENDU 3 : EN COURS DE JEU (PLAYING) ---
  if (room.gameType === 'bart') {
    return (
      <BartProjectorGame 
        room={room} 
        projectorMode={projectorMode} 
        setProjectorMode={setProjectorMode} 
        targetPosition={targetPosition}
        setTargetPosition={handleToggleTargetPosition}
        showModeSelector={showModeSelector} 
        setShowModeSelector={setShowModeSelector} 
        renderCalibratedDartboard={renderCalibratedDartboard}
        calibration={calibration}
        isCalibrating={isCalibrating}
        setIsCalibrating={handleSetIsCalibrating}
        calibrationStep={calibrationStep}
        renderProjectorCalibrationInterface={renderProjectorCalibrationInterface}
        lastCalibrationHit={lastCalibrationHit}
        renderStatsCalibrationOverlay={renderStatsCalibrationOverlay}
      />
    );
  }

  if (room.gameType === 'clock') {
    return (
      <ClockProjectorGame
        room={room}
        projectorMode={projectorMode}
        setProjectorMode={setProjectorMode}
        targetPosition={targetPosition}
        setTargetPosition={handleToggleTargetPosition}
        showModeSelector={showModeSelector}
        setShowModeSelector={setShowModeSelector}
        renderCalibratedDartboard={renderCalibratedDartboard}
        calibration={calibration}
        isCalibrating={isCalibrating}
        setIsCalibrating={handleSetIsCalibrating}
        calibrationStep={calibrationStep}
        renderProjectorCalibrationInterface={renderProjectorCalibrationInterface}
        lastCalibrationHit={lastCalibrationHit}
        renderStatsCalibrationOverlay={renderStatsCalibrationOverlay}
      />
    );
  }

  if (room.gameType === 'cricket') {
    return (
      <CricketProjectorGame
        room={room}
        projectorMode={projectorMode}
        setProjectorMode={setProjectorMode}
        targetPosition={targetPosition}
        setTargetPosition={handleToggleTargetPosition}
        showModeSelector={showModeSelector}
        setShowModeSelector={setShowModeSelector}
        renderCalibratedDartboard={renderCalibratedDartboard}
        calibration={calibration}
        isCalibrating={isCalibrating}
        setIsCalibrating={handleSetIsCalibrating}
        calibrationStep={calibrationStep}
        renderProjectorCalibrationInterface={renderProjectorCalibrationInterface}
        lastCalibrationHit={lastCalibrationHit}
        renderStatsCalibrationOverlay={renderStatsCalibrationOverlay}
        renderProjectorCricketMarkSymbol={renderProjectorCricketMarkSymbol}
      />
    );
  }

  return (
    <X01ProjectorGame
      room={room}
      projectorMode={projectorMode}
      setProjectorMode={setProjectorMode}
      targetPosition={targetPosition}
      setTargetPosition={handleToggleTargetPosition}
      showModeSelector={showModeSelector}
      setShowModeSelector={setShowModeSelector}
      renderCalibratedDartboard={renderCalibratedDartboard}
      calibration={calibration}
      isCalibrating={isCalibrating}
      setIsCalibrating={handleSetIsCalibrating}
      calibrationStep={calibrationStep}
      renderProjectorCalibrationInterface={renderProjectorCalibrationInterface}
      lastCalibrationHit={lastCalibrationHit}
      renderStatsCalibrationOverlay={renderStatsCalibrationOverlay}
    />
  );
};

  return (
    <ProjectorScaleWrapper>
      {renderContent()}
    </ProjectorScaleWrapper>
  );
};
