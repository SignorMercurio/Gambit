// Pieces translate via `translate3d` so motion stays on the GPU compositor.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { BOARD_GESTURE_CLASS } from '../lib/boardExport';
import { Piece } from './Piece';
import { idxToSq, sqToIdx } from '../lib/chess';
import {
  boardViewPosition,
  squareViewPosition,
  squareFromBoardView,
  type BoardOrientation,
  type BoardViewPosition,
} from '../lib/boardOrientation';
import {
  beginAnnotationGesture,
  beginMoveGesture,
  buttonBit,
  finishBoardGesture,
  updateGestureTarget,
  type BoardGesture,
} from '../lib/boardGesture';
import { clamp01, easeOutQuart, timedProgress } from '../lib/animation';
import {
  mindPieceStrength,
  mindRevealStrength,
  mindSink,
  type MindFrame,
  type MindWorld,
} from '../lib/mind';
import { ANNOTATION_MARKS, type MoveAnnotation } from '../lib/timeline';
import {
  annotationColors,
  annotationInk,
  annotationSquareAlpha,
  fontUi,
  tokens,
} from '../lib/tokens';
import {
  BOARD_OVERLAY_LIFETIME,
  type BoardArrow,
  type BoardCheck,
  type BoardHighlight,
  type CaptureFlash,
  type LastMove,
  type PiecePos,
  type Positions,
} from '../lib/world';

const SQ = 100;
// The board's own coordinate box. Exported because the badge-clamp guard
// asserts the disc stays inside it, and a second `800` there would be a clamp
// check that cannot see the box it is clamping to.
export const BOARD_SIZE = SQ * 8;
const HIGHLIGHT_FADE_IN = 0.16;
const OVERLAY_FADE_OUT = 0.32;
const ARROW_DRAW_DURATION = 0.34;
const BADGE_DELAY = 0.08;
const BADGE_IN_DURATION = 0.18;

type BoardProps = {
  positions: Positions;
  lastMove: LastMove | null;
  highlights: BoardHighlight[];
  arrows: BoardArrow[];
  captureFlash: CaptureFlash | null;
  check: BoardCheck | null;
  mind: MindWorld | null;
  // Time of the `reveal` that ended the last mind phase — the full board
  // fades in from the ghost floor instead of popping (-Infinity: no fade).
  revealedAt: number;
  time: number;
  orientation?: BoardOrientation;
  // Interactive editing (Script tab only). Gestures never draw directly —
  // they report intents that App records as script lines, so the script
  // text stays the single source of truth. Mouse-only by design: this is a
  // desktop screen-recording tool and right-button gestures need a mouse.
  interactive?: boolean;
  legalTargets?: (from: string) => string[];
  onMoveGesture?: (from: string, to: string) => void;
  onArrowGesture?: (from: string, to: string) => void;
  onHighlightGesture?: (sq: string) => void;
  // A left-press on a square that can't start a move. Reported rather than
  // swallowed so App can say why; Board never decides the wording.
  onMoveRejected?: (from: string) => void;
};

const BOARD_ARROW = {
  startInset: 18,
  endInset: 8,
  shaftHalf: 11,
  headHalf: 26,
  headLen: 36,
  headBack: 0,
} as const;

// Trace the arrow outline as a single polygon (tail → left elbows → head
// flare → right elbows → tail). `pts[0]` is the tail, `pts[last]` is the tip;
// intermediates are knight-L elbows.
type Seg = { x1: number; y1: number; ux: number; uy: number; len: number };

// Intersection of the offset edges along consecutive segments `a` and `b`,
// shifted by `side * shaftHalf` (side: +1 = walker's left, -1 = right).
function elbowJoin(a: Seg, b: Seg, side: number, shaftHalf: number): [number, number] {
  const ax = a.x1 + side * a.uy * shaftHalf;
  const ay = a.y1 - side * a.ux * shaftHalf;
  const bx = b.x1 + side * b.uy * shaftHalf;
  const by = b.y1 - side * b.ux * shaftHalf;
  const det = b.ux * a.uy - a.ux * b.uy;
  if (Math.abs(det) < 1e-9) return [ax + a.ux * a.len, ay + a.uy * a.len];
  const t = ((by - ay) * b.ux - (bx - ax) * b.uy) / det;
  return [ax + a.ux * t, ay + a.uy * t];
}

function buildArrowPath(pts: Array<readonly [number, number]>): string {
  const { shaftHalf, headHalf, headLen, headBack } = BOARD_ARROW;
  if (pts.length < 2) return '';
  const segs: Seg[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) return '';
    segs.push({ x1, y1, ux: dx / len, uy: dy / len, len });
  }
  const last = segs[segs.length - 1];
  if (last.len < headLen + 0.5) return '';

  const tipX = last.x1 + last.ux * last.len;
  const tipY = last.y1 + last.uy * last.len;
  const hbX = tipX - last.ux * headLen;
  const hbY = tipY - last.uy * headLen;
  const s0 = segs[0];
  const out: Array<[number, number]> = [];

  out.push([s0.x1 + s0.uy * shaftHalf, s0.y1 - s0.ux * shaftHalf]);
  for (let i = 0; i < segs.length - 1; i++) out.push(elbowJoin(segs[i], segs[i + 1], 1, shaftHalf));
  out.push([hbX + last.uy * shaftHalf, hbY - last.ux * shaftHalf]);
  out.push([hbX + last.uy * headHalf - last.ux * headBack, hbY - last.ux * headHalf - last.uy * headBack]);
  out.push([tipX, tipY]);
  out.push([hbX - last.uy * headHalf - last.ux * headBack, hbY + last.ux * headHalf - last.uy * headBack]);
  out.push([hbX - last.uy * shaftHalf, hbY + last.ux * shaftHalf]);
  for (let i = segs.length - 2; i >= 0; i--) out.push(elbowJoin(segs[i], segs[i + 1], -1, shaftHalf));
  out.push([s0.x1 - s0.uy * shaftHalf, s0.y1 + s0.ux * shaftHalf]);

  return 'M' + out.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' L') + 'Z';
}

