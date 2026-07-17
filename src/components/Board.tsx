// Pieces translate via `translate3d` so motion stays on the GPU compositor.

import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { Piece } from './Piece';
import { idxToSq, sqToIdx, type PieceType, type Side } from '../lib/chess';
import {
  beginAnnotationGesture,
  beginMoveGesture,
  finishBoardGesture,
  updateGestureTarget,
  type BoardGesture,
} from '../lib/boardGesture';
import type { MoveAnnotation } from '../lib/timeline';
import { annotationColors, annotationInk, fontUi, tokens } from '../lib/tokens';

const SQ = 100;
const BOARD_SIZE = SQ * 8;
export const BOARD_OVERLAY_LIFETIME = {
  highlight: 2.5,
  arrow: 2.5,
  captureFlash: 0.5,
} as const;
const HIGHLIGHT_FADE_IN = 0.16;
const OVERLAY_FADE_OUT = 0.32;
const ARROW_DRAW_DURATION = 0.34;
const BADGE_DELAY = 0.08;
const BADGE_IN_DURATION = 0.18;

type BoardProps = {
  positions: Record<string, PiecePos>;
  lastMove: LastMove | null;
  highlights: BoardHighlight[];
  arrows: BoardArrow[];
  captureFlash: CaptureFlash | null;
  check: BoardCheck | null;
  time: number;
  // Interactive editing (Script tab only). Gestures never draw directly —
  // they report intents that App records as script lines, so the script
  // text stays the single source of truth. Mouse-only by design: this is a
  // desktop screen-recording tool and right-button gestures need a mouse.
  interactive?: boolean;
  legalTargets?: (from: string) => string[];
  onMoveGesture?: (from: string, to: string) => void;
  onArrowGesture?: (from: string, to: string) => void;
  onHighlightGesture?: (sq: string) => void;
};

export type PiecePos = {
  f: number;
  r: number;
  type: PieceType;
  side: Side;
  captured?: boolean;
  capturedAt?: number;
  moveFromF?: number;
  moveFromR?: number;
  moveT?: number;
};

export type LastMove = {
  fromF: number;
  fromR: number;
  toF: number;
  toR: number;
  t: number;
  annotation?: MoveAnnotation;
};

export type BoardHighlight = { sq: string; t: number; pinned?: boolean };
export type BoardArrow = { from: string; to: string; t: number; pinned?: boolean };
export type CaptureFlash = { f: number; r: number; t: number; id: string };
// Checked king square + the time the check appeared (drives the fade-in).
export type BoardCheck = { sq: string; t: number };

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

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function easeOutQuart(n: number): number {
  const p = clamp01(n);
  return 1 - Math.pow(1 - p, 4);
}

