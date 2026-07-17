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

  // Board overlays. Last-move amber needs per-square-color alphas: too low
  // and the mix desaturates until it stops reading as amber — on blue squares
  // below ~0.52, on cream squares below ~0.42 (0.32 drifted toward a pale
  // olive butter) — especially after a 480p recording downscale.
  boardHighlight: 'rgba(255, 213, 79, 0.55)',
  boardLastMoveOnLight: 'rgba(255, 213, 79, 0.42)',
  boardLastMoveOnDark: 'rgba(255, 213, 79, 0.52)',
  boardArrow: 'rgba(255, 170, 60, 0.85)',
  // Check glow under the checked king: studio-vermillion radial, dense at
  // the center so it survives a 480p downscale, gone before the square edge
  // so it reads as danger on the king, not a painted square. The alpha-0
  // edge keeps the vermillion RGB because gradient interpolation blends
  // toward its hue; all three stops must retune together.
  boardCheckCenter: 'rgba(207, 93, 93, 0.95)',
  boardCheckMid: 'rgba(207, 93, 93, 0.55)',
  boardCheckEdge: 'rgba(207, 93, 93, 0)',

  // Capture flash
  captureFlash:
    'radial-gradient(circle, rgba(255,180,90,0.7), rgba(255,180,90,0))',

  // Shadows
  shadowBoard:
    '0 30px 80px -30px rgba(20, 30, 60, 0.55), 0 8px 24px -10px rgba(20, 30, 60, 0.3), inset 0 0 0 1px rgba(0, 0, 0, 0.05)',
  shadowPiece: 'drop-shadow(0 2px 2px rgba(0, 0, 0, 0.18))',
  shadowPieceMoving: 'drop-shadow(0 6px 5px rgba(15, 21, 37, 0.28))',
} as const;

// Move-quality annotation palette: badge fills on the board and quality
// marks in the move list. Mirrored by --color-annot-* in styles.css :root.
export const annotationColors = {
  brilliant: '#4fb9b2',
  great: '#7da9dc',
  mistake: '#d9a93f',
  blunder: '#cf5d5d',
} as const;

// Ink for the badge marks on all four fills — the palette's studio-cream,
// named separately from the board-surface tokens so square tuning can't
// silently recolor badge text.
export const annotationInk = '#f1ecde';

// Marker colors keyed by event kind. move/highlight/arrow/clear/reset are the
// Five Meanings palette; branch/mainline are structural events shown in
// neutral rim-light-pewter so they don't compete with chess content. 'err'
// covers parse-error events and lines the snapshot builder rejected —
// semantically distinct from reset even while both wear vermillion today.
import type { ParsedEvent } from './timeline';
export type MarkerKind = ParsedEvent['kind'] | 'err';
export const markerColors: Record<MarkerKind, string> = {
  move: '#5d8fc9',
  highlight: '#f0b429',
  arrow: '#f08c2e',
  clear: '#9b9b9b',
  reset: '#cf5d5d',
  start: '#cf5d5d',
  fen: '#cf5d5d',
  err: '#cf5d5d',
  branch: '#c8d0e6',
  mainline: '#c8d0e6',
};

// Chrome UI font stack — mirrored by --font-ui in styles.css :root, because
// SVG text attributes (the annotation badge) can't read CSS custom properties.
export const fontUi =
  "'Schibsted Grotesk', ui-sans-serif, system-ui, -apple-system, sans-serif";