function buildArrowGuidePath(pts: Array<readonly [number, number]>): string {
  if (pts.length < 2) return '';
  return 'M' + pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' L');
}

function overlayOpacity(age: number, lifetime: number, pinned?: boolean): number {
  if (age < 0) return 0;
  if (age < HIGHLIGHT_FADE_IN) return easeOutQuart(age / HIGHLIGHT_FADE_IN);
  if (pinned) return 1;
  if (age >= lifetime) return 0;
  const remaining = lifetime - age;
  if (remaining < OVERLAY_FADE_OUT) return easeOutQuart(remaining / OVERLAY_FADE_OUT);
  return 1;
}

function moveDuration(p: PiecePos): number {
  if (p.moveFromF == null || p.moveFromR == null) return 0;
  const distance = Math.hypot(p.f - p.moveFromF, p.r - p.moveFromR);
  return Math.min(0.44, Math.max(0.22, 0.2 + distance * 0.045));
}

function pieceVisual(p: PiecePos, time: number) {
  let f = p.f;
  let r = p.r;
  let opacity = 1;
  let scale = 1;
  let isMoving = false;
  let isCapturedFading = false;

  if (p.moveT != null && p.moveFromF != null && p.moveFromR != null) {
    const age = time - p.moveT;
    const duration = moveDuration(p);
    if (age >= 0 && age < duration) {
      const eased = timedProgress(age, duration);
      f = p.moveFromF + (p.f - p.moveFromF) * eased;
      r = p.moveFromR + (p.r - p.moveFromR) * eased;
      scale = 1 + Math.sin(eased * Math.PI) * 0.026;
      isMoving = true;
    }
  }

  if (p.captured) {
    const age = p.capturedAt == null ? Number.POSITIVE_INFINITY : time - p.capturedAt;
    if (age >= 0 && age < BOARD_OVERLAY_LIFETIME.captureFlash) {
      const eased = timedProgress(age, BOARD_OVERLAY_LIFETIME.captureFlash);
      opacity = 1 - eased;
      scale *= 1 - eased * 0.18;
      isCapturedFading = true;
    } else {
      opacity = 0;
      scale = 0.82;
    }
  }

  return { f, r, opacity, scale, isMoving, isCapturedFading };
}

function pieceZIndex(visual: ReturnType<typeof pieceVisual>): number {
  if (visual.isMoving) return 5;
  if (visual.isCapturedFading) return 4;
  return 1;
}

function captureFlashVisual(age: number) {
  const p = clamp01(age / BOARD_OVERLAY_LIFETIME.captureFlash);
  const fadeIn = timedProgress(age, BOARD_OVERLAY_LIFETIME.captureFlash * 0.32);
  const fadeOut = 1 - timedProgress(
    Math.max(0, age - BOARD_OVERLAY_LIFETIME.captureFlash * 0.32),
    BOARD_OVERLAY_LIFETIME.captureFlash * 0.68,
  );
  return {
    opacity: Math.max(0, Math.min(fadeIn, fadeOut)),
    scale: 0.45 + easeOutQuart(p) * 1.85,
  };
}

const viewCenter = (view: BoardViewPosition): [number, number] => [
  view.x * SQ + SQ / 2,
  view.y * SQ + SQ / 2,
];

function squareCenter(
  f: number,
  r: number,
  orientation: BoardOrientation,
): [number, number] {
  return viewCenter(boardViewPosition(f, r, orientation));
}

function insetPoint(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  inset: number,
): [number, number] {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  return [x1 + ((x2 - x1) / len) * inset, y1 + ((y2 - y1) / len) * inset];
}

function arrowPoints(
  from: string,
  to: string,
  orientation: BoardOrientation,
): Array<readonly [number, number]> {
  const fromXY = sqToIdx(from);
  const toXY = sqToIdx(to);
  const [x1, y1] = squareCenter(fromXY.f, fromXY.r, orientation);
  const [x2, y2] = squareCenter(toXY.f, toXY.r, orientation);
  const df = toXY.f - fromXY.f;
  const dr = toXY.r - fromXY.r;
  const isKnight =
    (Math.abs(df) === 1 && Math.abs(dr) === 2) ||
    (Math.abs(df) === 2 && Math.abs(dr) === 1);

  if (isKnight) {
    const verticalFirst = Math.abs(dr) === 2;
    const elbowF = verticalFirst ? fromXY.f : toXY.f;
    const elbowR = verticalFirst ? toXY.r : fromXY.r;
    const [ex, ey] = squareCenter(elbowF, elbowR, orientation);
    const start = insetPoint(x1, y1, ex, ey, BOARD_ARROW.startInset);
    const end = insetPoint(x2, y2, ex, ey, BOARD_ARROW.endInset);
    return [start, [ex, ey], end];
  }

  return [
    insetPoint(x1, y1, x2, y2, BOARD_ARROW.startInset),
    insetPoint(x2, y2, x1, y1, BOARD_ARROW.endInset),
  ];
}

