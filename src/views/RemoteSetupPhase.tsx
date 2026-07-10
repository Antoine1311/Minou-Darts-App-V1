import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Users, Settings, Tv, Maximize2, Sparkles, ExternalLink, Copy, Check, Target, Crosshair, Clock, RotateCcw, Plus, Play, Trash2 } from 'lucide-react';
import type { RoomData, GameType, CricketVariant } from '../services/roomService';
import { playerService } from '../services/playerService';
import { roomService } from '../services/roomService';
import { useGameStore } from '../store/gameStore';
import type { GlobalPlayer } from '../services/playerService';
import { QRCodeSVG } from 'qrcode.react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { getCheckoutSuggestion } from '../services/checkoutSuggestions';
import { generateCricketTargets, createEmptyMarks } from '../services/cricketEngine';
import { createEmptyBartState } from '../services/bartEngine';

interface RemoteSetupPhaseProps {
  roomId: string | null;
  isLocalMode: boolean;
  currentRoom: RoomData | null;
  onUpdateRoom: (data: Partial<RoomData>) => Promise<void>;
  onExit: () => void;
  setShowProjectorSettingsModal: (v: boolean) => void;
  setShowProjectionModal: (v: boolean) => void;
  showCalibrationPanel: boolean;
  setShowCalibrationPanel: (v: boolean) => void;
  remoteProjectorMode: 'classic' | 'fullscreen' | 'ar';
  setRemoteProjectorModeAndSync: (mode: 'classic' | 'fullscreen' | 'ar') => void;
}

export const RemoteSetupPhase: React.FC<RemoteSetupPhaseProps> = ({
  roomId, isLocalMode, currentRoom, onUpdateRoom, onExit,
  setShowProjectorSettingsModal, setShowProjectionModal, showCalibrationPanel, setShowCalibrationPanel,
  remoteProjectorMode, setRemoteProjectorModeAndSync
}) => {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const setLocalRoom = useGameStore(state => state.setLocalRoom);


  const [setupStep, setSetupStep] = useState<'players' | 'game'>('players');

  const [savedGameData, setSavedGameData] = useState<RoomData | null>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  }, [user]);

  const handleRemoveSavedPlayer = async (name: string) => {
    const playerToRemove = savedPlayers.find(p => p.name === name);
    if (playerToRemove) {
      try {
        await playerService.deletePlayer(playerToRemove.id);
        setSavedPlayers(prev => prev.filter(p => p.id !== playerToRemove.id));
        setSelectedPlayerNames(prev => prev.filter(p => p !== name));
      } catch (err) {
        console.error("Erreur suppression joueur:", err);
      }
    }
  };

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

  const handleToggleSelectPlayer = (name: string) => {
    if (selectedPlayerNames.includes(name)) {
      setSelectedPlayerNames(selectedPlayerNames.filter(p => p !== name));
    } else {
      setSelectedPlayerNames([...selectedPlayerNames, name]);
    }
  };

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
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
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




  // Lancer officiellement la partie
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

      await onUpdateRoom(newRoomData);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateRoomState = onUpdateRoom; // pour compatibilité

  
  
    return (
      <div className="remote-view-container h-svh max-h-svh overflow-hidden bg-theme-bg text-theme-text-primary transition-all duration-300 flex flex-col justify-between select-none">
        <header className="p-4 bg-black/40 border-b border-theme-border/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                if (setupStep === 'game') {
                  setSetupStep('players');
                } else {
                  onExit();
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
      </div>
    );
  
};
