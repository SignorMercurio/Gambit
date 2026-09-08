// Pure script-to-board world derivation. React owns the clock and editing
// concerns; this module owns the deterministic state walk that turns a parsed
// timeline plus a Start FEN into immutable snapshots for the renderer.

import * as Chess from './chess';
import type { MindWorld } from './mind';
import type { ErrorEvent, MoveAnnotation, ParsedEvent, TimelineEvent } from './timeline';
import { isValidScriptTimestamp } from './playback';

// `captured` is the discriminant, not a second copy of `capturedAt != null`:
// the pair is written at one site, so the type says so and the renderer never
// has to invent a fallback timestamp for a capture that cannot exist.
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
};

type WorldBuild = {
  snapshots: WorldSnapshot[];
  scriptErrors: ErrorEvent[];
  // Position context before each event, aligned one-for-one with events.
  moveStates: Chess.MoveState[];
  // Parsed events that could not be applied to the world (for example an
  // illegal SAN, malformed FEN, or exhausted overlay budget). Structural
  // errors are deliberately excluded so presentation readers still honor the
  // br/ml depth encoded by the event stream.
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
  terminal: ReplayState;
  line: number;
};

type WorldFrame = {
  snapshot: WorldSnapshot;
  replaySourceEventIndex: number | null;
  replayActive: boolean;
};

function replayTime(sequence: Pick<ReplaySequence, 'start' | 'step'>, ordinal: number): number {
  // Only the relative step is on the decisecond grid. Authored starts can
  // carry finer precision, so rounding the origin changes the recording.
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
  };
}

// One cached frame per world, never a growing cache of visited replay frames.
// The stable reference lets Board reuse its position-derived work between steps.
const REPLAY_FRAME_CACHE = new WeakMap<WorldBuild, {
  sequence: ReplaySequence;
  index: number;
  frame: WorldFrame;
}>();

// Select the authored snapshot or the clock-derived frame of a successful
// replay directive. Exact step boundaries keep the outgoing move so a paused
// event seek (+step) shows the first replayed move rather than skipping
// straight to the second; normal playback advances on the following frame.
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
      replayActive: false,
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
    replayActive: true,
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
// the branch-entry snapshot is shared with earlier history. The caller only
// interpolates within one setup epoch; across setups, matching ids are unrelated.
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
  type BranchSnapshot = WorldSnapshot & { line: number; t: number; raw: string; setupEpoch: number };

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
  let setupEpoch = -1;

  const snapshots: WorldSnapshot[] = [];
  const scriptErrors: ErrorEvent[] = [];
  const moveStates: Chess.MoveState[] = [];
  const rejectedEventIndexes = new Set<number>();
  const branchStack: BranchSnapshot[] = [];
  const hasReplay = events.some((event) => event.kind === 'replay');
  const replaySequences = new Map<number, ReplaySequence>();
  const replayFrames: ReplayFrame[] = [];
  let replayState: ReplayState = { positions, chessState, lastMove, lastCapture, check };
  let visualEndTime = events[events.length - 1]?.t ?? 0;

  // Takes the source record rather than its fields so a `br` snapshot and a
  // parsed event report the same way and no pair of arguments can be swapped.
  // A caller that also invalidates the event uses `reject`; the structural
  // br/ml mismatches deliberately do not — see `WorldBuild.rejectedEventIndexes`.
  const noteError = (source: { t: number; line: number; raw: string }, error: string) => {
    scriptErrors.push({ t: source.t, error, line: source.line, raw: source.raw });
  };

  const reject = (eventIndex: number, event: ParsedEvent, error: string) => {
    rejectedEventIndexes.add(eventIndex);
    noteError(event, error);
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

  const applySetup = (setup: BoardSetup, event: ParsedEvent, eventIndex: number) => {
    positions = setup.positions;
    chessState = setup.chessState;
    lastMove = null;
    highlights = [];
    arrows = [];
    lastCapture = null;
    check = checkAt(chessState, event.t);
    setupEpoch = eventIndex;
    // Reset the sketch, not the mind phase clock.
    if (mind) mind = { since: mind.since, touches: new Map(), held: new Set() };
    if (hasReplay && branchStack.length === 0) {
      // A setup keeps earlier replay moves but changes its terminal position.
      // At the tail this instant is the replay end, not another move slot.
      replayState = {
        positions, chessState, lastMove, lastCapture,
        check: check && { sq: check.sq, t: replayFrames.length },
      };
    }
  };

  // The two array-backed overlay kinds, each with its own lifetime.
  // BOARD_OVERLAY_LIFETIME.captureFlash is deliberately absent: `lastCapture`
  // is a scalar renderer-only fade window, not a pinnable overlay list.
  const pruneOverlays = (t: number) => {
    highlights = pruneExpired(highlights, t, BOARD_OVERLAY_LIFETIME.highlight);
    arrows = pruneExpired(arrows, t, BOARD_OVERLAY_LIFETIME.arrow);
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

    const sequence: ReplaySequence = {
      start: event.t, end, step, moveCount, terminal: replayState, line: event.line,
    };
    // Only the terminal frame becomes authored history. In-flight frames are
    // selected on demand; another rp never reruns chess or copies the prefix.
    ({ positions, chessState, lastMove, highlights, arrows, lastCapture, check, mind, revealedAt } =
      replaySnapshot(sequence.terminal, sequence));
    replaySequences.set(eventIndex, sequence);
    visualEndTime = Math.max(visualEndTime, end);
  };

  snapshots.push(snapshot());

  for (let eventIndex = 0; eventIndex < events.length; eventIndex++) {
    const event = events[eventIndex];
    // Capacity describes visuals that are live at this event, not historical
    // entries whose fade window already ended. Prune before applying the event
    // so an expired full arrow budget cannot reject the first fresh arrow.
    pruneOverlays(event.t);
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
          branchStack.push({ ...snapshot(), line: event.line, t: event.t, raw: event.raw, setupEpoch });
          break;
        case 'mainline': {
          const branch = branchStack.pop();
          if (!branch) {
            noteError(event, `'mainline' without matching 'branch'`);
          } else {
            const departed = positions;
            const sameSetup = setupEpoch === branch.setupEpoch;
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
              setupEpoch,
            } = branch);
            if (sameSetup) positions = glideRestoredPositions(departed, positions, event.t);
            // Restoring an older branch-entry snapshot can reintroduce
            // overlays already expired at this mainline event. Earlier
            // snapshots keep their history for backward scrubbing.
            pruneOverlays(event.t);
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
          if (hasReplay && branchStack.length === 0) {
            const ordinal = replayFrames.length;
            const replayMove = movePosition(replayState.positions, move, ordinal);
            replayState = {
              positions: replayMove.positions,
              chessState,
              check: check && { sq: check.sq, t: ordinal },
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

    snapshots.push(snapshot());
  }

  for (const branch of branchStack) {
    noteError(branch, `'branch' without matching 'mainline'`);
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
    replayFrames,
    replaySequences,
    visualEndTime,
  };
}
