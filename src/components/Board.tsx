// Pieces translate via `translate3d` so motion stays on the GPU compositor.

import { Piece } from './Piece';
import { sqToIdx, type PieceType, type Side } from '../lib/chess';
import type { MoveAnnotation } from '../lib/timeline';
import { tokens } from '../lib/tokens';

const SQ = 100;

type BoardProps = {
  positions: Record<string, PiecePos>;
  lastMove: LastMove | null;
  highlights: string[];
  arrows: { from: string; to: string }[];
  captureFlash: CaptureFlash | null;
};

export type PiecePos = {
  f: number;
  r: number;
  type: PieceType;
  side: Side;
  captured?: boolean;
  moving?: boolean;
};

export type LastMove = {
  fromF: number;
  fromR: number;
  toF: number;
  toR: number;
  annotation?: MoveAnnotation;
};

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

// Annotation badges sit on the destination square's upper-right corner, close
// to chess broadcast / analysis overlays: a large soft disc with a clear mark.
const ANNOTATION_BADGE: Record<
  MoveAnnotation,
  { fill: string; text: string; mark: string }
> = {
  brilliant: { fill: '#6fcfc8', text: '#0f1525', mark: '!!' },
  great: { fill: '#7da9dc', text: '#f1ecde', mark: '!' },
  mistake: { fill: '#f0c869', text: '#0f1525', mark: '?' },
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

export function Board({ positions, lastMove, highlights, arrows, captureFlash }: BoardProps) {
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
          viewBox={`0 0 ${SQ * 8} ${SQ * 8}`}
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
              />
              <rect
                x={lastMove.toF * SQ}
                y={(7 - lastMove.toR) * SQ}
                width={SQ}
                height={SQ}
                fill={tokens.boardLastMove}
              />
            </>
          )}

          {highlights.map((sq, i) => {
            const { f, r } = sqToIdx(sq);
            return (
              <rect
                key={`hl-${sq}-${i}`}
                x={f * SQ}
                y={(7 - r) * SQ}
                width={SQ}
                height={SQ}
                fill={tokens.boardHighlight}
              >
                <animate attributeName="opacity" from="0" to="1" dur="0.25s" fill="freeze" />
              </rect>
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
            const tx = p.f * 100;
            const ty = (7 - p.r) * 100;
            const captured = !!p.captured;
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
                  transform: `translate3d(${tx}%, ${ty}%, 0)${captured ? ' scale(0)' : ''}`,
                  opacity: captured ? 0 : 1,
                  transition: `transform ${tokens.durationPiece} ${tokens.easePieceSlide}, opacity ${tokens.durationTransform} ease-out`,
                  pointerEvents: 'none',
                  zIndex: p.moving ? 5 : 1,
                  willChange: 'transform',
                  padding: '0.75%',
                  boxSizing: 'border-box',
                }}
              >
                <Piece type={p.type} side={p.side} />
              </div>
            );
          })}
        </div>

        {/* Coordinates sit above enlarged Staunty pieces so file/rank labels
           remain visible in recordings, but below annotation arrows. */}
        <svg
          viewBox={`0 0 ${SQ * 8} ${SQ * 8}`}
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
          viewBox={`0 0 ${SQ * 8} ${SQ * 8}`}
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
              const fromXY = sqToIdx(a.from);
              const toXY = sqToIdx(a.to);
              const x1 = fromXY.f * SQ + SQ / 2;
              const y1 = (7 - fromXY.r) * SQ + SQ / 2;
              const x2 = toXY.f * SQ + SQ / 2;
              const y2 = (7 - toXY.r) * SQ + SQ / 2;
              const df = toXY.f - fromXY.f;
              const dr = toXY.r - fromXY.r;
              const isKnight =
                (Math.abs(df) === 1 && Math.abs(dr) === 2) ||
                (Math.abs(df) === 2 && Math.abs(dr) === 1);
              const startBack = BOARD_ARROW.startInset;
              const endBack = BOARD_ARROW.endInset;

              let pts: Array<readonly [number, number]>;
              if (isKnight) {
                // L-shape: longer leg first (vertical when |dr|=2, horizontal
                // when |df|=2). Elbow lands two squares away from origin.
                const verticalFirst = Math.abs(dr) === 2;
                const elbowF = verticalFirst ? fromXY.f : toXY.f;
                const elbowR = verticalFirst ? toXY.r : fromXY.r;
                const ex = elbowF * SQ + SQ / 2;
                const ey = (7 - elbowR) * SQ + SQ / 2;
                const len1 = Math.hypot(ex - x1, ey - y1) || 1;
                const sx = x1 + ((ex - x1) / len1) * startBack;
                const sy = y1 + ((ey - y1) / len1) * startBack;
                const len2 = Math.hypot(x2 - ex, y2 - ey) || 1;
                const tx = x2 - ((x2 - ex) / len2) * endBack;
                const ty = y2 - ((y2 - ey) / len2) * endBack;
                pts = [[sx, sy], [ex, ey], [tx, ty]];
              } else {
                const pdx = x2 - x1;
                const pdy = y2 - y1;
                const plen = Math.hypot(pdx, pdy) || 1;
                const ux = pdx / plen;
                const uy = pdy / plen;
                const sx = x1 + ux * startBack;
                const sy = y1 + uy * startBack;
                const tx = x2 - ux * endBack;
                const ty = y2 - uy * endBack;
                pts = [[sx, sy], [tx, ty]];
              }

              const d = buildArrowPath(pts);
              if (!d) return null;
              return (
                <path
                  key={`arr-${i}`}
                  d={d}
                  fill={tokens.boardArrow}
                  style={{ animation: 'arrowIn 0.28s ease-out' }}
                />
              );
            })}
          </g>
        </svg>

        {captureFlash && (
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
              animation: 'capturePop 0.5s ease-out forwards',
              pointerEvents: 'none',
              zIndex: 4,
            }}
          />
        )}

        {/* Annotation badge — sits above pieces so a moved piece never
           occludes the move-quality mark. SVG-based so the disc and text
           scale with the board's viewBox without container queries. */}
        {lastMove?.annotation && (
          <svg
            viewBox={`0 0 ${SQ * 8} ${SQ * 8}`}
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
              return (
                <g filter="url(#annotation-badge-shadow)" style={{ animation: 'arrowIn 0.28s ease-out' }}>
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
                    letterSpacing={isWide ? -2.5 : 0}
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
