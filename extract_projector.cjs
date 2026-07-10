const fs = require('fs');
const path = require('path');

const viewFile = path.join(__dirname, 'src/views/RemoteView.tsx');
const settingsFile = path.join(__dirname, 'src/views/RemoteProjectorSettings.tsx');

let content = fs.readFileSync(viewFile, 'utf8');
const lines = content.split('\n');

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

const renderProj = findFunction('renderProjectorSettingsModal');

if (renderProj.start === -1) {
  console.log("Could not find renderProjectorSettingsModal");
  process.exit(1);
}

const componentProps = `import React from 'react';
import { ArrowLeft, Settings, X, Tv, Maximize2, Sparkles, ChevronRight, RotateCcw } from 'lucide-react';
import type { RoomData, CalibrationSettings } from '../services/roomService';

interface RemoteProjectorSettingsProps {
  showProjectorSettingsModal: boolean;
  setShowProjectorSettingsModal: (v: boolean) => void;
  showCalibrationPanel: boolean;
  setShowCalibrationPanel: (v: boolean) => void;
  updateRoomState: (data: Partial<RoomData>) => void;
  remoteProjectorMode: 'classic' | 'fullscreen' | 'ar';
  setRemoteProjectorModeAndSync: (mode: 'classic' | 'fullscreen' | 'ar') => void;
  remoteCalibrationStep: number;
  setRemoteCalibrationStep: (v: number) => void;
  remoteCalibration: CalibrationSettings;
  getRemoteStepSliderValue: () => number;
  handleRemoteSliderChange: (val: number) => void;
  adjustRemoteCalibration: (type: 'move-x' | 'move-y' | 'scale-step' | 'stats-move-x' | 'stats-move-y', delta: number) => void;
  saveRemoteCalibration: (cal: CalibrationSettings) => void;
  resetRemoteTabParameters: (step: number) => void;
}

export const RemoteProjectorSettings: React.FC<RemoteProjectorSettingsProps> = ({
  showProjectorSettingsModal,
  setShowProjectorSettingsModal,
  showCalibrationPanel,
  setShowCalibrationPanel,
  updateRoomState,
  remoteProjectorMode,
  setRemoteProjectorModeAndSync,
  remoteCalibrationStep,
  setRemoteCalibrationStep,
  remoteCalibration,
  getRemoteStepSliderValue,
  handleRemoteSliderChange,
  adjustRemoteCalibration,
  saveRemoteCalibration,
  resetRemoteTabParameters
}) => {
`;

// remove "const renderProjectorSettingsModal = () => {" and last "};"
let jsxBody = lines.slice(renderProj.start + 1, renderProj.end).join('\n');

const componentStr = componentProps + jsxBody + '\n};\n';

fs.writeFileSync(settingsFile, componentStr);

// Now rewrite RemoteView to use it.
let newLines = [];
let i = 0;
while(i < lines.length) {
  if (i === 1) {
    newLines.push(`import { RemoteProjectorSettings } from './RemoteProjectorSettings';`);
  }
  
  if (i === renderProj.start) {
    newLines.push(`  const renderProjectorSettingsModal = () => (
    <RemoteProjectorSettings
      showProjectorSettingsModal={showProjectorSettingsModal}
      setShowProjectorSettingsModal={setShowProjectorSettingsModal}
      showCalibrationPanel={showCalibrationPanel}
      setShowCalibrationPanel={setShowCalibrationPanel}
      updateRoomState={updateRoomState}
      remoteProjectorMode={remoteProjectorMode}
      setRemoteProjectorModeAndSync={setRemoteProjectorModeAndSync}
      remoteCalibrationStep={remoteCalibrationStep}
      setRemoteCalibrationStep={setRemoteCalibrationStep}
      remoteCalibration={remoteCalibration}
      getRemoteStepSliderValue={getRemoteStepSliderValue}
      handleRemoteSliderChange={handleRemoteSliderChange}
      adjustRemoteCalibration={adjustRemoteCalibration}
      saveRemoteCalibration={saveRemoteCalibration}
      resetRemoteTabParameters={resetRemoteTabParameters}
    />
  );`);
    i = renderProj.end + 1;
    continue;
  }
  newLines.push(lines[i]);
  i++;
}

fs.writeFileSync(viewFile, newLines.join('\n'));
console.log('Projector settings extracted.');
