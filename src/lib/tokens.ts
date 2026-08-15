// Design tokens consumed by the JS/SVG layer (Board, Piece) where CSS custom
// properties can't be used directly inside SVG attributes or React style props.
// Mirrored by the :root rule in src/styles.css; if you change a value here,
// update there as well.

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


// Pin shape by kind, decodable in grayscale. Data, not CSS: `.marker` keys off
// `data-form`, so the shape a kind wears is stated once here and TypeScript
// forces the table exhaustive over every event kind — a thirteenth kind cannot
// reach the ruler without choosing a form.
//
// It is a table because the rule it enforces is a *relation between two
// tables*: kind is never color alone, so two kinds sharing a `markerColors`
// entry must not share a `markerForms` entry. `rp` is the pair that forced
// this — a replay is about moves and deliberately keeps move blue, which
// leaves shape as the only separation, and for a while it had none. Asserting
// that in CSS source text does not work: the guard that did compared rule
// bodies, so re-declaring `rp` with the base rule's own values read as
// "different" while a longhand rewrite of the real shape read as "changed".
//
// Writing it down surfaced a second collision the CSS never showed: `cl`,
// `mind`, and `reveal` all wear grey-mist, and all three were capsules.
// `mind`/`reveal` are two halves of one gesture and may look alike; `cl` is
// independent and may not. It takes the hollow form — which also settles a
// mismatch, since its *seek dot* has always been the hollow ring while its pin
// was a filled capsule, and DESIGN.md asks that one event read identically on
// the ruler and in the list.
export type PinForm = 'bar' | 'capsule' | 'hollow' | 'pennant' | 'stack';

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

  // Board overlays. Both board marks are legitimately amber, and they were
  // once the same full-square flood 3% of alpha apart (0.55 vs 0.52 on blue) —
  // in the recording, which is the whole product, a viewer could not tell "the
  // tool moved a piece here" from "the teacher is pointing here". Kind is never
  // color alone (the doctrine the seek dots and timeline pins already follow),
  // so they differ in form. Which one changes is decided by frequency and by
  // what the form means:
  //
  //   flood = ambient, "something happened on this square"
  //   frame = pointing, "look at this square"
  //
  // The last move keeps the flood. It marks two squares on *every* move, one
  // of them usually empty, so it has to stay quiet and conventional — framing
  // it put a hard-edged box on every move of the recording, and a box around
  // an empty origin square reads as a selection artifact, not as chess.
  boardLastMoveOnLight: 'rgba(255, 213, 79, 0.42)',
  boardLastMoveOnDark: 'rgba(255, 213, 79, 0.52)',
  // `hl` takes the ring. It is rare and deliberate — the author aimed it — and
  // a ring is a pointing gesture rather than a wash. Restraint here is not
  // weakness: thin ink is more directed than a flood, not less.
  //
  // Marker amber, not the board stop, and fully opaque. The board stop
  // `#ffd54f` is tuned for the *flood*, which has to sit under content without
  // muddying the square; against studio-cream it is nearly the same luminance,
  // so a ring drawn in it measured 1.15:1 on cream against 2.16:1 on blue —
  // the author's mark was half-invisible on every other square. Marker amber
  // is a step darker and more saturated, which is exactly what separates it
  // from cream: 1.58:1 there and 1.81:1 on blue.
  //
  // Opacity 1 is load-bearing, not incidental. A translucent stroke takes on
  // whatever it covers, so the same token composited to two different colors
  // and needed a per-square-color alpha pair to compensate (0.72/0.88, chasing
  // an olive drift on blue). An opaque stroke is the same pen everywhere, so
  // one value replaces the pair. It reads as solid gold rather than the glare
  // `#ffd54f` produced at the same opacity, because it is the darker stop.
  //
  // Side effect worth knowing: this lands near the board arrow's persimmon.
  // They never collide because nothing confuses a circle with an arrow — form
  // separates them, the same doctrine that split this ring from the flood —
  // and it puts the board mark on the exact color its own timeline pin and
  // seek dot already use, so one event reads identically in all three places.
  //
  // A reference, not a second `#f0b429`. "The ring is marker amber" is the
  // whole paragraph above; spelled as a literal it was an equality a test had
  // to keep true, and a test can only notice the drift after someone commits
  // it. Marker amber is the source because that is the direction the rule runs
  // — the board mark borrows the pin's color, never the reverse.
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

// Chrome UI font stack — mirrored by --font-ui in styles.css :root, because
// SVG text attributes (the annotation badge) can't read CSS custom properties.
export const fontUi =
  "'Schibsted Grotesk', ui-sans-serif, system-ui, -apple-system, sans-serif";
