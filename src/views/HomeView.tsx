import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Tv, 
  Smartphone, 
  Users, 
  ArrowRight, 
  Loader2, 
  Gamepad2, 
  LogOut, 
  Wifi, 
  WifiOff, 
  Plus, 
  Trash2, 
  RotateCcw, 
  ShieldCheck, 
  Trophy,
  X
} from 'lucide-react';
import { roomService } from '../services/roomService';
import type { RoomData } from '../services/roomService';
import { playerService } from '../services/playerService';
import type { GlobalPlayer, LocalMatchRecord } from '../services/playerService';
import { useAuth } from '../context/AuthContext';

const AVAILABLE_EMOJIS = ['🎯', '😎', '🚀', '👾', '👑', '🔥', '🦁', '🦉', '👻', '😜', '🍀', '⭐'];

export const HomeView: React.FC = () => {
  const { user, loading: authLoading, loginWithGoogle, logout } = useAuth();
  
  // Détection du statut réseau du smartphone
  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Mode actif : Hors-Ligne (Local) ou En Ligne (Cloud / Vidéoprojecteur)
  const [activeTab, setActiveTab] = useState<'offline' | 'online'>(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return 'offline';
    }
    const saved = localStorage.getItem('minou_dart_preferred_mode');
    return (saved === 'offline' || saved === 'online') ? saved : 'offline';
  });

  // États pour le mode En Ligne
  const [roomIdInput, setRoomIdInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRooms, setActiveRooms] = useState<RoomData[]>([]);
  const [checkingRooms, setCheckingRooms] = useState<boolean>(false);

  // États pour le mode Hors-Ligne (Stockage local sur le téléphone)
  const [localPlayers, setLocalPlayers] = useState<GlobalPlayer[]>([]);
  const [matchHistory, setMatchHistory] = useState<LocalMatchRecord[]>([]);
  const [newPlayerName, setNewPlayerName] = useState<string>('');
  const [newPlayerEmoji, setNewPlayerEmoji] = useState<string>('🎯');
  const [savedActiveGame, setSavedActiveGame] = useState<any | null>(null);

  // Écouter les changements d'état de connectivité réseau
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setActiveTab('offline'); // Basculer automatiquement en mode hors-ligne en l'absence de réseau
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Mémoriser la préférence de mode de jeu
  const handleSelectTab = (mode: 'offline' | 'online') => {
    setActiveTab(mode);
    localStorage.setItem('minou_dart_preferred_mode', mode);
    setError(null);
  };

  // Recharger les données locales du téléphone
  const refreshLocalData = () => {
    setLocalPlayers(playerService.getLocalPlayers());
    setMatchHistory(playerService.getLocalMatchHistory());
    const active = playerService.getActiveLocalGame();
    setSavedActiveGame(active);
  };

  useEffect(() => {
    refreshLocalData();
  }, [activeTab]);

  // Recherche des salons actifs Cloud (uniquement si en ligne et connecté)
  useEffect(() => {
    if (!isOnline || !user) {
      setActiveRooms([]);
      return;
    }

    const fetchActiveRooms = async () => {
      setCheckingRooms(true);
      try {
        const rooms = await roomService.getUserActiveRooms(user.uid);
        setActiveRooms(rooms);
      } catch (err) {
        console.warn("Erreur de récupération des salons actifs :", err);
      } finally {
        setCheckingRooms(false);
      }
    };

    fetchActiveRooms();
    const interval = setInterval(fetchActiveRooms, 10000);
    return () => clearInterval(interval);
  }, [user, isOnline]);

  // Ajouter un nouveau joueur en mémoire locale
  const handleAddLocalPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newPlayerName.trim();
    if (!name) return;

    playerService.saveLocalPlayer(name, newPlayerEmoji);
    setNewPlayerName('');
    refreshLocalData();
  };

  // Supprimer un joueur de la mémoire locale
  const handleDeleteLocalPlayer = (idOrName: string) => {
    playerService.deleteLocalPlayer(idOrName);
    refreshLocalData();
  };

  // Création d'une nouvelle partie en ligne
  const handleCreateRoom = async () => {
    if (!isOnline) {
      setError("Aucune connexion Internet détectée. Veuillez utiliser le Mode Hors-Ligne.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const newRoomId = await roomService.createRoom('modern', 501, 'x01');
      window.location.hash = `#/remote?room=${newRoomId}`;
    } catch (err) {
      console.error("Erreur de création de salon :", err);
      setError("Impossible de créer une nouvelle partie. Veuillez réessayer ou jouer en Mode Hors-Ligne.");
    } finally {
      setLoading(false);
    }
  };

  // Rejoindre une partie existante
  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      setError("Une connexion Internet est requise pour rejoindre un salon en ligne.");
      return;
    }
    const code = roomIdInput.trim().toUpperCase();
    if (code.length !== 4) {
      setError("Le code de salon doit comporter 4 caractères.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const exists = await roomService.checkRoomExists(code);
      if (exists) {
        window.location.hash = `#/remote?room=${code}`;
      } else {
        setError("Ce salon n'existe pas. Veuillez vérifier le code à 4 lettres.");
      }
    } catch (err) {
      console.error("Erreur de liaison :", err);
      setError("Erreur de connexion. Veuillez vérifier votre réseau.");
    } finally {
      setLoading(false);
    }
  };

  // Reprendre la partie locale sauvegardée
  const handleResumeLocalGame = () => {
    window.location.hash = '#/remote?mode=local';
  };

  // Abandonner la partie locale en cours pour en démarrer une neuve
  const handleAbandonLocalGame = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Voulez-vous abandonner la partie locale en cours ?")) {
      playerService.clearActiveLocalGame();
      refreshLocalData();
    }
  };

  return (
    <div className="min-h-screen bg-theme-bg text-theme-text-primary transition-all duration-300 flex flex-col items-center justify-center p-3 sm:p-4 md:p-8">
      {/* Conteneur principal moderne et premium */}
      <div className="w-full max-w-xl bg-black/40 border border-theme-border/50 rounded-3xl p-5 sm:p-7 md:p-10 backdrop-blur-md shadow-2xl flex flex-col items-center text-center">
        
        {/* En-tête / Logo */}
        <div className="relative mb-4">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-light tracking-[0.25em] text-white uppercase select-none">
            MINOU<span className="font-extrabold text-theme-accent">DARTS</span>
          </h1>
          <div className="w-16 h-[2px] bg-theme-accent mx-auto mt-2" />
        </div>

        <p className="max-w-md text-xs sm:text-sm text-theme-text-secondary mb-5 leading-relaxed font-light">
          Configurateur de scoring de fléchettes métrique haute précision. Conçu pour le jeu autonome sur smartphone ou la synchronisation sur vidéoprojecteur.
        </p>

        {/* Indicateur de connectivité réseau */}
        <div className="w-full mb-4">
          {isOnline ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-500/10 border border-green-500/30 rounded-full text-[11px] text-green-400 font-medium">
              <Wifi className="w-3.5 h-3.5" />
              <span>Connecté au réseau</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full text-[11px] text-amber-300 font-medium animate-pulse">
              <WifiOff className="w-3.5 h-3.5" />
              <span>Aucun réseau détecté — Mode Hors-Ligne recommandé</span>
            </div>
          )}
        </div>

        {/* SÉLECTEUR DE MODE PRINCIPAL (Onglets professionnels) */}
        <div className="w-full grid grid-cols-2 gap-2 p-1.5 bg-black/60 border border-theme-border/60 rounded-2xl mb-6 shadow-inner">
          <button
            type="button"
            onClick={() => handleSelectTab('offline')}
            className={`py-3 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'offline'
                ? 'bg-theme-accent text-black shadow-lg shadow-theme-accent/20 scale-[1.01]'
                : 'text-theme-text-secondary hover:text-white hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Smartphone className="w-4 h-4" />
              <span className="tracking-wide">MODE HORS-LIGNE</span>
            </div>
            <span className={`text-[10px] font-normal ${activeTab === 'offline' ? 'text-black/80 font-medium' : 'text-zinc-500'}`}>
              Sur ce téléphone • Zéro réseau
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTab('online')}
            className={`py-3 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'online'
                ? 'bg-theme-accent text-black shadow-lg shadow-theme-accent/20 scale-[1.01]'
                : 'text-theme-text-secondary hover:text-white hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Tv className="w-4 h-4" />
              <span className="tracking-wide">MODE EN LIGNE</span>
            </div>
            <span className={`text-[10px] font-normal ${activeTab === 'online' ? 'text-black/80 font-medium' : 'text-zinc-500'}`}>
              Vidéoprojecteur • Multijoueur
            </span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* VUE 1 : MODE HORS-LIGNE (100% Stockage local dans la mémoire du smartphone) */}
        {/* ========================================================================= */}
        {activeTab === 'offline' && (
          <div className="w-full space-y-5 text-left animate-fadeIn">
            
            {/* Bannière de réassurance vente et technique */}
            <div className="p-3.5 bg-theme-accent/10 border border-theme-accent/30 rounded-2xl flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-theme-accent flex-shrink-0 mt-0.5" />
              <div className="text-xs text-theme-text-secondary leading-relaxed">
                <strong className="text-white font-semibold">Stockage 100% autonome et persistant : </strong> 
                Toutes vos données (scores en cours, historique complet des matchs et profils des joueurs) sont conservées en continu dans la mémoire de votre téléphone. Même si vous quittez ou éteignez l'écran, vos scores sont préservés.
              </div>
            </div>

            {/* Reprise de partie locale si disponible */}
            {savedActiveGame && (
              <div 
                onClick={handleResumeLocalGame}
                className="w-full p-4 bg-gradient-to-r from-green-950/40 via-green-900/20 to-black/40 border border-green-500/40 hover:border-green-400 rounded-2xl transition-all cursor-pointer group shadow-lg flex items-center justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs font-black text-green-400 uppercase tracking-wider">
                      Partie locale en cours mémorisée
                    </span>
                  </div>
                  <p className="text-sm font-bold text-white">
                    {savedActiveGame.gameType === 'x01' ? `X01 (${savedActiveGame.targetScore || 501})` : 
                     savedActiveGame.gameType === 'cricket' ? 'Cricket' :
                     savedActiveGame.gameType === 'bart' ? 'Bart Darts' : "Tour de l'horloge"}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Joueurs : <strong className="text-zinc-200">{savedActiveGame.players?.map((p: any) => p.name).join(', ') || 'En cours'}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResumeLocalGame}
                    className="px-3.5 py-2 bg-green-500 group-hover:bg-green-400 text-black font-extrabold text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-md flex-shrink-0 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reprendre</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAbandonLocalGame}
                    className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl transition-colors cursor-pointer flex-shrink-0"
                    title="Abandonner cette partie"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Bouton d'action principal HERO : Lancer une partie locale */}
            <button
              type="button"
              onClick={() => {
                // Si aucune partie en cours, on ouvre directement le lobby
                playerService.clearActiveLocalGame();
                window.location.hash = '#/remote?mode=local';
              }}
              className="w-full group relative py-4 bg-theme-accent hover:bg-theme-accent-hover text-black font-extrabold text-sm sm:text-base rounded-2xl transition-all shadow-lg shadow-theme-accent/20 flex items-center justify-center gap-3 cursor-pointer active:scale-[0.99]"
            >
              <Gamepad2 className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
              <span>{savedActiveGame ? 'COMMENCER UNE NOUVELLE PARTIE' : 'NOUVELLE PARTIE HORS-LIGNE'}</span>
              <ArrowRight className="w-4 h-4 opacity-70 group-hover:translate-x-1 transition-transform" />
            </button>

            {/* HISTORIQUE DES DERNIERS MATCHS JOUÉS SUR CE TÉLÉPHONE */}
            {matchHistory.length > 0 && (
              <div className="w-full bg-black/40 border border-theme-border/40 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-theme-accent" />
                    <h3 className="text-xs sm:text-sm font-extrabold text-white uppercase tracking-wider">
                      Derniers matchs terminés sur ce téléphone
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Effacer l'historique des matchs locaux ?")) {
                        playerService.clearLocalMatchHistory();
                        refreshLocalData();
                      }
                    }}
                    className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                  >
                    Effacer
                  </button>
                </div>

                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {matchHistory.map((match) => {
                    const dateFormatted = new Date(match.timestamp).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                    const gameLabel = match.gameType === 'x01' ? `X01 (${match.targetScore || 501})` :
                                     match.gameType === 'cricket' ? 'Cricket' :
                                     match.gameType === 'bart' ? 'Bart Darts' : "Tour de l'horloge";

                    return (
                      <div
                        key={match.id}
                        className="p-3 bg-black/30 border border-theme-border/30 rounded-xl space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between border-b border-theme-border/20 pb-1.5">
                          <span className="font-bold text-white flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-theme-accent/20 text-theme-accent text-[9px] font-black uppercase">
                              {gameLabel}
                            </span>
                            <span>Vainqueur : <strong className="text-theme-accent">{match.winnerName} 🏆</strong></span>
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {dateFormatted}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5">
                          {match.players.map((p, idx) => {
                            const avgFormatted = (Math.round((p.avg || 0) * 10) / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
                            return (
                              <div
                                key={idx}
                                className={`flex items-center justify-between p-1.5 px-2 rounded-lg text-[11px] ${
                                  p.won ? 'bg-theme-accent/15 border border-theme-accent/40 font-bold text-white' : 'bg-white/5 text-zinc-300'
                                }`}
                              >
                                <span className="flex items-center gap-1.5 truncate">
                                  <span>{p.emoji || '🎯'}</span>
                                  <span className="truncate">{p.name}</span>
                                </span>
                                <span className="font-mono text-[10px] text-zinc-400">
                                  {match.gameType === 'x01' ? `Score: ${p.score} • ` : ''}
                                  Moy: <strong className={p.won ? 'text-theme-accent' : 'text-zinc-200'}>{avgFormatted}</strong>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SECTION DE GESTIEON DES JOUEURS LOCAUX */}
            <div className="w-full bg-black/40 border border-theme-border/40 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-theme-accent" />
                  <h3 className="text-xs sm:text-sm font-extrabold text-white uppercase tracking-wider">
                    Profils des joueurs (Mémoire du téléphone)
                  </h3>
                </div>
                <span className="text-[10px] bg-theme-accent/20 text-theme-accent font-bold px-2 py-0.5 rounded-full font-mono">
                  {localPlayers.length} {localPlayers.length > 1 ? 'joueurs' : 'joueur'}
                </span>
              </div>

              {/* Formulaire d'ajout rapide d'un joueur local */}
              <form onSubmit={handleAddLocalPlayer} className="flex gap-2">
                <select
                  value={newPlayerEmoji}
                  onChange={(e) => setNewPlayerEmoji(e.target.value)}
                  className="bg-black/60 border border-theme-border/60 text-base rounded-xl px-2.5 py-2.5 text-center cursor-pointer focus:outline-none focus:border-theme-accent"
                >
                  {AVAILABLE_EMOJIS.map((emoji) => (
                    <option key={emoji} value={emoji} className="bg-zinc-900 text-white">
                      {emoji}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  placeholder="Nom du joueur local..."
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  className="flex-grow p-2.5 bg-black/60 border border-theme-border/60 rounded-xl text-xs sm:text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-theme-accent transition-all"
                />

                <button
                  type="submit"
                  disabled={!newPlayerName.trim()}
                  className="px-3.5 py-2.5 bg-white/10 hover:bg-theme-accent hover:text-black text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Ajouter</span>
                </button>
              </form>

              {/* Liste des joueurs locaux avec affichage métrique de leurs statistiques */}
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {localPlayers.map((player) => {
                  const games = player.stats?.gamesPlayed || 0;
                  const wins = player.stats?.wins || 0;
                  const darts = player.stats?.dartsThrown || 0;
                  const points = player.stats?.totalPoints || 0;
                  // Moyenne métrique 3 fléchettes au standard français (virgule décimale)
                  const avg = darts > 0 ? (Math.round((points / darts) * 30) / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '0,0';
                  const winRate = games > 0 ? Math.round((wins / games) * 100) : 0;

                  return (
                    <div
                      key={player.id}
                      className="p-2.5 bg-black/30 border border-theme-border/30 hover:border-theme-border/70 rounded-xl flex items-center justify-between text-xs transition-all"
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span className="text-base">{player.emoji || '🎯'}</span>
                        <div className="truncate">
                          <p className="font-bold text-white truncate">{player.name}</p>
                          <p className="text-[10px] text-theme-text-secondary flex items-center gap-2">
                            <span>{wins} vict. / {games} part. ({winRate} %)</span>
                            <span>&bull;</span>
                            <span>Moyenne : <strong className="text-theme-accent">{avg} pts</strong></span>
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteLocalPlayer(player.id)}
                        className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer flex-shrink-0"
                        title="Supprimer de ce téléphone"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}

                {localPlayers.length === 0 && (
                  <p className="text-xs text-theme-text-secondary italic text-center py-4">
                    Aucun joueur enregistré en mémoire locale. Ajoutez votre nom ci-dessus.
                  </p>
                )}
              </div>
            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* VUE 2 : MODE EN LIGNE (Synchronisation Cloud & Vidéoprojecteur)            */}
        {/* ========================================================================= */}
        {activeTab === 'online' && (
          <div className="w-full space-y-6 text-left animate-fadeIn">
            
            {/* Alerte si aucune connexion réseau n'est présente */}
            {!isOnline && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3 text-xs text-amber-300 leading-relaxed">
                <WifiOff className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-400" />
                <div>
                  <strong className="font-bold">Vous êtes hors-ligne : </strong>
                  La synchronisation avec le Cloud et le vidéoprojecteur nécessite Internet.
                  <button
                    type="button"
                    onClick={() => handleSelectTab('offline')}
                    className="block mt-2 underline font-bold text-theme-accent cursor-pointer"
                  >
                    Basculer en Mode Hors-Ligne pour jouer immédiatement &rarr;
                  </button>
                </div>
              </div>
            )}

            {/* Section de gestion de compte Google */}
            <div className="w-full">
              {user && !user.isAnonymous ? (
                <div className="w-full p-3 bg-white/5 border border-theme-border/30 rounded-2xl flex items-center justify-between text-xs text-theme-text-secondary">
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                    <span className="truncate">Synchronisé : <strong className="text-white font-semibold">{user.email}</strong></span>
                  </div>
                  <button
                    onClick={logout}
                    disabled={authLoading}
                    className="p-1.5 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 flex-shrink-0 disabled:opacity-50"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Déconnexion</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={loginWithGoogle}
                  disabled={authLoading || loading || !isOnline}
                  className="w-full py-3 px-4 bg-zinc-900 border border-zinc-800 hover:border-theme-accent/50 hover:bg-zinc-800 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
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
                      <span>SE CONNECTER AVEC GOOGLE (GMAIL)</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {error && (
              <div className="w-full p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 font-medium flex items-center justify-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {error}
              </div>
            )}

            {/* Détection automatique de partie active Cloud */}
            {activeRooms.length > 0 && (
              <div className="w-full bg-theme-accent/10 border border-theme-accent/30 rounded-2xl p-4 md:p-5 text-left animate-fadeIn">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-black text-theme-accent uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-theme-accent animate-pulse" />
                    <span>Partie active détectée</span>
                  </h3>
                  <span className="text-[9px] bg-theme-accent/20 text-theme-accent font-bold px-2 py-0.5 rounded font-mono">
                    SALON : {activeRooms[0].roomId}
                  </span>
                </div>
                
                <p className="text-[11px] text-theme-text-secondary mb-4 leading-relaxed">
                  Un salon actif créé avec votre compte a été trouvé. Rejoignez-le directement :
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <a
                    href={`#/remote?room=${activeRooms[0].roomId}`}
                    className="p-3 bg-black/50 border border-theme-border/60 hover:border-theme-accent/50 hover:bg-theme-accent/5 rounded-xl flex flex-col items-center text-center gap-1.5 transition-all group cursor-pointer"
                  >
                    <Smartphone className="w-5 h-5 text-theme-accent group-hover:scale-110 transition-transform" />
                    <span className="text-[11px] font-extrabold text-white">TÉLÉCOMMANDE</span>
                    <span className="text-[8px] text-theme-text-secondary">Saisir les scores</span>
                  </a>

                  <a
                    href={`#/projector?room=${activeRooms[0].roomId}`}
                    className="p-3 bg-black/50 border border-theme-border/60 hover:border-theme-accent/50 hover:bg-theme-accent/5 rounded-xl flex flex-col items-center text-center gap-1.5 transition-all group cursor-pointer"
                  >
                    <Tv className="w-5 h-5 text-theme-accent group-hover:scale-110 transition-transform" />
                    <span className="text-[11px] font-extrabold text-white">VIDÉOPROJECTEUR</span>
                    <span className="text-[8px] text-theme-text-secondary">Affichage grand écran</span>
                  </a>
                </div>
              </div>
            )}

            {checkingRooms && activeRooms.length === 0 && (
              <div className="w-full flex items-center justify-center gap-2 text-[10px] text-theme-text-secondary/60 animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Recherche de salons en cours...</span>
              </div>
            )}

            {/* 1. Lancer une partie en ligne */}
            <button
              onClick={handleCreateRoom}
              disabled={loading || authLoading || !isOnline}
              className="w-full group relative py-4 bg-theme-accent hover:bg-theme-accent-hover text-black font-extrabold text-sm rounded-xl transition-all shadow-lg shadow-theme-accent/10 flex items-center justify-center gap-3 cursor-pointer active:scale-[0.99] disabled:opacity-40"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Gamepad2 className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                  <span>NOUVELLE PARTIE EN LIGNE</span>
                  <ArrowRight className="w-4 h-4 opacity-50 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

            {/* Séparateur */}
            <div className="flex items-center w-full text-theme-text-secondary/35 text-[10px] uppercase font-bold tracking-widest my-2">
              <div className="flex-grow h-[1px] bg-theme-border/30" />
              <span className="px-3">Ou rejoindre une partie</span>
              <div className="flex-grow h-[1px] bg-theme-border/30" />
            </div>

            {/* 2. Rejoindre via un code */}
            <form onSubmit={handleJoinRoom} className="w-full flex gap-2">
              <input
                type="text"
                placeholder="CODE"
                maxLength={4}
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
                disabled={loading || authLoading || !isOnline}
                className="w-28 p-3.5 bg-black/50 border border-theme-border rounded-xl text-center text-lg font-black tracking-widest text-theme-accent focus:border-theme-accent focus:outline-none transition-all placeholder:text-theme-border/35 disabled:opacity-40"
              />
              <button
                type="submit"
                disabled={loading || authLoading || roomIdInput.trim().length !== 4 || !isOnline}
                className="flex-grow py-3.5 bg-black/40 border border-theme-border/80 hover:border-theme-accent hover:bg-theme-accent/5 text-theme-text-primary font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:border-theme-border/80"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Users className="w-4 h-4" />
                    <span>SE CONNECTER</span>
                  </>
                )}
              </button>
            </form>

            {/* Accès Vidéoprojecteur Seul */}
            <div className="pt-2 border-t border-theme-border/20 text-center">
              <a
                href="#/projector"
                className="inline-flex items-center justify-center gap-1.5 py-2.5 px-4 bg-black/30 border border-theme-border/40 hover:border-theme-accent/40 rounded-xl text-xs text-theme-text-secondary hover:text-white transition-all"
              >
                <Tv className="w-3.5 h-3.5 text-theme-accent" />
                <span>Ouvrir l'affichage Vidéoprojecteur seul</span>
              </a>
            </div>

          </div>
        )}

        {/* Pied de page métrique et professionnel */}
        <div className="mt-8 pt-4 border-t border-theme-border/20 w-full text-[10px] text-theme-text-secondary/60 flex justify-between items-center px-1">
          <span>&copy; {new Date().getFullYear()} Minou Darts</span>
          <span className="flex items-center gap-1 font-semibold text-theme-accent">
            <Sparkles className="w-3 h-3 animate-pulse" /> Métrique & Multi-Mode
          </span>
        </div>

      </div>
    </div>
  );
};
