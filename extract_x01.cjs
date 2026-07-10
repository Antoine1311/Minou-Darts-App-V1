const fs = require('fs');
const path = require('path');

const viewFile = path.join(__dirname, 'src/views/RemoteView.tsx');
const gameFile = path.join(__dirname, 'src/views/X01RemoteGame.tsx');

let content = fs.readFileSync(viewFile, 'utf8');
const lines = content.split('\n');

// 1. x01InputMethod state
let inputMethodStart = lines.findIndex(l => l.includes("const [x01InputMethod, setX01InputMethod] = useState<'keyboard' | 'target'>"));
let inputMethodEnd = lines.findIndex((l, i) => i > inputMethodStart && l.includes("localStorage.setItem('minou_dart_x01_input_method'"));
inputMethodEnd += 2; // include the closing '};'

// 2. multiplier state
let multiplierIndex = lines.findIndex(l => l.includes("const [multiplier, setMultiplier] = useState<'S' | 'D' | 'T'>('S');"));

// 3. handleThrowDirect
const findFunction = (name) => {
  let start = lines.findIndex(l => l.includes(`const ${name} = `));
  if (start === -1) return {start: -1, end: -1};
  let count = 0;
  let end = -1;
  for (let i = start; i < lines.length; i++) {
    if (lines[i].includes('{')) count += (lines[i].match(/\{/g) || []).length;
    if (lines[i].includes('}')) count -= (lines[i].match(/\}/g) || []).length;
    if (count === 0 && i > start) {
      end = i;
      break;
    }
  }
  return {start, end};
};

const handleThrow = findFunction('handleThrowDirect');
const renderDarts = findFunction('renderX01DartList');

// 4. RENDU X01
let jsxStart = lines.findIndex(l => l.includes("// --- RENDU X01 (Inspiré de la capture d'écran - très similaire, premium) ---"));
let jsxEnd = lines.findIndex((l, i) => i > jsxStart && l.includes("{renderProjectionModal()}"));

// BUILD X01RemoteGame.tsx
const componentStr = `import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Settings, Tv, Eraser, Delete, Undo2 } from 'lucide-react';
import type { RoomData } from '../services/roomService';
import { useGameStore } from '../store/gameStore';

interface X01RemoteGameProps {
  currentRoom: RoomData;
  isLocalMode: boolean;
  setShowExitModal: (v: boolean) => void;
  setShowProjectionModal: (v: boolean) => void;
  setShowProjectorSettingsModal: (v: boolean) => void;
  setShowCalibrationPanel: (v: boolean) => void;
  updateRoomState: (data: Partial<RoomData>) => void;
  error: string | null;
}

export const X01RemoteGame: React.FC<X01RemoteGameProps> = ({
  currentRoom,
  isLocalMode,
  setShowExitModal,
  setShowProjectionModal,
  setShowProjectorSettingsModal,
  setShowCalibrationPanel,
  updateRoomState,
  error
}) => {
  const { recordThrowX01, undoX01 } = useGameStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const players = currentRoom.players || [];
  const activePlayerIndex = currentRoom.activePlayerIndex ?? 0;
  
  const playerListRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!playerListRef.current) return;
    const activeCard = playerListRef.current.querySelector('[data-active-player="true"]');
    if (activeCard) {
      activeCard.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [activePlayerIndex, players]);

${lines.slice(inputMethodStart, inputMethodEnd + 1).join('\n')}
  
  const [multiplier, setMultiplier] = useState<'S' | 'D' | 'T'>('S');

  // Remplace handleThrowDirect de RemoteView par la nouvelle version Zustand optimisée
  const handleThrowDirect = async (basePoints: number, customMultiplier?: 'S' | 'D' | 'T') => {
    if (!currentRoom || isSubmitting) return;

    setIsSubmitting(true);
    let points = basePoints;
    const targetMult = customMultiplier || multiplier;
    const isDouble = targetMult === 'D';

    let label = '';
    if (basePoints === 0) {
      label = '0';
    } else if (basePoints === 25) {
      if (targetMult === 'D') {
        points = 50;
        label = 'D25';
      } else {
        label = '25';
      }
    } else {
      if (targetMult === 'D') {
        points *= 2;
        label = \`D\${basePoints}\`;
      } else if (targetMult === 'T') {
        points *= 3;
        label = \`T\${basePoints}\`;
      } else {
        label = \`\${basePoints}\`;
      }
    }

    try {
      setMultiplier('S');
      await recordThrowX01(points, isDouble, label);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUndo = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await undoX01();
    } catch(err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

${lines.slice(renderDarts.start, renderDarts.end + 1).join('\n')}

${lines.slice(jsxStart, jsxEnd).join('\n').replace(/return \(/, 'return (')}
  );
};
`;

fs.writeFileSync(gameFile, componentStr);

// REWRITE RemoteView.tsx
let newLines = [];
let i = 0;
while(i < lines.length) {
  if (i === 1) {
    newLines.push(`import { X01RemoteGame } from './X01RemoteGame';`);
  }
  
  if (i >= inputMethodStart && i <= inputMethodEnd) { i++; continue; }
  if (i === multiplierIndex) { i++; continue; }
  if (i >= handleThrow.start && i <= handleThrow.end) { i++; continue; }
  if (i >= renderDarts.start && i <= renderDarts.end) { i++; continue; }
  
  if (i === jsxStart) {
    newLines.push(`  // --- RENDU X01 ---
  return (
    <>
      <X01RemoteGame
        currentRoom={currentRoom}
        isLocalMode={isLocalMode}
        setShowExitModal={setShowExitModal}
        setShowProjectionModal={setShowProjectionModal}
        setShowProjectorSettingsModal={setShowProjectorSettingsModal}
        setShowCalibrationPanel={setShowCalibrationPanel}
        updateRoomState={updateRoomState}
        error={error}
      />
      {renderProjectionModal()}
      {renderExitModal()}
    </>
  );`);
    i = lines.findIndex((l, index) => index > jsxStart && l.includes('// --- FIN DU COMPOSANT ---')); 
    if (i === -1) {
       // if we can't find it, we just skip until the end
       let closingBrace = lines.lastIndexOf('};');
       i = closingBrace;
    }
    continue;
  }
  
  newLines.push(lines[i]);
  i++;
}

fs.writeFileSync(viewFile, newLines.join('\n'));
console.log('X01RemoteGame extracted safely.');
