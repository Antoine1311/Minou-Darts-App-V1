const fs = require('fs');
const path = require('path');

const viewFile = path.join(__dirname, 'src/views/RemoteView.tsx');
const setupFile = path.join(__dirname, 'src/views/RemoteSetupPhase.tsx');

let content = fs.readFileSync(viewFile, 'utf8');

// The goal is to just extract the setup step logic and states.
// I will just use regex to extract everything.
// Since it's risky, let me just create RemoteSetupPhase.tsx by reading the file line by line.

const lines = content.split('\n');

// Find the states
let stateStart = lines.findIndex(l => l.includes('const [setupStep, setSetupStep]'));
let stateEnd = lines.findIndex(l => l.includes('const [x01InputMethod, setX01InputMethod]'));

const states = lines.slice(stateStart, stateEnd).join('\n');

// Find the JSX
let jsxStart = lines.findIndex(l => l.includes('// --- RENDU 2 : FORMULAIRE DE CONFIGURATION DU SALON (SETUP) ---'));
let jsxEnd = lines.findIndex(l => l.includes('// --- RENDU 3 : PARTIE TERMINÉE (FIN) ---')) - 1;

// Find handleStartGame
let handleStartGameStart = lines.findIndex(l => l.includes('const handleStartGame = async () => {'));
let handleStartGameEnd = lines.findIndex((l, i) => i > handleStartGameStart && l.trim() === '};' && lines[i-1].includes('setIsSubmitting(false)')) + 1;
// Actually handleStartLocalGame and handleStartGame were merged? In my grep I didn't see handleStartLocalGame.
// Let's extract handleStartGame manually inside the script based on brackets
let bracketCount = 0;
let handleStartStr = '';
for (let i = handleStartGameStart; i < lines.length; i++) {
  handleStartStr += lines[i] + '\n';
  if (lines[i].includes('{')) bracketCount += (lines[i].match(/\{/g) || []).length;
  if (lines[i].includes('}')) bracketCount -= (lines[i].match(/\}/g) || []).length;
  if (bracketCount === 0 && i > handleStartGameStart) {
    break;
  }
}

// Same for handleAddNewPlayer, handleRemovePlayer, handleSelectPlayer
const extractFunction = (name) => {
  let start = lines.findIndex(l => l.includes(`const ${name} = `));
  if (start === -1) return '';
  let count = 0;
  let str = '';
  for (let i = start; i < lines.length; i++) {
    str += lines[i] + '\n';
    if (lines[i].includes('{')) count += (lines[i].match(/\{/g) || []).length;
    if (lines[i].includes('}')) count -= (lines[i].match(/\}/g) || []).length;
    if (count === 0 && i > start) break;
  }
  return str;
}

const handleAdd = extractFunction('handleAddNewPlayer');
const handleRem = extractFunction('handleRemovePlayer');
const handleSel = extractFunction('handleSelectPlayer');

// Also linkCopied state
const linkCopiedState = `  const [linkCopied, setLinkCopied] = useState<boolean>(false);`;
const isSubmittingState = `  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);`;

const newComponent = `import React, { useState, useEffect } from 'react';
import { ArrowLeft, Users, Settings, Tv, Maximize2, Sparkles, ExternalLink, Copy, Check, Target, Crosshair, Clock, RotateCcw } from 'lucide-react';
import type { RoomData, GameType, CricketVariant } from '../services/roomService';
import { playerService } from '../services/playerService';
import type { GlobalPlayer } from '../services/playerService';
import { useAuth } from '../context/AuthContext';
import { generateCricketTargets, createEmptyMarks } from '../services/cricketEngine';
import { createEmptyBartState } from '../services/bartEngine';

interface RemoteSetupPhaseProps {
  roomId: string | null;
  isLocalMode: boolean;
  currentRoom: RoomData;
  onUpdateRoom: (data: Partial<RoomData>) => Promise<void>;
  onExit: () => void;
  setShowProjectorSettingsModal: (v: boolean) => void;
  showCalibrationPanel: boolean;
  setShowCalibrationPanel: (v: boolean) => void;
  remoteProjectorMode: 'classic' | 'fullscreen' | 'ar';
  setRemoteProjectorModeAndSync: (mode: 'classic' | 'fullscreen' | 'ar') => void;
}

export const RemoteSetupPhase: React.FC<RemoteSetupPhaseProps> = ({
  roomId, isLocalMode, currentRoom, onUpdateRoom, onExit,
  setShowProjectorSettingsModal, showCalibrationPanel, setShowCalibrationPanel,
  remoteProjectorMode, setRemoteProjectorModeAndSync
}) => {
  const { user } = useAuth();
${isSubmittingState}
${linkCopiedState}

${states}

${handleAdd}
${handleRem}
${handleSel}

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

  let error = null; // Géré par le parent, mais on peut ajouter un prop si nécessaire

${lines.slice(jsxStart+1, jsxEnd).join('\n').replace(/if\s*\(currentRoom\?.status\s*===\s*'setup'\)\s*\{/g, '').replace(/return \(/, 'return (').slice(0, -1)}
};
`;

fs.writeFileSync(setupFile, newComponent);
console.log('Setup extracted.');
