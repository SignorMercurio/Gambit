// Pure script-to-board world derivation. React owns the clock and editing
// concerns; this module owns the deterministic state walk that turns a parsed
// timeline plus a Start FEN into immutable snapshots for the renderer.

import * as Chess from './chess';
import type { MindWorld } from './mind';
import type { ErrorEvent, MoveAnnotation, ParsedEvent, TimelineEvent } from './timeline';
import { isValidScriptTimestamp } from './playback';

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
  restoredAt?: number;
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
// Built at two instants — when the script's move applies, and again per frame
// of a replay — so the flattening of `move.from` / `move.to` into the four
// fields the board renders lives in one place.
const lastMoveAt = (move: Chess.Move, t: number, annotation?: MoveAnnotation): LastMove => ({
  fromF: move.from[0],
  fromR: move.from[1],
  toF: move.to[0],
  toR: move.to[1],
  t,
  annotation,
});

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
export const REPLAY_STEP_SECONDS = 0.5;

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
  replaySequences: ReadonlyMap<number, ReplaySequence>;
  visualEndTime: number;
};

// No `t`: the frame's time is `sequence.start + index * REPLAY_STEP_SECONDS`,
// which is exactly how `worldFrameAt` selects a frame in the first place.
// Storing it too made the one function that derives frames from the clock
// carry a second copy of the timing it derives.
type ReplayFrame = {
  sourceEventIndex: number;
  snapshot: WorldSnapshot;
};

type ReplaySequence = {
  start: number;
  end: number;
  frames: ReplayFrame[];
};

export type WorldFrame = {
  snapshot: WorldSnapshot;
  replaySourceEventIndex: number | null;
  replayActive: boolean;
};

// Select the authored snapshot or the clock-derived frame of a successful
// replay directive. Exact half-second boundaries keep the outgoing move so a
// paused event seek (+0.5s) shows the first replayed move rather than skipping
// straight to the second; normal playback advances on the following frame.
export function worldFrameAt(
  build: WorldBuild,
  reachedEventIndex: number,
  time: number,
): WorldFrame {
  const sequence = build.replaySequences.get(reachedEventIndex);
  if (!sequence) {
    return {
      snapshot: build.snapshots[reachedEventIndex + 1],
      replaySourceEventIndex: null,
      replayActive: false,
    };
  }
  const elapsed = Math.max(0, time - sequence.start);
  const frameIndex = Math.min(
    sequence.frames.length - 1,
    Math.max(0, Math.ceil(elapsed / REPLAY_STEP_SECONDS) - 1),
  );
  const frame = sequence.frames[frameIndex];
  return {
    snapshot: frame.snapshot,
    replaySourceEventIndex: frame.sourceEventIndex,
    replayActive: time < sequence.end,
  };
}

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
  return { chessState, positions: positionsFromBoard(Chess.board(chessState)) };
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

// A restored branch-entry snapshot carries pre-branch move metadata, so on its
// own it hard-cuts: every piece the branch disturbed teleports home. Piece ids
// are stable across moves, so each id present on both sides of the restore can
// instead glide from where the branch left it, and a piece the branch captured
// can fade back in via `restoredAt`. A setup inside the branch mints new ids;
// unmatched pieces keep the hard cut. New objects only where metadata changes —
// the branch-entry snapshot is shared with earlier history.
function glideRestoredPositions(departed: Positions, restored: Positions, t: number): Positions {
  const next: Positions = {};
  for (const [id, piece] of Object.entries(restored)) {
    const final = departed[id];
    if (!final || piece.captured) {
      next[id] = piece;
    } else if (final.captured) {
      next[id] = { ...piece, restoredAt: t };
    } else if (final.f !== piece.f || final.r !== piece.r) {
      next[id] = { ...piece, moveFromF: final.f, moveFromR: final.r, moveT: t };
    } else {
      next[id] = piece;
    }
  }
  return next;
}

