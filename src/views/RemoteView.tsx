import React, { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { X, ArrowLeft, Play, RotateCcw, Check, Plus, Trash2, Smartphone, Users, Target, Crosshair, Tv, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { roomService, getGameHighlights } from '../services/roomService';
import { useAuth } from '../context/AuthContext';
import type { RoomData, GameType, CricketVariant } from '../services/roomService';
import { generateCricketTargets, createEmptyMarks, processCricketThrow } from '../services/cricketEngine';
import { createEmptyBartState } from '../services/bartEngine';
import { BartRemoteGame } from './BartRemoteGame';
import { getCheckoutSuggestion } from '../services/checkoutSuggestions';

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

  // États pour l'édition de la partie dans la phase Setup
  const [setupStep, setSetupStep] = useState<'players' | 'game'>('players');
  const [newPlayerName, setNewPlayerName] = useState<string>('');
  
  // Liste globale de smileys disponibles
  const AVAILABLE_EMOJIS = ['🎯', '😎', '🚀', '👾', '👑', '🔥', '🦁', '🦉', '👻', '😜', '🍀', '⭐'];
  const [selectedEmoji, setSelectedEmoji] = useState<string>('🎯');
  
  interface SavedPlayer {
    name: string;
    emoji: string;
  }
  
  // Liste globale de joueurs sauvegardée dans le localStorage
  const [savedPlayers, setSavedPlayers] = useState<SavedPlayer[]>(() => {
    const saved = localStorage.getItem('minou-dart-saved-players-v2');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    
    // Migration depuis l'ancien format string[] s'il existe
    const oldSaved = localStorage.getItem('minou-dart-saved-players');
    if (oldSaved) {
      try {
        const parsed = JSON.parse(oldSaved);
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
          const migrated = parsed.map((name: string) => ({ name, emoji: '🎯' }));
          localStorage.setItem('minou-dart-saved-players-v2', JSON.stringify(migrated));
          return migrated;
        }
      } catch (e) {
        console.error(e);
      }
    }
    
    return [
      { name: 'Rozan', emoji: '😎' },
      { name: 'Antoine', emoji: '🚀' },
      { name: 'Alexandre', emoji: '👾' },
      { name: 'Minou', emoji: '🎯' }
    ];
  });

  // Joueurs sélectionnés pour la partie
  const [selectedPlayerNames, setSelectedPlayerNames] = useState<string[]>([]);

  // Configuration locale du jeu
  const [selectedGameType, setSelectedGameType] = useState<GameType>('x01');
  const [selectedTargetScore, setSelectedTargetScore] = useState<number>(501);
  const [selectedDoubleOut, setSelectedDoubleOut] = useState<boolean>(false);
  const [selectedCricketScoringMode, setSelectedCricketScoringMode] = useState<'standard' | 'cutthroat'>('standard');
  const [selectedCricketVariant, setSelectedCricketVariant] = useState<CricketVariant>('classic');
  const [selectedCricketDistribution, setSelectedCricketDistribution] = useState<'random' | 'non_adjacent' | 'adjacent'>('random');
  const [selectedCricketWithBull, setSelectedCricketWithBull] = useState<boolean>(true);
  const [selectedBartSets, setSelectedBartSets] = useState<number>(1);
  
  const [multiplier, setMultiplier] = useState<'S' | 'D' | 'T'>('S'); // Simple, Double, Triple
  const [showExitModal, setShowExitModal] = useState<boolean>(false);
  const [savedGameData, setSavedGameData] = useState<RoomData | null>(null);
  const [showProjectionModal, setShowProjectionModal] = useState<boolean>(false);
  const [linkCopied, setLinkCopied] = useState<boolean>(false);

  // Utilisation temporaire pour éviter l'erreur de build TS (noUnusedLocals)
  if (false as boolean) {
    console.log(setSelectedCricketDistribution, setSelectedCricketWithBull);
  }

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
        setError("Code de salon invalide ou session expirée.");
        setRoomId(null);
        setRoom(null);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [roomId, isLocalMode]);

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
  const handleAddNewPlayer = () => {
    const name = newPlayerName.trim();
    if (!name) return;
    
    if (!savedPlayers.some(p => p.name === name)) {
      const updated = [...savedPlayers, { name, emoji: selectedEmoji }];
      setSavedPlayers(updated);
      localStorage.setItem('minou-dart-saved-players-v2', JSON.stringify(updated));
      // Sélectionner automatiquement le nouveau joueur
      setSelectedPlayerNames([...selectedPlayerNames, name]);
    }
    setNewPlayerName('');
  };

  // Supprimer définitivement un joueur de la liste globale
  const handleRemoveSavedPlayer = (name: string) => {
    const updated = savedPlayers.filter(p => p.name !== name);
    setSavedPlayers(updated);
    localStorage.setItem('minou-dart-saved-players-v2', JSON.stringify(updated));
    // Retirer de la sélection s'il y était
    setSelectedPlayerNames(selectedPlayerNames.filter(p => p !== name));
  };

  // Mettre à jour l'émoji d'un joueur existant
  const handleUpdatePlayerEmoji = (name: string, newEmoji: string) => {
    const updated = savedPlayers.map(p => p.name === name ? { ...p, emoji: newEmoji } : p);
    setSavedPlayers(updated);
    localStorage.setItem('minou-dart-saved-players-v2', JSON.stringify(updated));
  };

  // Cocher/Décocher un joueur (remonte automatiquement en haut via le tri dynamique)
  const handleToggleSelectPlayer = (name: string) => {
    if (selectedPlayerNames.includes(name)) {
      setSelectedPlayerNames(selectedPlayerNames.filter(p => p !== name));
    } else {
      setSelectedPlayerNames([...selectedPlayerNames, name]);
    }
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
      
      const initialPlayers = selectedPlayerNames.map(name => {
        const playerObj = savedPlayers.find(p => p.name === name);
        return {
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
          ...(selectedGameType === 'cricket' ? { cricketMarks: createEmptyMarks(targets) } : {}),
          ...(selectedGameType === 'bart' ? { bartState: createEmptyBartState() } : {})
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
            isTieBreak: false
          }
        } : {})
      };

      if (isLocalMode) {
        setLocalRoom(prev => ({
          ...prev!,
          ...newRoomData
        } as RoomData));
      } else {
        await roomService.updateRoom(room!.roomId, newRoomData);
      }
      
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
  const handleThrowDirect = async (basePoints: number) => {
    if (!currentRoom || isSubmitting) return;

    setIsSubmitting(true);
    let points = basePoints;
    const isDouble = multiplier === 'D';

    // Construire le libellé exact du lancer
    let label = '';
    if (basePoints === 0) {
      label = '0';
    } else if (basePoints === 25) {
      if (multiplier === 'D') {
        points = 50;
        label = 'D25';
      } else {
        label = '25';
      }
    } else {
      if (multiplier === 'D') {
        points *= 2;
        label = `D${basePoints}`;
      } else if (multiplier === 'T') {
        points *= 3;
        label = `T${basePoints}`;
      } else {
        label = `${basePoints}`;
      }
    }

    try {
      if (isLocalMode) {
        const nextState = roomService.calculateNextX01State(currentRoom, points, isDouble, label);
        setLocalRoom(nextState);
      } else {
        await roomService.recordThrow(room!.roomId, room!, points, isDouble, label);
      }
      // Rétablir le multiplicateur par défaut pour la fléchette suivante
      setMultiplier('S');
    } catch (err) {
      console.error(err);
      setError("Erreur lors de la validation du lancer.");
    } finally {
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
        setLocalRoom(prev => ({
          ...prev!,
          ...updatedRoom
        } as RoomData));
      } else {
        await roomService.recordCricketThrow(room!.roomId, room!, baseNumber, mult);
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
          setLocalRoom(prev => ({
            ...prev!,
            ...result
          } as RoomData));
        } else {
          await roomService.updateRoom(room!.roomId, result);
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
          setLocalRoom(prev => ({
            ...prev!,
            ...updateData
          } as RoomData));
        } else {
          await roomService.updateRoom(room!.roomId, updateData);
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
                  players: [
                    { 
                      name: 'Joueur 1', 
                      score: 501, 
                      scoreBeforeRound: 501, 
                      avg: 0, 
                      dartsLeft: 3, 
                      throwsCount: 0, 
                      totalPoints: 0, 
                      history: [],
                      bestRound: 0,
                      lastRoundScore: 0,
                      roundScores: []
                    }
                  ],
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

  // Joueurs et scores
  const players = currentRoom?.players || [];
  const activePlayerIndex = currentRoom?.activePlayerIndex ?? 0;

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
            <span className="text-[10px] bg-theme-accent/20 text-theme-accent font-bold px-2 py-0.5 rounded">
              En Attente
            </span>
          </div>
        </header>

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
                          bartConfig: savedGameData.bartConfig
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
                    <p>Mode : <strong className="text-white capitalize">{savedGameData.gameType === 'x01' ? `X01 (${savedGameData.targetScore})` : savedGameData.gameType}</strong></p>
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
                    {selectedPlayerNames.length !== 2 && (
                      <p className="text-[10px] text-red-400 font-semibold text-center mt-2 bg-red-500/10 rounded-lg p-2 border border-red-500/20">
                        Le mode Bart nécessite exactement 2 joueurs.
                      </p>
                    )}
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
            {/* Bouton Son masqué car non fonctionnel */}
          </div>
        </header>

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
      </div>
    );
  }

  // --- RENDU X01 (Inspiré de la capture d'écran - très similaire, premium) ---
  return (
    <div className="remote-view-container min-h-svh bg-black text-white flex flex-col justify-between relative overflow-hidden select-none font-sans">
      
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
          {/* Bouton Son masqué car non fonctionnel */}
        </div>
      </header>

      {/* Bandeau de description du mode de jeu (ex: 301, Double Out...) */}
      <div className="bg-[#121212] py-2 px-4 border-b border-zinc-900 text-xs text-zinc-400 font-medium tracking-wide">
        {currentRoom?.targetScore}, {currentRoom?.doubleOut ? 'Double Out' : 'Normal'}, First to 1 Set 1 Leg
      </div>

      {/* Liste des joueurs adaptative (grille ou flex) */}
      <div className={`flex-grow overflow-y-auto p-3 bg-black ${
        players.length >= 3
          ? 'grid grid-cols-2 gap-2 content-start'
          : 'flex flex-col space-y-3'
      }`}>
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

          const isGrid = numPlayers >= 3;
          const scoreSizeClass = isGrid 
            ? 'text-2xl sm:text-3xl font-black' 
            : 'text-6xl sm:text-7xl font-black';
          const nameSizeClass = isGrid
            ? 'text-xs font-extrabold'
            : 'text-sm sm:text-base font-extrabold';
          const cardPaddingClass = isGrid
            ? 'p-2 rounded-xl'
            : 'p-3 rounded-2xl';

          // --- RENDU PLEINE LARGEUR (1 À 2 JOUEURS) ---
          if (!isGrid) {
            return (
              <div 
                key={player.name} 
                className={`relative flex flex-col transition-all border ${cardPaddingClass} ${
                  isActive 
                    ? 'bg-zinc-900/95 border-[#22c55e] shadow-[0_0_15px_rgba(34,197,94,0.15)] ring-1 ring-[#22c55e]/25' 
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

                {/* Ligne 2 : Statistiques en 1 ligne horizontale de 4 colonnes */}
                <div className="grid grid-cols-4 gap-2 mt-2 pt-2.5 border-t border-zinc-900/40 text-center">
                  <div className="flex flex-col items-center justify-center py-1 bg-black/25 rounded-lg border border-zinc-900/35">
                    <span className="text-[7px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Moyenne</span>
                    <span className="text-[10px] font-extrabold text-white">{formattedAvg}</span>
                  </div>

                  <div className="flex flex-col items-center justify-center py-1 bg-black/25 rounded-lg border border-zinc-900/35">
                    <span className="text-[7px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Dernier</span>
                    <span className="text-[10px] font-extrabold text-[#22c55e]">
                      {player.lastRoundScore !== undefined && player.lastRoundScore > 0 ? player.lastRoundScore : '-'}
                    </span>
                  </div>

                  <div className="flex flex-col items-center justify-center py-1 bg-black/25 rounded-lg border border-zinc-900/35">
                    <span className="text-[7px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Meilleur</span>
                    <span className="text-[10px] font-extrabold text-yellow-500">
                      {player.bestRound !== undefined && player.bestRound > 0 ? player.bestRound : '-'}
                    </span>
                  </div>

                  <div className="flex flex-col items-center justify-center py-1 bg-black/25 rounded-lg border border-zinc-900/35">
                    <span className="text-[7px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Lancers</span>
                    <span className="text-[10px] font-extrabold text-zinc-300">{player.throwsCount}</span>
                  </div>
                </div>
              </div>
            );
          }

          // --- RENDU EN GRILLE (3 JOUEURS ET PLUS) ---
          return (
            <div 
              key={player.name} 
              className={`relative flex flex-col transition-all border ${cardPaddingClass} ${
                isActive 
                  ? 'bg-zinc-900/95 border-[#22c55e] shadow-[0_0_12px_rgba(34,197,94,0.15)] ring-1 ring-[#22c55e]/25' 
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

              {/* Ligne 2 : Volée en cours (score du tour + 3 cases) */}
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
                      <span className="text-[8px] text-zinc-650 font-bold uppercase tracking-wider">Tour : Aucun</span>
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

              {/* Ligne 3 : Grille des 4 statistiques en 2 lignes (2x2) */}
              <div className="grid grid-cols-2 gap-0.5 mt-1.5 pt-1 border-t border-zinc-900/60 text-center">
                <div className="flex flex-col items-center justify-center py-0.5 px-1 bg-black/25 rounded-md border border-zinc-900/30">
                  <span className="text-[6.5px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Moyenne</span>
                  <span className="text-[9px] font-extrabold text-white">{formattedAvg}</span>
                </div>

                <div className="flex flex-col items-center justify-center py-0.5 px-1 bg-black/25 rounded-md border border-zinc-900/30">
                  <span className="text-[6.5px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Dernier</span>
                  <span className="text-[9px] font-extrabold text-[#22c55e]">
                    {player.lastRoundScore !== undefined && player.lastRoundScore > 0 ? player.lastRoundScore : '-'}
                  </span>
                </div>

                <div className="flex flex-col items-center justify-center py-0.5 px-1 bg-black/25 rounded-md border border-zinc-900/30">
                  <span className="text-[6.5px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Meilleur</span>
                  <span className="text-[9px] font-extrabold text-yellow-500">
                    {player.bestRound !== undefined && player.bestRound > 0 ? player.bestRound : '-'}
                  </span>
                </div>

                <div className="flex flex-col items-center justify-center py-0.5 px-1 bg-black/25 rounded-md border border-zinc-900/30">
                  <span className="text-[6.5px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Lancers</span>
                  <span className="text-[9px] font-extrabold text-zinc-300">{player.throwsCount}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pavé de saisie X01 unifié de type Cricket */}
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

        {/* Suggestion de finition X01 */}
        {currentRoom?.gameType === 'x01' && (() => {
          const activePlayer = players[activePlayerIndex];
          if (!activePlayer || activePlayer.score > 180 || activePlayer.score <= 1) return null;
          const suggestion = getCheckoutSuggestion(activePlayer.score, !!currentRoom.doubleOut);
          if (!suggestion || suggestion.length === 0) return null;

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
            <div className="w-full max-w-lg mx-auto mb-1 px-2 py-1.5 bg-black/45 border border-zinc-850 rounded-xl backdrop-blur-sm flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-400 font-extrabold tracking-wider uppercase flex items-center gap-1">
                <Target className="w-3.5 h-3.5 text-[#22c55e]" /> Finition :
              </span>
              <div className="flex items-center gap-1.5">
                {suggestion.map((dart, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && <span className="text-zinc-600 text-[10px] font-black">➔</span>}
                    {renderCheckoutDartBadge(dart)}
                  </React.Fragment>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Ligne 1 : Actions (Loupé, Retour) */}
        <div className="grid grid-cols-7 gap-1.5 max-w-lg mx-auto w-full px-1">
          {/* Bouton Loupé (grand bandeau) avec liseré rouge */}
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
          
          {/* Bouton Retour (Correction) */}
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

        {/* Ligne 2 : Multiplicateurs (DOUBLE, TRIPLE) à largeur égale */}
        <div className="grid grid-cols-2 gap-1.5 max-w-lg mx-auto w-full px-1">
          <button
            onClick={() => setMultiplier(multiplier === 'D' ? 'S' : 'D')}
            className={`text-black font-extrabold py-2.5 rounded-xl text-[11px] tracking-wider transition-all cursor-pointer select-none touch-manipulation ${
              multiplier === 'D' 
                ? 'bg-yellow-400 ring-2 ring-white scale-95 shadow-[0_0_12px_rgba(250,204,21,0.5)]' 
                : 'bg-yellow-500 hover:bg-yellow-400'
            }`}
          >
            DOUBLE
          </button>

          <button
            onClick={() => setMultiplier(multiplier === 'T' ? 'S' : 'T')}
            className={`text-white font-extrabold py-2.5 rounded-xl text-[11px] tracking-wider transition-all cursor-pointer select-none touch-manipulation ${
              multiplier === 'T' 
                ? 'bg-orange-600 ring-2 ring-white scale-95 shadow-[0_0_12px_rgba(234,88,12,0.5)]' 
                : 'bg-orange-700 hover:bg-orange-600'
            }`}
          >
            TRIPLE
          </button>
        </div>

        {/* Ligne 3 : Chiffres 1 à 7 */}
        <div className="grid grid-cols-7 gap-1.5 max-w-lg mx-auto w-full">
          {[1, 2, 3, 4, 5, 6, 7].map(num => (
            <button
              key={num}
              onClick={() => handleThrowDirect(num)}
              disabled={isSubmitting}
              className="bg-[#2a2a2a] hover:bg-zinc-700 active:scale-95 text-white font-extrabold py-2.5 rounded-xl text-sm transition-all cursor-pointer disabled:opacity-40 select-none touch-manipulation"
            >
              {num}
            </button>
          ))}
        </div>

        {/* Ligne 4 : Chiffres 8 à 14 */}
        <div className="grid grid-cols-7 gap-1.5 max-w-lg mx-auto w-full">
          {[8, 9, 10, 11, 12, 13, 14].map(num => (
            <button
              key={num}
              onClick={() => handleThrowDirect(num)}
              disabled={isSubmitting}
              className="bg-[#2a2a2a] hover:bg-zinc-700 active:scale-95 text-white font-extrabold py-2.5 rounded-xl text-sm transition-all cursor-pointer disabled:opacity-40 select-none touch-manipulation"
            >
              {num}
            </button>
          ))}
        </div>

        {/* Ligne 5 : Chiffres 15 à 20 + Bull (25) */}
        <div className="grid grid-cols-7 gap-1.5 max-w-lg mx-auto w-full">
          {[15, 16, 17, 18, 19, 20, 25].map(num => {
            const isBull = num === 25;
            const isTripleBullForbidden = isBull && multiplier === 'T';
            return (
              <button
                key={num}
                onClick={() => handleThrowDirect(num)}
                disabled={isSubmitting || isTripleBullForbidden}
                className={`font-extrabold py-2.5 rounded-xl text-sm transition-all cursor-pointer select-none touch-manipulation ${
                  isTripleBullForbidden
                    ? 'bg-zinc-900 text-zinc-650 opacity-20 cursor-not-allowed'
                    : 'bg-[#2a2a2a] hover:bg-zinc-700 active:scale-95 text-white disabled:opacity-40'
                }`}
              >
                {num}
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
    </div>
  );
};
