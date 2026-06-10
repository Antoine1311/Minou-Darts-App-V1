import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { Award, Zap, ArrowLeft, Users, Smartphone } from 'lucide-react';
import { roomService, getGameHighlights } from '../services/roomService';
import type { RoomData } from '../services/roomService';
import { BartProjectorGame } from './BartProjectorGame';
import { getCheckoutSuggestion } from '../services/checkoutSuggestions';

export const ProjectorView: React.FC = () => {
  const { theme } = useTheme();
  const [room, setRoom] = useState<RoomData | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const isCreatingRoom = useRef(false);

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

  // Rendu en cas de chargement
  if (loading && !room) {
    return (
      <div className="w-full h-screen overflow-hidden bg-black flex flex-col items-center justify-center text-white">
        <div className="w-16 h-16 border-4 border-theme-accent border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-lg font-medium tracking-wide">Initialisation de la liaison temps réel...</p>
      </div>
    );
  }

  // Rendu en cas d'erreur
  if (error || !roomId) {
    return (
      <div className="w-full h-screen overflow-hidden bg-theme-bg text-theme-text-primary flex flex-col items-center justify-center p-6 text-center">
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
    let sizeClass = 'w-9 h-9 md:w-11 md:h-11 lg:w-13 lg:h-13';
    let circleSizeClass = 'w-11 h-11 md:w-13 md:h-13 lg:w-15 lg:h-15';
    
    if (numPlayers > 4) {
      sizeClass = 'w-6 h-6 md:w-8 md:h-8 lg:w-9 lg:h-9';
      circleSizeClass = 'w-8 h-8 md:w-10 md:h-10 lg:w-11 lg:h-11';
    } else if (numPlayers > 2) {
      sizeClass = 'w-8 h-8 md:w-9 md:h-9 lg:w-11 lg:h-11';
      circleSizeClass = 'w-9 h-9 md:w-11 md:h-11 lg:w-13 lg:h-13';
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
      <div className="w-full h-screen flex m-0 p-0 overflow-hidden bg-black select-none">
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

        {/* Interface d'attente à droite */}
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

          <div className="flex flex-col items-center justify-center flex-grow py-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-theme-accent animate-ping" />
              <h2 className="text-xs font-bold tracking-widest text-theme-text-secondary uppercase">
                Configuration de la partie
              </h2>
            </div>

            {/* Code du salon et QR Code */}
            <div className="flex flex-col sm:flex-row items-center gap-4 bg-black/30 border border-theme-border/40 p-4 md:p-6 rounded-3xl mb-5 w-full max-w-xl backdrop-blur">
              {/* Colonne Code */}
              <div className="text-center flex-grow flex flex-col justify-center">
                <span className="text-[10px] md:text-xs text-theme-text-secondary uppercase tracking-widest block mb-1">CODE DE CONNEXION</span>
                <span className="text-5xl md:text-6xl font-black tracking-widest text-theme-accent font-mono block select-all">
                  {room.roomId}
                </span>
                <p className="text-[10px] text-theme-text-secondary/70 mt-3 leading-relaxed hidden sm:block">
                  Entrez ce code sur votre téléphone pour vous lier.
                </p>
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
        </div>
      </div>
    );
  }

  // --- RENDU 2 : FIN DE PARTIE (CÉLÉBRATION) ---
  if (status === 'finished' && room) {
    return (
      <div className="w-full h-screen flex m-0 p-0 overflow-hidden bg-black select-none">
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
    return <BartProjectorGame room={room} />;
  }

  return (
    <div className="w-full h-screen flex m-0 p-0 overflow-hidden bg-black select-none">
      
      {/* 1. MOITIÉ GAUCHE (50% de l'écran) : Éclairage de la cible physique */}
      <div 
        className="w-1/2 h-full bg-white transition-all duration-500 shadow-[20px_0_40px_rgba(255,255,255,0.15)] z-10 flex flex-col justify-end items-center pb-6"
        id="projector-spotlight"
      >
        {/* Logo Minou Dart Game */}
        <span 
          className="italic text-xl text-zinc-950 font-serif tracking-widest opacity-50 select-none mb-4"
          style={{ fontFamily: "'Playfair Display', 'Didot', 'Georgia', serif" }}
        >
          Minou Dart Game
        </span>

        {/* Règle de progression X01 (seulement pour le mode X01/501) */}
        {room?.gameType === 'x01' && (
          <div className="w-full px-8 pb-6 flex flex-col gap-4">
            <div className="text-zinc-650 text-xs font-bold uppercase tracking-widest text-center flex items-center justify-between border-b border-zinc-200 pb-2">
              <span>{room.targetScore} (Départ)</span>
              <span className="text-zinc-500 font-black">Progression du Match</span>
              <span>0 (Arrivée)</span>
            </div>
            
            <div className="space-y-4 w-full bg-zinc-50/90 p-5 rounded-2xl border border-zinc-200/80 shadow-md">
              {players.map((player, idx) => {
                const isActive = idx === activePlayerIndex;
                const progressPercentage = Math.max(0, Math.min(100, (((room.targetScore - player.score) / room.targetScore) * 100)));
                
                return (
                  <div key={player.name} className="flex flex-col gap-1.5 w-full">
                    {/* Légende du joueur */}
                    <div className="flex justify-between text-xs font-bold text-zinc-700 px-1">
                      <span className="uppercase flex items-center gap-1">
                        <span>{player.name}</span>
                        <span>{player.emoji || '🎯'}</span>
                      </span>
                      <span>{player.score} restants</span>
                    </div>
                    {/* Ligne horizontale de la règle */}
                    <div className="relative w-full h-2.5 bg-zinc-200 rounded-full overflow-visible border border-zinc-300/30">
                      {/* Ligne de progression colorée (verte/grise) */}
                      <div 
                        className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${
                          isActive ? 'bg-[#22c55e]' : 'bg-zinc-400'
                        }`}
                        style={{ width: `${progressPercentage}%` }}
                      />
                      {/* Curseur avec le Smiley du joueur */}
                      <div 
                        className={`absolute -top-3.5 -translate-x-1/2 w-9 h-9 rounded-full border-2 flex items-center justify-center text-lg shadow-lg transition-all duration-500 cursor-default select-none ${
                          isActive 
                            ? 'bg-zinc-950 border-[#22c55e] scale-110 z-10' 
                            : 'bg-white border-zinc-350 scale-100 opacity-90'
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

            {/* Encart de suggestion de finition pour le joueur actif */}
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
                  <span key={dart} className={`px-4 py-1.5 rounded-xl border text-sm md:text-base font-black uppercase tracking-wider ${bgClass}`}>
                    {display}
                  </span>
                );
              };

              return (
                <div className="w-full bg-zinc-950 text-white p-4 rounded-3xl border-2 border-theme-accent shadow-[0_0_20px_rgba(255,255,255,0.05)] flex items-center justify-between gap-4">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-theme-accent font-black uppercase tracking-widest">
                      Finition Suggérée ({activePlayer.name})
                    </span>
                    <span className="text-xl font-black mt-0.5 tracking-tight text-white">
                      {activePlayer.score} points restants
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {suggestion.map((dart, idx) => (
                      <React.Fragment key={idx}>
                        {idx > 0 && <span className="text-zinc-600 text-sm font-black">➔</span>}
                        {renderProjectorCheckoutDartBadge(dart)}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Règle de progression Cricket (fermeture des 7 cibles) */}
        {room?.gameType === 'cricket' && (
          <div className="w-full px-8 pb-6 flex flex-col gap-4">
            <div className="text-zinc-650 text-xs font-bold uppercase tracking-widest text-center flex items-center justify-between border-b border-zinc-200 pb-2">
              <span>0 (Début)</span>
              <span className="text-zinc-500 font-black">Cibles Fermées (Cricket)</span>
              <span>{room.cricketTargets?.length || 7} (Fermé)</span>
            </div>
            
            <div className="space-y-4 w-full bg-zinc-50/90 p-5 rounded-2xl border border-zinc-200/80 shadow-md">
              {players.map((player, idx) => {
                const isActive = idx === activePlayerIndex;
                const targets = room.cricketTargets || [];
                const closedCount = targets.filter(t => (player.cricketMarks?.[String(t)] || 0) >= 3).length;
                const progressPercentage = targets.length > 0 ? (closedCount / targets.length) * 100 : 0;
                
                return (
                  <div key={player.name} className="flex flex-col gap-1.5 w-full">
                    {/* Légende du joueur */}
                    <div className="flex justify-between text-xs font-bold text-zinc-700 px-1">
                      <span className="uppercase flex items-center gap-1">
                        <span>{player.name}</span>
                        <span>{player.emoji || '🎯'}</span>
                      </span>
                      <span>{closedCount} / {targets.length} cibles</span>
                    </div>
                    {/* Ligne horizontale de la règle */}
                    <div className="relative w-full h-2.5 bg-zinc-200 rounded-full overflow-visible border border-zinc-300/30">
                      {/* Ligne de progression colorée (verte/grise) */}
                      <div 
                        className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${
                          isActive ? 'bg-[#22c55e]' : 'bg-zinc-400'
                        }`}
                        style={{ width: `${progressPercentage}%` }}
                      />
                      {/* Curseur avec le Smiley du joueur */}
                      <div 
                        className={`absolute -top-3.5 -translate-x-1/2 w-9 h-9 rounded-full border-2 flex items-center justify-center text-lg shadow-lg transition-all duration-500 cursor-default select-none ${
                          isActive 
                            ? 'bg-zinc-950 border-[#22c55e] scale-110 z-10' 
                            : 'bg-white border-zinc-350 scale-100 opacity-90'
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

      {/* 2. MOITIÉ DROITE (50% de l'écran) : Interface Sombre */}
      <div 
        className="w-1/2 h-full bg-theme-bg text-theme-text-primary transition-all duration-300 p-4 md:p-5 flex flex-col justify-between relative border-l border-theme-border/30"
        id="projector-interface"
      >
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
              <table className="w-full border-collapse table-fixed flex-grow">
                <thead>
                  <tr className="border-b border-theme-border/20">
                    {/* Colonne des cibles (vide en en-tête) */}
                    <th className="w-[80px] md:w-[100px] pb-1"></th>
                    
                    {/* En-têtes Joueurs */}
                    {players.map((player, idx) => {
                      const isActive = idx === activePlayerIndex;
                      const numPlayers = players.length;
                      
                      let nameTextSize = 'text-sm md:text-base lg:text-lg';
                      let scoreTextSize = 'text-xl md:text-2xl lg:text-3xl';
                      let headerHeight = 'min-h-[70px]';
                      
                      if (numPlayers > 4) {
                        nameTextSize = 'text-xs md:text-xs lg:text-sm';
                        scoreTextSize = 'text-base md:text-lg lg:text-xl';
                        headerHeight = 'min-h-[55px]';
                      } else if (numPlayers > 2) {
                        nameTextSize = 'text-xs md:text-sm lg:text-base';
                        scoreTextSize = 'text-lg md:text-xl lg:text-2xl';
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
                            <span className={`font-black uppercase tracking-wider truncate max-w-full block ${
                              isActive ? 'text-theme-accent' : 'text-theme-text-primary'
                            } ${nameTextSize}`}>
                              {player.name}
                            </span>
                            <span className={`font-black block ${
                              isActive ? 'text-theme-accent' : 'text-theme-text-primary'
                            } ${scoreTextSize} ${theme === 'arcade' ? 'neon-glow-text font-mono' : ''}`}>
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
                          <div className={`w-full py-2 md:py-3 rounded-xl font-black text-base md:text-lg lg:text-2xl text-center shadow-md transition-all relative overflow-hidden ${
                            allClosed 
                              ? 'bg-green-950/40 text-green-700 border border-green-900/50'
                              : isBull 
                                ? 'bg-red-600 text-white border border-red-500 shadow-red-600/10' 
                                : 'bg-green-600 text-white border border-green-500 shadow-green-600/10'
                          }`}>
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
                              <div className="flex justify-center items-center h-8 md:h-9 lg:h-10">
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
                      <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest leading-tight">
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
                          <div className="flex flex-wrap items-center justify-center gap-x-1.5 md:gap-x-3 gap-y-0.5 text-[9px] md:text-[11px] lg:text-xs font-bold text-zinc-350 mb-1.5 leading-tight">
                            <span>{players.length >= 5 ? 'Lanc.' : 'Lancers'}: <strong className="text-white text-xs md:text-sm">{player.throwsCount}</strong></span>
                            <span className="text-zinc-700">|</span>
                            <span>{players.length >= 5 ? 'Loup.' : 'Loupées'}: <strong className="text-red-400 text-xs md:text-sm">{player.missedDarts || 0}</strong></span>
                            <span className="text-zinc-700">|</span>
                            <span>Préc.: <strong className="text-white text-xs md:text-sm">{player.accuracy !== undefined ? `${player.accuracy.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}%` : '-'}</strong></span>
                            <span className="text-zinc-700">|</span>
                            <span>MPR: <strong className="text-theme-accent font-black text-xs md:text-sm">{player.avg.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                          </div>
                          
                          {/* Boîtes de lancer du tour */}
                          <div className="flex gap-1 justify-center mb-0.5">
                            {[0, 1, 2].map((i) => {
                              const throwLabel = roundThrows[i] || '';
                              const displayLabel = throwLabel === '0' ? 'Loupé' : throwLabel;
                              
                              // Tailles adaptatives pour les boîtes de lancer
                              const boxWidth = players.length >= 5 ? 'w-10 h-7 text-[9px] md:w-11 md:h-8.5' : 'w-14 h-9 md:w-16 md:h-11';
                              
                              return (
                                <div key={i} className={`${boxWidth} rounded-lg border-2 flex items-center justify-center font-black transition-all text-[10px] md:text-xs ${
                                  throwLabel 
                                    ? throwLabel === '0'
                                      ? 'border-red-950 bg-red-950/20 text-red-400 font-extrabold uppercase text-[7.5px] md:text-[9px]'
                                      : 'border-theme-accent/50 bg-black/80 text-theme-accent font-extrabold shadow-md' 
                                    : 'border-zinc-850 bg-zinc-950/10 text-transparent'
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
                </tfoot>
              </table>

              {/* Indicateur du joueur actif en bas de tableau */}
              <div className="mt-1 text-center">
                <span className="text-[10px] text-theme-text-secondary uppercase tracking-widest font-black animate-pulse">
                  🎯 {players[activePlayerIndex]?.name} à vous de jouer &bull; {players[activePlayerIndex]?.dartsLeft} fléchettes restantes
                </span>
              </div>
            </div>
          ) : (
            /* ═══ LISTE DES JOUEURS X01 (OPTIMISÉE 16/9 1080p) ═══ */
            <div className={`flex-grow min-h-0 gap-1.5 ${
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
                let nameSize = 'text-base md:text-lg lg:text-xl';
                let scoreSize = 'text-4xl md:text-5xl lg:text-6xl';
                let dartBoxSize = 'w-10 h-7 text-[10px] rounded-xl';
                let statTextSize = 'text-[10px] md:text-xs';
                let statBoxPadding = 'p-1';
                let rowSpacing = 'mt-2';
                let tourActuelLabelSize = 'text-[9px] md:text-[10px]';
                let roundSumSize = 'text-xs';
                const cardFlexClass = numPlayers >= 3 ? '' : 'flex-1';
                
                if (numPlayers <= 2) {
                  cardPadding = 'p-4 md:p-5';
                  nameSize = 'text-xl md:text-2xl lg:text-2xl';
                  scoreSize = 'text-6xl md:text-7xl lg:text-[5.5rem]';
                  dartBoxSize = 'w-16 h-11 text-xs md:text-sm rounded-xl';
                  statTextSize = 'text-xs md:text-sm';
                  statBoxPadding = 'p-1.5';
                  rowSpacing = 'mt-3.5';
                  tourActuelLabelSize = 'text-[11px] md:text-xs lg:text-sm';
                  roundSumSize = 'text-sm md:text-base';
                } else if (numPlayers <= 4) {
                  cardPadding = 'p-3 md:p-4';
                  nameSize = 'text-base md:text-lg lg:text-xl';
                  scoreSize = 'text-4xl md:text-5xl lg:text-6xl';
                  dartBoxSize = 'w-14 h-9.5 text-[11px] md:text-xs rounded-xl';
                  statTextSize = 'text-[11px] md:text-xs';
                  statBoxPadding = 'p-1';
                  rowSpacing = 'mt-2.5';
                  tourActuelLabelSize = 'text-[10px] md:text-[11px] lg:text-xs';
                  roundSumSize = 'text-xs md:text-sm';
                } else {
                  // 5 à 6 joueurs
                  cardPadding = 'p-1 md:p-1.5';
                  nameSize = 'text-xs md:text-sm';
                  scoreSize = 'text-xl md:text-2xl lg:text-3xl';
                  dartBoxSize = 'w-9 h-6.5 text-[8px] rounded-md';
                  statTextSize = 'text-[8.5px] md:text-[9.5px]';
                  statBoxPadding = 'p-0.5';
                  rowSpacing = 'mt-1';
                  tourActuelLabelSize = 'text-[7.5px] md:text-[8.5px]';
                  roundSumSize = 'text-[9.5px] md:text-xs';
                }

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
                          <span className={`text-[10px] md:text-xs font-black px-2.5 py-0.5 rounded-md flex-shrink-0 ${
                            isActive ? 'bg-theme-accent text-black font-extrabold' : 'bg-black/40 text-theme-text-secondary'
                          } ${theme === 'arcade' ? 'font-mono' : ''}`}>
                            J{idx + 1}
                          </span>
                          <span className={`font-black tracking-wide uppercase truncate flex items-center gap-1.5 ${
                            isActive ? 'text-theme-accent' : 'text-zinc-300'
                          } ${nameSize} ${theme === 'arcade' ? 'font-mono' : ''}`}>
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

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`font-black tracking-tighter leading-none ${
                          player.roundBust 
                            ? 'text-red-400/90' 
                            : isActive 
                              ? 'text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.15)]' 
                              : 'text-zinc-400'
                        } ${scoreSize} ${theme === 'arcade' ? 'neon-glow-text font-mono' : ''}`}>
                          {player.score}
                        </span>
                      </div>
                    </div>

                    {/* Ligne 2 : Fléchettes jetées au cours de ce tour */}
                    <div className={`flex items-center justify-between ${rowSpacing} pt-2 border-t border-zinc-900/40`}>
                      <div className="flex items-center gap-1.5">
                        <span className={`${tourActuelLabelSize} text-zinc-500 font-bold uppercase tracking-wider`}>
                          Tour :
                        </span>
                        {player.roundBust ? (
                          <span className="text-xs md:text-sm text-red-500 font-black tracking-widest animate-pulse">
                            BUST ❌
                          </span>
                        ) : (
                          (roundSum > 0 || roundThrows.length > 0) ? (
                            <span className={`${roundSumSize} bg-zinc-900 text-[#22c55e] border border-zinc-850/80 font-black px-2.5 py-0.5 rounded-md`}>
                              {roundSum} pts
                            </span>
                          ) : (
                            <span className={`${tourActuelLabelSize} text-zinc-650 font-semibold italic`}>Aucun</span>
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
                        <span className="text-[7px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Moyenne</span>
                        <span className={`font-extrabold text-white ${statTextSize}`}>{formattedAvg}</span>
                      </div>

                      <div className={`flex flex-col items-center justify-center ${statBoxPadding} bg-black/25 rounded-xl border border-zinc-900/40`}>
                        <span className="text-[7px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Dernier</span>
                        <span className={`font-extrabold text-[#22c55e] ${statTextSize}`}>
                          {player.lastRoundScore !== undefined && player.lastRoundScore > 0 ? player.lastRoundScore : '-'}
                        </span>
                      </div>

                      <div className={`flex flex-col items-center justify-center ${statBoxPadding} bg-black/25 rounded-xl border border-zinc-900/40`}>
                        <span className="text-[7px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Meilleur</span>
                        <span className={`font-extrabold text-yellow-500 ${statTextSize}`}>
                          {player.bestRound !== undefined && player.bestRound > 0 ? player.bestRound : '-'}
                        </span>
                      </div>

                      <div className={`flex flex-col items-center justify-center ${statBoxPadding} bg-black/25 rounded-xl border border-zinc-900/40`}>
                        <span className="text-[7px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Lancers</span>
                        <span className={`font-extrabold text-zinc-300 ${statTextSize}`}>{player.throwsCount}</span>
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

      </div>
    </div>
  );
};