export function buildWorld(events: TimelineEvent[], initialSetup: BoardSetup): WorldBuild {
  type BranchSnapshot = WorldSnapshot & { line: number; t: number; raw: string };
  type MainlineAction =
    | { kind: 'setup'; setup: BoardSetup }
    | {
        kind: 'move';
        move: Chess.Move;
        annotation?: MoveAnnotation;
        sourceEventIndex: number;
        sourceLine: number;
      };

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
  const replaySequences = new Map<number, ReplaySequence>();
  const mainlineActions: MainlineAction[] = [{ kind: 'setup', setup: initialSetup }];
  let visualEndTime = events[events.length - 1]?.t ?? 0;

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

  // What a setup resets. Shared with the replay walk, which re-applies the same
  // top-level setups while rebuilding the mainline: that branch used to
  // hand-write five of these assignments, so "what a setup clears" lived in two
  // places and a sixth field added here would have left replay stale.
  const seedFromSetup = (setup: BoardSetup, t: number) => {
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

  const applySetup = (setup: BoardSetup, t: number) => {
    seedFromSetup(setup, t);
    // Replay derives from top-level setups only, and recording that belongs
    // here rather than after each call site: it was written out three times
    // identically, so a fourth setup path could silently omit it. It cannot
    // move into `seedFromSetup` — replay calls that while iterating
    // `mainlineActions`, and appending to the array being walked would not
    // terminate.
    if (branchStack.length === 0) mainlineActions.push({ kind: 'setup', setup });
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

  const applyReplay = (eventIndex: number, event: Extract<ParsedEvent, { kind: 'replay' }>) => {
    if (branchStack.length > 0) {
      reject(eventIndex, event, 'Replay is only available on the main line');
      return;
    }
    if (mind) {
      reject(eventIndex, event, 'Replay requires reveal before replaying the board');
      return;
    }
    const moveCount = mainlineActions.reduce(
      (count, action) => count + (action.kind === 'move' ? 1 : 0),
      0,
    );
    if (moveCount === 0) {
      reject(eventIndex, event, 'Replay requires at least one applied mainline move');
      return;
    }
    const end = event.t + moveCount * REPLAY_STEP_SECONDS;
    if (!isValidScriptTimestamp(end)) {
      reject(eventIndex, event, 'Replay exceeds the maximum playback time');
      return;
    }
    const nextEvent = events[eventIndex + 1];
    if (nextEvent && nextEvent.t < end) {
      reject(
        eventIndex,
        event,
        `Replay needs ${(moveCount * REPLAY_STEP_SECONDS).toFixed(1)}s before the next event`,
      );
      return;
    }

    // Replay drives the walk's own state rather than a parallel set of `replay*`
    // locals. Every reject path has returned by here, so the board is already
    // committed to being overwritten, and the walk ends where the last frame
    // does — no trailing destructure to copy it back.
    //
    // That destructure was the reason to do this: it spelled out the whole
    // `WorldSnapshot` field list a third time, and it was the one copy the
    // compiler could not check. A field added to the type and omitted there
    // typechecks clean and leaves the walk stale for every event after an `rp`.
    // Frames now come from `snapshot()`, the same builder every other event uses.
    //
    // Overlays clear once rather than per frame. Every write in this file
    // reassigns these arrays instead of mutating them, so one empty array is
    // safe to share across frames — and a stable identity is what keeps Board's
    // `arrows` memo from recomputing on every replay step. A mid-replay setup
    // rebinds them through `seedFromSetup`, so the sharing runs between setup
    // boundaries rather than across the whole sequence; that is still every
    // frame of an ordinary replay, which has exactly one setup at its head.
    highlights = [];
    arrows = [];
    mind = null;
    revealedAt = Number.NEGATIVE_INFINITY;

    const frames: ReplayFrame[] = [];
    for (const action of mainlineActions) {
      if (action.kind === 'setup') {
        // `mainlineActions` always opens with the initial setup, so the first
        // pass through here is what seeds the replay.
        seedFromSetup(action.setup, event.t);
        continue;
      }

      const frameT = event.t + frames.length * REPLAY_STEP_SECONDS;
      const moved = movePosition(positions, action.move, frameT);
      positions = moved.positions;
      chessState = Chess.applyMove(chessState, action.move);
      check = checkAt(chessState, frameT);
      lastMove = lastMoveAt(action.move, frameT, action.annotation);
      if (moved.captureFlash) {
        lastCapture = {
          ...moved.captureFlash,
          id: `replay-${event.line}-${action.sourceLine}`,
        };
      }
      frames.push({ sourceEventIndex: action.sourceEventIndex, snapshot: snapshot() });
    }

    replaySequences.set(eventIndex, { start: event.t, end, frames });
    visualEndTime = Math.max(visualEndTime, end);
  };

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
            const departed = positions;
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
            positions = glideRestoredPositions(departed, positions, event.t);
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
        case 'replay':
          applyReplay(eventIndex, event);
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
          lastMove = lastMoveAt(move, event.t, event.annotation);
          if (moved.captureFlash) {
            lastCapture = { ...moved.captureFlash, id: String(event.line) };
          }
          nameMove(event.t, ...moved.touched, check?.sq);
          if (branchStack.length === 0) {
            mainlineActions.push({
              kind: 'move',
              move,
              annotation: event.annotation,
              sourceEventIndex: eventIndex,
              sourceLine: event.line,
            });
          }
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

  return {
    snapshots,
    // Errors arrive in two passes — the parser's, then this walk's — so the
    // natural order interleaves them by stage rather than by script: six broken
    // lines came out L7, L3, L4, L5, L6, L8. The band is read top-to-bottom
    // against the text the author is about to go fix, and `role="status"`
    // announces it in exactly that order, so sort by line.
    scriptErrors: scriptErrors.slice().sort((a, b) => a.line - b.line),
    moveStates,
    rejectedEventIndexes,
    replaySequences,
    visualEndTime,
  };
}
