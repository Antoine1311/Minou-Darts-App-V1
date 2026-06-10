import React, { useState, useEffect } from 'react';
import { Sparkles, Tv, Smartphone, Users, ArrowRight, Loader2, Gamepad2, LogOut } from 'lucide-react';
import { roomService } from '../services/roomService';
import type { RoomData } from '../services/roomService';
import { useAuth } from '../context/AuthContext';

export const HomeView: React.FC = () => {
  const { user, loading: authLoading, loginWithGoogle, logout } = useAuth();
  const [roomIdInput, setRoomIdInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRooms, setActiveRooms] = useState<RoomData[]>([]);
  const [checkingRooms, setCheckingRooms] = useState<boolean>(false);

  // Recherche en temps réel des salons actifs associés à l'UID de l'utilisateur
  useEffect(() => {
    const fetchActiveRooms = async () => {
      if (!user) {
        setActiveRooms([]);
        return;
      }
      setCheckingRooms(true);
      try {
        const rooms = await roomService.getUserActiveRooms(user.uid);
        setActiveRooms(rooms);
      } catch (err) {
        console.error("Erreur de récupération des salons actifs :", err);
      } finally {
        setCheckingRooms(false);
      }
    };

    fetchActiveRooms();

    // Rafraîchir toutes les 10 secondes pour détecter les changements d'appareils en tâche de fond
    const interval = setInterval(fetchActiveRooms, 10000);
    return () => clearInterval(interval);
  }, [user]);

  // Création d'une nouvelle partie en ligne
  const handleCreateRoom = async () => {
    setLoading(true);
    setError(null);
    try {
      const newRoomId = await roomService.createRoom('modern', 501, 'x01');
      window.location.hash = `#/remote?room=${newRoomId}`;
    } catch (err) {
      console.error("Erreur de création de salon :", err);
      setError("Impossible de créer une nouvelle partie. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  };

  // Rejoindre une partie existante
  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
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

  return (
    <div className="min-h-screen bg-theme-bg text-theme-text-primary transition-all duration-300 flex flex-col items-center justify-center p-4 md:p-8">
      {/* Container principal moderne et premium */}
      <div className="w-full max-w-xl bg-black/40 border border-theme-border/50 rounded-3xl p-6 md:p-10 backdrop-blur-md shadow-2xl flex flex-col items-center text-center">
        
        {/* En-tête / Logo */}
        <div className="relative mb-6">
          <h1 className="text-4xl md:text-5xl font-light tracking-[0.25em] text-white uppercase select-none">
            MINOU<span className="font-extrabold text-theme-accent">DARTS</span>
          </h1>
          <div className="w-16 h-[2px] bg-theme-accent mx-auto mt-3" />
        </div>

        <p className="max-w-md text-sm md:text-base text-theme-text-secondary mb-6 leading-relaxed font-light">
          Le configurateur de scoring de fléchettes ultime. Calibré au système métrique, conçu pour le jeu sur vidéoprojecteur avec télécommande en temps réel.
        </p>

        {/* Section de gestion de compte Google */}
        <div className="w-full mb-6">
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
              disabled={authLoading || loading}
              className="w-full py-3 px-4 bg-zinc-900 border border-zinc-800 hover:border-theme-accent/50 hover:bg-zinc-800 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
            >
              {authLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-theme-accent" />
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>SE CONNECTER AVEC GOOGLE (GMAIL)</span>
                </>
              )}
            </button>
          )}
        </div>

        {error && (
          <div className="w-full mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 font-medium flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {error}
          </div>
        )}

        {/* Section 0. Détection automatique de partie active */}
        {activeRooms.length > 0 && (
          <div className="w-full bg-theme-accent/10 border border-theme-accent/30 rounded-2xl p-4 md:p-5 text-left mb-6 animate-fadeIn">
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
              Un salon actif créé avec votre compte a été trouvé. Cliquez ci-dessous pour le rejoindre instantanément sur cet appareil :
            </p>

            <div className="grid grid-cols-2 gap-3">
              {/* Bouton Télécommande */}
              <a
                href={`#/remote?room=${activeRooms[0].roomId}`}
                className="p-3 bg-black/50 border border-theme-border/60 hover:border-theme-accent/50 hover:bg-theme-accent/5 rounded-xl flex flex-col items-center text-center gap-1.5 transition-all group cursor-pointer"
              >
                <Smartphone className="w-5 h-5 text-theme-accent group-hover:scale-110 transition-transform" />
                <span className="text-[11px] font-extrabold text-white">TÉLÉCOMMANDE</span>
                <span className="text-[8px] text-theme-text-secondary">Saisir les scores</span>
              </a>

              {/* Bouton Projecteur */}
              <a
                href={`#/projector?room=${activeRooms[0].roomId}`}
                className="p-3 bg-black/50 border border-theme-border/60 hover:border-theme-accent/50 hover:bg-theme-accent/5 rounded-xl flex flex-col items-center text-center gap-1.5 transition-all group cursor-pointer"
              >
                <Tv className="w-5 h-5 text-theme-accent group-hover:scale-110 transition-transform" />
                <span className="text-[11px] font-extrabold text-white">VIDÉOPROJECTEUR</span>
                <span className="text-[8px] text-theme-text-secondary">Affichage des scores</span>
              </a>
            </div>
          </div>
        )}

        {checkingRooms && activeRooms.length === 0 && (
          <div className="w-full flex items-center justify-center gap-2 text-[10px] text-theme-text-secondary/60 mb-4 animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Recherche de parties en cours...</span>
          </div>
        )}

        {/* Section Actions principales */}
        <div className="w-full space-y-6">
          
          {/* 1. Lancer une partie en ligne */}
          <button
            onClick={handleCreateRoom}
            disabled={loading || authLoading}
            className="w-full group relative py-4 bg-theme-accent hover:bg-theme-accent-hover text-black font-extrabold text-sm rounded-xl transition-all shadow-lg shadow-theme-accent/10 flex items-center justify-center gap-3 cursor-pointer active:scale-[0.99] disabled:opacity-50"
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

          {/* Séparateur élégant */}
          <div className="flex items-center w-full text-theme-text-secondary/35 text-[10px] uppercase font-bold tracking-widest my-4">
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
              disabled={loading || authLoading}
              className="w-28 p-3.5 bg-black/50 border border-theme-border rounded-xl text-center text-lg font-black tracking-widest text-theme-accent focus:border-theme-accent focus:outline-none transition-all placeholder:text-theme-border/35"
            />
            <button
              type="submit"
              disabled={loading || authLoading || roomIdInput.trim().length !== 4}
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

          {/* Boutons d'accès directs / secondaires */}
          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-theme-border/20">
            {/* Mode local */}
            <button
              onClick={() => {
                window.location.hash = '#/remote';
              }}
              className="py-2.5 px-3 bg-black/20 border border-theme-border/30 hover:border-theme-text-secondary/40 text-[10px] md:text-xs text-theme-text-secondary font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 hover:text-theme-text-primary cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Mode Local Seul</span>
            </button>

            {/* Projecteur indépendant */}
            <a
              href="#/projector"
              className="py-2.5 px-3 bg-black/20 border border-theme-border/30 hover:border-theme-text-secondary/40 text-[10px] md:text-xs text-theme-text-secondary font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 hover:text-theme-text-primary cursor-pointer"
            >
              <Tv className="w-3.5 h-3.5" />
              <span>Projecteur Seul</span>
            </a>
          </div>

        </div>

        {/* Pied de page */}
        <div className="mt-10 pt-4 border-t border-theme-border/20 w-full text-[10px] text-theme-text-secondary/60 flex justify-between items-center px-1">
          <span>&copy; {new Date().getFullYear()} Minou Darts</span>
          <span className="flex items-center gap-1 font-semibold text-theme-accent">
            <Sparkles className="w-3 h-3 animate-pulse" /> Métrique & Connecté
          </span>
        </div>

      </div>
    </div>
  );
};
