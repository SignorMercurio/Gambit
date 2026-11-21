// Pure script-to-board world derivation. React owns the clock and editing
// concerns; this module owns the deterministic state walk that turns a parsed
// timeline plus a Start FEN into immutable snapshots for the renderer.

import * as Chess from './chess';
import type { MindWorld } from './mind';
import { lastEventIndexAt } from './timeline';
import type { ErrorEvent, MoveAnnotation, ParsedEvent, TimelineEvent } from './timeline';
import { isValidScriptTimestamp } from './playback';

// `captured` discriminates `capturedAt`, so a captured piece always has its
// capture time.
export type PiecePos = {
  f: number;
  r: number;
  type: Chess.PieceType;
  side: Chess.Side;
  moveFromF?: number;
  moveFromR?: number;
  moveT?: number;
  restoredAt?: number;
} & ({ captured: true; capturedAt: number } | { captured?: false; capturedAt?: undefined });

export type Positions = Record<string, PiecePos>;
type BoardSetup = { positions: Positions; chessState: Chess.GameState };
export type LastMove = {
  fromF: number;
  fromR: number;
  toF: number;
  toR: number;
  t: number;
  annotation?: MoveAnnotation;
};
// Shared by the authored walk and replay templates.
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

// Seconds. Shared by snapshot pruning and Board's fades, so the walk never
// retains overlays the renderer can no longer show.
export const BOARD_OVERLAY_LIFETIME = {
  highlight: 2.5,
  arrow: 2.5,
  captureFlash: 0.5,
} as const;

// Bounds per-snapshot arrow memory (and legibility). Repeating a live arrow is
// allowed; `cl`/reset/FEN reopens the budget.
export const MAX_LIVE_ARROWS = 128;
export const REPLAY_STEP_SECONDS = 0.5;

type WorldSnapshot = {
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
  // Open `br` variations. The one count of br/ml nesting: readers take it
  // from the snapshot before an event instead of recounting.
  branchDepth: number;
};

// What the move lists read: snapshots[i] numbers event i's move row and says
// whether it sits on the main line.
export type StructureSnapshot = Pick<WorldSnapshot, 'chessState' | 'branchDepth'>;

export type WorldBuild = {
  // snapshots[i] is the world before event i and snapshots[i + 1] the world
  // after it, so snapshots[i].chessState also numbers event i's move row.
  snapshots: WorldSnapshot[];
  scriptErrors: ErrorEvent[];
  // Parsed events the walk could not apply (illegal SAN, malformed FEN,
  // exhausted arrow budget). Unmatched br/ml are excluded so readers still
  // honor the depth the event stream encodes.
  rejectedEventIndexes: ReadonlySet<number>;
  replayFrames: ReplayFrame[];
  replaySequences: ReadonlyMap<number, ReplaySequence>;
  visualEndTime: number;
};

// One mainline template per move, shared by every replay. Its clocks are
// move ordinals, not authored seconds; variations and overlays never enter it.
type ReplayState = Pick<WorldSnapshot, 'positions' | 'chessState' | 'lastMove' | 'lastCapture' | 'check'>;
type ReplayFrame = {
  sourceEventIndex: number;
  state: ReplayState;
};

type ReplaySequence = {
  start: number;
  end: number;
  // Seconds per frame: the directive's own step, or REPLAY_STEP_SECONDS.
  step: number;
  moveCount: number;
  line: number;
};

type WorldFrame = {
  snapshot: WorldSnapshot;
  // Null outside replay; the source index also gates board editing.
  replaySourceEventIndex: number | null;
};

function replayTime(sequence: Pick<ReplaySequence, 'start' | 'step'>, ordinal: number): number {
  // Only the step is rounded to the decisecond grid; authored starts can be
  // finer, and rounding the origin would shift the recording.
  return sequence.start + (ordinal * Math.round(sequence.step * 10)) / 10;
}

// Decimal script times can differ by a rounding bit after adding replay steps.
// Treat that machine error as equality without accepting a real overlap.
function beforeReplayTime(a: number, b: number): boolean {
  return b - a > 2 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
}

