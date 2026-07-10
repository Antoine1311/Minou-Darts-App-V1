const fs = require('fs');
const path = require('path');

const viewFile = path.join(__dirname, 'src/views/RemoteView.tsx');
let content = fs.readFileSync(viewFile, 'utf8');

const lines = content.split('\n');

// 1. Find state block
let stateStart = lines.findIndex(l => l.includes('const [setupStep, setSetupStep]'));
let stateEnd = lines.findIndex(l => l.includes('const [x01InputMethod, setX01InputMethod]'));

// 2. Find functions
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

const handleAdd = findFunction('handleAddNewPlayer');
const handleRem = findFunction('handleRemovePlayer');
const handleSel = findFunction('handleSelectPlayer');
// For handleStartGame, the previous script found it well. Let's find it again.
const handleStart = findFunction('handleStartGame');

// 3. Find JSX block
let jsxStart = lines.findIndex(l => l.includes('// --- RENDU 2 : FORMULAIRE DE CONFIGURATION DU SALON (SETUP) ---'));
let jsxEnd = lines.findIndex(l => l.includes('// --- RENDU 3 : PARTIE TERMINÉE (FIN) ---')) - 1;

// Now let's build the new file content by skipping these parts
let newLines = [];
let i = 0;
while (i < lines.length) {
  // Add imports at the very beginning
  if (i === 1) {
    newLines.push(`import { RemoteSetupPhase } from './RemoteSetupPhase';`);
  }

  // Skip states
  if (i >= stateStart && i < stateEnd) {
    i++;
    continue;
  }
  // Also skip linkCopied and isSubmitting if possible? No wait, linkCopied is used in RemoteView for the projector link inside playing phase?
  // Let's check if linkCopied is used elsewhere. Yes, at line 1338 (in renderExitModal or somewhere?). It was in the Setup phase!
  // Let's remove linkCopied state and isSubmitting state.
  if (lines[i].includes('const [linkCopied, setLinkCopied]') || lines[i].includes('const [isSubmitting, setIsSubmitting]')) {
    i++;
    continue;
  }

  // Skip functions
  if (i >= handleAdd.start && i <= handleAdd.end) { i++; continue; }
  if (i >= handleRem.start && i <= handleRem.end) { i++; continue; }
  if (i >= handleSel.start && i <= handleSel.end) { i++; continue; }
  if (i >= handleStart.start && i <= handleStart.end) { i++; continue; }

  // Skip JSX and replace with component
  if (i === jsxStart) {
    newLines.push(`  // --- RENDU 2 : FORMULAIRE DE CONFIGURATION DU SALON (SETUP) ---
  if (currentRoom?.status === 'setup') {
    return (
      <RemoteSetupPhase
        roomId={roomId}
        isLocalMode={isLocalMode}
        currentRoom={currentRoom}
        onUpdateRoom={async (data) => {
          if (isLocalMode) {
            setLocalRoom(prev => prev ? { ...prev, ...data } as RoomData : null);
          } else if (roomId) {
            await roomService.updateRoom(roomId, data);
          }
        }}
        onExit={() => {
          setRoomId(null);
          setRoom(null);
          setIsLocalMode(false);
          setLocalRoom(null);
        }}
        setShowProjectorSettingsModal={setShowProjectorSettingsModal}
        showCalibrationPanel={showCalibrationPanel}
        setShowCalibrationPanel={setShowCalibrationPanel}
        remoteProjectorMode={remoteProjectorMode}
        setRemoteProjectorModeAndSync={setRemoteProjectorModeAndSync}
      />
    );
  }`);
    i = jsxEnd + 1;
    continue;
  }

  newLines.push(lines[i]);
  i++;
}

fs.writeFileSync(viewFile, newLines.join('\n'));
console.log('RemoteView cleaned.');
