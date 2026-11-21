import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { BOARD_GESTURE_CLASS } from '../lib/boardExport';
import { Piece } from './Piece';
import { idxToSq, legalTargets, sqToIdx, type GameState } from '../lib/chess';
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
  type BoardGesture,
} from '../lib/boardGesture';
import { easeOutQuart, timedProgress } from '../lib/animation';
import {
  mindPieceStrength,
  mindRevealStrength,
  mindSink,
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
// The board's own coordinate box; exported so the badge-clamp test
// (test/board.test.mjs) checks against this box, not a second `800`.
export const BOARD_SIZE = SQ * 8;
const HIGHLIGHT_FADE_IN = 0.16;
const OVERLAY_FADE_OUT = 0.32;
const ARROW_DRAW_DURATION = 0.34;
const BADGE_DELAY = 0.08;
const BADGE_IN_DURATION = 0.18;
// A restored piece grows from the capture fade-out's 0.82 end scale, so it
// returns along the visual path it left by.
const RESTORE_FADE_IN = 0.3;

type BoardProps = {
  boardRef: RefObject<HTMLDivElement>;
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
  orientation: BoardOrientation;
  // Gestures never draw directly; they report intents that App records as
  // script lines. Mouse-only: right-button gestures need a mouse.
  interactive: boolean;
  // The same snapshot value the board draws from, never a copy of it.
  chessState: GameState;
  onMoveGesture: (from: string, to: string) => void;
  onArrowGesture: (from: string, to: string) => void;
  onHighlightGesture: (sq: string) => void;
  // A left-press on a square that can't start a move; App owns the wording.
  onMoveRejected: (from: string) => void;
};

const BOARD_ARROW = {
  startInset: 18,
  endInset: 8,
  shaftHalf: 11,
  headHalf: 26,
  headLen: 36,
} as const;

type Seg = { x1: number; y1: number; ux: number; uy: number; len: number };

// Where the offset edges along consecutive segments `a` and `b` meet, shifted
// by `side * shaftHalf` (side: +1 = walker's left, -1 = right). Valid only for
// perpendicular legs (the knight L from `arrowPoints`); any other elbow needs
// a general line intersection.
function elbowJoin(a: Seg, b: Seg, side: number, shaftHalf: number): [number, number] {
  return [b.x1 + side * shaftHalf * (a.uy + b.uy), b.y1 - side * shaftHalf * (a.ux + b.ux)];
}

const polyline = (pts: ReadonlyArray<readonly [number, number]>) =>
  'M' + pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' L');