function replaySnapshot(state: ReplayState, sequence: ReplaySequence): WorldSnapshot {
  const at = (ordinal: number) => replayTime(sequence, ordinal);
  const positions: Positions = {};
  for (const [id, piece] of Object.entries(state.positions)) {
    const timed: PiecePos = {
      ...piece,
      ...(piece.moveT == null ? {} : { moveT: at(piece.moveT) }),
    };
    if (timed.captured) timed.capturedAt = at(timed.capturedAt);
    positions[id] = timed;
  }
  return {
    positions,
    chessState: state.chessState,
    lastMove: state.lastMove && { ...state.lastMove, t: at(state.lastMove.t) },
    lastCapture: state.lastCapture && {
      ...state.lastCapture,
      t: at(state.lastCapture.t),
      id: `replay-${sequence.line}-${state.lastCapture.id}`,
    },
    check: state.check && { ...state.check, t: at(state.check.t) },
    highlights: [],
    arrows: [],
    mind: null,
    revealedAt: Number.NEGATIVE_INFINITY,
    // Replay is rejected inside a variation.
    branchDepth: 0,
  };
}

// One cached frame per world, never a growing cache. The stable reference
// lets Board reuse its position-derived work between steps.
const REPLAY_FRAME_CACHE = new WeakMap<WorldBuild, {
  sequence: ReplaySequence;
  index: number;
  frame: WorldFrame;
}>();

// The frame a time shows: the one rule the board and the offline render share.
export function worldFrameAtTime(
  build: WorldBuild,
  events: TimelineEvent[],
  time: number,
): WorldFrame {
  return worldFrameAt(build, lastEventIndexAt(events, time), time);
}

// The authored snapshot, or the clock-derived frame of a successful replay.
// An exact step boundary keeps the outgoing move, so a paused seek just past
// a boundary shows that move instead of skipping to the next.
export function worldFrameAt(
  build: WorldBuild,
  reachedEventIndex: number,
  time: number,
): WorldFrame {
  const sequence = build.replaySequences.get(reachedEventIndex);
  if (!sequence || !beforeReplayTime(time, sequence.end)) {
    return {
      snapshot: build.snapshots[reachedEventIndex + 1],
      replaySourceEventIndex: null,
    };
  }
  // Compare absolute boundaries rather than dividing elapsed floats: at
  // 10.8, (10.8 - 10) / 0.8 is slightly above one and would skip a frame.
  let lo = 0;
  let hi = sequence.moveCount;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (beforeReplayTime(replayTime(sequence, mid), time)) lo = mid + 1;
    else hi = mid;
  }
  const index = Math.max(0, lo - 1);
  const cached = REPLAY_FRAME_CACHE.get(build);
  if (cached?.sequence === sequence && cached.index === index) return cached.frame;
  const template = build.replayFrames[index];
  const frame: WorldFrame = {
    snapshot: replaySnapshot(template.state, sequence),
    replaySourceEventIndex: template.sourceEventIndex,
  };
  REPLAY_FRAME_CACHE.set(build, { sequence, index, frame });
  return frame;
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

// A repeated key replaces its entry instead of stacking identical geometry.
// A pinned entry survives a later unpinned restatement.
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

