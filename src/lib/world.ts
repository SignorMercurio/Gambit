// Pure script-to-board world derivation. React owns the clock and editing
// concerns; this module owns the deterministic state walk that turns a parsed
// timeline plus a Start FEN into immutable snapshots for the renderer.

import * as Chess from './chess';
import type { MindWorld } from './mind';
import type { ErrorEvent, MoveAnnotation, ParsedEvent, TimelineEvent } from './timeline';

export type PiecePos = {
  f: number;
  r: number;
  type: Chess.PieceType;
  side: Chess.Side;
  captured?: boolean;
  capturedAt?: number;
  moveFromF?: number;
  moveFromR?: number;
  moveT?: number;
};

export type Positions = Record<string, PiecePos>;
export type BoardSetup = { positions: Positions; chessState: Chess.GameState };
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
export type BoardCheck = { sq: string; t: number };

// Shared by world-history retention and Board's clock-derived fades. Keeping
// the lifetime in one domain constant prevents the snapshot builder from
// retaining history the renderer can no longer show.
export const BOARD_OVERLAY_LIFETIME = {
  highlight: 2.5,
  arrow: 2.5,
  captureFlash: 0.5,
} as const;

// More simultaneous arrows are no longer legible, and retaining every unique
// pair in every historical snapshot turns a bounded script into quadratic
// memory. Repeating an existing arrow remains allowed; `cl`/reset/FEN opens the
// budget again.
export const MAX_LIVE_ARROWS = 128;

export type WorldSnapshot = {
  positions: Positions;
  chessState: Chess.GameState;
  lastMove: LastMove | null;
  highlights: BoardHighlight[];
  arrows: BoardArrow[];
  lastCapture: CaptureFlash | null;
  // Checked king square, derived from chessState rather than a SAN `+`.
  check: BoardCheck | null;
  // Mental sketch while mind's-eye mode is active.
  mind: MindWorld | null;
  // Time of the reveal that ended the last mind phase (-Infinity: never).
  revealedAt: number;
};

export type WorldBuild = {
  snapshots: WorldSnapshot[];
  scriptErrors: ErrorEvent[];
  // Position context before each event, aligned one-for-one with events.
  moveStates: Chess.MoveState[];
  // Parsed events that could not be applied to the world (for example an
  // illegal SAN, malformed FEN, or exhausted overlay budget). Structural
  // errors are deliberately excluded so presentation readers still honor the
  // br/ml depth encoded by the event stream.
  rejectedEventIndexes: ReadonlySet<number>;
};

function positionsFromBoard(board: Chess.Board): Positions {
  const positions: Positions = {};
  let id = 0;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (!piece) continue;
      positions[`${piece.side}-${piece.type}-${id++}`] = {
        f,
        r,
        type: piece.type,
        side: piece.side,
      };
    }
  }
  return positions;
}

function setupFromValidFen(fen: string): BoardSetup {
  const chessState = Chess.stateFromFEN(fen);
  return { chessState, positions: positionsFromBoard(chessState.board) };
}

const STANDARD_SETUP = setupFromValidFen(Chess.STARTING_FEN);

export function setupFromFen(fenText: string): BoardSetup & { error: string | null } {
  try {
    return {
      ...setupFromValidFen(fenText.trim() ? fenText : Chess.STARTING_FEN),
      error: null,
    };
  } catch (error) {
    return {
      ...STANDARD_SETUP,
      error: error instanceof Error ? error.message : 'Invalid FEN',
    };
  }
}

function pruneExpired<T extends { t: number; pinned?: boolean }>(
  overlays: T[],
  time: number,
  lifetime: number,
): T[] {
  const firstExpired = overlays.findIndex(
    (overlay) => !overlay.pinned && time - overlay.t >= lifetime,
  );
  if (firstExpired < 0) return overlays;
  return overlays.filter((overlay) => overlay.pinned || time - overlay.t < lifetime);
}

// Repeating the same visual key only restates that visual; stacking identical
// SVG geometry has no visible benefit and lets a short script line fan out
// into unbounded per-frame work. A pinned visual keeps its stronger lifetime
// when a later unpinned restatement names the same key.
function mergeLatestByKey<T extends { pinned?: boolean }>(
  current: T[],
  incoming: T[],
  keyOf: (item: T) => string,
): T[] {
  if (incoming.length === 0) return current;
  let next = current;
  const indexes = new Map(current.map((item, index) => [keyOf(item), index]));
  for (const item of incoming) {
    const key = keyOf(item);
    const index = indexes.get(key);
    if (index == null) {
      if (next === current) next = [...current];
      indexes.set(key, next.length);
      next.push(item);
    } else if (!next[index].pinned || item.pinned) {
      if (next === current) next = [...current];
      next[index] = item;
    }
  }
  return next;
}

