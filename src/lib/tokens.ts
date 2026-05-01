// Design tokens consumed by the JS/SVG layer (Board, Piece) where CSS custom
// properties can't be used directly inside SVG attributes or React style props.
// Mirrored by the :root rule in src/styles.css; if you change a value here,
// update there as well.

export const tokens = {
  // Board surface
  squareLight: '#f1ecde', // studio-cream
  squareDark: '#5d8fc9', // studio-steel-blue
  coordOnLight: '#5d8fc9',
  coordOnDark: '#f1ecde',

  // Board overlays
  boardHighlight: 'rgba(255, 213, 79, 0.55)',
  boardLastMove: 'rgba(255, 213, 79, 0.32)',
  boardArrow: 'rgba(255, 170, 60, 0.85)',

  // Capture flash
  captureFlash:
    'radial-gradient(circle, rgba(255,180,90,0.7), rgba(255,180,90,0))',

  // Shadows
  shadowBoard:
    '0 30px 80px -30px rgba(20, 30, 60, 0.55), 0 8px 24px -10px rgba(20, 30, 60, 0.3), inset 0 0 0 1px rgba(0, 0, 0, 0.05)',
  shadowPiece: 'drop-shadow(0 2px 2px rgba(0, 0, 0, 0.18))',

  // Motion
  easePieceSlide: 'cubic-bezier(0.5, 0, 0.2, 1)',
  durationPiece: '380ms',
  durationTransform: '220ms',
} as const;

// Marker colors keyed by event kind. move/highlight/arrow/clear/reset are the
// Five Meanings palette; branch/mainline are structural events shown in
// neutral rim-light-pewter so they don't compete with chess content.
import type { ParsedEvent } from './timeline';
export const markerColors: Record<ParsedEvent['kind'], string> = {
  move: '#5d8fc9',
  highlight: '#f0b429',
  arrow: '#f08c2e',
  clear: '#9b9b9b',
  reset: '#cf5d5d',
  branch: '#c8d0e6',
  mainline: '#c8d0e6',
};

// Human-readable piece names (for accessible alt text).
export const pieceNames: Record<string, string> = {
  p: 'pawn',
  r: 'rook',
  n: 'knight',
  b: 'bishop',
  q: 'queen',
  k: 'king',
};