// At `ml`, pieces glide from where the branch left them (ids are stable
// across moves) and pieces it captured fade back via `restoredAt`; unmatched
// ids hard-cut. Only valid within one setup epoch, since a setup mints new
// ids. Copies only changed pieces: the entry snapshot is shared history.
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
  type BranchSnapshot = { entry: WorldSnapshot; setupEpoch: number; event: ParsedEvent };

  const checkAt = (state: Chess.GameState, t: number): BoardCheck | null =>
    state.check ? { sq: state.check, t } : null;

  // The working snapshot. Stored snapshots are shallow copies, so its fields
  // are rebound, never mutated.
  let w: WorldSnapshot = {
    positions: initialSetup.positions,
    chessState: initialSetup.chessState,
    lastMove: null,
    highlights: [],
    arrows: [],
    lastCapture: null,
    check: checkAt(initialSetup.chessState, 0),
    mind: null,
    revealedAt: Number.NEGATIVE_INFINITY,
    branchDepth: 0,
  };
  let setupEpoch = -1;

  const snapshots: WorldSnapshot[] = [];
  const scriptErrors: ErrorEvent[] = [];
  const rejectedEventIndexes = new Set<number>();
  const branchStack: BranchSnapshot[] = [];
  const hasReplay = events.some((event) => event.kind === 'replay');
  const replaySequences = new Map<number, ReplaySequence>();
  const replayFrames: ReplayFrame[] = [];
  let replayState: ReplayState = {
    positions: w.positions,
    chessState: w.chessState,
    lastMove: w.lastMove,
    lastCapture: w.lastCapture,
    check: w.check,
  };
  let visualEndTime = events[events.length - 1]?.t ?? 0;

  // Errors that invalidate the event go through `reject`; unmatched br/ml
  // only note (see `WorldBuild.rejectedEventIndexes`).
  const noteError = (event: ParsedEvent, error: string) => {
    scriptErrors.push({ t: event.t, error, line: event.line, raw: event.raw });
  };

  const reject = (eventIndex: number, event: ParsedEvent, error: string) => {
    rejectedEventIndexes.add(eventIndex);
    noteError(event, error);
  };

  // Naming also releases a rehearsal: restamp held squares at the event that
  // releases them so they follow the forgetting curve instead of disappearing.
  const touch = (t: number, ...squares: (string | null | undefined)[]) => {
    if (!w.mind) return;
    const touches = new Map(w.mind.touches);
    for (const square of squares) if (square) touches.set(square, t);
    w.mind = { since: w.mind.since, touches, held: w.mind.held };
  };

  const nameMove = (t: number, ...squares: (string | null | undefined)[]) => {
    if (!w.mind) return;
    touch(t, ...w.mind.held, ...squares);
    const held = new Set<string>();
    for (const square of squares) if (square) held.add(square);
    w.mind = { since: w.mind.since, touches: w.mind.touches, held };
  };

  const applySetup = (setup: BoardSetup, event: ParsedEvent, eventIndex: number) => {
    w.positions = setup.positions;
    w.chessState = setup.chessState;
    w.lastMove = null;
    w.highlights = [];
    w.arrows = [];
    w.lastCapture = null;
    w.check = checkAt(w.chessState, event.t);
    setupEpoch = eventIndex;
    // Reset the sketch, not the mind phase clock.
    if (w.mind) w.mind = { since: w.mind.since, touches: new Map(), held: new Set() };
    if (hasReplay && branchStack.length === 0) {
      // A setup changes the origin of subsequent moves, but adds no replay
      // frame: a trailing reset is an explanation pause, not the replay end.
      replayState = {
        positions: w.positions,
        chessState: w.chessState,
        lastMove: w.lastMove,
        lastCapture: w.lastCapture,
        check: w.check && { sq: w.check.sq, t: replayFrames.length },
      };
    }
  };

  // `lastCapture` is a renderer-only fade, not a list, so captureFlash is not
  // pruned here.
  const pruneOverlays = (t: number) => {
    w.highlights = pruneExpired(w.highlights, t, BOARD_OVERLAY_LIFETIME.highlight);
    w.arrows = pruneExpired(w.arrows, t, BOARD_OVERLAY_LIFETIME.arrow);
  };

  const applyReplay = (eventIndex: number, event: Extract<ParsedEvent, { kind: 'replay' }>) => {
    if (branchStack.length > 0) {
      reject(eventIndex, event, 'Replay is only available on the main line');
      return;
    }
    if (w.mind) {
      reject(eventIndex, event, 'Replay requires reveal before replaying the board');
      return;
    }
    const moveCount = replayFrames.length;
    if (moveCount === 0) {
      reject(eventIndex, event, 'Replay requires at least one applied mainline move');
      return;
    }
    const step = event.step ?? REPLAY_STEP_SECONDS;
    const replayDuration = replayTime({ start: 0, step }, moveCount);
    const end = event.t + replayDuration;
    if (!isValidScriptTimestamp(end)) {
      reject(eventIndex, event, 'Replay exceeds the maximum playback time');
      return;
    }
    const nextEvent = events[eventIndex + 1];
    if (nextEvent && beforeReplayTime(nextEvent.t, end)) {
      reject(
        eventIndex,
        event,
        `Replay needs ${replayDuration.toFixed(1)}s before the next event`,
      );
      return;
    }

    // Both the walk and later templates resume from the last replayed move,
    // even after a setup.
    replayState = replayFrames[moveCount - 1].state;
    const sequence: ReplaySequence = {
      start: event.t, end, step, moveCount, line: event.line,
    };
    // Only the terminal frame becomes history; in-flight frames are selected
    // on demand by worldFrameAt.
    w = replaySnapshot(replayState, sequence);
    replaySequences.set(eventIndex, sequence);
    visualEndTime = Math.max(visualEndTime, end);
  };

  snapshots.push({ ...w });

  for (let eventIndex = 0; eventIndex < events.length; eventIndex++) {
    const event = events[eventIndex];
    // Prune before applying so expired arrows do not count against the budget.
    pruneOverlays(event.t);
    if ('error' in event) {
      scriptErrors.push(event);
    } else {
      switch (event.kind) {
        case 'highlight':
          w.highlights = mergeLatestByKey(
            w.highlights,
            event.squares.map((sq) => ({ sq, t: event.t, pinned: event.pinned })),
            (highlight) => highlight.sq,
          );
          touch(event.t, ...event.squares);
          break;
        case 'arrow':
          if (
            w.arrows.length >= MAX_LIVE_ARROWS &&
            !w.arrows.some((arrow) => arrow.from === event.from && arrow.to === event.to)
          ) {
            reject(
              eventIndex,
              event,
              `Too many live arrows (maximum ${MAX_LIVE_ARROWS}); use cl before adding more`,
            );
            break;
          }
          w.arrows = mergeLatestByKey(
            w.arrows,
            [{ from: event.from, to: event.to, t: event.t, pinned: event.pinned }],
            (arrow) => `${arrow.from}-${arrow.to}`,
          );
          touch(event.t, event.from, event.to);
          break;
        case 'clear':
          // Only pinned highlights still hold a square at this event.
          touch(event.t, ...w.highlights.filter((highlight) => highlight.pinned).map((highlight) => highlight.sq));
          w.highlights = [];
          w.arrows = [];
          break;
        case 'reset':
          applySetup(initialSetup, event, eventIndex);
          break;
        case 'start':
          applySetup(STANDARD_SETUP, event, eventIndex);
          break;
        case 'fen': {
          const setup = setupFromFen(event.fen);
          if (setup.error) {
            reject(eventIndex, event, setup.error);
          } else {
            applySetup(setup, event, eventIndex);
          }
          break;
        }
        case 'branch':
          // The entry snapshot keeps the outer depth, so restoring it at
          // the matching `ml` restores the depth too.
          branchStack.push({ entry: { ...w }, setupEpoch, event });
          w.branchDepth = branchStack.length;
          break;
        case 'mainline': {
          const branch = branchStack.pop();
          if (!branch) {
            noteError(event, `'mainline' without matching 'branch'`);
          } else {
            const departed = w.positions;
            const sameSetup = setupEpoch === branch.setupEpoch;
            w = { ...branch.entry };
            setupEpoch = branch.setupEpoch;
            if (sameSetup) w.positions = glideRestoredPositions(departed, w.positions, event.t);
            // The restored entry can carry overlays already expired here.
            pruneOverlays(event.t);
          }
          break;
        }
        case 'mind':
          w.mind = {
            since: w.mind ? w.mind.since : event.t,
            touches: new Map(),
            held: new Set(),
          };
          break;
        case 'reveal':
          if (w.mind) {
            w.mind = null;
            w.revealedAt = event.t;
          }
          break;
        case 'replay':
          applyReplay(eventIndex, event);
          break;
        case 'ask':
          // Not board state (activeAskAt reads the events), but its countdown
          // extends the recording.
          visualEndTime = Math.max(visualEndTime, event.t + event.seconds);
          break;
        case 'move': {
          const played = Chess.playSAN(event.san, w.chessState);
          if (!played) {
            reject(eventIndex, event, `Invalid move: "${event.san}"`);
            break;
          }
          const { move } = played;

          const moved = movePosition(w.positions, move, event.t);
          w.positions = moved.positions;
          w.chessState = played.next;
          if (w.check) touch(event.t, w.check.sq);
          w.check = checkAt(w.chessState, event.t);
          w.lastMove = lastMoveAt(move, event.t, event.annotation);
          if (moved.captureFlash) {
            w.lastCapture = { ...moved.captureFlash, id: String(event.line) };
          }
          nameMove(event.t, ...moved.touched, w.check?.sq);
          if (hasReplay && branchStack.length === 0) {
            const ordinal = replayFrames.length;
            const replayMove = movePosition(replayState.positions, move, ordinal);
            replayState = {
              positions: replayMove.positions,
              chessState: w.chessState,
              check: w.check && { sq: w.check.sq, t: ordinal },
              lastMove: lastMoveAt(move, ordinal, event.annotation),
              lastCapture: replayMove.captureFlash
                ? { ...replayMove.captureFlash, id: String(event.line) }
                : replayState.lastCapture,
            };
            replayFrames.push({ sourceEventIndex: eventIndex, state: replayState });
          }
          break;
        }
      }
    }

    snapshots.push({ ...w });
  }

  for (const branch of branchStack) {
    noteError(branch.event, `'branch' without matching 'mainline'`);
  }

  return {
    snapshots,
    // Errors arrive by stage (parser, then this walk); sort by line so the
    // band and its role="status" announcement read in script order.
    scriptErrors: scriptErrors.slice().sort((a, b) => a.line - b.line),
    rejectedEventIndexes,
    replayFrames,
    replaySequences,
    visualEndTime,
  };
}
