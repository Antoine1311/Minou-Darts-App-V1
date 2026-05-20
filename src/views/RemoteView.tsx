import React, { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { Menu, X, ArrowLeft, Play, Pause, RotateCcw, ShieldAlert, Check, Plus, Trash2, Smartphone, Users } from 'lucide-react';
import { roomService, RoomData } from '../services/roomService';

export const RemoteView: React.FC = () => {
  const { theme } = useTheme();
  
  // États de la télécommande
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [roomIdInput, setRoomIdInput] = useState<string>('');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // États pour l'édition de la partie dans la phase Setup
  const [newPlayerName, setNewPlayerName] = useState<string>('');
  
  // États de saisie des points
  const [currentInput, setCurrentInput] = useState<string>('');
  const [multiplier, setMultiplier] = useState<'S' | 'D' | 'T'>('S'); // Simple, Double, Triple

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

  // S'abonner au salon une fois connecté
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
        console.error("Erreur de liaison Firestore :", err);
        setError("Code de salon invalide ou session expirée.");
        setRoomId(null);
        setRoom(null);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [roomId]);

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

  // Ajouter un joueur au salon (Setup)
  const handleAddPlayer = async () => {
    if (!room || !newPlayerName.trim()) return;
    
    const updatedPlayers = [
      ...room.players,
      {
        name: newPlayerName.trim(),
        score: room.targetScore,
        avg: 0,
        dartsLeft: 3,
        throwsCount: 0,
        totalPoints: 0,
        history: []
      }
    ];

    // Si on ajoute le tout premier joueur réel, on peut remplacer le "Joueur 1" par défaut
    if (room.players.length === 1 && room.players[0].name === 'Joueur 1') {
      updatedPlayers.shift(); // Supprimer "Joueur 1"
      updatedPlayers.unshift({
        name: newPlayerName.trim(),
        score: room.targetScore,
        avg: 0,
        dartsLeft: 3,
        throwsCount: 0,
        totalPoints: 0,
        history: []
      });
    }

    await roomService.updateRoom(room.roomId, { players: updatedPlayers });
    setNewPlayerName('');
  };

  // Supprimer un joueur (Setup)
  const handleRemovePlayer = async (index: number) => {
    if (!room) return;
    const updatedPlayers = [...room.players];
    updatedPlayers.splice(index, 1);
    await roomService.updateRoom(room.roomId, { players: updatedPlayers });
  };

  // Changer le score cible (301 vs 501)
  const handleChangeTargetScore = async (score: number) => {
    if (!room) return;
    const updatedPlayers = room.players.map(p => ({
      ...p,
      score: score
    }));
    await roomService.updateRoom(room.roomId, { 
      targetScore: score,
      players: updatedPlayers
    });
  };

  // Lancer officiellement la partie (Setup -> Playing)
  const handleStartGame = async () => {
    if (!room || room.players.length === 0) return;
    await roomService.updateRoom(room.roomId, { status: 'playing' });
  };

  // Enregistrer le score d'une fléchette lancée
  const handleValidateThrow = async () => {
    if (!room) return;

    let points = parseInt(currentInput || '0', 10);
    
    // Appliquer le multiplicateur
    if (multiplier === 'D') points *= 2;
    if (multiplier === 'T') points *= 3;

    try {
      await roomService.recordThrow(room.roomId, room, points);
      
      // Réinitialiser la saisie locale
      setCurrentInput('');
      setMultiplier('S');
    } catch (err) {
      console.error(err);
      setError("Erreur lors de la validation du lancer.");
    }
  };

  // Pavé numérique de fléchettes standard
  const numbers = [
    20, 1, 18, 4,
    13, 6, 10, 15,
    2, 17, 3, 19,
    7, 16, 8, 11,
    14, 9, 12, 5
  ];

  // Trier les numéros dans l'ordre croissant pour l'ergonomie mobile
  const sortedNumbers = [...numbers].sort((a, b) => b - a);

  // --- RENDU 1 : ÉCRAN DE CONNEXION AU SALON (LIAISON) ---
  if (!roomId || !room) {
    return (
      <div className="min-h-screen bg-theme-bg text-theme-text-primary transition-all duration-300 flex flex-col justify-center items-center p-6 select-none">
        <div className="w-full max-w-md bg-black/30 border border-theme-border/50 rounded-3xl p-8 backdrop-blur-md shadow-2xl flex flex-col items-center">
          
          <div className="p-4 bg-theme-accent/15 text-theme-accent rounded-full mb-6">
            <Smartphone className="w-12 h-12" />
          </div>

          <h1 className={`text-2xl font-black mb-2 tracking-wide text-center ${theme === 'arcade' ? 'font-mono text-theme-accent' : ''}`}>
            LIAISON TÉLÉCOMMANDE
          </h1>
          <p className="text-xs text-theme-text-secondary text-center mb-8 max-w-xs leading-relaxed">
            Entrez le code à 4 lettres affiché sur votre écran de Vidéoprojecteur pour coupler cet appareil en direct.
          </p>

          <form onSubmit={handleJoinRoom} className="w-full space-y-4">
            <div>
              <input
                type="text"
                placeholder="EX: A9FT"
                maxLength={4}
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
                className="w-full py-4 bg-black/40 border-2 border-theme-border rounded-xl text-center text-3xl font-bold tracking-[0.4em] uppercase text-theme-accent focus:border-theme-accent focus:outline-none transition-all placeholder:text-theme-border/50"
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

          <a href="#/" className="mt-6 text-xs text-theme-text-secondary/70 hover:text-theme-accent transition-colors flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Retour à l'accueil
          </a>
        </div>
      </div>
    );
  }

  // Joueurs et scores
  const players = room.players;
  const activePlayerIndex = room.activePlayerIndex;
  const activePlayer = players[activePlayerIndex];

  // --- RENDU 2 : FORMULAIRE DE CONFIGURATION DU SALON (SETUP) ---
  if (room.status === 'setup') {
    return (
      <div className="min-h-screen bg-theme-bg text-theme-text-primary transition-all duration-300 flex flex-col justify-between select-none">
        <header className="p-4 bg-black/40 border-b border-theme-border/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => { setRoomId(null); setRoom(null); }} 
              className="p-1.5 rounded-lg bg-black/20 text-theme-text-secondary border border-theme-border/20"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-sm font-black tracking-wide">SALON : {room.roomId}</h1>
              <p className="text-[9px] text-theme-text-secondary uppercase">Configuration</p>
            </div>
          </div>
          <span className="text-[10px] bg-theme-accent/20 text-theme-accent font-bold px-2 py-0.5 rounded">
            En Attente
          </span>
        </header>

        <main className="flex-grow p-6 max-w-md mx-auto w-full space-y-8">
          {/* Sélection du score cible */}
          <div>
            <label className="block text-xs font-bold text-theme-text-secondary uppercase tracking-widest mb-3 text-center">Score Cible</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => handleChangeTargetScore(301)}
                className={`py-3 rounded-xl border text-sm font-bold transition-all ${
                  room.targetScore === 301 
                    ? 'bg-theme-accent text-black border-theme-accent font-extrabold shadow-md' 
                    : 'bg-black/20 border-theme-border/20 text-theme-text-primary'
                }`}
              >
                301 points
              </button>
              <button
                onClick={() => handleChangeTargetScore(501)}
                className={`py-3 rounded-xl border text-sm font-bold transition-all ${
                  room.targetScore === 501 
                    ? 'bg-theme-accent text-black border-theme-accent font-extrabold shadow-md' 
                    : 'bg-black/20 border-theme-border/20 text-theme-text-primary'
                }`}
              >
                501 points
              </button>
            </div>
          </div>

          {/* Gestion des joueurs */}
          <div className="space-y-4">
            <label className="block text-xs font-bold text-theme-text-secondary uppercase tracking-widest mb-2 flex items-center gap-2">
              <Users className="w-4 h-4 text-theme-accent" /> Ajouter des Joueurs
            </label>
            
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nom du joueur (ex: Alexandre)"
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddPlayer()}
                className="flex-grow p-3.5 bg-black/40 border border-theme-border rounded-xl focus:border-theme-accent focus:outline-none font-semibold text-sm"
              />
              <button
                onClick={handleAddPlayer}
                className="p-3.5 bg-theme-accent text-black font-extrabold rounded-xl transition-all hover:scale-105 active:scale-95"
              >
                <Plus className="w-5 h-5 stroke-[3px]" />
              </button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {players.map((p, idx) => (
                <div key={idx} className="flex items-center justify-between p-3.5 bg-black/20 border border-theme-border/20 rounded-xl">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-black/40 text-theme-text-secondary text-xs font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-theme-text-primary">{p.name}</span>
                  </div>
                  
                  {players.length > 1 && (
                    <button
                      onClick={() => handleRemovePlayer(idx)}
                      className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </main>

        <footer className="p-6 max-w-md mx-auto w-full">
          <button
            onClick={handleStartGame}
            disabled={players.length === 0}
            className="w-full py-4 bg-theme-accent hover:bg-theme-accent-hover text-black font-black text-sm rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
          >
            <Play className="w-5 h-5 fill-current" /> ALLUMER LA CIBLE & COMMENCER
          </button>
        </footer>
      </div>
    );
  }

  // --- RENDU 3 : PARTIE TERMINÉE (FIN) ---
  if (room.status === 'finished') {
    return (
      <div className="min-h-screen bg-theme-bg text-theme-text-primary transition-all duration-300 flex flex-col justify-between items-center p-6 select-none">
        <div className="w-full max-w-md bg-black/30 border border-theme-border/50 rounded-3xl p-8 backdrop-blur-md shadow-2xl flex flex-col items-center flex-grow justify-center">
          
          <div className="p-4 bg-theme-accent/10 border-2 border-theme-accent rounded-full mb-6">
            <Check className="w-12 h-12 text-theme-accent stroke-[3px]" />
          </div>

          <h1 className="text-3xl font-black mb-2 tracking-wide text-center">MATCH TERMINÉ</h1>
          <p className="text-xs text-theme-text-secondary text-center mb-6">
            Le vainqueur de ce salon est :
          </p>
          <span className="text-3xl font-black text-theme-accent font-serif tracking-widest mb-8 uppercase">
            {room.winnerName}
          </span>

          <div className="w-full space-y-4">
            <button
              onClick={async () => {
                // Recommencer une nouvelle partie dans le même salon
                const resetPlayers = players.map(p => ({
                  name: p.name,
                  score: room.targetScore,
                  avg: 0,
                  dartsLeft: 3,
                  throwsCount: 0,
                  totalPoints: 0,
                  history: []
                }));
                await roomService.updateRoom(room.roomId, {
                  status: 'setup',
                  activePlayerIndex: 0,
                  players: resetPlayers,
                  winnerName: ''
                });
              }}
              className="w-full py-4 bg-theme-accent hover:bg-theme-accent-hover text-black font-black rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              <RotateCcw className="w-5 h-5 stroke-[3px]" /> REJOUER (MÊME SALON)
            </button>

            <button
              onClick={() => {
                setRoomId(null);
                setRoom(null);
                window.location.hash = '#/remote';
              }}
              className="w-full py-4 bg-black/40 border border-theme-border text-theme-text-primary font-bold rounded-xl transition-all hover:bg-black/60 cursor-pointer"
            >
              QUITTER LE SALON
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDU 4 : EN COURS DE JEU (SAISIE DES POINTS) ---
  return (
    <div className="min-h-screen bg-theme-bg text-theme-text-primary transition-all duration-300 flex flex-col justify-between relative overflow-hidden select-none">
      
      {/* --- EN-TÊTE --- */}
      <header className="p-4 bg-black/40 border-b border-theme-border/30 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => { setRoomId(null); setRoom(null); }} 
            className="p-1.5 rounded-lg bg-black/20 border border-theme-border/20 text-theme-text-secondary hover:text-theme-accent transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className={`text-base font-black tracking-wide ${theme === 'arcade' ? 'font-mono text-theme-accent' : ''}`}>
              SALON : {room.roomId}
            </h1>
            <p className="text-[10px] text-theme-text-secondary uppercase tracking-widest">En cours de jeu</p>
          </div>
        </div>

        {/* Bouton Menu Burger */}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="p-2 rounded-xl bg-theme-accent/10 border border-theme-accent/30 text-theme-accent hover:bg-theme-accent/20 transition-all duration-200"
          title="Menu de jeu"
        >
          {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* --- ZONE D'AFFICHAGE DU TOUR EN COURS --- */}
      <div className="p-4 bg-black/20 border-b border-theme-border/20 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-theme-text-secondary uppercase tracking-wider font-semibold">
          <span>Joueur Actif: <strong className="text-theme-accent font-extrabold">{activePlayer?.name}</strong></span>
          <span>Score restant: <strong className="text-theme-accent font-extrabold">{activePlayer?.score}</strong></span>
        </div>

        {/* Fléchettes jetées et Saisie courante */}
        <div className="grid grid-cols-4 gap-2 items-center">
          {/* Fléchette 1 */}
          <div className="bg-black/30 border border-theme-border/20 rounded-xl p-2 text-center">
            <span className="block text-[7px] text-theme-text-secondary uppercase">Dart 1</span>
            <span className="font-bold text-xs text-theme-text-primary">
              {activePlayer?.dartsLeft <= 2 ? (activePlayer.history[activePlayer.history.length - (3 - activePlayer.dartsLeft)] ?? '-') : '-'}
            </span>
          </div>
          {/* Fléchette 2 */}
          <div className="bg-black/30 border border-theme-border/20 rounded-xl p-2 text-center">
            <span className="block text-[7px] text-theme-text-secondary uppercase">Dart 2</span>
            <span className="font-bold text-xs text-theme-text-primary">
              {activePlayer?.dartsLeft <= 1 ? (activePlayer.history[activePlayer.history.length - (2 - activePlayer.dartsLeft)] ?? '-') : '-'}
            </span>
          </div>
          {/* Fléchette 3 */}
          <div className="bg-black/30 border border-theme-border/20 rounded-xl p-2 text-center">
            <span className="block text-[7px] text-theme-text-secondary uppercase">Dart 3</span>
            <span className="font-bold text-xs text-theme-text-primary">
              {activePlayer?.dartsLeft === 0 ? (activePlayer.history[activePlayer.history.length - 1] ?? '-') : '-'}
            </span>
          </div>

          {/* Entrée active du tir en cours */}
          <div className="bg-theme-accent/10 border border-theme-accent/30 rounded-xl p-2 text-center relative">
            <span className="block text-[7px] text-theme-accent uppercase font-bold">Saisie</span>
            <span className={`font-black text-xs text-theme-accent ${theme === 'arcade' ? 'font-mono' : ''}`}>
              {multiplier !== 'S' ? multiplier : ''}{currentInput || '0'}
            </span>
          </div>
        </div>
      </div>

      {/* --- BLOC CENTRAL : PAVÉ NUMÉRIQUE & BOUTONS DE SAISIE --- */}
      <main className="flex-1 p-4 flex flex-col justify-center gap-4 max-w-lg mx-auto w-full">
        
        {/* Modificateurs de Multiplicateur (S, D, T) */}
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => setMultiplier('S')}
            className={`py-3 rounded-xl border text-sm font-bold transition-all duration-200 cursor-pointer ${
              multiplier === 'S'
                ? 'bg-theme-accent text-black border-theme-accent font-extrabold shadow-md'
                : 'bg-black/30 border-theme-border/20 text-theme-text-primary hover:border-theme-accent/40'
            }`}
          >
            Simple
          </button>
          <button
            onClick={() => setMultiplier('D')}
            className={`py-3 rounded-xl border text-sm font-bold transition-all duration-200 cursor-pointer ${
              multiplier === 'D'
                ? 'bg-theme-accent text-black border-theme-accent font-extrabold shadow-md'
                : 'bg-black/30 border-theme-border/20 text-theme-text-primary hover:border-theme-accent/40'
            }`}
          >
            Double
          </button>
          <button
            onClick={() => setMultiplier('T')}
            className={`py-3 rounded-xl border text-sm font-bold transition-all duration-200 cursor-pointer ${
              multiplier === 'T'
                ? 'bg-theme-accent text-black border-theme-accent font-extrabold shadow-md'
                : 'bg-black/30 border-theme-border/20 text-theme-text-primary hover:border-theme-accent/40'
            }`}
          >
            Triple
          </button>
        </div>

        {/* Grille des secteurs de la cible (20 numéros principaux) */}
        <div className="grid grid-cols-4 gap-2 flex-1 max-h-[380px] min-h-[220px]">
          {sortedNumbers.map((num) => (
            <button
              key={num}
              onClick={() => setCurrentInput(num.toString())}
              className={`rounded-xl border bg-black/20 border-theme-border/20 text-theme-text-primary hover:border-theme-accent hover:bg-theme-accent/5 font-extrabold text-base flex items-center justify-center transition-all duration-150 cursor-pointer active:scale-95 ${
                theme === 'arcade' ? 'font-mono' : ''
              }`}
            >
              {num}
            </button>
          ))}
        </div>

        {/* Ligne Spécifique : Bull, Miss et Validation */}
        <div className="grid grid-cols-3 gap-3">
          {/* Bull */}
          <button
            onClick={() => setCurrentInput('25')}
            className="py-4 rounded-xl border border-red-900/40 bg-red-950/20 text-red-500 hover:bg-red-950/40 font-black text-sm transition-all duration-150 cursor-pointer active:scale-95"
          >
            BULL (25)
          </button>

          {/* Manqué (Miss) */}
          <button
            onClick={() => setCurrentInput('0')}
            className="py-4 rounded-xl border border-gray-800/40 bg-gray-900/20 text-gray-400 hover:bg-gray-900/40 font-bold text-sm transition-all duration-150 cursor-pointer active:scale-95"
          >
            MANQUÉ
          </button>

          {/* Valider la fléchette */}
          <button
            onClick={handleValidateThrow}
            className="py-4 rounded-xl bg-theme-accent hover:bg-theme-accent-hover text-black font-extrabold text-sm flex items-center justify-center gap-1.5 transition-all duration-150 shadow-lg cursor-pointer active:scale-95"
          >
            <Check className="w-4 h-4 stroke-[3px]" /> OK
          </button>
        </div>

      </main>

      {/* --- MENU CONTEXTUEL / BURGER SLIDEOUT --- */}
      {isMenuOpen && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-30 flex flex-col justify-end">
          <div className="bg-theme-bg border-t border-theme-border p-6 rounded-t-3xl max-w-lg mx-auto w-full space-y-6">
            
            <div className="flex items-center justify-between pb-4 border-b border-theme-border/30">
              <h2 className={`text-lg font-black tracking-wide ${theme === 'arcade' ? 'font-mono text-theme-accent' : ''}`}>
                CONTRÔLE DE LA PARTIE
              </h2>
              <button 
                onClick={() => setIsMenuOpen(false)}
                className="p-1.5 rounded-full bg-black/40 text-theme-text-secondary border border-theme-border/20 hover:text-theme-accent transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              
              {/* Statut de la partie */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-theme-border/20 text-xs">
                <span className="text-theme-text-secondary">Statut Actuel :</span>
                <span className="font-bold px-2 py-0.5 rounded text-[10px] uppercase bg-green-500/20 text-green-500">
                  En cours
                </span>
              </div>

              {/* Bouton Annuler le tour (Undo) - très utile en cas d'erreur de frappe ! */}
              <button
                onClick={async () => {
                  if (!room || activePlayer.history.length === 0) return;
                  
                  const updatedPlayers = [...room.players];
                  const player = { ...updatedPlayers[activePlayerIndex] };
                  
                  // Retirer le dernier lancer de l'historique
                  const lastThrow = player.history.pop();
                  if (lastThrow !== undefined) {
                    player.score += lastThrow;
                    player.throwsCount -= 1;
                    player.totalPoints -= lastThrow;
                    
                    // Rétablir le nombre de fléchettes du tour
                    if (player.dartsLeft === 3) {
                      // On a déjà changé de joueur ! Donc l'annulation doit être réfléchie.
                      // Pour simplifier dans ce prototype, on annule seulement sur le tour en cours.
                      player.dartsLeft = 1;
                    } else {
                      player.dartsLeft += 1;
                    }

                    if (player.throwsCount > 0) {
                      player.avg = parseFloat(((player.totalPoints / player.throwsCount) * 3).toFixed(1));
                    } else {
                      player.avg = 0;
                    }
                  }

                  updatedPlayers[activePlayerIndex] = player;
                  await roomService.updateRoom(room.roomId, { players: updatedPlayers });
                  setIsMenuOpen(false);
                }}
                disabled={!activePlayer || activePlayer.history.length === 0}
                className="w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 bg-amber-500/10 border border-amber-500/40 text-amber-500 hover:bg-amber-500/20 disabled:opacity-40 transition-all duration-200 cursor-pointer"
              >
                <RotateCcw className="w-5 h-5" /> Annuler le dernier lancer
              </button>

              {/* Bouton Annuler la partie (Abort) */}
              <button
                onClick={async () => {
                  if (confirm('Voulez-vous vraiment annuler la partie ? Les statistiques seront perdues.')) {
                    await roomService.updateRoom(room.roomId, { status: 'setup' });
                    setIsMenuOpen(false);
                  }
                }}
                className="w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 bg-red-500/10 border border-red-500/40 text-red-500 hover:bg-red-500/20 transition-all duration-200 cursor-pointer"
              >
                <ShieldAlert className="w-5 h-5" /> Réinitialiser le match (Setup)
              </button>

            </div>

          </div>
        </div>
      )}

    </div>
  );
};