// The board's light/dark convention (a1 dark) in one place.
const isLightSquare = (f: number, r: number) => (f + r) % 2 === 1;
// Last-move amber needs a higher alpha on blue squares; see tokens.ts.
const lastMoveFill = (f: number, r: number) =>
  isLightSquare(f, r) ? tokens.boardLastMoveOnLight : tokens.boardLastMoveOnDark;

// The two squares a last move paints, origin first. One function rather than a
// conditional at each rect, because the rule is about the *pair*: an annotated
// move repaints only where it landed, and the origin keeps the amber, so the
// move still reads directionally — where it came from, and what it was worth.
// Written as a ternary inside the map, that rule lived in the difference
// between two iterations of the same expression, and the only way to state it
// was to quote the source line.
type PaintedSquare = { f: number; r: number; fill: string; alpha: number };

export function lastMoveSquares(move: LastMove): [PaintedSquare, PaintedSquare] {
  const { fromF, fromR, toF, toR, annotation } = move;
  return [
    { f: fromF, r: fromR, fill: lastMoveFill(fromF, fromR), alpha: 1 },
    {
      f: toF,
      r: toR,
      ...(annotation
        ? {
            fill: annotationColors[annotation],
            alpha: annotationSquareAlpha[isLightSquare(toF, toR) ? 'onLight' : 'onDark'],
          }
        : { fill: lastMoveFill(toF, toR), alpha: 1 }),
    },
  ];
}

// The move-quality badge, in board units (SQ = 100). Exported because the
// suite checks the disc stays on the board, and a second `23` there would be
// a clamp guard that can't see the radius it is clamping.
export const BADGE_R = 23;
// The disc hangs off the square's top-right corner rather than sitting inside
// it. Two reasons, both about the recording: a badge contained in the square
// competes with the piece standing on it — on a pawn move the disc lands on the
// pawn's head — and a mark that breaks the grid reads as applied *to* the move
// rather than as one more thing painted on the square, which is the whole
// distinction between the author's judgment and the board's own state. So the
// center sits exactly on the corner; there is no inset to tune.
//
// It must never leave the board, though. The overhang clips against the
// viewBox on the h-file and the 8th rank, and the PNG export rasterizes the
// same 800-unit box, so an edge move would ship a sliced disc.
export const BADGE_EDGE_MARGIN = 4;

// The badge glyphs. Real characters, set in the chrome face — `!` and `?` are
// text, and drawing them as paths traded a maintainable line for control we
// did not need. Weight 700 rather than the display 900 it started at: at the
// ~40px the disc is drawn, 900 closes the question mark's aperture and the
// pair of a doubled mark starts to fuse.
//
// One thing the path version did buy, noted so it is a known risk rather than
// a surprise: `<text>` inside the SVG that `html-to-image` clones rasterizes in
// the right face only if that face is loaded and embeddable. Both board fonts
// are self-hosted and preloaded, so the export has them.
const GLYPH_WEIGHT = 700;
// `!` / `?` are tall and narrow; `!!` / `??` are a pair of them side by side.
// One size cannot set both, and the doubled pair also needs its tracking
// pulled in — at the default it runs wider than the disc's usable width.
const GLYPH_SIZE_SINGLE = 44;
const GLYPH_SIZE_DOUBLE = 30;
const GLYPH_TRACKING_DOUBLE = -1.5;

export function badgeCenter(view: BoardViewPosition): [number, number] {
  const limit = BOARD_SIZE - BADGE_R - BADGE_EDGE_MARGIN;
  const floor = BADGE_R + BADGE_EDGE_MARGIN;
  return [Math.min((view.x + 1) * SQ, limit), Math.max(view.y * SQ, floor)];
}

// The disc in one place, returning the element rather than a props bag, for
// the reason `HlRing` does it below: the reference has no rim, and a `stroke`
// added at a call site is the exact drift this replica keeps inviting. Owning
// the element makes a rim unrepresentable there, and lets the suite assert its
// absence by calling this function instead of pattern-matching JSX source —
// which is how the first version of that guard came to slice an empty string
// out of Board.tsx and pass without reading a character of the disc.
export function BadgeDisc({
  annotation,
  cx,
  cy,
}: {
  annotation: MoveAnnotation;
  cx: number;
  cy: number;
}) {
  return <circle cx={cx} cy={cy} r={BADGE_R} fill={annotationColors[annotation]} />;
}

// The `hl` ring, in board units (SQ = 100) so it scales with the board rather
// than the viewport. A circle, not a rounded square. An outlined rounded rect restates the
// square's own geometry, so it reads as the square being *selected* — UI
// language — no matter how thin or how softly cornered it gets. A circle does
// not echo the grid, so it reads as a mark drawn on top of the square, and it
// is the annotation shape chess players already know from ring-a-square.
// 6% stroke still resolves at 480p, where the board is ~50px per square.
const HL_RING = 6;
const HL_RADIUS = 43;

