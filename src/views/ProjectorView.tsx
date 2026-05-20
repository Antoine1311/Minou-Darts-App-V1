import React, { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { Award, Zap, ArrowLeft, Sparkles, Users, Play } from 'lucide-react';
import { roomService, RoomData } from '../services/roomService';

export const ProjectorView: React.FC = () => {
  const { theme } = useTheme();
  const [room, setRoom] = useState<RoomData | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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
        }
      };
      initRoom();
    }
  }, [theme]);

  // 2. S'abonner aux changements Firestore dès qu'on a un roomId
  useEffect(() => {
    if (!roomId) return;

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

  // Rendu en cas de chargement
  if (loading && !room) {
    return (
      <div className="w-full min-h-screen bg-black flex flex-col items-center justify-center text-white">
        <div className="w-16 h-16 border-4 border-theme-accent border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-lg font-medium tracking-wide">Initialisation de la liaison temps réel...</p>
      </div>
    );
  }

  // Rendu en cas d'erreur
  if (error || !roomId) {
    return (
      <div className="w-full min-h-screen bg-theme-bg text-theme-text-primary flex flex-col items-center justify-center p-6 text-center">
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

  // --- RENDU 1 : ÉCRAN D'ATTENTE (SETUP) ---
  if (status === 'setup' && room) {
    return (
      <div className="w-full min-h-screen flex m-0 p-0 overflow-hidden bg-black select-none">
        {/* Cible à gauche éclairée à 50% */}
        <div className="w-1/2 min-h-screen bg-white shadow-[20px_0_40px_rgba(255,255,255,0.15)] z-10" />

        {/* Interface d'attente à droite */}
        <div className="w-1/2 min-h-screen bg-theme-bg text-theme-text-primary p-8 flex flex-col justify-between relative border-l border-theme-border/30">
          <a href="#/" className="absolute top-4 right-4 p-2 rounded-full bg-black/40 hover:bg-black/80 border border-theme-border/30 hover:border-theme-accent text-theme-text-secondary transition-all">
            <ArrowLeft className="w-5 h-5" />
          </a>

          <div className="flex flex-col items-center justify-center flex-grow py-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-theme-accent animate-ping" />
              <h2 className="text-xs font-bold tracking-widest text-theme-text-secondary uppercase">
                Configuration de la partie
              </h2>
            </div>

            {/* Code du salon géant */}
            <div className="text-center bg-black/30 border border-theme-border/40 p-8 rounded-3xl mb-8 w-full max-w-sm backdrop-blur">
              <span className="text-xs text-theme-text-secondary uppercase tracking-widest block mb-2">CODE DE CONNEXION</span>
              <span className="text-6xl font-black tracking-widest text-theme-accent font-mono block select-all">
                {room.roomId}
              </span>
              <p className="text-[10px] text-theme-text-secondary/70 mt-4 leading-relaxed">
                Entrez ce code sur votre téléphone dans la section **Télécommande** pour vous lier.
              </p>
            </div>

            {/* Liste des joueurs connectés */}
            <div className="w-full max-w-sm">
              <h3 className="text-sm font-bold text-theme-text-primary mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-theme-accent" /> Joueurs rejoints ({players.length})
              </h3>
              
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
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

          <div className="text-center text-xs text-theme-text-secondary/60">
            Lancez la partie depuis la télécommande pour allumer la cible !
          </div>
        </div>
      </div>
    );
  }

  // --- RENDU 2 : FIN DE PARTIE (CÉLÉBRATION) ---
  if (status === 'finished' && room) {
    return (
      <div className="w-full min-h-screen flex m-0 p-0 overflow-hidden bg-black select-none">
        {/* Cible à gauche éclairée à 50% */}
        <div className="w-1/2 min-h-screen bg-white shadow-[20px_0_40px_rgba(255,255,255,0.15)] z-10" />

        {/* Interface vainqueur à droite */}
        <div className="w-1/2 min-h-screen bg-theme-bg text-theme-text-primary p-8 flex flex-col justify-between relative border-l border-theme-border/30">
          <a href="#/" className="absolute top-4 right-4 p-2 rounded-full bg-black/40 hover:bg-black/80 border border-theme-border/30 hover:border-theme-accent text-theme-text-secondary transition-all">
            <ArrowLeft className="w-5 h-5" />
          </a>

          <div className="flex flex-col items-center justify-center flex-grow py-8 text-center">
            <div className="p-6 bg-theme-accent/10 border-2 border-theme-accent rounded-full mb-6 animate-bounce">
              <Award className="w-16 h-16 text-theme-accent" />
            </div>

            <h2 className="text-xs font-bold tracking-widest text-theme-accent uppercase mb-2">Victoire magistrale</h2>
            <h1 className="text-4xl md:text-5xl font-black tracking-wider text-theme-text-primary mb-4 font-serif">
              {room.winnerName}
            </h1>
            <div className="w-24 h-[2px] bg-theme-accent mb-6" />

            <p className="text-sm text-theme-text-secondary max-w-sm mb-8 leading-relaxed">
              Félicitations pour cette performance ! Le score cible de {room.targetScore} a été atteint.
            </p>

            {/* Statistiques rapides du vainqueur */}
            {players.find(p => p.name === room.winnerName) && (
              <div className="bg-black/30 border border-theme-border/30 p-6 rounded-2xl w-full max-w-xs text-left">
                <h3 className="text-xs font-bold text-theme-text-secondary uppercase tracking-widest mb-3 text-center">Stats du Vainqueur</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-theme-text-secondary">Moyenne :</span>
                    <span className="font-bold text-theme-accent">
                      {players.find(p => p.name === room.winnerName)?.avg.toLocaleString('fr-FR')} pts
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-theme-text-secondary">Fléchettes lancées :</span>
                    <span className="font-bold text-theme-text-primary">
                      {players.find(p => p.name === room.winnerName)?.throwsCount}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="text-center text-xs text-theme-text-secondary/60">
            Relancez un match depuis la télécommande pour recommencer à jouer !
          </div>
        </div>
      </div>
    );
  }

  // --- RENDU 3 : EN COURS DE JEU (PLAYING) ---
  return (
    <div className="w-full min-h-screen flex m-0 p-0 overflow-hidden bg-black select-none">
      
      {/* 1. MOITIÉ GAUCHE (50% de l'écran) : Éclairage de la cible physique */}
      <div 
        className="w-1/2 min-h-screen bg-white transition-all duration-500 shadow-[20px_0_40px_rgba(255,255,255,0.15)] z-10"
        id="projector-spotlight"
      />

      {/* 2. MOITIÉ DROITE (50% de l'écran) : Interface Sombre */}
      <div 
        className="w-1/2 min-h-screen bg-theme-bg text-theme-text-primary transition-all duration-300 p-8 flex flex-col justify-between relative border-l border-theme-border/30"
        id="projector-interface"
      >
        <a 
          href="#/" 
          className="absolute top-4 right-4 p-2 rounded-full bg-black/40 hover:bg-black/80 border border-theme-border/30 hover:border-theme-accent text-theme-text-secondary hover:text-theme-accent transition-all duration-300 z-20"
        >
          <ArrowLeft className="w-5 h-5" />
        </a>

        {/* --- ZONE DU TIERS SUPÉRIEUR : Affichage des Scores & Statistiques --- */}
        <div className="h-1/2 flex flex-col justify-start">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-theme-accent animate-ping" />
            <h2 className={`text-xs md:text-sm font-bold tracking-widest text-theme-text-secondary uppercase ${
              theme === 'arcade' ? 'neon-glow-pink-text font-mono' : ''
            }`}>
              PARTIE EN COURS &bull; MODE {room?.targetScore} &bull; SALON : {room?.roomId}
            </h2>
          </div>

          {/* Liste des Joueurs */}
          <div className="space-y-3 overflow-y-auto max-h-[80%] pr-1">
            {players.map((player, idx) => {
              const isActive = idx === activePlayerIndex;
              return (
                <div 
                  key={player.name}
                  className={`flex items-center justify-between p-4 rounded-xl border transition-all duration-300 ${
                    isActive 
                      ? 'bg-theme-accent/15 border-theme-accent shadow-lg scale-[1.02]' 
                      : 'bg-black/20 border-theme-border/20 opacity-60'
                  } ${theme === 'arcade' && isActive ? 'neon-glow-border' : ''}`}
                >
                  {/* Gauche : Nom et Indicateur Actif */}
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold px-2 py-1 rounded ${
                      isActive ? 'bg-theme-accent text-black font-extrabold' : 'bg-black/40 text-theme-text-secondary'
                    } ${theme === 'arcade' ? 'font-mono' : ''}`}>
                      J{idx + 1}
                    </span>
                    <span className={`text-lg font-bold tracking-wide ${isActive ? 'text-theme-accent' : 'text-theme-text-primary'} ${
                      theme === 'arcade' ? 'font-mono' : ''
                    }`}>
                      {player.name}
                    </span>
                    {isActive && (
                      <span className="flex items-center gap-1 text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-theme-accent/20 text-theme-accent animate-pulse">
                        <Zap className="w-2.5 h-2.5 fill-current" /> {player.dartsLeft} Fléchettes
                      </span>
                    )}
                  </div>

                  {/* Droite : Score et Moyenne */}
                  <div className="flex items-center gap-6">
                    {/* Statistiques (Moyenne) */}
                    <div className="text-right hidden sm:block">
                      <span className="block text-[10px] text-theme-text-secondary/70 uppercase">Moyenne</span>
                      <span className={`text-xs font-semibold ${theme === 'arcade' ? 'font-mono' : ''}`}>
                        {player.avg.toLocaleString('fr-FR', { minimumFractionDigits: 1 })} pts
                      </span>
                    </div>

                    {/* Score Principal */}
                    <div className="text-right">
                      <span className={`text-2xl md:text-3xl font-extrabold tracking-wide ${
                        isActive ? 'text-theme-accent' : 'text-theme-text-primary'
                      } ${theme === 'arcade' ? 'neon-glow-text font-mono' : ''}`}>
                        {player.score}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* --- ZONE DES DEUX TIERS INFÉRIEURS : Logo stylisé et fierté de marque --- */}
        <div className="h-1/2 flex flex-col justify-end items-center pb-6">
          <div className="w-full max-w-md text-center p-8 rounded-2xl relative select-none">
            {theme === 'pub' && (
              <div className="flex flex-col items-center">
                <div className="w-full border-t border-b-2 border-theme-accent/60 py-4 px-2 my-2 relative">
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-theme-bg px-4">
                    <Award className="w-6 h-6 text-theme-accent" />
                  </div>
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-widest text-theme-accent font-serif select-none">
                    MINOU DARTS
                  </h1>
                </div>
                <p className="text-xs uppercase tracking-[0.3em] text-theme-text-secondary font-bold font-serif mt-2">
                  Est. 2026 &bull; Club de Fléchettes de Prestige
                </p>
              </div>
            )}

            {theme === 'arcade' && (
              <div className="flex flex-col items-center">
                <div className="relative p-6 border-4 border-theme-accent rounded-xl bg-black/50 shadow-[0_0_20px_var(--theme-accent)]">
                  <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold font-mono tracking-widest text-theme-accent neon-glow-text uppercase">
                    MINOU DARTS
                  </h1>
                  <div className="absolute -top-3 -left-3 w-6 h-6 border-t-4 border-l-4 border-theme-text-secondary" />
                  <div className="absolute -top-3 -right-3 w-6 h-6 border-t-4 border-r-4 border-theme-text-secondary" />
                  <div className="absolute -bottom-3 -left-3 w-6 h-6 border-b-4 border-l-4 border-theme-text-secondary" />
                  <div className="absolute -bottom-3 -right-3 w-6 h-6 border-b-4 border-r-4 border-theme-text-secondary" />
                </div>
                <p className="text-[10px] font-mono tracking-[0.2em] text-theme-text-secondary neon-glow-pink-text mt-6 uppercase">
                  LE SCORE D'UN CHAMPION &bull; FLÉCHETTES MÉTRIQUES
                </p>
              </div>
            )}

            {theme === 'modern' && (
              <div className="flex flex-col items-center">
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-extralight tracking-[0.25em] text-white uppercase select-none">
                  MINOU<span className="font-extrabold text-theme-accent">DARTS</span>
                </h1>
                <div className="w-12 h-[2px] bg-theme-accent my-4" />
                <p className="text-[10px] uppercase tracking-[0.4em] text-theme-text-secondary font-medium">
                  SYSTÈME MÉTRIQUE DE SCORING PWA
                </p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
