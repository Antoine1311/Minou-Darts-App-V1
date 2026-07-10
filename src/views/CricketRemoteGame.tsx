import React, { useState } from 'react';
import { ArrowLeft, Settings, Tv } from 'lucide-react';
import type { RoomData } from '../services/roomService';
import { roomService } from '../services/roomService';
import { processCricketThrow } from '../services/cricketEngine';

interface CricketRemoteGameProps {
  currentRoom: RoomData;
  isLocalMode: boolean;
  roomId: string | null;
  setLocalRoom: (updater: any) => void;
  setShowExitModal: (v: boolean) => void;
  setShowProjectionModal: (v: boolean) => void;
  setShowProjectorSettingsModal: (v: boolean) => void;
  setShowCalibrationPanel: (v: boolean) => void;
  updateRoomState: (data: Partial<RoomData>) => void;
  error: string | null;
  multiplier: 'S' | 'D' | 'T';
  setMultiplier: (m: 'S' | 'D' | 'T') => void;
  handleCricketUndo: () => Promise<void>;
}

export const CricketRemoteGame: React.FC<CricketRemoteGameProps> = ({
  currentRoom,
  isLocalMode,
  roomId,
  setLocalRoom,
  setShowExitModal,
  setShowProjectionModal,
  setShowProjectorSettingsModal,
  setShowCalibrationPanel,
  updateRoomState,
  error,
  multiplier,
  setMultiplier,
  handleCricketUndo
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const players = currentRoom.players || [];
  const activePlayerIndex = currentRoom.activePlayerIndex ?? 0;
  
  const cricketTargets = currentRoom?.cricketTargets || [];

  const handleCricketThrow = async (baseNumber: number) => {
    if (!currentRoom || isSubmitting) return;
    setIsSubmitting(true);

    // Convertir le multiplicateur lettre en chiffre
    const multMap = { 'S': 1, 'D': 2, 'T': 3 } as const;
    const mult = multMap[multiplier];

    try {
      if (isLocalMode) {
        const { updatedRoom } = processCricketThrow(currentRoom, baseNumber, mult);
        setLocalRoom((prev: any) => {
          if (!prev) return null;
          return {
            ...prev,
            ...updatedRoom
          } as RoomData;
        });
      } else if (roomId && currentRoom) {
        await roomService.recordCricketThrow(roomId, currentRoom, baseNumber, mult);
      }
      setMultiplier('S');
    } catch (err) {
      console.error(err);
      console.error("Erreur lors de la validation du lancer Cricket.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
            {/* Bouton ⚙️ Paramètres Projecteur */}
            <button
              onClick={() => { 
                setShowProjectorSettingsModal(true); 
                setShowCalibrationPanel(false); 
                updateRoomState({ isCalibrating: false });
                localStorage.setItem('minou_dart_is_calibrating', 'false');
              }}
              title="Paramètres du projecteur"
              className="p-1.5 bg-zinc-900/80 border border-zinc-700/50 hover:border-[#22c55e]/60 hover:bg-zinc-800 text-zinc-500 hover:text-[#22c55e] rounded-lg transition-all cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {error && (
          <div className="bg-red-500/10 border-b border-red-500/30 py-2.5 px-4 text-xs text-red-400 text-center font-medium flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {error}
          </div>
        )}

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
                          className={`w-full py-4 px-1 rounded-xl font-black text-lg text-center cursor-pointer transition-all active:scale-95 disabled:opacity-50 relative overflow-hidden ${targetBgClass}`}
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
      </div>
    );
};