// The arrow outline as one polygon: tail → left elbows → head flare → right
// elbows → tail. `pts[0]` is the tail, `pts[last]` the tip.
function buildArrowPath(pts: Array<readonly [number, number]>): string {
  const { shaftHalf, headHalf, headLen } = BOARD_ARROW;
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

  const tipX = last.x1 + last.ux * last.len;
  const tipY = last.y1 + last.uy * last.len;
  const hbX = tipX - last.ux * headLen;
  const hbY = tipY - last.uy * headLen;
  const s0 = segs[0];
  const out: Array<[number, number]> = [];

  out.push([s0.x1 + s0.uy * shaftHalf, s0.y1 - s0.ux * shaftHalf]);
  for (let i = 0; i < segs.length - 1; i++) out.push(elbowJoin(segs[i], segs[i + 1], 1, shaftHalf));
  out.push([hbX + last.uy * shaftHalf, hbY - last.ux * shaftHalf]);
  out.push([hbX + last.uy * headHalf, hbY - last.ux * headHalf]);
  out.push([tipX, tipY]);
  out.push([hbX - last.uy * headHalf, hbY + last.ux * headHalf]);
  out.push([hbX - last.uy * shaftHalf, hbY + last.ux * shaftHalf]);
  for (let i = segs.length - 2; i >= 0; i--) out.push(elbowJoin(segs[i], segs[i + 1], -1, shaftHalf));
  out.push([s0.x1 - s0.uy * shaftHalf, s0.y1 + s0.ux * shaftHalf]);

  return polyline(out) + 'Z';
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

function pieceVisual(p: PiecePos, time: number) {
  let f = p.f;
  let r = p.r;
  let opacity = 1;
  let scale = 1;
  let isMoving = false;
  let isCapturedFading = false;

  if (p.moveT != null && p.moveFromF != null && p.moveFromR != null) {
    const age = time - p.moveT;
    const duration = Math.min(
      0.44,
      Math.max(0.22, 0.2 + Math.hypot(p.f - p.moveFromF, p.r - p.moveFromR) * 0.045),
    );
    if (age >= 0 && age < duration) {
      const eased = timedProgress(age, duration);
      f = p.moveFromF + (p.f - p.moveFromF) * eased;
      r = p.moveFromR + (p.r - p.moveFromR) * eased;
      scale = 1 + Math.sin(eased * Math.PI) * 0.026;
      isMoving = true;
    }
  }

  // restoredAt survives later captures (movePosition spreads the old piece),
  // so the capture guard keeps the capture fade authoritative over a stale
  // restore fade when both fall in the same window.
  if (!p.captured && p.restoredAt != null) {
    const age = time - p.restoredAt;
    if (age >= 0 && age < RESTORE_FADE_IN) {
      const eased = timedProgress(age, RESTORE_FADE_IN);
      opacity = eased;
      scale *= 0.82 + eased * 0.18;
    }
  }

  if (p.captured) {
    const age = time - p.capturedAt;
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

function captureFlashVisual(age: number) {
  const fadeIn = timedProgress(age, BOARD_OVERLAY_LIFETIME.captureFlash * 0.32);
  const fadeOut = 1 - timedProgress(
    age - BOARD_OVERLAY_LIFETIME.captureFlash * 0.32,
    BOARD_OVERLAY_LIFETIME.captureFlash * 0.68,
  );
  return {
    opacity: Math.min(fadeIn, fadeOut),
    scale: 0.45 + timedProgress(age, BOARD_OVERLAY_LIFETIME.captureFlash) * 1.85,
  };
}

const viewCenter = (view: BoardViewPosition): [number, number] => [
  view.x * SQ + SQ / 2,
  view.y * SQ + SQ / 2,
];

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
  const [x1, y1] = viewCenter(squareViewPosition(from, orientation));
  const [x2, y2] = viewCenter(squareViewPosition(to, orientation));
  const df = toXY.f - fromXY.f;
  const dr = toXY.r - fromXY.r;
  const isKnight =
    (Math.abs(df) === 1 && Math.abs(dr) === 2) ||
    (Math.abs(df) === 2 && Math.abs(dr) === 1);

  if (isKnight) {
    const verticalFirst = Math.abs(dr) === 2;
    const elbowF = verticalFirst ? fromXY.f : toXY.f;
    const elbowR = verticalFirst ? toXY.r : fromXY.r;
    const [ex, ey] = viewCenter(boardViewPosition(elbowF, elbowR, orientation));
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
// Ink that stays readable on either square color — the coordinate-label
// pairing, which the gesture marks share (DESIGN.md, Move gestures).
const coordInk = (isLight: boolean) => (isLight ? tokens.coordOnLight : tokens.coordOnDark);

// The two squares a last move paints, origin first. An annotated move repaints
// only where it landed; the origin keeps the amber so the move still reads
// directionally.
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

// The last move is a flood, never a stroke. Returns the element (not props) so
// a call site cannot add one, and test/board.test.mjs asserts that by calling it.
export function LastMoveRect({
  view,
  fill,
  opacity,
}: {
  view: BoardViewPosition;
  fill: string;
  opacity: number;
}) {
  return squareRect(view, fill, opacity);
}

// One whole square, filled: the last-move flood and the check glow.
const squareRect = (view: BoardViewPosition, fill: string, opacity: number) => (
  <rect x={view.x * SQ} y={view.y * SQ} width={SQ} height={SQ} fill={fill} opacity={opacity} />
);

// The move-quality badge radius, in board units (SQ = 100); exported so the
// clamp test checks against this radius.
export const BADGE_R = 23;
// The disc's center sits on the square's top-right corner, so it does not
// cover the piece and reads as applied to the move. `badgeCenter` clamps it
// this far inside the board, since the viewBox and the PNG both clip there.
export const BADGE_EDGE_MARGIN = 4;

// The glyphs are `<text>` in the chrome face; the PNG rasterizes them in that
// face only because the board fonts are self-hosted and preloaded. 700, not
// 900: at ~40px, 900 closes `?`'s aperture and fuses doubled marks.
const GLYPH_WEIGHT = 700;
// Size and tracking per mark, in board units, measured in Schibsted 700. The
// doubled marks need opposite fixes: `!!` needs positive tracking or its stems
// fuse at 1080p; `??` is too wide for the disc at single size, and any negative
// tracking makes its hooks touch.
const BADGE_GLYPHS: Record<MoveAnnotation, { size: number; tracking: number }> = {
  brilliant: { size: 40, tracking: 2.5 },
  great: { size: 42, tracking: 0 },
  mistake: { size: 42, tracking: 0 },
  blunder: { size: 33, tracking: 0.5 },
};
// Cap height as a share of the em in Schibsted Grotesk. The baseline sits half
// a cap below the disc's center to center the ink; `dominant-baseline="central"`
// centers the em box instead and puts the marks low.
const GLYPH_CAP_HEIGHT = 0.716;

export function badgeCenter(view: BoardViewPosition): [number, number] {
  const limit = BOARD_SIZE - BADGE_R - BADGE_EDGE_MARGIN;
  const floor = BADGE_R + BADGE_EDGE_MARGIN;
  return [Math.min((view.x + 1) * SQ, limit), Math.max(view.y * SQ, floor)];
}

// The disc has no rim. Returns the element (not props) so a call site cannot
// add a stroke, and test/board.test.mjs asserts that by calling it.
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

// The `hl` ring, in board units (SQ = 100). A circle, not a rounded square: a
// rounded rect echoes the grid and reads as UI selection. A 6-unit stroke
// still resolves at 480p.
const HL_RING = 6;
const HL_RADIUS = 43;

// The live overlay and the gesture preview both draw the ring through this, so
// the preview cannot promise a mark the script will not produce. Returns the
// element (not props) so a call site cannot override the radius or stroke.
// `scale` pivots on the ring's own center. The stroke is opaque, so one color
// serves both square colors.
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

function coordLabels(orientation: BoardOrientation) {
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

// The board's one <defs>, hoisted so per-frame renders reuse one element. SVG
// ids are document-global, so the other planes resolve `url(#…)` against these
// in the always-mounted base plane; keep one copy per id.
const BOARD_DEFS = (
  <defs>
    <radialGradient id="board-check-glow">
      <stop offset="0%" stopColor={tokens.boardCheckCenter} />
      <stop offset="55%" stopColor={tokens.boardCheckMid} />
      <stop offset="92%" stopColor={tokens.boardCheckEdge} />
    </radialGradient>
    <filter id="arrow-shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#0f1525" floodOpacity="0.32" />
    </filter>
    {/* The badge's only edge: `great` blue is ~1:1 against the dark square,
       so the shadow carries the disc there. 0.7 is the deepest that does not
       read as grime on the cream squares. */}
    <filter id="annotation-badge-shadow" x="-45%" y="-45%" width="190%" height="190%">
      <feDropShadow dx="0" dy="3" stdDeviation="3.5" floodColor="#0f1525" floodOpacity="0.7" />
    </filter>
  </defs>
);

// Hoisted fragments, so a steady frame bails out on element identity instead
// of diffing 64 rects.
const squareRects = (light: string, dark: string) => (
  <>
    {SQUARES.map(({ f, r, isLight }) => (
      <rect
        key={`${f}-${r}`}
        x={f * SQ}
        y={(7 - r) * SQ}
        width={SQ}
        height={SQ}
        fill={isLight ? light : dark}
      />
    ))}
  </>
);
const SQUARE_RECTS = squareRects(tokens.squareLight, tokens.squareDark);
// The void: a layer faded in over the lit squares by `mindSink`, not a fill
// swap, so the sink follows the playback clock and overlays stay on top.
const VOID_RECTS = squareRects(tokens.mindVoidLight, tokens.mindVoidDark);
// The fully-sunk steady state, hoisted for the same identity bail-out.
const VOID_G = <g>{VOID_RECTS}</g>;

// Coordinates paint above the pieces but below the arrows (first in the arrows'
// plane). Two hoisted label sets, board ink and the bright mind's-eye ink that
// fades in with the void, so steady frames bail out on identity. `ink` null
// means the per-square board pair.
const coordTexts = (ink: string | null, orientation: BoardOrientation) => (
  <>
    {coordLabels(orientation).map((c, i) => (
      <text
        key={`coord-${i}`}
        x={c.x}
        y={c.y}
        fontFamily="ui-sans-serif, system-ui"
        fontSize="14"
        fontWeight="700"
        textAnchor={c.anchor}
        fill={ink ?? coordInk(c.isLight)}
        opacity="0.95"
      >
        {c.text}
      </text>
    ))}
  </>
);
const coordSet = (orientation: BoardOrientation) => {
  const mind = coordTexts(tokens.mindCoordInk, orientation);
  return { lit: coordTexts(null, orientation), mind, mindG: <g>{mind}</g> };
};
const COORDS = { white: coordSet('white'), black: coordSet('black') };

// The board's stack; the code half of the layer table in docs/design.md. The
// squares plane is the base and takes no entry. Per-piece 1/4/5 z-indexes live
// inside the pieces layer's stacking context and are not sourced from here.
// The board is not its own stacking context, so these meet the page's
// z-indexes; 3 is the plane DESIGN.md names for the gesture preview.
const BOARD_LAYER_Z = {
  pieces: 1,
  // Arrows and the gesture preview share a plane so a preview reads exactly
  // like the mark it would record.
  overlay: 3,
  captureFlash: 4,
  badge: 5,
} as const;

// One prebuilt style object per plane: Board re-renders every animation frame,
// and a style built per call would hand every layer a new prop each frame.
const BOARD_LAYER_BASE_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
};
const BOARD_LAYER_STYLE: Record<number, CSSProperties> = Object.fromEntries(
  Object.values(BOARD_LAYER_Z).map((z) => [z, { ...BOARD_LAYER_BASE_STYLE, zIndex: z }]),
);

// A full-size SVG plane: its own z (or none, for the base) and an optional class.
function BoardLayer({
  z,
  className,
  children,
}: {
  z?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
      aria-hidden="true"
      style={z === undefined ? BOARD_LAYER_BASE_STYLE : BOARD_LAYER_STYLE[z]}
    >
      {children}
    </svg>
  );
}

// Best-effort: browsers throw if the pointer went inactive before capture, and
// the gesture still works uncaptured.
function capturePointer(e: React.PointerEvent) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    // Uncaptured tracking is the fallback.
  }
}

function squareInk(sq: string): string {
  const { f, r } = sqToIdx(sq);
  return coordInk(isLightSquare(f, r));
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

// Live preview of the gesture in progress: a move marks the origin and legal
// destinations; an annotate previews, at reduced opacity, the exact mark a
// release would record. Exported for test/board-export.test.mjs.
export function GestureOverlay({
  gesture,
  positions,
  orientation,
}: {
  gesture: BoardGesture;
  positions: Positions;
  orientation: BoardOrientation;
}) {
  // Memoized on positions: a scripted move during playback must restyle the
  // dots, but a drag frame must not rebuild the set.
  const occupied = useMemo(
    () =>
      new Set(
        Object.values(positions)
          .filter((p) => !p.captured)
          .map((p) => idxToSq(p.f, p.r)),
      ),
    [positions],
  );

  // Both gesture kinds render inside one wrapper carrying `BOARD_GESTURE_CLASS`,
  // which `snapshotBoard` removes so the preview never reaches a PNG
  // (test/board-export.test.mjs).
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
    <BoardLayer z={BOARD_LAYER_Z.overlay} className={BOARD_GESTURE_CLASS}>
      {body}
    </BoardLayer>
  );
}

export function Board({
  boardRef,
  positions,
  lastMove,
  highlights,
  arrows,
  captureFlash,
  check,
  mind,
  revealedAt,
  time,
  orientation,
  interactive,
  chessState,
  onMoveGesture,
  onArrowGesture,
  onHighlightGesture,
  onMoveRejected,
}: BoardProps) {
  const [gesture, setGesture] = useState<BoardGesture | null>(null);
  // Whether the square under the pointer can start a move (the `grab` cursor).
  const [hoverGrab, setHoverGrab] = useState(false);
  // The square `hoverGrab` was computed for, so mousemove sets state only when
  // the square changes.
  const hoverSqRef = useRef<string | null>(null);
  const positionEntries = useMemo(() => Object.entries(positions), [positions]);
  const arrowShapes = useMemo(
    () =>
      arrows.map((arrow, index) => {
        const points = arrowPoints(arrow.from, arrow.to, orientation);
        return {
          arrow,
          d: buildArrowPath(points),
          guideD: polyline(points),
          maskId: `arrow-mask-${index}-${arrow.from}-${arrow.to}`,
        };
      }),
    [arrows, orientation],
  );

  // Interactive mode can turn off mid-drag (e.g. a keyboard tab switch); cancel
  // the gesture so it cannot commit into a surface that is no longer editing.
  useEffect(() => {
    if (interactive || !gesture) return;
    const board = boardRef.current;
    if (board?.hasPointerCapture(gesture.pointerId)) {
      board.releasePointerCapture(gesture.pointerId);
    }
    setGesture(null);
  }, [interactive, gesture]);

  // A new position invalidates the cached hover answer even on the same square;
  // `chessState` identity changes with the position.
  useEffect(() => {
    hoverSqRef.current = null;
    setHoverGrab(false);
  }, [chessState, interactive]);

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
      // A second button while the drag's button is held is a chord: ignore it.
      // Otherwise the release was missed (no capture): drop the stale gesture
      // and let this press start over.
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
    const targets = legalTargets(chessState, sq);
    if (targets.size === 0) {
      onMoveRejected(sq);
      return;
    }
    e.preventDefault();
    capturePointer(e);
    setGesture(beginMoveGesture(owner, sq, targets, onMoveGesture));
  };

  const updateHoverCursor = (e: React.PointerEvent) => {
    if (gesture || !interactive || e.pointerType !== 'mouse') return;
    const sq = squareAtPointer(e);
    if (sq === hoverSqRef.current) return;
    hoverSqRef.current = sq;
    setHoverGrab(sq != null && legalTargets(chessState, sq).size > 0);
  };

  const onGesturePointerMove = (e: React.PointerEvent) => {
    updateHoverCursor(e);
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    // Covers the window before the mode-change effect above has run.
    if (!interactive) {
      setGesture(null);
      return;
    }
    if ((e.buttons & gesture.buttonBit) === 0) {
      // Released off-board without capture: cancel, never commit.
      setGesture(null);
      return;
    }
    const sq = squareAtPointer(e);
    if (sq !== gesture.over) setGesture({ ...gesture, over: sq });
  };

  const onGesturePointerUp = (e: React.PointerEvent) => {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    // Never commit once the board is no longer interactive.
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

  // Lit highlights, resolved once: the rings and mind-mode rehearsal both read
  // this list, so they agree on what is showing.
  const litHighlights: { h: BoardHighlight; age: number; opacity: number }[] = [];
  for (const h of highlights) {
    const age = time - h.t;
    const opacity = overlayOpacity(age, BOARD_OVERLAY_LIFETIME.highlight, h.pinned);
    if (opacity > 0) litHighlights.push({ h, age, opacity });
  }

  // While dark, held squares and squares under a lit highlight or live check
  // are rehearsed and resist fading. world.ts (`touch`) restamps a rehearsal as
  // it ends so the piece fades rather than vanishes; an unpinned highlight
  // keeps its own stamp. Arrows rehearse nothing by design.
  const mindFrame = mind
    ? {
        touches: mind.touches,
        rehearsed: new Set([
          ...mind.held,
          ...litHighlights.map(({ h }) => h.sq),
          ...(check ? [check.sq] : []),
        ]),
      }
    : null;

  const sink = mindSink(mind, revealedAt, time);
  const coords = COORDS[orientation];
  // Outside mind mode every piece shares this one strength.
  const revealStrength = mindRevealStrength(revealedAt, time);
  const flash =
    captureFlash && time - captureFlash.t < BOARD_OVERLAY_LIFETIME.captureFlash
      ? {
          id: captureFlash.id,
          view: boardViewPosition(captureFlash.f, captureFlash.r, orientation),
          ...captureFlashVisual(time - captureFlash.t),
        }
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
        <BoardLayer>
          {BOARD_DEFS}
          {/* A fully sunk void is opaque, so the lit squares under it are skipped. */}
          {sink < 1 && SQUARE_RECTS}

          {/* Every overlay below renders on top of the void. */}
          {sink >= 1 ? VOID_G : sink > 0 && <g opacity={sink}>{VOID_RECTS}</g>}

          {lastMove &&
            lastMoveSquares(lastMove).map(({ f, r, fill, alpha }, i) => (
              <LastMoveRect
                key={`lm-${i}`}
                view={boardViewPosition(f, r, orientation)}
                fill={fill}
                opacity={lastMoveOpacity * alpha}
              />
            ))}

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

          {/* Check glow: board state, not a timed overlay; it lasts as long as the check. */}
          {checkView &&
            checkOpacity > 0 &&
            squareRect(checkView, 'url(#board-check-glow)', checkOpacity)}
        </BoardLayer>

        {/* HTML divs, not a `BoardLayer`, so transforms stay on the compositor.
           Its zIndex makes a stacking context that contains per-piece 1/4/5. */}
        <div aria-hidden="true" style={BOARD_LAYER_STYLE[BOARD_LAYER_Z.pieces]}>
          {positionEntries.map(([id, p]) => {
            const strength = mindFrame
              ? mindPieceStrength(mindFrame, idxToSq(p.f, p.r), time)
              : revealStrength;
            if (strength <= 0) return null;
            const visual = pieceVisual(p, time);
            // Captured pieces stay in `positions` (a restore can fade them back).
            if (visual.opacity <= 0) return null;
            const view = boardViewPosition(visual.f, visual.r, orientation);
            const tx = view.x * 100;
            const ty = view.y * 100;
            return (
              <div
                key={id}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: '12.5%',
                  height: '12.5%',
                  transform: `translate3d(${tx}%, ${ty}%, 0) scale(${visual.scale})`,
                  opacity: visual.opacity * strength,
                  zIndex: visual.isMoving ? 5 : visual.isCapturedFading ? 4 : 1,
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

        {/* coordinates, then arrows */}
        <BoardLayer z={BOARD_LAYER_Z.overlay}>
          {/* An opaque base with one fading set over it, as the squares do;
             cross-fading both would dip the labels mid-ramp. */}
          {sink < 1 && coords.lit}
          {sink >= 1 ? coords.mindG : sink > 0 && <g opacity={sink}>{coords.mind}</g>}
          <g filter="url(#arrow-shadow)">
            {arrowShapes.map(({ arrow: a, d, guideD, maskId }, i) => {
              if (!d) return null;
              const age = time - a.t;
              const opacity = overlayOpacity(age, BOARD_OVERLAY_LIFETIME.arrow, a.pinned);
              if (opacity <= 0) return null;
              const draw = timedProgress(age, ARROW_DRAW_DURATION);
              return (
                <g key={`arr-${a.from}-${a.to}-${a.t}-${i}`} opacity={opacity}>
                  {/* A mask never renders in place, so it needs no <defs>. */}
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
                  <path
                    d={d}
                    fill={tokens.boardArrow}
                    mask={`url(#${maskId})`}
                  />
                </g>
              );
            })}
          </g>
        </BoardLayer>

        {gesture && (
          <GestureOverlay gesture={gesture} positions={positions} orientation={orientation} />
        )}

        {flash && flash.opacity > 0 && (
          <div
            key={flash.id}
            className="capture-flash"
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: `${(flash.view.x / 8) * 100}%`,
              top: `${(flash.view.y / 8) * 100}%`,
              width: '12.5%',
              height: '12.5%',
              borderRadius: '50%',
              background: tokens.captureFlash,
              pointerEvents: 'none',
              zIndex: BOARD_LAYER_Z.captureFlash,
              '--capture-opacity': flash.opacity.toFixed(3),
              '--capture-scale': flash.scale.toFixed(3),
            } as CSSProperties}
          />
        )}

        {/* Annotation badge, above the pieces so a moved piece never covers it. */}
        {lastMove?.annotation && (
          <BoardLayer z={BOARD_LAYER_Z.badge}>
            {(() => {
              const annotation = lastMove.annotation;
              const mark = ANNOTATION_MARKS[annotation];
              const [cx, cy] = badgeCenter(
                boardViewPosition(lastMove.toF, lastMove.toR, orientation),
              );
              const glyph = BADGE_GLYPHS[annotation];
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
                  {/* Tracking is added after every glyph, the last one included, so
                     a middle-anchored run sits half a step off; x takes it back. */}
                  <text
                    x={cx + glyph.tracking / 2}
                    y={cy + (glyph.size * GLYPH_CAP_HEIGHT) / 2}
                    fontFamily={fontUi}
                    fontSize={glyph.size}
                    fontWeight={GLYPH_WEIGHT}
                    letterSpacing={glyph.tracking}
                    fill={annotationInk}
                    textAnchor="middle"
                  >
                    {mark}
                  </text>
                </g>
              );
            })()}
          </BoardLayer>
        )}
      </div>
    </div>
  );
}
