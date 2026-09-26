// Design tokens consumed by the JS/SVG layer (Board, App, MoveList,
// InsertMenu) where CSS custom properties can't be used directly inside SVG
// attributes or React style props.
// Mirrored by the :root rule in src/styles.css; if you change a value here,
// update there as well.

// Marker colors keyed by event kind. move/highlight/arrow/clear/reset are the
// Five Meanings palette; branch/mainline are structural events shown in
// neutral rim-light-pewter so they don't compete with chess content. 'err'
// covers parse-error events and lines the snapshot builder rejected —
// semantically distinct from reset even while both wear vermillion today.
import type { MoveAnnotation, ParsedEvent } from './timeline';
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
  replay: '#5d8fc9',
  mind: '#9b9b9b',
  reveal: '#9b9b9b',
};

// A line the snapshot builder rejected keeps its parsed kind — an illegal SAN
// is still a `move` event — but must not keep its parsed *color*. It reads as
// an error everywhere it appears.
//
// This lives next to the table it feeds because two surfaces derive it (the
// timeline pin and the move-list seek dot) off the same `errorLines` set, and
// DESIGN.md's rule is that one event reads identically on both. Spelled twice,
// they can disagree — a vermillion pennant on the ruler and a blue dot in the
// list, for the same broken line, with nothing to typecheck the two against
// each other.
export const markerKindFor = (
  kind: MarkerKind,
  line: number,
  errorLines: ReadonlySet<number>,
): MarkerKind => (errorLines.has(line) ? 'err' : kind);


// Pin shape by kind, decodable in grayscale (DESIGN.md "Event-kind markers").
// Data, not CSS: `.marker` keys off `data-form`, and a Record forces every
// kind to choose a form. It is a table because the rule is a relation between
// two tables: kinds sharing a `markerColors` entry never share a form (except
// mind/reveal, two halves of one gesture). `rp` keeps move blue, so its shape
// is all that separates it. A guard over CSS source text cannot check that.
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
};

export const tokens = {
  // Board surface
  squareLight: '#f1ecde', // studio-cream
  squareDark: '#5d8fc9', // studio-steel-blue
  coordOnLight: '#5d8fc9',
  coordOnDark: '#f1ecde',

  // Mind's-eye void: what the squares sink to between `mind` and `reveal`.
  // The pair is near-identical on purpose — the grid all but disappears and
  // orientation moves to the coordinates, which swap to one bright ink
  // (rim-light-pewter). JS-only, unlike the surface colors above: the sink is
  // derived from the playback clock, so it cannot be a CSS transition.
  mindVoidLight: '#101628',
  mindVoidDark: '#0f1526',
  mindCoordInk: '#c8d0e6',

  // Board overlays (DESIGN.md "The teacher's mark and the tool's mark"). Both
  // marks are amber, so they differ in form, decided by frequency:
  // flood = ambient last move, on every move and often an empty origin, so it
  // stays quiet; ring = the authored `hl`, rare and aimed.
  boardLastMoveOnLight: 'rgba(255, 213, 79, 0.42)',
  boardLastMoveOnDark: 'rgba(255, 213, 79, 0.52)',
  // The ring is marker amber, not the board stop: `#ffd54f` sits near
  // studio-cream's luminance and half-vanishes on light squares. Opaque,
  // because a translucent stroke composites to a different color per square.
  // A reference, not a second literal: the rule runs from the pin to the
  // board, so the board mark borrows the pin's color, never the reverse.
  boardHighlightRing: markerColors.highlight,
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
} as const;

// Move-quality annotation palette (DESIGN.md "Move-Quality Marks"):
// chess.com's classification colors, a deliberate exception carved out in
// PRODUCT.md. Two contrast costs are accepted, not overlooked: white ink sits
// under 3:1 on `mistake` and `brilliant`, and `great` all but matches the dark
// square. Both are paid by the drop shadow in Board.tsx rather than by breaking
// the replica. No rim: `BadgeDisc` in Board.tsx owns the circle so a rim is
// unrepresentable at a call site.
export const annotationColors: Record<MoveAnnotation, string> = {
  brilliant: '#1baca6',
  great: '#5c8bb0',
  mistake: '#ffa459',
  blunder: '#fa412d',
};

// The same marks as 13px/700 text in the move list. Spread from the board
// fills and overridden only where body AA against a variation's inset
// (#31384c), the worst backdrop a mark renders on, forces it. The current row
// drops the color entirely; see `moveBtn` in MoveList.tsx.
export const annotationMarkColors: Record<MoveAnnotation, string> = {
  ...annotationColors,
  brilliant: '#2cb9b3',
  great: '#8fb6d8',
  blunder: '#ff7f6d',
};

// Ink for the badge marks on all four fills — white, as in the reference.
export const annotationInk = '#ffffff';

// The destination square's tint: an annotated move's landing square takes the
// annotation hue instead of last-move amber, and the origin keeps the amber.
// Applied as `opacity` on a rect filled with the annotation color, so the hue
// stays single-sourced above rather than respelled as rgba literals.
export const annotationSquareAlpha = { onLight: 0.42, onDark: 0.58 } as const;

// Chrome UI font stack — mirrored by --font-ui in styles.css :root, because
// SVG text attributes (the annotation badge) can't read CSS custom properties.
export const fontUi =
  "'Schibsted Grotesk', ui-sans-serif, system-ui, -apple-system, sans-serif";
