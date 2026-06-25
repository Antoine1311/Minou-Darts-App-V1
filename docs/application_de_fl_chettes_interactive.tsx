import React, { useState, useEffect, useRef } from 'react';

// --- Constantes & Utilitaires pour la géométrie de la cible ---

// Ordre des numéros sur une cible standard
const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

// Proportions standard d'une cible (par rapport au rayon total jusqu'à l'extérieur du double)
// Rayon total standard = 170mm
const R_BULL_INNER = 6.35 / 170;
const R_BULL_OUTER = 15.9 / 170;
const R_TRIPLE_INNER = 99 / 170;
const R_TRIPLE_OUTER = 107 / 170;
const R_DOUBLE_INNER = 162 / 170;
const R_DOUBLE_OUTER = 1.0; // 170 / 170

// Convertit des coordonnées polaires en cartésiennes
const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
  return {
    x: centerX + (radius * Math.cos(angleInRadians)),
    y: centerY + (radius * Math.sin(angleInRadians)),
  };
};

// Génère le chemin SVG pour un arc de cercle (une "tranche" de segment)
const describeArc = (x, y, innerRadius, outerRadius, startAngle, endAngle) => {
  const startOuter = polarToCartesian(x, y, outerRadius, endAngle);
  const endOuter = polarToCartesian(x, y, outerRadius, startAngle);
  const startInner = polarToCartesian(x, y, innerRadius, endAngle);
  const endInner = polarToCartesian(x, y, innerRadius, startAngle);

  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    'M', startOuter.x, startOuter.y,
    'A', outerRadius, outerRadius, 0, largeArcFlag, 0, endOuter.x, endOuter.y,
    'L', endInner.x, endInner.y,
    'A', innerRadius, innerRadius, 0, largeArcFlag, 1, startInner.x, startInner.y,
    'Z',
  ].join(' ');
};