function timedProgress(age: number, duration: number): number {
  if (age <= 0) return 0;
  if (age >= duration) return 1;
  return easeOutQuart(age / duration);
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

function squareCenter(f: number, r: number): [number, number] {
  return [f * SQ + SQ / 2, (7 - r) * SQ + SQ / 2];
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

function arrowPoints(from: string, to: string): Array<readonly [number, number]> {
  const fromXY = sqToIdx(from);
  const toXY = sqToIdx(to);
  const [x1, y1] = squareCenter(fromXY.f, fromXY.r);
  const [x2, y2] = squareCenter(toXY.f, toXY.r);
  const df = toXY.f - fromXY.f;
  const dr = toXY.r - fromXY.r;
  const isKnight =
    (Math.abs(df) === 1 && Math.abs(dr) === 2) ||
    (Math.abs(df) === 2 && Math.abs(dr) === 1);

  if (isKnight) {
    const verticalFirst = Math.abs(dr) === 2;
    const elbowF = verticalFirst ? fromXY.f : toXY.f;
    const elbowR = verticalFirst ? toXY.r : fromXY.r;
    const [ex, ey] = squareCenter(elbowF, elbowR);
    const start = insetPoint(x1, y1, ex, ey, BOARD_ARROW.startInset);
    const end = insetPoint(x2, y2, ex, ey, BOARD_ARROW.endInset);
    return [start, [ex, ey], end];
  }

  return [
    insetPoint(x1, y1, x2, y2, BOARD_ARROW.startInset),
    insetPoint(x2, y2, x1, y1, BOARD_ARROW.endInset),
  ];
}

// Annotation badges sit on the destination square's upper-right corner, close
// to chess broadcast / analysis overlays: a large soft disc with a clear mark.
const ANNOTATION_BADGE: Record<MoveAnnotation, { fill: string; mark: string }> = {
  brilliant: { fill: annotationColors.brilliant, mark: '!!' },
  great: { fill: annotationColors.great, mark: '!' },
  mistake: { fill: annotationColors.mistake, mark: '?' },
  blunder: { fill: annotationColors.blunder, mark: '??' },
};

// The board's light/dark convention (a1 dark) in one place.
const isLightSquare = (f: number, r: number) => (f + r) % 2 === 1;
// Last-move amber needs a higher alpha on blue squares; see tokens.ts.
const lastMoveFill = (f: number, r: number) =>
  isLightSquare(f, r) ? tokens.boardLastMoveOnLight : tokens.boardLastMoveOnDark;

const SQUARES: { f: number; r: number; isLight: boolean }[] = [];
for (let r = 7; r >= 0; r--) {
  for (let f = 0; f < 8; f++) SQUARES.push({ f, r, isLight: isLightSquare(f, r) });
}

const COORD_LABELS: { x: number; y: number; isLight: boolean; text: string; anchor: 'end' | 'start' }[] = [
  ...Array.from({ length: 8 }, (_, f) => ({
    x: f * SQ + SQ - 8,
    y: 8 * SQ - 8,
    isLight: f % 2 === 1,
    text: String.fromCharCode(97 + f),
    anchor: 'end' as const,
  })),
  ...Array.from({ length: 8 }, (_, r) => ({
    x: 4,
    y: (7 - r) * SQ + 16,
    isLight: r % 2 === 1,
    text: String(r + 1),
    anchor: 'start' as const,
  })),
];

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

// The 64 base squares never change — hoisted like CHECK_GLOW_DEFS so the
// per-frame render diffs one constant element instead of 64 rects.
const SQUARE_RECTS = SQUARES.map(({ f, r, isLight }) => (
  <rect
    key={`${f}-${r}`}
    x={f * SQ}
    y={(7 - r) * SQ}
    width={SQ}
    height={SQ}
    fill={isLight ? tokens.squareLight : tokens.squareDark}
  />
));

// Coordinates sit above enlarged Staunty pieces so file/rank labels remain
// visible in recordings, but below annotation arrows. Fully static: the
// whole layer is one hoisted element.
const COORD_LAYER = (
  <svg
    viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
    aria-hidden="true"
    style={{
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: 2,
    }}
  >
    {COORD_LABELS.map((c, i) => (
      <text
        key={`coord-${i}`}
        x={c.x}
        y={c.y}
        fontFamily="ui-sans-serif, system-ui"
        fontSize="14"
        fontWeight="700"
        textAnchor={c.anchor}
        fill={c.isLight ? tokens.coordOnLight : tokens.coordOnDark}
        opacity="0.95"
      >
        {c.text}
      </text>
    ))}
  </svg>
);

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

function insetSquareMarker(sq: string, key: string) {
  const { f, r } = sqToIdx(sq);
  return (
    <rect
      key={key}
      x={f * SQ + 4}
      y={(7 - r) * SQ + 4}
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
const GESTURE_LAYER_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  zIndex: 3,
};

// Live preview of the gesture in progress. Move gestures mark the origin and
// the legal destinations (dot on empty squares, ring on occupied ones);
// annotate gestures preview the exact highlight or arrow a release would
// record, at reduced opacity so preview reads as not-yet-committed.
function GestureOverlay({
  gesture,
  positions,
}: {
  gesture: BoardGesture;
  positions: Record<string, PiecePos>;
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

  if (gesture.kind === 'annotate') {
    const { from, over } = gesture;
    const fromIdx = sqToIdx(from);
    return (
      <svg viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`} aria-hidden="true" style={GESTURE_LAYER_STYLE}>
        {over && over !== from ? (
          <path d={buildArrowPath(arrowPoints(from, over))} fill={tokens.boardArrow} opacity={0.55} />
        ) : (
          <rect
            x={fromIdx.f * SQ}
            y={(7 - fromIdx.r) * SQ}
            width={SQ}
            height={SQ}
            fill={tokens.boardHighlight}
            opacity={0.5}
          />
        )}
      </svg>
    );
  }

  const { from, over, targets } = gesture;
  return (
    <svg viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`} aria-hidden="true" style={GESTURE_LAYER_STYLE}>
      {insetSquareMarker(from, 'from')}
      {[...targets].map((sq) => {
        const { f, r } = sqToIdx(sq);
        const [cx, cy] = squareCenter(f, r);
        return occupied.has(sq) ? (
          <circle key={sq} cx={cx} cy={cy} r={40} fill="none" stroke={squareInk(sq)} strokeWidth={7} opacity={0.5} />
        ) : (
          <circle key={sq} cx={cx} cy={cy} r={13} fill={squareInk(sq)} opacity={0.45} />
        );
      })}
      {over && over !== from && targets.has(over) && insetSquareMarker(over, 'over')}
    </svg>
  );
}

export function Board({
  positions,
  lastMove,
  highlights,
  arrows,
  captureFlash,
  check,
  time,
  interactive,
  legalTargets,
  onMoveGesture,
  onArrowGesture,
  onHighlightGesture,
}: BoardProps) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [gesture, setGesture] = useState<BoardGesture | null>(null);
  // The pointer and button that started the gesture: other pointers (a stray
  // touch mid-drag) must not retarget, commit, or cancel it, and releasing a
  // chorded second button must not finish it. `buttonBit` is the initiating
  // button's `e.buttons` bit, used to detect a release the board never saw
  // when pointer capture was unavailable.
  const gesturePointer = useRef<{ id: number; buttonBit: number } | null>(null);

  // Map a pointer event to the square under it, or null outside the board.
  const squareAtPointer = (e: React.PointerEvent): string | null => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x >= 1 || y < 0 || y >= 1) return null;
    return idxToSq(Math.floor(x * 8), 7 - Math.floor(y * 8));
  };

  const onGesturePointerDown = (e: React.PointerEvent) => {
    if (!interactive || e.pointerType !== 'mouse') return;
    const downBit = e.button === 2 ? 2 : e.button === 0 ? 1 : 0;
    if (gesture) {
      // A second button pressed while the drag's button is still held is a
      // chord: ignore it, the drag continues. A re-press of the initiating
      // button (or its bit missing from `buttons`) means the release happened
      // where the board couldn't see it (pointer capture unavailable): drop
      // the dangling gesture — its captured playhead is long stale — and let
      // this press start over.
      const gp = gesturePointer.current;
      if (gp && downBit !== gp.buttonBit && (e.buttons & gp.buttonBit) !== 0) return;
      setGesture(null);
    }
    const sq = squareAtPointer(e);
    if (!sq) return;
    // Ctrl+left covers macOS's right-click convention.
    const annotate = e.button === 2 || (e.button === 0 && e.ctrlKey);
    if (!annotate && e.button !== 0) return;
    if (annotate) {
      e.preventDefault();
      capturePointer(e);
      gesturePointer.current = { id: e.pointerId, buttonBit: downBit };
      setGesture(beginAnnotationGesture(sq, onArrowGesture, onHighlightGesture));
      return;
    }
    const targets = new Set(legalTargets?.(sq) ?? []);
    if (targets.size === 0) return;
    e.preventDefault();
    capturePointer(e);
    gesturePointer.current = { id: e.pointerId, buttonBit: downBit };
    setGesture(beginMoveGesture(sq, targets, onMoveGesture));
  };

  const onGesturePointerMove = (e: React.PointerEvent) => {
    const gp = gesturePointer.current;
    if (!gesture || !gp || e.pointerId !== gp.id) return;
    if ((e.buttons & gp.buttonBit) === 0) {
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
    const gp = gesturePointer.current;
    if (!gesture || !gp || e.pointerId !== gp.id) return;
    // Releasing a chorded second button must not finish the drag.
    const upBit = e.button === 2 ? 2 : e.button === 0 ? 1 : 0;
    if (upBit !== gp.buttonBit) return;
    setGesture(null);
    const over = squareAtPointer(e);
    finishBoardGesture(gesture, over);
  };

  const onGesturePointerCancel = (e: React.PointerEvent) => {
    if (e.pointerId === gesturePointer.current?.id) setGesture(null);
  };

  const lastMoveOpacity = lastMove ? timedProgress(time - lastMove.t, 0.12) : 0;
  const checkOpacity = check ? timedProgress(time - check.t, 0.12) : 0;
  const checkIdx = check ? sqToIdx(check.sq) : null;
  const flash =
    captureFlash && time - captureFlash.t < BOARD_OVERLAY_LIFETIME.captureFlash
      ? captureFlashVisual(time - captureFlash.t)
      : null;

  return (
    <div className="board-wrap">
      <div
        ref={boardRef}
        className="board"
        role="img"
        aria-label="Chess board"
        onPointerDown={onGesturePointerDown}
        onPointerMove={onGesturePointerMove}
        onPointerUp={onGesturePointerUp}
        onPointerCancel={onGesturePointerCancel}
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
          cursor: gesture ? (gesture.kind === 'move' ? 'grabbing' : 'crosshair') : undefined,
        }}
      >
        {/* squares */}
        <svg
          viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          {CHECK_GLOW_DEFS}
          {SQUARE_RECTS}

          {lastMove &&
            (
              [
                [lastMove.fromF, lastMove.fromR],
                [lastMove.toF, lastMove.toR],
              ] as const
            ).map(([f, r], i) => (
              <rect
                key={`lm-${i}`}
                x={f * SQ}
                y={(7 - r) * SQ}
                width={SQ}
                height={SQ}
                fill={lastMoveFill(f, r)}
                opacity={lastMoveOpacity}
              />
            ))}

          {highlights.map((h, i) => {
            const { f, r } = sqToIdx(h.sq);
            const age = time - h.t;
            const opacity = overlayOpacity(age, BOARD_OVERLAY_LIFETIME.highlight, h.pinned);
            if (opacity <= 0) return null;
            const cx = f * SQ + SQ / 2;
            const cy = (7 - r) * SQ + SQ / 2;
            const scale = 0.94 + timedProgress(age, HIGHLIGHT_FADE_IN) * 0.06;
            return (
              <rect
                key={`hl-${h.sq}-${h.t}-${i}`}
                x={f * SQ}
                y={(7 - r) * SQ}
                width={SQ}
                height={SQ}
                fill={tokens.boardHighlight}
                opacity={opacity}
                transform={`translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`}
              />
            );
          })}

          {/* Check glow: vermillion radial under the checked king. A board
             state (not a timed overlay), so it persists while the check
             lasts and clears the moment the position resolves it. */}
          {checkIdx && checkOpacity > 0 && (
            <rect
              x={checkIdx.f * SQ}
              y={(7 - checkIdx.r) * SQ}
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
          style={{ position: 'absolute', inset: 0, zIndex: 1 }}
        >
          {Object.entries(positions).map(([id, p]) => {
            const visual = pieceVisual(p, time);
            const tx = visual.f * 100;
            const ty = (7 - visual.r) * 100;
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
                  opacity: visual.opacity,
                  pointerEvents: 'none',
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

        {COORD_LAYER}

        {/* arrows overlay — sits above pieces so annotations land on top */}
        <svg
          viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 3,
          }}
        >
          <defs>
            <filter id="arrow-shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#0f1525" floodOpacity="0.32" />
            </filter>
          </defs>
          <g filter="url(#arrow-shadow)">
            {arrows.map((a, i) => {
              const pts = arrowPoints(a.from, a.to);
              const d = buildArrowPath(pts);
              const guideD = buildArrowGuidePath(pts);
              if (!d) return null;
              const age = time - a.t;
              const opacity = overlayOpacity(age, BOARD_OVERLAY_LIFETIME.arrow, a.pinned);
              if (opacity <= 0) return null;
              const draw = timedProgress(age, ARROW_DRAW_DURATION);
              const maskId = `arrow-mask-${i}-${a.from}-${a.to}`;
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

        {gesture && <GestureOverlay gesture={gesture} positions={positions} />}

        {captureFlash && flash && flash.opacity > 0 && (
          <div
            key={captureFlash.id}
            className="capture-flash"
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: `${(captureFlash.f / 8) * 100}%`,
              top: `${((7 - captureFlash.r) / 8) * 100}%`,
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
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          >
            <defs>
              <filter id="annotation-badge-shadow" x="-35%" y="-35%" width="170%" height="170%">
                <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#0f1525" floodOpacity="0.30" />
              </filter>
            </defs>
            {(() => {
              const cfg = ANNOTATION_BADGE[lastMove.annotation];
              const cx = lastMove.toF * SQ + SQ - 16;
              const cy = (7 - lastMove.toR) * SQ + 16;
              const r = 22;
              const isWide = cfg.mark.length === 2;
              const badgeProgress = timedProgress(time - lastMove.t - BADGE_DELAY, BADGE_IN_DURATION);
              if (badgeProgress <= 0) return null;
              const badgeScale = 0.9 + badgeProgress * 0.1;
              return (
                <g
                  filter="url(#annotation-badge-shadow)"
                  opacity={badgeProgress}
                  transform={`translate(${cx} ${cy}) scale(${badgeScale}) translate(${-cx} ${-cy})`}
                >
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={cfg.fill}
                  />
                  <text
                    x={cx}
                    y={cy + (isWide ? 0 : 1)}
                    fontFamily={fontUi}
                    fontSize={isWide ? 22 : 38}
                    fontWeight={900}
                    letterSpacing={0}
                    fill={annotationInk}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {cfg.mark}
                  </text>
                </g>
              );
            })()}
          </svg>
        )}
      </div>
    </div>
  );
}