function movePosition(
  positions: Positions,
  move: Chess.Move,
  t: number,
): {
  positions: Positions;
  captureFlash: Omit<CaptureFlash, 'id'> | null;
  // Every square disturbed by the move, for the mind's-eye sketch.
  touched: string[];
} {
  const next = { ...positions };
  const [fromF, fromR] = move.from;
  const [toF, toR] = move.to;
  const touched = [Chess.idxToSq(fromF, fromR), Chess.idxToSq(toF, toR)];

  let moverId: string | null = null;
  for (const [id, piece] of Object.entries(next)) {
    if (!piece.captured && piece.f === fromF && piece.r === fromR) {
      moverId = id;
      break;
    }
  }

  let captureFlash: Omit<CaptureFlash, 'id'> | null = null;
  if (move.capture) {
    const capturedF = toF;
    const capturedR = move.enPassant ? fromR : toR;
    captureFlash = { f: capturedF, r: capturedR, t };
    touched.push(Chess.idxToSq(capturedF, capturedR));
    for (const [id, piece] of Object.entries(next)) {
      if (id === moverId) continue;
      if (!piece.captured && piece.f === capturedF && piece.r === capturedR) {
        next[id] = { ...piece, captured: true, capturedAt: t };
        break;
      }
    }
  }

  if (moverId) {
    next[moverId] = {
      ...next[moverId],
      f: toF,
      r: toR,
      type: move.promotion || next[moverId].type,
      moveFromF: fromF,
      moveFromR: fromR,
      moveT: t,
    };
  }

  if (move.castle) {
    const rookFromF = move.castle === 'K' ? 7 : 0;
    const rookToF = move.castle === 'K' ? 5 : 3;
    touched.push(Chess.idxToSq(rookFromF, toR), Chess.idxToSq(rookToF, toR));
    for (const [id, piece] of Object.entries(next)) {
      if (!piece.captured && piece.f === rookFromF && piece.r === toR && piece.type === 'r') {
        next[id] = {
          ...piece,
          f: rookToF,
          moveFromF: rookFromF,
          moveFromR: toR,
          moveT: t,
        };
        break;
      }
    }
  }

  return { positions: next, captureFlash, touched };
}

