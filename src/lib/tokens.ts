// Design tokens for the JS/SVG layer, where CSS custom properties can't reach
// SVG attributes or React style props. Mirrored by the :root rule in
// src/styles.css; change both together.

// Marker colors keyed by event kind. 'err' covers parse errors and lines the
// snapshot builder rejected; it is its own kind even while it shares reset's
// vermillion.
import type { MoveAnnotation, ParsedEvent } from './timeline';
export type MarkerKind = ParsedEvent['kind'] | 'err';
// Markup Amber: `hl`'s stop, shared with `ask` (same meaning, not a new hue).
const MARKUP_AMBER = '#f0b429';
export const markerColors: Record<MarkerKind, string> = {
  move: '#5d8fc9',
  highlight: MARKUP_AMBER,
  arrow: '#f08c2e',
  clear: '#9b9b9b',
  reset: '#cf5d5d',
  start: '#cf5d5d',
  fen: '#cf5d5d',
  err: '#cf5d5d',
  branch: '#c8d0e6',
  mainline: '#c8d0e6',
  replay: '#5d8fc9',
  mind: '#9b9b9b',
  reveal: '#9b9b9b',
  // The teacher's-mark amber; its hollow form keeps it apart from `hl`.
  ask: MARKUP_AMBER,
};

// A rejected line keeps its parsed kind but is marked as an error. The
// timeline pin and the move-list dot both go through this so one event reads
// identically on both (DESIGN.md).
export const markerKindFor = (
  kind: MarkerKind,
  line: number,
  errorLines: ReadonlySet<number>,
): MarkerKind => (errorLines.has(line) ? 'err' : kind);


// Pin shape by kind, decodable in grayscale (DESIGN.md "Event-kind markers");
// `.marker` keys off `data-form`. Kinds sharing a `markerColors` entry never
// share a form, except mind/reveal (test/commands.test.mjs).
type PinForm = 'bar' | 'capsule' | 'hollow' | 'pennant' | 'stack';

export const markerForms: Record<MarkerKind, PinForm> = {
  move: 'bar',
  branch: 'bar',
  mainline: 'bar',
  highlight: 'capsule',
  arrow: 'capsule',
  clear: 'hollow',
  mind: 'capsule',
  reveal: 'capsule',
  reset: 'pennant',
  start: 'pennant',
  fen: 'pennant',
  err: 'pennant',
  replay: 'stack',
  ask: 'hollow',
};

export const tokens = {
  // Board surface
  squareLight: '#f1ecde', // studio-cream
  squareDark: '#5d8fc9', // studio-steel-blue
  coordOnLight: '#5d8fc9',
  coordOnDark: '#f1ecde',

  // Mind's-eye void between `mind` and `reveal`. Near-identical on purpose:
  // the grid all but disappears and the coordinates carry orientation in one
  // bright ink. JS-only: the sink follows the playback clock, not a transition.
  mindVoidLight: '#101628',
  mindVoidDark: '#0f1526',
  mindCoordInk: '#c8d0e6',

  // Board overlays (DESIGN.md "The teacher's mark and the tool's mark"). Both
  // are amber, so they differ in form: flood = last move, ring = authored `hl`.
  boardLastMoveOnLight: 'rgba(255, 213, 79, 0.42)',
  boardLastMoveOnDark: 'rgba(255, 213, 79, 0.52)',
  // Marker amber, not the flood's `#ffd54f`, which half-vanishes on cream.
  // Opaque, so one color serves both squares. Derived from the pin color,
  // never the reverse.
  boardHighlightRing: markerColors.highlight,
  boardArrow: 'rgba(255, 170, 60, 0.85)',
  // Check glow: dense at the center to survive a 480p downscale, gone before
  // the square edge. The alpha-0 edge keeps the vermillion RGB because
  // gradients interpolate toward it; retune all three stops together.
  boardCheckCenter: 'rgba(207, 93, 93, 0.95)',
  boardCheckMid: 'rgba(207, 93, 93, 0.55)',
  boardCheckEdge: 'rgba(207, 93, 93, 0)',

  captureFlash:
    'radial-gradient(circle, rgba(255,180,90,0.7), rgba(255,180,90,0))',
} as const;

// Move-quality palette (DESIGN.md "Move-Quality Marks"): chess.com's colors,
// a deliberate PRODUCT.md exception. The contrast costs (white ink under 3:1 on
// `mistake` and `brilliant`, `great` near the dark square) are accepted; the
// badge shadow in Board.tsx offsets them.
export const annotationColors: Record<MoveAnnotation, string> = {
  brilliant: '#1baca6',
  great: '#5c8bb0',
  mistake: '#ffa459',
  blunder: '#fa412d',
};

// The same marks as 13px/700 move-list text: the board fills, overridden only
// where body AA against the variation inset (#31384c), the worst backdrop,
// requires it (test/board.test.mjs).
export const annotationMarkColors: Record<MoveAnnotation, string> = {
  ...annotationColors,
  brilliant: '#2cb9b3',
  great: '#8fb6d8',
  blunder: '#ff7f6d',
};

export const annotationInk = '#ffffff';

// An annotated move's landing-square tint, applied as `opacity` on a rect
// filled with the annotation color so the hue stays single-sourced.
export const annotationSquareAlpha = { onLight: 0.42, onDark: 0.58 } as const;

// Mirrors --font-ui in styles.css; SVG text attributes can't read CSS variables.
export const fontUi =
  "'Schibsted Grotesk', ui-sans-serif, system-ui, -apple-system, sans-serif";
