const fs = require('fs');
const path = require('path');

const viewFile = path.join(__dirname, 'src/views/RemoteView.tsx');
const finishedFile = path.join(__dirname, 'src/views/RemoteFinishedPhase.tsx');
const cricketFile = path.join(__dirname, 'src/views/CricketRemoteGame.tsx');

let content = fs.readFileSync(viewFile, 'utf8');
const lines = content.split('\n');

// 1. EXTRACT FINISHED PHASE
let finishedStart = lines.findIndex(l => l.includes("if (currentRoom?.status === 'finished') {"));
let count = 0;
let finishedEnd = -1;
for (let i = finishedStart; i < lines.length; i++) {
  if (lines[i].includes('{')) count += (lines[i].match(/\{/g) || []).length;
  if (lines[i].includes('}')) count -= (lines[i].match(/\}/g) || []).length;
  if (count === 0 && i > finishedStart) {
    finishedEnd = i;
    break;
  }
}

const finishedStr = `import React, { useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import type { RoomData } from '../services/roomService';
import { roomService, getGameHighlights } from '../services/roomService';

interface RemoteFinishedPhaseProps {
  currentRoom: RoomData;
  isLocalMode: boolean;
  roomId: string | null;
  setLocalRoom: (room: RoomData | null) => void;
  updateRoomState: (data: Partial<RoomData>) => void;
  setRoomId: (id: string | null) => void;
  setRoom: (room: RoomData | null) => void;
  handleCricketUndo: () => Promise<void>;
}

export const RemoteFinishedPhase: React.FC<RemoteFinishedPhaseProps> = ({
  currentRoom,
  isLocalMode,
  roomId,
  setLocalRoom,
  updateRoomState,
  setRoomId,
  setRoom,
  handleCricketUndo
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
${lines.slice(finishedStart + 1, finishedEnd).join('\n')}
};
`;
fs.writeFileSync(finishedFile, finishedStr);

// 2. EXTRACT CRICKET
let cricketStart = lines.findIndex(l => l.includes("if (isCricket) {"));
count = 0;
let cricketEnd = -1;
for (let i = cricketStart; i < lines.length; i++) {
  if (lines[i].includes('{')) count += (lines[i].match(/\{/g) || []).length;
  if (lines[i].includes('}')) count -= (lines[i].match(/\}/g) || []).length;
  if (count === 0 && i > cricketStart) {
    cricketEnd = i;
    break;
  }
}

// Find handleCricketThrow
const findFunction = (name) => {
  let start = lines.findIndex(l => l.includes(`const ${name} = `));
  if (start === -1) return {start: -1, end: -1};
  let c = 0;
  let end = -1;
  for (let i = start; i < lines.length; i++) {
    if (lines[i].includes('{')) c += (lines[i].match(/\{/g) || []).length;
    if (lines[i].includes('}')) c -= (lines[i].match(/\}/g) || []).length;
    if (c === 0 && i > start) {
      end = i;
      break;
    }
  }
  return {start, end};
};

const cricketThrow = findFunction('handleCricketThrow');
const cricketUndo = findFunction('handleCricketUndo');
let targetsStart = lines.findIndex(l => l.includes("const cricketTargets = currentRoom?.cricketTargets || [20, 19, 18, 17, 16, 15, 25];"));

const cricketStr = `import React, { useState, useEffect, useRef } from 'react';
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
  
${lines[targetsStart]}

${lines.slice(cricketThrow.start, cricketThrow.end + 1).join('\n')}

${lines.slice(cricketStart + 1, cricketEnd).join('\n').replace(/return \(/, 'return (')}
};
`;
fs.writeFileSync(cricketFile, cricketStr);

// 3. REWRITE RemoteView.tsx
let newLines = [];
let i = 0;
while (i < lines.length) {
  if (i === 1) {
    newLines.push(`import { RemoteFinishedPhase } from './RemoteFinishedPhase';`);
    newLines.push(`import { CricketRemoteGame } from './CricketRemoteGame';`);
  }
  
  if (i === targetsStart) { i++; continue; }
  if (i >= cricketThrow.start && i <= cricketThrow.end) { i++; continue; }
  if (i >= cricketUndo.start && i <= cricketUndo.end) {
    // wait, handleCricketUndo is passed as a prop to both! We must keep it in RemoteView!
    // But we already passed it. Let me just keep it in RemoteView.
  }
  
  if (i === finishedStart) {
    newLines.push(`  // --- RENDU 3 : PARTIE TERMINÉE (FIN) ---
  if (currentRoom?.status === 'finished') {
    return (
      <RemoteFinishedPhase
        currentRoom={currentRoom}
        isLocalMode={isLocalMode}
        roomId={roomId}
        setLocalRoom={setLocalRoom}
        updateRoomState={updateRoomState}
        setRoomId={setRoomId}
        setRoom={setRoom}
        handleCricketUndo={handleCricketUndo}
      />
    );
  }`);
    i = finishedEnd;
    continue;
  }
  
  if (i === cricketStart) {
    newLines.push(`  // Rendu spécifique au Cricket
  if (isCricket) {
    return (
      <>
        <CricketRemoteGame
          currentRoom={currentRoom}
          isLocalMode={isLocalMode}
          roomId={roomId}
          setLocalRoom={setLocalRoom}
          setShowExitModal={setShowExitModal}
          setShowProjectionModal={setShowProjectionModal}
          setShowProjectorSettingsModal={setShowProjectorSettingsModal}
          setShowCalibrationPanel={setShowCalibrationPanel}
          updateRoomState={updateRoomState}
          error={error}
          multiplier={multiplier}
          setMultiplier={setMultiplier}
          handleCricketUndo={handleCricketUndo}
        />
        {renderExitModal()}
      </>
    );
  }`);
    i = cricketEnd;
    continue;
  }
  
  newLines.push(lines[i]);
  i++;
}

fs.writeFileSync(viewFile, newLines.join('\n'));
console.log('Final extraction done.');
