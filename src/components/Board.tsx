// Pieces translate via `translate3d` so motion stays on the GPU compositor.

import type { CSSProperties } from 'react';
import { Piece } from './Piece';
import { sqToIdx, type PieceType, type Side } from '../lib/chess';
import type { MoveAnnotation } from '../lib/timeline';
import { tokens } from '../lib/tokens';

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
  time: number;
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
const ANNOTATION_BADGE: Record<
  MoveAnnotation,
  { fill: string; text: string; mark: string }
> = {
  brilliant: { fill: '#4fb9b2', text: '#f1ecde', mark: '!!' },
  great: { fill: '#7da9dc', text: '#f1ecde', mark: '!' },
  mistake: { fill: '#d9a93f', text: '#f1ecde', mark: '?' },
  blunder: { fill: '#cf5d5d', text: '#f1ecde', mark: '??' },
};

const SQUARES: { f: number; r: number; isLight: boolean }[] = [];
for (let r = 7; r >= 0; r--) {
  for (let f = 0; f < 8; f++) SQUARES.push({ f, r, isLight: (f + r) % 2 === 1 });
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

export function Board({ positions, lastMove, highlights, arrows, captureFlash, time }: BoardProps) {
  const lastMoveOpacity = lastMove ? timedProgress(time - lastMove.t, 0.12) : 0;
  const flash =
    captureFlash && time - captureFlash.t < BOARD_OVERLAY_LIFETIME.captureFlash
      ? captureFlashVisual(time - captureFlash.t)
      : null;

  return (
    <div className="board-wrap">
      <div
        className="board"
        role="img"
        aria-label="Chess board"
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          position: 'relative',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: tokens.shadowBoard,
        }}
      >
        {/* squares */}
        <svg
          viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          {SQUARES.map(({ f, r, isLight }) => (
            <rect
              key={`${f}-${r}`}
              x={f * SQ}
              y={(7 - r) * SQ}
              width={SQ}
              height={SQ}
              fill={isLight ? tokens.squareLight : tokens.squareDark}
            />
          ))}

          {lastMove && (
            <>
              <rect
                x={lastMove.fromF * SQ}
                y={(7 - lastMove.fromR) * SQ}
                width={SQ}
                height={SQ}
                fill={tokens.boardLastMove}
                opacity={lastMoveOpacity}
              />
              <rect
                x={lastMove.toF * SQ}
                y={(7 - lastMove.toR) * SQ}
                width={SQ}
                height={SQ}
                fill={tokens.boardLastMove}
                opacity={lastMoveOpacity}
              />
            </>
          )}

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

        {/* Coordinates sit above enlarged Staunty pieces so file/rank labels
           remain visible in recordings, but below annotation arrows. */}
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
                    fontFamily="'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif"
                    fontSize={isWide ? 22 : 38}
                    fontWeight={900}
                    letterSpacing={0}
                    fill={cfg.text}
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