export function buildWorld(events: TimelineEvent[], initialSetup: BoardSetup): WorldBuild {
  type BranchSnapshot = WorldSnapshot & { line: number; t: number; raw: string };

  const checkAt = (state: Chess.GameState, t: number): BoardCheck | null => {
    const sq = Chess.checkedKingSquare(state);
    return sq ? { sq, t } : null;
  };

  let positions = initialSetup.positions;
  let chessState = initialSetup.chessState;
  let lastMove: LastMove | null = null;
  // Rebound rather than mutated so earlier snapshots keep their references.
  let highlights: BoardHighlight[] = [];
  let arrows: BoardArrow[] = [];
  let lastCapture: CaptureFlash | null = null;
  let check = checkAt(chessState, 0);
  let mind: MindWorld | null = null;
  let revealedAt = Number.NEGATIVE_INFINITY;

  const snapshots: WorldSnapshot[] = [];
  const scriptErrors: ErrorEvent[] = [];
  const moveStates: Chess.MoveState[] = [];
  const rejectedEventIndexes = new Set<number>();
  const branchStack: BranchSnapshot[] = [];

  const reject = (eventIndex: number, event: ParsedEvent, error: string) => {
    rejectedEventIndexes.add(eventIndex);
    scriptErrors.push({
      t: event.t,
      error,
      line: event.line,
      raw: event.raw,
    });
  };

  // Naming also releases a rehearsal: restamp held squares at the event that
  // releases them so they follow the forgetting curve instead of disappearing.
  const touch = (t: number, ...squares: (string | null | undefined)[]) => {
    if (!mind) return;
    const touches = new Map(mind.touches);
    for (const square of squares) if (square) touches.set(square, t);
    mind = { since: mind.since, touches, held: mind.held };
  };

  const nameMove = (t: number, ...squares: (string | null | undefined)[]) => {
    if (!mind) return;
    touch(t, ...mind.held, ...squares);
    const held = new Set<string>();
    for (const square of squares) if (square) held.add(square);
    mind = { since: mind.since, touches: mind.touches, held };
  };

  const applySetup = (setup: BoardSetup, t: number) => {
    positions = setup.positions;
    chessState = setup.chessState;
    lastMove = null;
    highlights = [];
    arrows = [];
    lastCapture = null;
    check = checkAt(chessState, t);
    // Reset the sketch, not the mind phase clock.
    if (mind) mind = { since: mind.since, touches: new Map(), held: new Set() };
  };

  const snapshot = (): WorldSnapshot => ({
    positions,
    chessState,
    lastMove,
    highlights,
    arrows,
    lastCapture,
    check,
    mind,
    revealedAt,
  });

  snapshots.push(snapshot());

  for (let eventIndex = 0; eventIndex < events.length; eventIndex++) {
    const event = events[eventIndex];
    // Capacity describes visuals that are live at this event, not historical
    // entries whose fade window already ended. Prune before applying the event
    // so an expired full arrow budget cannot reject the first fresh arrow.
    highlights = pruneExpired(
      highlights,
      event.t,
      BOARD_OVERLAY_LIFETIME.highlight,
    );
    arrows = pruneExpired(arrows, event.t, BOARD_OVERLAY_LIFETIME.arrow);
    moveStates.push({ fullmove: chessState.fullmove, turn: chessState.turn });
    if ('error' in event) {
      scriptErrors.push(event);
    } else {
      switch (event.kind) {
        case 'highlight':
          highlights = mergeLatestByKey(
            highlights,
            event.squares.map((sq) => ({ sq, t: event.t, pinned: event.pinned })),
            (highlight) => highlight.sq,
          );
          touch(event.t, ...event.squares);
          break;
        case 'arrow':
          if (
            arrows.length >= MAX_LIVE_ARROWS &&
            !arrows.some((arrow) => arrow.from === event.from && arrow.to === event.to)
          ) {
            reject(
              eventIndex,
              event,
              `Too many live arrows (maximum ${MAX_LIVE_ARROWS}); use cl before adding more`,
            );
            break;
          }
          arrows = mergeLatestByKey(
            arrows,
            [{ from: event.from, to: event.to, t: event.t, pinned: event.pinned }],
            (arrow) => `${arrow.from}-${arrow.to}`,
          );
          touch(event.t, event.from, event.to);
          break;
        case 'clear':
          // Only pinned highlights still hold a square at this event.
          touch(event.t, ...highlights.filter((highlight) => highlight.pinned).map((highlight) => highlight.sq));
          highlights = [];
          arrows = [];
          break;
        case 'reset':
          applySetup(initialSetup, event.t);
          break;
        case 'start':
          applySetup(STANDARD_SETUP, event.t);
          break;
        case 'fen': {
          const setup = setupFromFen(event.fen);
          if (setup.error) {
            reject(eventIndex, event, setup.error);
          } else {
            applySetup(setup, event.t);
          }
          break;
        }
        case 'branch':
          branchStack.push({ ...snapshot(), line: event.line, t: event.t, raw: event.raw });
          break;
        case 'mainline': {
          const branch = branchStack.pop();
          if (!branch) {
            scriptErrors.push({
              t: event.t,
              error: `'mainline' without matching 'branch'`,
              line: event.line,
              raw: event.raw,
            });
          } else {
            ({
              positions,
              chessState,
              lastMove,
              highlights,
              arrows,
              lastCapture,
              check,
              mind,
              revealedAt,
            } = branch);
            // Restoring an older branch-entry snapshot can reintroduce
            // overlays already expired at this mainline event. Earlier
            // snapshots keep their history for backward scrubbing.
            highlights = pruneExpired(
              highlights,
              event.t,
              BOARD_OVERLAY_LIFETIME.highlight,
            );
            arrows = pruneExpired(arrows, event.t, BOARD_OVERLAY_LIFETIME.arrow);
          }
          break;
        }
        case 'mind':
          mind = {
            since: mind ? mind.since : event.t,
            touches: new Map(),
            held: new Set(),
          };
          break;
        case 'reveal':
          if (mind) {
            mind = null;
            revealedAt = event.t;
          }
          break;
        case 'move': {
          const move = Chess.parseSAN(event.san, chessState);
          if (!move) {
            reject(eventIndex, event, `Invalid move: "${event.san}"`);
            break;
          }

          const moved = movePosition(positions, move, event.t);
          positions = moved.positions;
          chessState = Chess.applyMove(chessState, move);
          if (check) touch(event.t, check.sq);
          check = checkAt(chessState, event.t);
          lastMove = {
            fromF: move.from[0],
            fromR: move.from[1],
            toF: move.to[0],
            toR: move.to[1],
            t: event.t,
            annotation: event.annotation,
          };
          if (moved.captureFlash) {
            lastCapture = { ...moved.captureFlash, id: String(event.line) };
          }
          nameMove(event.t, ...moved.touched, check?.sq);
          break;
        }
      }
    }

    snapshots.push(snapshot());
  }

  for (const branch of branchStack) {
    scriptErrors.push({
      t: branch.t,
      error: `'branch' without matching 'mainline'`,
      line: branch.line,
      raw: branch.raw,
    });
  }

  return { snapshots, scriptErrors, moveStates, rejectedEventIndexes };
}