// --- Composant Principal ---
const App = () => {
  // États du jeu
  const [lastHit, setLastHit] = useState({ region: 'En attente...', score: 0 });
  const [highlightedSegment, setHighlightedSegment] = useState(null); // ID du segment cliqué

  // Paramètres fixes pour une cible centrée dans une viewBox de 1000x1000
  const centerPoint = { x: 500, y: 500 };
  const radius = 450; // Laisse une petite marge autour
  const rotationDeg = 0; // Le 20 est en haut par défaut

  // --- Gestionnaire de clic sur un segment (Mode Jeu) ---
  const handleSegmentClick = (regionName, score, segmentId) => {
    setLastHit({ region: regionName, score });
    setHighlightedSegment(segmentId);
    console.log(`Touché: ${regionName}, Score: ${score}, ID: ${segmentId}`);
  };

  // --- Génération de la cible SVG ---
  const renderDartboard = () => {
    const segments = [];
    const segmentAngle = 360 / 20;

    // 1. Bulle (Bullseye)
    // Bulle Extérieure (Single Bull - 25 points) - Dessinée en premier car plus grande
    segments.push(
      <circle
        key="bull-outer"
        cx={centerPoint.x}
        cy={centerPoint.y}
        r={radius * R_BULL_OUTER}
        fill={highlightedSegment === 'bull-outer' ? 'cyan' : 'green'}
        className="dart-segment bull-outer"
        onClick={() => handleSegmentClick('Simple Bull', 25, 'bull-outer')}
      />
    );
    
    // Bulle Intérieure (Double Bull - 50 points) - Dessinée par-dessus
    segments.push(
      <circle
        key="bull-inner"
        cx={centerPoint.x}
        cy={centerPoint.y}
        r={radius * R_BULL_INNER}
        fill={highlightedSegment === 'bull-inner' ? 'cyan' : 'red'}
        className="dart-segment bull-inner"
        onClick={() => handleSegmentClick('Double Bull', 50, 'bull-inner')}
      />
    );

    // 2. Segments Numérotés (20 tranches)
    SECTORS.forEach((score, index) => {
      const startAngle = index * segmentAngle - 9; // Décale de 9° pour centrer le secteur
      const endAngle = startAngle + segmentAngle;
      const isEven = index % 2 === 0;
      const color1 = isEven ? 'black' : '#e2c08d'; // Noir / Beige pour les simples
      const color2 = isEven ? 'red' : 'green';   // Rouge / Vert pour les doubles/triples

      // Simple Intérieur
      const idInnerSingle = `single-inner-${score}`;
      segments.push(
        <path
          key={idInnerSingle}
          d={describeArc(centerPoint.x, centerPoint.y, radius * R_BULL_OUTER, radius * R_TRIPLE_INNER, startAngle, endAngle)}
          fill={highlightedSegment === idInnerSingle ? 'cyan' : color1}
          className={`dart-segment single-inner s-${score}`}
          onClick={() => handleSegmentClick(`Simple ${score} (Int)`, score, idInnerSingle)}
        />
      );

      // Triple
      const idTriple = `triple-${score}`;
      segments.push(
        <path
          key={idTriple}
          d={describeArc(centerPoint.x, centerPoint.y, radius * R_TRIPLE_INNER, radius * R_TRIPLE_OUTER, startAngle, endAngle)}
          fill={highlightedSegment === idTriple ? 'cyan' : color2}
          className={`dart-segment triple t-${score}`}
          onClick={() => handleSegmentClick(`Triple ${score}`, score * 3, idTriple)}
        />
      );

      // Simple Extérieur
      const idOuterSingle = `single-outer-${score}`;
      segments.push(
        <path
          key={idOuterSingle}
          d={describeArc(centerPoint.x, centerPoint.y, radius * R_TRIPLE_OUTER, radius * R_DOUBLE_INNER, startAngle, endAngle)}
          fill={highlightedSegment === idOuterSingle ? 'cyan' : color1}
          className={`dart-segment single-outer s-${score}`}
          onClick={() => handleSegmentClick(`Simple ${score} (Ext)`, score, idOuterSingle)}
        />
      );

      // Double
      const idDouble = `double-${score}`;
      segments.push(
        <path
          key={idDouble}
          d={describeArc(centerPoint.x, centerPoint.y, radius * R_DOUBLE_INNER, radius * R_DOUBLE_OUTER, startAngle, endAngle)}
          fill={highlightedSegment === idDouble ? 'cyan' : color2}
          className={`dart-segment double d-${score}`}
          onClick={() => handleSegmentClick(`Double ${score}`, score * 2, idDouble)}
        />
      );
    });

    return (
      <g transform={`rotate(${rotationDeg}, ${centerPoint.x}, ${centerPoint.y})`}>
        {/* Cercle de fond noir pour le contraste */}
        <circle cx={centerPoint.x} cy={centerPoint.y} r={radius * 1.02} fill="black" />
        {segments}
        {/* Cercle extérieur du double pour la finition */}
        <circle
          cx={centerPoint.x}
          cy={centerPoint.y}
          r={radius * R_DOUBLE_OUTER}
          fill="none"
          stroke="white"
          strokeWidth="2"
        />
      </g>
    );
  };

  // --- Rendu de l'interface ---
  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* Barre d'outils */}
      <div className="flex justify-between items-center p-4 bg-gray-800 shadow-md z-10">
        <h1 className="text-2xl font-bold">Minou Dart - Projection Interactive</h1>
      </div>

      {/* Zone Principale (Cible & Infos) */}
      <div className="flex flex-1 relative overflow-hidden items-center justify-center p-8">
        
        {/* Conteneur SVG viewBox permet un redimensionnement automatique et un centrage parfait */}
        <svg
          className="w-full h-full max-h-screen"
          viewBox="0 0 1000 1000"
        >
          {renderDartboard()}
        </svg>

        {/* Panneau d'affichage du score */}
        <div className="absolute top-4 right-4 p-6 bg-gray-800 bg-opacity-90 rounded-xl shadow-2xl border border-gray-700 pointer-events-none">
          <h2 className="text-xl font-bold mb-4 text-gray-200">Dernier Lancer</h2>
          <div className="mb-2">
            <span className="text-gray-400 font-semibold">Zone :</span>
            <span className="text-2xl font-bold ml-2 text-blue-400 block">{lastHit.region}</span>
          </div>
          <div>
            <span className="text-gray-400 font-semibold">Score :</span>
            <span className="text-4xl font-extrabold ml-2 text-green-400 block">{lastHit.score}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Styles CSS (Injectés) ---
const styles = `
  .dart-segment {
    stroke: #d1d5db; /* gray-300 */
    stroke-width: 1px;
    transition: fill 0.15s ease-out;
    cursor: pointer;
  }
  .dart-segment:hover {
    filter: brightness(1.2);
  }
`;
const styleSheet = document.createElement("style");
styleSheet.type = "text/css";
styleSheet.innerText = styles;
document.head.appendChild(styleSheet);

export default App;