// The ring in one place: the live overlay and the in-flight gesture preview
// must draw the same shape, or the preview promises a mark the script will not
// produce.
//
// It returns the element, not a props bag. A bag is only a default — every
// call site spreads it, and `{...hlRingCircle(v)} r={30} strokeWidth={2.5}`
// silently wins, which is the invariant this helper exists for. Owning the
// element makes a second radius unrepresentable at a call site rather than
// merely discouraged.
//
// `scale` is the fade-in growth, applied here because it pivots on the ring's
// own center: two expressions for one point can drift, and the ring would then
// grow about a spot that is not its middle.
//
// No per-square-color variant: the stroke is opaque, so it does not take on the
// square underneath and reads as one pen on both. See tokens.ts.
export function HlRing({
  view,
  opacity = 1,
  scale = 1,
}: {
  view: BoardViewPosition;
  opacity?: number;
  scale?: number;
}) {
  const [cx, cy] = viewCenter(view);
  return (
    <circle
      cx={cx}
      cy={cy}
      r={HL_RADIUS}
      fill="none"
      stroke={tokens.boardHighlightRing}
      strokeWidth={HL_RING}
      opacity={opacity}
      transform={
        scale === 1
          ? undefined
          : `translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`
      }
    />
  );
}

const SQUARES: { f: number; r: number; isLight: boolean }[] = [];
for (let r = 7; r >= 0; r--) {
  for (let f = 0; f < 8; f++) SQUARES.push({ f, r, isLight: isLightSquare(f, r) });
}

type CoordLabel = {
  x: number;
  y: number;
  isLight: boolean;
  text: string;
  anchor: 'end' | 'start';
};

function coordLabels(orientation: BoardOrientation): CoordLabel[] {
  const bottomRank = orientation === 'white' ? 0 : 7;
  const leftFile = orientation === 'white' ? 0 : 7;
  return [
    ...Array.from({ length: 8 }, (_, x) => {
      const f = orientation === 'white' ? x : 7 - x;
      return {
        x: x * SQ + SQ - 8,
        y: 8 * SQ - 8,
        isLight: isLightSquare(f, bottomRank),
        text: String.fromCharCode(97 + f),
        anchor: 'end' as const,
      };
    }),
    ...Array.from({ length: 8 }, (_, y) => {
      const r = orientation === 'white' ? 7 - y : y;
      return {
        x: 4,
        y: y * SQ + 16,
        isLight: isLightSquare(leftFile, r),
        text: String(r + 1),
        anchor: 'start' as const,
      };
    }),
  ];
}

// Static gradient defs, hoisted so 60Hz renders reuse one element instead of
// rebuilding (and remounting) the defs subtree with the check state.
const CHECK_GLOW_DEFS = (
  <defs>
    <radialGradient id="board-check-glow">
      <stop offset="0%" stopColor={tokens.boardCheckCenter} />
      <stop offset="55%" stopColor={tokens.boardCheckMid} />
      <stop offset="92%" stopColor={tokens.boardCheckEdge} />
    </radialGradient>
  </defs>
);
const ARROW_SHADOW_DEFS = (
  <defs>
    <filter id="arrow-shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#0f1525" floodOpacity="0.32" />
    </filter>
  </defs>
);
// The badge's only edge, now that the rim is gone. Deeper than an ordinary
// board shadow on purpose: chess.com's `great` blue is 1.08:1 against our dark
// square, so on half the board this filter is the entire difference between a
// disc and a smudge. Compared on the page at 0.34 / 0.55 / 0.70 / 0.85 — 0.34
// left the circle's edge to guesswork on blue, and 0.85 turned into a grey
// halo that reads as grime on the cream squares, where the fills already have
// contrast to spare. 0.70 is the last stop that helps the blue case without
// dirtying the cream one.
const ANNOTATION_BADGE_SHADOW_DEFS = (
  <defs>
    <filter id="annotation-badge-shadow" x="-45%" y="-45%" width="190%" height="190%">
      <feDropShadow dx="0" dy="3" stdDeviation="3.5" floodColor="#0f1525" floodOpacity="0.7" />
    </filter>
  </defs>
);

// One square pair per surface. Both sets are hoisted so a steady frame diffs
// a single constant element instead of 64 rects.
const squareRects = (light: string, dark: string) =>
  SQUARES.map(({ f, r, isLight }) => (
    <rect
      key={`${f}-${r}`}
      x={f * SQ}
      y={(7 - r) * SQ}
      width={SQ}
      height={SQ}
      fill={isLight ? light : dark}
    />
  ));
const SQUARE_RECTS = squareRects(tokens.squareLight, tokens.squareDark);
// The void layer: the same 64 squares in near-black, faded in over the lit
// board by `mindSink`. A layer rather than a fill swap so the sink follows the
// playback clock (and so overlays keep landing on top of it). VOID_G is the
// fully-sunk steady state — the whole mind phase after the 0.6s ramp.
const VOID_RECTS = squareRects(tokens.mindVoidLight, tokens.mindVoidDark);
const VOID_G = <g>{VOID_RECTS}</g>;

function voidLayer(sink: number) {
  if (sink <= 0) return null;
  if (sink >= 1) return VOID_G;
  return <g opacity={sink}>{VOID_RECTS}</g>;
}

// Coordinates sit above enlarged Staunty pieces so file/rank labels remain
// visible in recordings, but below annotation arrows. Two hoisted sets of the
// same labels: the board ink, and the bright mind's-eye ink that cross-fades
// in with the void (in the dark, the coordinates are the only orientation
// left, so they must read at full strength).
// `ink` null means the per-square board pair; a color means the one bright
// mind's-eye ink.
const coordTexts = (ink: string | null, orientation: BoardOrientation) =>
  coordLabels(orientation).map((c, i) => (
    <text
      key={`coord-${i}`}
      x={c.x}
      y={c.y}
      fontFamily="ui-sans-serif, system-ui"
      fontSize="14"
      fontWeight="700"
      textAnchor={c.anchor}
      fill={ink ?? (c.isLight ? tokens.coordOnLight : tokens.coordOnDark)}
      opacity="0.95"
    >
      {c.text}
    </text>
  ));
const COORD_TEXTS = {
  white: coordTexts(null, 'white'),
  black: coordTexts(null, 'black'),
};
const COORD_TEXTS_MIND = {
  white: coordTexts(tokens.mindCoordInk, 'white'),
  black: coordTexts(tokens.mindCoordInk, 'black'),
};

// Full-size SVG planes share one positioning contract; each layer only adds
// its own pointer and stacking behavior.
const SVG_LAYER_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
};
const COORD_LAYER_STYLE: CSSProperties = {
  ...SVG_LAYER_STYLE,
  pointerEvents: 'none',
  zIndex: 2,
};

// Both steady states are whole hoisted layers, so every frame outside the
// 0.6s ramp — which is every frame of an ordinary script — bails out on
// element identity instead of reconciling 16 labels.
const coordSvg = (texts: ReactNode) => (
  <svg className="board-coords" viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`} aria-hidden="true" style={COORD_LAYER_STYLE}>
    {texts}
  </svg>
);
const COORD_LAYER = {
  white: coordSvg(COORD_TEXTS.white),
  black: coordSvg(COORD_TEXTS.black),
};
const COORD_LAYER_MIND = {
  white: coordSvg(COORD_TEXTS_MIND.white),
  black: coordSvg(COORD_TEXTS_MIND.black),
};

function coordLayer(sink: number, orientation: BoardOrientation) {
  if (sink <= 0) return COORD_LAYER[orientation];
  if (sink >= 1) return COORD_LAYER_MIND[orientation];
  return (
    <svg
      className="board-coords"
      viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
      aria-hidden="true"
      style={COORD_LAYER_STYLE}
    >
      {COORD_TEXTS[orientation]}
      <g opacity={sink}>{COORD_TEXTS_MIND[orientation]}</g>
    </svg>
  );
}

// Best-effort: capture keeps the gesture tracking when the pointer leaves
// the board, but a pointer can go inactive between down and capture, and
// browsers throw for it. The gesture still works without capture.
function capturePointer(e: React.PointerEvent) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    // Fall back to uncaptured tracking.
  }
}

// Per-square ink that stays readable on both square colors — the same
// pairing the coordinate labels use.
function squareInk(sq: string): string {
  const { f, r } = sqToIdx(sq);
  return isLightSquare(f, r) ? tokens.coordOnLight : tokens.coordOnDark;
}

function insetSquareMarker(sq: string, key: string, orientation: BoardOrientation) {
  const view = squareViewPosition(sq, orientation);
  return (
    <rect
      key={key}
      x={view.x * SQ + 4}
      y={view.y * SQ + 4}
      width={SQ - 8}
      height={SQ - 8}
      rx={8}
      fill="none"
      stroke={squareInk(sq)}
      strokeWidth={5}
      opacity={0.85}
    />
  );
}

// Same plane as the arrows overlay so annotate previews read exactly like
// the artifact they are about to record.
const PIECE_LAYER_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 1,
};
const OVERLAY_LAYER_STYLE: CSSProperties = {
  ...SVG_LAYER_STYLE,
  pointerEvents: 'none',
  zIndex: 3,
};
const BADGE_LAYER_STYLE: CSSProperties = {
  ...OVERLAY_LAYER_STYLE,
  zIndex: 5,
};

// Live preview of the gesture in progress. Move gestures mark the origin and
// the legal destinations (dot on empty squares, ring on occupied ones);
// annotate gestures preview the exact highlight or arrow a release would
// record, at reduced opacity so preview reads as not-yet-committed.
function GestureOverlay({
  gesture,
  positions,
  orientation,
}: {
  gesture: BoardGesture;
  positions: Positions;
  orientation: BoardOrientation;
}) {
  // Memoized on positions (not gesture start): a scripted move firing during
  // playback must restyle the dots, but a 60Hz drag frame must not rebuild
  // the set. Computed before the annotate early-return per the hooks rules.
  const occupied = useMemo(
    () =>
      new Set(
        Object.values(positions)
          .filter((p) => !p.captured)
          .map((p) => idxToSq(p.f, p.r)),
      ),
    [positions],
  );

  // One wrapper for both gesture kinds. `BOARD_GESTURE_CLASS` is the single
  // hook the PNG export filters on, so a branch that grew its own <svg> and
  // missed the class would bake the in-flight preview into a user's 1440×1440
  // export with nothing failing. The early return existed only to narrow
  // `gesture.kind`; a ternary narrows just as well.
  const body =
    gesture.kind === 'annotate' ? (
      gesture.over == null ? null : gesture.over !== gesture.from ? (
        <path
          d={buildArrowPath(arrowPoints(gesture.from, gesture.over, orientation))}
          fill={tokens.boardArrow}
          opacity={0.55}
        />
      ) : (
        <HlRing view={squareViewPosition(gesture.from, orientation)} opacity={0.5} />
      )
    ) : (
      <>
        {insetSquareMarker(gesture.from, 'from', orientation)}
        {[...gesture.targets].map((sq) => {
          const [cx, cy] = viewCenter(squareViewPosition(sq, orientation));
          return occupied.has(sq) ? (
            <circle key={sq} cx={cx} cy={cy} r={40} fill="none" stroke={squareInk(sq)} strokeWidth={7} opacity={0.5} />
          ) : (
            <circle key={sq} cx={cx} cy={cy} r={13} fill={squareInk(sq)} opacity={0.45} />
          );
        })}
        {gesture.over &&
          gesture.over !== gesture.from &&
          gesture.targets.has(gesture.over) &&
          insetSquareMarker(gesture.over, 'over', orientation)}
      </>
    );

  return (
    <svg
      className={BOARD_GESTURE_CLASS}
      viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
      aria-hidden="true"
      style={OVERLAY_LAYER_STYLE}
    >
      {body}
    </svg>
  );
}

export const Board = forwardRef<HTMLDivElement, BoardProps>(function Board({
  positions,
  lastMove,
  highlights,
  arrows,
  captureFlash,
  check,
  mind,
  revealedAt,
  time,
  orientation = 'white',
  interactive,
  legalTargets,
  onMoveGesture,
  onArrowGesture,
  onHighlightGesture,
  onMoveRejected,
}: BoardProps, forwardedRef) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  useImperativeHandle(forwardedRef, () => boardRef.current as HTMLDivElement, []);
  const [gesture, setGesture] = useState<BoardGesture | null>(null);
  // Whether the square under the pointer can start a move, so the board can
  // offer a resting `grab` cursor. Without it an editable board is visually
  // identical to an inert one and nothing invites the drag at all.
  const [hoverGrab, setHoverGrab] = useState(false);
  // The square that answer was computed for. `legalTargets` generates the
  // whole legal move list per call, which is far too heavy to run per
  // mousemove — only a square change can change the answer.
  const hoverSqRef = useRef<string | null>(null);
  const positionEntries = useMemo(() => Object.entries(positions), [positions]);
  const arrowShapes = useMemo(
    () =>
      arrows.map((arrow, index) => {
        const points = arrowPoints(arrow.from, arrow.to, orientation);
        return {
          arrow,
          d: buildArrowPath(points),
          guideD: buildArrowGuidePath(points),
          maskId: `arrow-mask-${index}-${arrow.from}-${arrow.to}`,
        };
      }),
    [arrows, orientation],
  );

  // Interactive mode can turn off while a pointer is still captured (for
  // example, keyboard-switching to Setup or Present during a drag). Cancel the
  // in-flight gesture at the mode boundary so its pointer-down callback cannot
  // commit into an editing surface that is no longer active.
  useEffect(() => {
    if (interactive || !gesture) return;
    const board = boardRef.current;
    if (board?.hasPointerCapture(gesture.pointerId)) {
      board.releasePointerCapture(gesture.pointerId);
    }
    setGesture(null);
  }, [interactive, gesture]);

  // A new position makes the cached hover answer wrong on the very same
  // square — the piece that could move a moment ago may be the opponent's now.
  // `legalTargets`'s identity changes with the position, so it is the signal.
  useEffect(() => {
    hoverSqRef.current = null;
    setHoverGrab(false);
  }, [legalTargets, interactive]);

  // Map a pointer event to the square under it, or null outside the board.
  const squareAtPointer = (e: React.PointerEvent): string | null => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x >= 1 || y < 0 || y >= 1) return null;
    return squareFromBoardView(Math.floor(x * 8), Math.floor(y * 8), orientation);
  };

  const onGesturePointerDown = (e: React.PointerEvent) => {
    if (!interactive || e.pointerType !== 'mouse') return;
    const downBit = buttonBit(e.button);
    if (gesture) {
      // A second button pressed while the drag's button is still held is a
      // chord: ignore it, the drag continues. A re-press of the initiating
      // button (or its bit missing from `buttons`) means the release happened
      // where the board couldn't see it (pointer capture unavailable): drop
      // the dangling gesture — its captured playhead is long stale — and let
      // this press start over.
      if (downBit !== gesture.buttonBit && (e.buttons & gesture.buttonBit) !== 0) return;
      setGesture(null);
    }
    const sq = squareAtPointer(e);
    if (!sq) return;
    // Ctrl+left covers macOS's right-click convention.
    const annotate = e.button === 2 || (e.button === 0 && e.ctrlKey);
    if (!annotate && e.button !== 0) return;
    const owner = { pointerId: e.pointerId, buttonBit: downBit };
    if (annotate) {
      e.preventDefault();
      capturePointer(e);
      setGesture(beginAnnotationGesture(owner, sq, onArrowGesture, onHighlightGesture));
      return;
    }
    const targets = new Set(legalTargets?.(sq) ?? []);
    if (targets.size === 0) {
      onMoveRejected?.(sq);
      return;
    }
    e.preventDefault();
    capturePointer(e);
    setGesture(beginMoveGesture(owner, sq, targets, onMoveGesture));
  };

  // Resting affordance only — a drag in flight already owns the cursor.
  const updateHoverCursor = (e: React.PointerEvent) => {
    if (gesture || !interactive || e.pointerType !== 'mouse') return;
    const sq = squareAtPointer(e);
    if (sq === hoverSqRef.current) return;
    hoverSqRef.current = sq;
    setHoverGrab(sq != null && (legalTargets?.(sq)?.length ?? 0) > 0);
  };

  const onGesturePointerMove = (e: React.PointerEvent) => {
    updateHoverCursor(e);
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    // The effect above owns normal mode transitions; this guard closes the
    // event-ordering window before that effect has run.
    if (!interactive) {
      setGesture(null);
      return;
    }
    if ((e.buttons & gesture.buttonBit) === 0) {
      // The initiating button is no longer held: it was released off-board
      // with capture unavailable. Cancel rather than commit — an uncaptured
      // off-board release never commits.
      setGesture(null);
      return;
    }
    const sq = squareAtPointer(e);
    if (sq !== gesture.over) setGesture(updateGestureTarget(gesture, sq));
  };

  const onGesturePointerUp = (e: React.PointerEvent) => {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    // Never invoke the captured commit after the board has become inert.
    if (!interactive) {
      setGesture(null);
      return;
    }
    // Releasing a chorded second button must not finish the drag.
    if (buttonBit(e.button) !== gesture.buttonBit) return;
    setGesture(null);
    const over = squareAtPointer(e);
    finishBoardGesture(gesture, over);
  };

  const onGesturePointerCancel = (e: React.PointerEvent) => {
    if (gesture && e.pointerId === gesture.pointerId) setGesture(null);
  };

  const lastMoveOpacity = lastMove ? timedProgress(time - lastMove.t, 0.12) : 0;
  const checkOpacity = check ? timedProgress(time - check.t, 0.12) : 0;
  const checkView = check ? squareViewPosition(check.sq, orientation) : null;

  // Which highlights are lit, resolved once: the rects render from this list
  // and mind mode's rehearsal reads it, so "is this alarm showing" has exactly
  // one answer per frame.
  const litHighlights: { h: BoardHighlight; age: number; opacity: number }[] = [];
  for (const h of highlights) {
    const age = time - h.t;
    const opacity = overlayOpacity(age, BOARD_OVERLAY_LIFETIME.highlight, h.pinned);
    if (opacity > 0) litHighlights.push({ h, age, opacity });
  }

  // While dark, the move on the board and the squares under a lit highlight or
  // a live check are being rehearsed — by the narration or by the alarm itself
  // — so their pieces resist the forgetting curve for as long as that lasts.
  // The world snapshot walk releases each rehearsal as it ends (see `touch`
  // in world.ts), so those pieces fade out rather than vanish; the exception
  // is an unpinned highlight,
  // which expires between events and keeps its own stamp. Arrows deliberately
  // hold nothing: the attack line persists while its endpoints fade.
  let mindFrame: MindFrame | null = null;
  if (mind) {
    let rehearsed: ReadonlySet<string> = mind.held;
    if (litHighlights.length > 0 || check) {
      const expanded = new Set(mind.held);
      for (const { h } of litHighlights) expanded.add(h.sq);
      if (check) expanded.add(check.sq);
      rehearsed = expanded;
    }
    mindFrame = { touches: mind.touches, rehearsed };
  }

  const sink = mindSink(mind, revealedAt, time);
  const boardVoid = voidLayer(sink);
  const coordinates = coordLayer(sink, orientation);
  // Outside mind mode every piece shares one strength (the reveal fade-up, or
  // a saturated 1 for scripts that never darken), so it is computed once here
  // instead of per piece per frame.
  const revealStrength = mindRevealStrength(revealedAt, time);
  const flash =
    captureFlash && time - captureFlash.t < BOARD_OVERLAY_LIFETIME.captureFlash
      ? captureFlashVisual(time - captureFlash.t)
      : null;
  const captureView = captureFlash
    ? boardViewPosition(captureFlash.f, captureFlash.r, orientation)
    : null;

  return (
    <div className="board-wrap">
      <div
        ref={boardRef}
        className="board"
        role="img"
        aria-label={`Chess board, ${orientation} perspective`}
        onPointerDown={onGesturePointerDown}
        onPointerMove={onGesturePointerMove}
        onPointerUp={onGesturePointerUp}
        onPointerCancel={onGesturePointerCancel}
        onPointerLeave={() => {
          hoverSqRef.current = null;
          if (hoverGrab) setHoverGrab(false);
        }}
        onContextMenu={(e) => {
          if (interactive) e.preventDefault();
        }}
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          position: 'relative',
          borderRadius: 'var(--board-radius)',
          overflow: 'hidden',
          boxShadow: tokens.shadowBoard,
          cursor: gesture
            ? gesture.kind === 'move'
              ? 'grabbing'
              : 'crosshair'
            : hoverGrab
              ? 'grab'
              : undefined,
        }}
      >
        {/* squares */}
        <svg
          viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
          aria-hidden="true"
          style={SVG_LAYER_STYLE}
        >
          {CHECK_GLOW_DEFS}
          {/* Once the void is fully sunk it is opaque, so the lit squares
             underneath are pure cost — drop them for the rest of the phase. */}
          {sink < 1 && SQUARE_RECTS}

          {/* The void sinks in over the lit squares; every overlay below
             renders on top of it, so the alarms keep carrying the light. */}
          {boardVoid}

          {lastMove &&
            lastMoveSquares(lastMove).map(({ f, r, fill, alpha }, i) => {
              const view = boardViewPosition(f, r, orientation);
              return (
                <rect
                  key={`lm-${i}`}
                  x={view.x * SQ}
                  y={view.y * SQ}
                  width={SQ}
                  height={SQ}
                  fill={fill}
                  opacity={lastMoveOpacity * alpha}
                />
              );
            })}

          {litHighlights.map(({ h, age, opacity }, i) => {
            return (
              <HlRing
                key={`hl-${h.sq}-${h.t}-${i}`}
                view={squareViewPosition(h.sq, orientation)}
                opacity={opacity}
                scale={0.94 + timedProgress(age, HIGHLIGHT_FADE_IN) * 0.06}
              />
            );
          })}

          {/* Check glow: vermillion radial under the checked king. A board
             state (not a timed overlay), so it persists while the check
             lasts and clears the moment the position resolves it. */}
          {checkView && checkOpacity > 0 && (
            <rect
              x={checkView.x * SQ}
              y={checkView.y * SQ}
              width={SQ}
              height={SQ}
              fill="url(#board-check-glow)"
              opacity={checkOpacity}
            />
          )}
        </svg>

        {/* zIndex here creates a stacking context so per-piece zIndex (1/5)
           stays contained and doesn't outrank the arrows overlay. */}
        <div
          aria-hidden="true"
          style={PIECE_LAYER_STYLE}
        >
          {positionEntries.map(([id, p]) => {
            const strength = mindFrame
              ? mindPieceStrength(mindFrame, idxToSq(p.f, p.r), time)
              : revealStrength;
            if (strength <= 0) return null;
            const visual = pieceVisual(p, time);
            const view = boardViewPosition(visual.f, visual.r, orientation);
            const tx = view.x * 100;
            const ty = view.y * 100;
            return (
              <div
                key={id}
                className="piece"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: '12.5%',
                  height: '12.5%',
                  transform: `translate3d(${tx}%, ${ty}%, 0) scale(${visual.scale})`,
                  opacity: visual.opacity * strength,
                  pointerEvents: 'none',
                  zIndex: pieceZIndex(visual),
                  willChange: visual.isMoving || visual.isCapturedFading ? 'transform, opacity' : 'auto',
                  padding: '0.75%',
                  boxSizing: 'border-box',
                }}
              >
                <Piece type={p.type} side={p.side} active={visual.isMoving} />
              </div>
            );
          })}
        </div>

        {/* Mid-ramp only: an opaque base with one fading layer over it, the
           same compositing rule the squares use. Cross-fading both at once
           would dip the labels to ~72% coverage at the midpoint. */}
        {coordinates}

        {/* arrows overlay — sits above pieces so annotations land on top */}
        <svg
          viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
          aria-hidden="true"
          style={OVERLAY_LAYER_STYLE}
        >
          {ARROW_SHADOW_DEFS}
          <g filter="url(#arrow-shadow)">
            {arrowShapes.map(({ arrow: a, d, guideD, maskId }, i) => {
              if (!d) return null;
              const age = time - a.t;
              const opacity = overlayOpacity(age, BOARD_OVERLAY_LIFETIME.arrow, a.pinned);
              if (opacity <= 0) return null;
              const draw = timedProgress(age, ARROW_DRAW_DURATION);
              return (
                <g key={`arr-${a.from}-${a.to}-${a.t}-${i}`} opacity={opacity}>
                  <defs>
                    <mask id={maskId} maskUnits="userSpaceOnUse">
                      <rect x="0" y="0" width={BOARD_SIZE} height={BOARD_SIZE} fill="black" />
                      <path
                        d={guideD}
                        fill="none"
                        stroke="white"
                        strokeWidth="86"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        pathLength={1}
                        strokeDasharray={1}
                        strokeDashoffset={1 - draw}
                      />
                    </mask>
                  </defs>
                  <path
                    d={d}
                    fill={tokens.boardArrow}
                    mask={`url(#${maskId})`}
                  />
                </g>
              );
            })}
          </g>
        </svg>

        {gesture && (
          <GestureOverlay gesture={gesture} positions={positions} orientation={orientation} />
        )}

        {captureFlash && captureView && flash && flash.opacity > 0 && (
          <div
            key={captureFlash.id}
            className="capture-flash"
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: `${(captureView.x / 8) * 100}%`,
              top: `${(captureView.y / 8) * 100}%`,
              width: '12.5%',
              height: '12.5%',
              borderRadius: '50%',
              background: tokens.captureFlash,
              pointerEvents: 'none',
              zIndex: 4,
              '--capture-opacity': flash.opacity.toFixed(3),
              '--capture-scale': flash.scale.toFixed(3),
            } as CSSProperties}
          />
        )}

        {/* Annotation badge — sits above pieces so a moved piece never
           occludes the move-quality mark. SVG-based so the disc and text
           scale with the board's viewBox without container queries. */}
        {lastMove?.annotation && (
          <svg
            viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
            aria-hidden="true"
            style={BADGE_LAYER_STYLE}
          >
            {ANNOTATION_BADGE_SHADOW_DEFS}
            {(() => {
              const annotation = lastMove.annotation;
              const mark = ANNOTATION_MARKS[annotation];
              const [cx, cy] = badgeCenter(
                boardViewPosition(lastMove.toF, lastMove.toR, orientation),
              );
              const isWide = mark.length === 2;
              const badgeProgress = timedProgress(time - lastMove.t - BADGE_DELAY, BADGE_IN_DURATION);
              if (badgeProgress <= 0) return null;
              const badgeScale = 0.9 + badgeProgress * 0.1;
              return (
                <g
                  filter="url(#annotation-badge-shadow)"
                  opacity={badgeProgress}
                  transform={`translate(${cx} ${cy}) scale(${badgeScale}) translate(${-cx} ${-cy})`}
                >
                  <BadgeDisc annotation={annotation} cx={cx} cy={cy} />
                  <text
                    x={cx}
                    y={cy + 1}
                    fontFamily={fontUi}
                    fontSize={isWide ? GLYPH_SIZE_DOUBLE : GLYPH_SIZE_SINGLE}
                    fontWeight={GLYPH_WEIGHT}
                    letterSpacing={isWide ? GLYPH_TRACKING_DOUBLE : 0}
                    fill={annotationInk}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {mark}
                  </text>
                </g>
              );
            })()}
          </svg>
        )}
      </div>
    </div>
  );
});
