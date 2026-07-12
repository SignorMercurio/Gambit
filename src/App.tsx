// Main app: orchestrates state from a script, drives playback,
// renders the board, the timeline scrubber, and the editor panel.

import { useState, useEffect, useRef, useMemo, useCallback, useId } from 'react';
import {
  Board,
  BOARD_OVERLAY_LIFETIME,
  type BoardArrow,
  type BoardCheck,
  type BoardHighlight,
  type CaptureFlash,
  type LastMove,
  type PiecePos,
} from './components/Board';
import * as Chess from './lib/chess';
import { DEFAULT_SCRIPT, DEFAULT_SUBTITLES } from './lib/defaults';
import { formatSubtitleText, getActiveSubtitle, getSubtitleEnd, parseSrt } from './lib/subtitles';
import { MoveList } from './components/MoveList';
import {
  planLineInsert,
  planMoveGesture,
  removeLines,
  setLineTime,
  type ScriptEditPlan,
} from './lib/scriptEdit';
import {
  fmtTime,
  lastEventIndexAt,
  parseScript,
  type ParsedEvent,
  type TimelineEvent,
} from './lib/timeline';
import { markerColors } from './lib/tokens';

type Positions = Record<string, PiecePos>;
type BoardSetup = { positions: Positions; chessState: Chess.GameState };

function positionsFromBoard(board: Chess.Board): Positions {
  const out: Positions = {};
  let i = 0;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (!piece) continue;
      out[`${piece.side}-${piece.type}-${i++}`] = { f, r, type: piece.type, side: piece.side };
    }
  }
  return out;
}

function setupFromValidFen(fenText: string): BoardSetup {
  const chessState = Chess.stateFromFEN(fenText);
  return { chessState, positions: positionsFromBoard(chessState.board) };
}

function setupFromFen(fenText: string): BoardSetup & { error: string | null } {
  try {
    const setup = setupFromValidFen(fenText.trim() ? fenText : Chess.STARTING_FEN);
    return { ...setup, error: null };
  } catch (err) {
    const chessState = Chess.initialState();
    const message = err instanceof Error ? err.message : 'Invalid FEN';
    return { chessState, positions: positionsFromBoard(chessState.board), error: message };
  }
}

function movePosition(
  positions: Positions,
  mv: Chess.Move,
  t: number,
): { positions: Positions; captureFlash: Omit<CaptureFlash, 'id'> | null } {
  const out: Positions = {};
  for (const [k, v] of Object.entries(positions)) out[k] = { ...v };
  const [ff, fr] = mv.from;
  const [tf, tr] = mv.to;

  let moverId: string | null = null;
  for (const [k, v] of Object.entries(out)) {
    if (!v.captured && v.f === ff && v.r === fr) {
      moverId = k;
      break;
    }
  }
  let captureFlash: Omit<CaptureFlash, 'id'> | null = null;
  if (mv.capture) {
    const capF = tf;
    const capR = mv.enPassant ? fr : tr;
    captureFlash = { f: capF, r: capR, t };
    for (const [k, v] of Object.entries(out)) {
      if (k === moverId) continue;
      if (!v.captured && v.f === capF && v.r === capR) {
        out[k] = { ...v, captured: true, capturedAt: t };
        break;
      }
    }
  }
  if (moverId) {
    out[moverId] = {
      ...out[moverId],
      f: tf,
      r: tr,
      type: mv.promotion || out[moverId].type,
      moveFromF: ff,
      moveFromR: fr,
      moveT: t,
    };
  }
  if (mv.castle) {
    const homeRank = tr;
    const rookFromF = mv.castle === 'K' ? 7 : 0;
    const rookToF = mv.castle === 'K' ? 5 : 3;
    for (const [k, v] of Object.entries(out)) {
      if (!v.captured && v.f === rookFromF && v.r === homeRank && v.type === 'r') {
        out[k] = {
          ...v,
          f: rookToF,
          moveFromF: rookFromF,
          moveFromR: homeRank,
          moveT: t,
        };
        break;
      }
    }
  }
  return { positions: out, captureFlash };
}

function isInteractiveShortcutTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(
    target.closest('button, input, textarea, select, [role="button"], [role="tab"], [contenteditable="true"]'),
  );
}

function generateTicks(duration: number): number[] {
  const interval = duration > 180 ? 60 : duration > 90 ? 30 : duration > 60 ? 15 : duration > 30 ? 10 : 5;
  const ticks: number[] = [];
  for (let t = 0; t <= duration + 0.001; t += interval) ticks.push(Math.round(t * 10) / 10);
  return ticks;
}

// The one paused-landing convention (see the AGENTS.md pitfall): every timed
// visual derives from `time - event.t`, so at age 0 the moved piece,
// highlight, and arrow are all invisible. Land just past t — +0.5s when
// there's room, otherwise as late as the gap to the next event allows,
// always strictly between the two. `nextT` must be the first *strictly
// later* event (equal-time events fire together), or undefined at the tail.
function landBetween(t: number, nextT?: number): number {
  if (nextT == null) return t + 0.5;
  const gap = nextT - t;
  return t + Math.min(0.5, Math.max(gap - 0.05, gap / 2));
}

const DRAFT_KEYS = {
  script: 'gambit:draft:script',
  subtitles: 'gambit:draft:subtitles',
  fen: 'gambit:draft:start-fen',
  scriptView: 'gambit:draft:script-view',
} as const;

const SCRIPT_CHANGED_DURING_GESTURE_ERROR =
  'Cannot record this gesture because the script changed while the pointer was held. Try again from the updated position.';

function loadDraft(key: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveDraft(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Local persistence is best-effort; playback must keep working if storage is unavailable.
  }
}

function useDraftText(key: string, fallback: string) {
  const [value, setValue] = useState(() => loadDraft(key, fallback));
  useEffect(() => {
    saveDraft(key, value);
  }, [key, value]);
  return [value, setValue] as const;
}

// Pluck the selected file and reset the input so re-picking the same file
// fires change again. Shared intake for every import affordance.
function takeSelectedFile(e: React.ChangeEvent<HTMLInputElement>): File | null {
  const file = e.currentTarget.files?.[0];
  e.currentTarget.value = '';
  return file ?? null;
}

function readSelectedTextFile(
  e: React.ChangeEvent<HTMLInputElement>,
  onRead: (text: string, fileName: string) => void,
): void {
  const file = takeSelectedFile(e);
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => onRead(String(reader.result ?? ''), file.name);
  reader.readAsText(file);
}

// Import affordance: a labelled button driving a hidden file input. The
// three import surfaces (script, subtitles, narration) share the wiring so
// accept types and the button/input pairing stay in one place.
function ImportButton({
  id,
  accept,
  label,
  onChange,
  describedBy,
}: {
  id: string;
  accept: string;
  label: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  describedBy?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className="upload-btn"
        aria-label={label}
        aria-describedby={describedBy}
        onClick={() => inputRef.current?.click()}
      >
        Import
      </button>
      <input
        id={id}
        ref={inputRef}
        className="file-input"
        type="file"
        accept={accept}
        onChange={onChange}
      />
    </>
  );
}

export default function App() {
  const [scriptText, setScriptText] = useDraftText(DRAFT_KEYS.script, DEFAULT_SCRIPT);
  const [scriptFileName, setScriptFileName] = useState<string | null>(null);
  const [subtitleText, setSubtitleText] = useDraftText(DRAFT_KEYS.subtitles, DEFAULT_SUBTITLES);
  const [subtitleFileName, setSubtitleFileName] = useState<string | null>(null);
  const [fenText, setFenText] = useDraftText(DRAFT_KEYS.fen, Chess.STARTING_FEN);
  const events = useMemo(() => parseScript(scriptText), [scriptText]);
  const subtitleResult = useMemo(() => parseSrt(subtitleText), [subtitleText]);
  const subtitleCues = subtitleResult.cues;
  const initialSetup = useMemo(() => setupFromFen(fenText), [fenText]);
  const standardSetup = useMemo(() => setupFromValidFen(Chess.STARTING_FEN), []);
  // Narration audio rides the playback clock. Session-only by design: object
  // URLs die with the page and audio blobs don't fit the localStorage drafts.
  const [narration, setNarration] = useState<{ url: string; name: string; duration: number } | null>(
    null,
  );
  const [narrationError, setNarrationError] = useState<string | null>(null);

  const duration = useMemo(() => {
    const lastEvent = events[events.length - 1];
    return Math.max(
      30,
      (lastEvent ? lastEvent.t : 0) + 3,
      getSubtitleEnd(subtitleCues) + 1,
      // Like subtitles, narration that outlasts the chess script extends
      // playback so the tail of the recording stays audible.
      narration ? narration.duration : 0,
    );
  }, [events, subtitleCues, narration]);

  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  // Side panel: the script editor is the primary surface; setup (start FEN,
  // subtitles, narration audio) lives on its own quieter page.
  const [tab, setTab] = useState<'script' | 'setup'>('script');
  // Script panel view: PGN-style structured editor by default, raw text as
  // the fallback for comments and exotic edits. Persisted like the drafts.
  const [scriptViewRaw, setScriptView] = useDraftText(DRAFT_KEYS.scriptView, 'board');
  const scriptView: 'board' | 'text' = scriptViewRaw === 'text' ? 'text' : 'board';
  const scriptTextRef = useRef(scriptText);
  scriptTextRef.current = scriptText;
  // Gesture callbacks are captured at pointer-down, but the pause-landing
  // rule must follow the transport state at release: playback can flip
  // mid-drag (Space, auto-pause at the end), and landing by the captured
  // value would park a paused board exactly on the event's timestamp — the
  // age-0 invisibility pitfall.
  const playingRef = useRef(playing);
  playingRef.current = playing;
  // Pre-insert script snapshot for one-step undo of the last board gesture or
  // structured edit. Hand edits clear it so undo never reverts typing.
  const [gestureUndo, setGestureUndo] = useState<string | null>(null);
  const [scriptEditError, setScriptEditError] = useState<string | null>(null);

  useEffect(() => {
    setTime((t) => Math.min(t, duration));
  }, [duration]);

  const editorLabelId = useId();
  const subtitleLabelId = useId();
  const scriptFileInputId = useId();
  const subtitleFileInputId = useId();
  const narrationLabelId = useId();
  const narrationFileInputId = useId();
  const narrationErrorId = useId();
  const setupTabId = useId();
  const scriptTabId = useId();
  const panelId = useId();
  const fenErrorId = useId();
  const setupTabRef = useRef<HTMLButtonElement>(null);
  const scriptTabRef = useRef<HTMLButtonElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const onTabKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      e.stopPropagation();
      const next = tab === 'script' ? 'setup' : 'script';
      setTab(next);
      // Match the ARIA Tabs pattern: focus follows selection on arrow keys.
      requestAnimationFrame(() => {
        (next === 'script' ? scriptTabRef : setupTabRef).current?.focus();
      });
    },
    [tab],
  );

  const onScriptFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    readSelectedTextFile(e, (text, fileName) => {
      setScriptText(text);
      setScriptFileName(fileName);
      setGestureUndo(null);
      setScriptEditError(null);
    });
  }, []);

  const onSubtitleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    readSelectedTextFile(e, (text, fileName) => {
      setSubtitleText(text);
      setSubtitleFileName(fileName);
    });
  }, []);

  const onNarrationFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = takeSelectedFile(e);
    if (!file) return;
    const url = URL.createObjectURL(file);
    // Probe metadata off-DOM so a broken file never becomes the live track.
    const probe = new Audio();
    probe.preload = 'metadata';
    probe.src = url;
    probe.onloadedmetadata = () => {
      const audioDuration = Number.isFinite(probe.duration) ? probe.duration : 0;
      setNarrationError(null);
      setNarration((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url, name: file.name, duration: audioDuration };
      });
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      setNarrationError(`Could not decode audio file: "${file.name}"`);
    };
  }, []);

  const clearNarration = useCallback(() => {
    setNarrationError(null);
    setNarration((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) {
      lastTickRef.current = null;
      return;
    }
    function tick(now: number) {
      if (lastTickRef.current == null) lastTickRef.current = now;
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      let terminal = false;
      setTime((t) => {
        const next = t + dt * speed;
        if (next >= duration) {
          setPlaying(false);
          terminal = true;
          return duration;
        }
        return next;
      });
      if (!terminal) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, speed, duration]);

  // Narration follows the playback clock; the clock stays the single source
  // of truth so the board remains fully determined by script + time. Two
  // couplings: idempotent state application (rate + play/pause, re-applied
  // when the <audio> element remounts on narration change), and a drift snap
  // that also covers seeks.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !narration) return;
    el.playbackRate = speed;
    if (playing) {
      el.play().catch(() => {
        // Autoplay rejection: playback starts from a user gesture in every
        // Gambit flow, but if a browser still refuses, stay silent.
      });
    } else {
      el.pause();
    }
  }, [playing, speed, narration]);

  // 0.25s tick granularity matches the snap tolerance below: any seek larger
  // than the tolerance crosses a tick boundary, while steady playback runs
  // this check ~4x/s instead of every animation frame.
  const narrationDriftTick = narration ? Math.round(time * 4) : 0;
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !narration) return;
    const target = Math.min(time, narration.duration);
    if (Math.abs(el.currentTime - target) > 0.25) {
      el.currentTime = target;
      if (playing && time < narration.duration && el.paused) {
        el.play().catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- time is sampled
    // at tick granularity on purpose; see narrationDriftTick above.
  }, [narrationDriftTick, narration, playing]);

  // snapshots[0] is the initial state; snapshots[i+1] is the state AFTER
  // applying events[i]. Per-frame render binary-searches by `time` to pick the
  // current snapshot, then filters highlights/arrows by their lifetime windows.
  type WorldSnap = {
    positions: Positions;
    chessState: Chess.GameState;
    lastMove: LastMove | null;
    highlights: BoardHighlight[];
    arrows: BoardArrow[];
    lastCapture: CaptureFlash | null;
    // Checked king square, derived from chessState (never from a SAN `+`).
    // State-scoped, not transient: it persists until the position changes.
    check: BoardCheck | null;
    errors: TimelineEvent[];
  };

  const snapshots = useMemo<WorldSnap[]>(() => {
    type BranchSnap = WorldSnap & {
      line: number;
      t: number;
      raw: string;
    };

    const checkAt = (state: Chess.GameState, t: number): BoardCheck | null => {
      const sq = Chess.checkedKingSquare(state);
      return sq ? { sq, t } : null;
    };

    let positions = initialSetup.positions;
    let chessState = initialSetup.chessState;
    let lastMove: LastMove | null = null;
    // Rebound (not mutated) so prior snapshots share their array references.
    let highlights: BoardHighlight[] = [];
    let arrows: BoardArrow[] = [];
    let lastCapture: CaptureFlash | null = null;
    // A custom Start FEN may already be a check position.
    let check: BoardCheck | null = checkAt(initialSetup.chessState, 0);
    const errorAcc: TimelineEvent[] = [];
    const branchStack: BranchSnap[] = [];

    const list: WorldSnap[] = [];
    const applySetup = (setup: Pick<WorldSnap, 'positions' | 'chessState'>, t: number) => {
      positions = setup.positions;
      chessState = setup.chessState;
      lastMove = null;
      highlights = [];
      arrows = [];
      lastCapture = null;
      check = checkAt(setup.chessState, t);
    };
    const snapshot = (errors: TimelineEvent[] = errorAcc.slice()): WorldSnap => ({
      positions,
      chessState,
      lastMove,
      highlights,
      arrows,
      lastCapture,
      check,
      errors,
    });

    list.push(snapshot([]));

    for (const ev of events) {
      if ('error' in ev) {
        errorAcc.push(ev);
      } else {
        switch (ev.kind) {
          case 'highlight':
            highlights = [
              ...highlights,
              ...ev.squares.map((sq) => ({ sq, t: ev.t, pinned: ev.pinned })),
            ];
            break;
          case 'arrow':
            arrows = [...arrows, { from: ev.from, to: ev.to, t: ev.t, pinned: ev.pinned }];
            break;
          case 'clear':
            highlights = [];
            arrows = [];
            break;
          case 'reset':
            applySetup(initialSetup, ev.t);
            break;
          case 'start':
            applySetup(standardSetup, ev.t);
            break;
          case 'fen': {
            const setup = setupFromFen(ev.fen);
            if (setup.error) {
              errorAcc.push({ t: ev.t, error: setup.error, line: ev.line, raw: ev.raw });
            } else {
              applySetup(setup, ev.t);
            }
            break;
          }
          case 'branch':
            branchStack.push({ ...snapshot([]), line: ev.line, t: ev.t, raw: ev.raw });
            break;
          case 'mainline': {
            const snap = branchStack.pop();
            if (!snap) {
              errorAcc.push({
                t: ev.t,
                error: `'mainline' without matching 'branch'`,
                line: ev.line,
                raw: ev.raw,
              });
            } else {
              positions = snap.positions;
              chessState = snap.chessState;
              lastMove = snap.lastMove;
              highlights = snap.highlights;
              arrows = snap.arrows;
              lastCapture = snap.lastCapture;
              check = snap.check;
            }
            break;
          }
          case 'move': {
            const mv = Chess.parseSAN(ev.san, chessState);
            if (!mv) {
              errorAcc.push({ t: ev.t, error: `Invalid move: "${ev.san}"`, line: ev.line, raw: ev.raw });
            } else {
              const moved = movePosition(positions, mv, ev.t);
              positions = moved.positions;
              chessState = Chess.applyMove(chessState, mv);
              check = checkAt(chessState, ev.t);
              lastMove = {
                fromF: mv.from[0],
                fromR: mv.from[1],
                toF: mv.to[0],
                toR: mv.to[1],
                t: ev.t,
                annotation: ev.annotation,
              };
              if (moved.captureFlash) lastCapture = { ...moved.captureFlash, id: `${ev.line}` };
            }
            break;
          }
        }
      }

      list.push(snapshot());
    }

    for (const snap of branchStack) {
      errorAcc.push({
        t: snap.t,
        error: `'branch' without matching 'mainline'`,
        line: snap.line,
        raw: snap.raw,
      });
    }
    if (branchStack.length > 0) {
      // Rebuild the final snapshot (same board state, updated errors) rather
      // than pushing an extra one: the world selector reads at most
      // snapshots[events.length], so an appended slot is never reachable and
      // the unpaired-br error would stay invisible forever.
      list[list.length - 1] = snapshot();
    }

    return list;
  }, [events, initialSetup, standardSetup]);

  const world = useMemo(() => {
    // snapshots[i + 1] is the state AFTER events[i], so the reached index
    // maps straight to a snapshot slot.
    const snap = snapshots[lastEventIndexAt(events, time) + 1];

    const visibleHighlights = snap.highlights
      .filter((h) => h.pinned || time - h.t < BOARD_OVERLAY_LIFETIME.highlight);
    const visibleArrows = snap.arrows
      .filter((a) => a.pinned || time - a.t < BOARD_OVERLAY_LIFETIME.arrow);
    const captureFlash =
      snap.lastCapture && time - snap.lastCapture.t < BOARD_OVERLAY_LIFETIME.captureFlash
        ? snap.lastCapture
        : null;

    return {
      positions: snap.positions,
      chessState: snap.chessState,
      lastMove: snap.lastMove,
      highlights: visibleHighlights,
      arrows: visibleArrows,
      errors: snap.errors,
      captureFlash,
      check: snap.check,
    };
  }, [snapshots, events, time]);

  // landBetween with the boundary looked up from the current events — for
  // freshly written lines the events array is stale, so those callers pass
  // the boundary they just placed to landBetween directly.
  const landAfter = useCallback(
    (t: number): number => landBetween(t, events[lastEventIndexAt(events, t) + 1]?.t),
    [events],
  );

  // Event-anchored seek: while playing, land on t and let it animate; while
  // paused, land just past it so the click shows what it named — and never
  // shows more (the landing stays clamped before the next event).
  const seekEvent = useCallback(
    (t: number) => {
      setTime(playingRef.current ? t : landAfter(t));
    },
    [landAfter],
  );

  // One commit contract for every programmatic script edit (gestures and
  // structured edits): snapshot the prior text for one-step undo, apply,
  // drop the imported-file name. While paused, `landT` moves the playhead
  // just past what the edit wrote so the board shows its settled result,
  // and nothing more.
  const commitScriptEdit = useCallback(
    (next: string, landT?: number) => {
      setGestureUndo(scriptText);
      setScriptEditError(null);
      setScriptText(next);
      setScriptFileName(null);
      if (landT != null && !playingRef.current) setTime(landT);
    },
    [scriptText, setScriptText],
  );

  // Both gestures reject the same way: the script text changed between
  // pointer-down and pointer-up (hand edit, undo), so any plan would be built
  // against text the gesture never previewed. Leaves the script untouched.
  const gestureIsStale = useCallback((): boolean => {
    if (scriptTextRef.current === scriptText) return false;
    setScriptEditError(SCRIPT_CHANGED_DURING_GESTURE_ERROR);
    return true;
  }, [scriptText]);

  // The one way a planner's edit reaches React: surface a conflict, or commit
  // the new text and land the paused playhead between the line it wrote and
  // whatever follows.
  const applyEditPlan = useCallback(
    (plan: ScriptEditPlan) => {
      if (plan.kind === 'conflict') setScriptEditError(plan.error);
      else commitScriptEdit(plan.text, landBetween(plan.t, plan.nextT));
    },
    [commitScriptEdit],
  );

  // Board gestures (Script tab only): each gesture becomes one script line
  // stamped at the playhead — stamping policy lives in planLineInsert.
  const recordGestureLine = useCallback(
    (body: string) => {
      if (gestureIsStale()) return;
      applyEditPlan(planLineInsert(events, scriptText, time, body));
    },
    [scriptText, time, events, gestureIsStale, applyEditPlan],
  );

  const undoGestureLine = useCallback(() => {
    if (gestureUndo == null) return;
    setScriptText(gestureUndo);
    setGestureUndo(null);
    setScriptEditError(null);
  }, [gestureUndo, setScriptText]);

  const legalTargets = useCallback(
    (from: string): string[] => {
      const { f, r } = Chess.sqToIdx(from);
      const out = new Set<string>();
      for (const m of Chess.legalMoves(world.chessState)) {
        if (m.from[0] === f && m.from[1] === r) out.add(Chess.idxToSq(m.to[0], m.to[1]));
      }
      return [...out];
    },
    [world.chessState],
  );

  // Move gestures: chess resolution (legality, SAN, same-move comparison)
  // happens here against the current position; the branch-aware policy —
  // advance / extend / wrap / plain-insert fallback — is planMoveGesture's
  // (scriptEdit.ts). The plan is either a seek or new text plus landing
  // boundaries; committing stays a React concern.
  const onMoveGesture = useCallback(
    (from: string, to: string) => {
      if (gestureIsStale()) return;
      const f = Chess.sqToIdx(from);
      const t = Chess.sqToIdx(to);
      const candidates = Chess.legalMoves(world.chessState).filter(
        (m) => m.from[0] === f.f && m.from[1] === f.r && m.to[0] === t.f && m.to[1] === t.r,
      );
      // Promotion records a queen; underpromotion stays a hand edit.
      const mv = candidates.find((m) => !m.promotion || m.promotion === 'q');
      if (!mv) return;
      const san = Chess.sanForMove(world.chessState, mv);
      // Coordinate comparison, not SAN string equality: the scripted line
      // may carry check/annotation suffixes the generated SAN never has.
      const matchesScripted = (scriptedSan: string) => {
        const scripted = Chess.parseSAN(scriptedSan, world.chessState);
        return (
          !!scripted &&
          scripted.from[0] === mv.from[0] &&
          scripted.from[1] === mv.from[1] &&
          scripted.to[0] === mv.to[0] &&
          scripted.to[1] === mv.to[1] &&
          (scripted.promotion ?? null) === (mv.promotion ?? null)
        );
      };
      const plan = planMoveGesture(events, scriptText, time, san, matchesScripted);
      if (plan.kind === 'seek') {
        setScriptEditError(null);
        seekEvent(plan.t);
      } else {
        applyEditPlan(plan);
      }
    },
    [world.chessState, events, time, scriptText, seekEvent, gestureIsStale, applyEditPlan],
  );

  const onArrowGesture = useCallback(
    (from: string, to: string) => recordGestureLine(`${from}->${to}`),
    [recordGestureLine],
  );

  const onHighlightGesture = useCallback(
    (sq: string) => recordGestureLine(`hl ${sq}`),
    [recordGestureLine],
  );

  // Structured edits from the PGN script view. Free-form times by design:
  // the script re-sorts (and the line relocates) when an edit crosses other
  // events, and any structural damage surfaces as visible errors — same
  // snapshot-undo safety net as the gestures.
  const onRetimeEvent = useCallback(
    (line: number, t: number) => commitScriptEdit(setLineTime(scriptText, line, t)),
    [scriptText, commitScriptEdit],
  );

  const onDeleteEvents = useCallback(
    (lines: number[]) => commitScriptEdit(removeLines(scriptText, lines)),
    [scriptText, commitScriptEdit],
  );

  // Rewind preserves the play state (editor convention): while playing it
  // replays from 0; while paused or at the end it returns to 0 paused. The
  // gradient play button owns "replay from the end", so the two transport
  // buttons never duplicate.
  const restart = useCallback(() => {
    setTime(0);
  }, []);
  const pauseToggle = useCallback(() => {
    if (time >= duration) {
      setTime(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  }, [time, duration]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isInteractiveShortcutTarget(e.target)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (e.repeat) return;
        pauseToggle();
      }
      if (e.code === 'ArrowLeft') setTime((t) => Math.max(0, t - 1));
      if (e.code === 'ArrowRight') setTime((t) => Math.min(duration, t + 1));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [duration, pauseToggle]);

  const eventMarkers = useMemo(
    () => events.filter((e): e is ParsedEvent => !('error' in e)),
    [events],
  );
  const ticks = useMemo(() => generateTicks(duration), [duration]);

  // Position context before each event (move numbering for the PGN list):
  // snapshots[i] is the state BEFORE events[i], so its fullmove/turn label
  // the move that events[i] plays.
  const moveStates = useMemo(
    () =>
      events.map((_, i) => ({
        fullmove: snapshots[i].chessState.fullmove,
        turn: snapshots[i].chessState.turn,
      })),
    [events, snapshots],
  );

  const activeSubtitle = useMemo(() => getActiveSubtitle(subtitleCues, time), [subtitleCues, time]);

  // Replay panel follow-scroll: keep the event the playhead has reached
  // visible, like a video editor's timeline list. Manual reading wins:
  // following pauses while a mouse pointer is over the list and resumes
  // when it leaves. Scrolls only the list container, never the page.
  // The Moves list follows the playhead only while playback runs; while
  // paused it scrolls independently — editing must not fight the scroll
  // position. Hovering pauses the follow so a click target stays put.
  const editListRef = useRef<HTMLDivElement | null>(null);
  const followPausedRef = useRef(false);
  const pauseFollowOnHover = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') followPausedRef.current = true;
  }, []);
  const resumeFollowOnLeave = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') followPausedRef.current = false;
  }, []);
  // React fires no pointerleave when the hovered list unmounts (keyboard
  // tab/view switch), so the pause must reset when the list goes away.
  useEffect(() => {
    if (tab !== 'script' || scriptView !== 'board') followPausedRef.current = false;
  }, [tab, scriptView]);

  const reachedEventIndex = useMemo(() => lastEventIndexAt(events, time), [events, time]);

  useEffect(() => {
    if (!playing || followPausedRef.current) return;
    const list = editListRef.current;
    if (!list) return;
    if (reachedEventIndex < 0) {
      list.scrollTop = 0;
      return;
    }
    // The PGN list nests event elements, so the reached event is located by
    // its data-evi attribute rather than by child index.
    const row = list.querySelector<HTMLElement>(`[data-evi="${reachedEventIndex}"]`);
    if (!row) return;
    const listRect = list.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    if (rowRect.top < listRect.top) {
      list.scrollTop += rowRect.top - listRect.top;
    } else if (rowRect.bottom > listRect.bottom) {
      list.scrollTop += rowRect.bottom - listRect.bottom;
    }
  }, [reachedEventIndex, playing, tab, scriptView]);

  const playState: 'play' | 'pause' | 'replay' = playing
    ? 'pause'
    : time >= duration
    ? 'replay'
    : 'play';
  const playLabel = playState === 'pause' ? 'Pause' : playState === 'replay' ? 'Restart playback' : 'Play';

  // Event pins depend only on the parsed script, not the clock — memoized so
  // 60Hz frames reuse the element and React bails out of the subtree.
  const timelinePins = useMemo(
    () => (
      <div className="timeline-pins">
        {eventMarkers.map((e, i) => (
          <button
            type="button"
            key={i}
            className="marker"
            aria-label={`Seek to ${fmtTime(e.t, 'auto')}: ${e.raw}`}
            onClick={() => seekEvent(e.t)}
            style={{
              left: `${(e.t / duration) * 100}%`,
              color: markerColors[e.kind],
            }}
          />
        ))}
      </div>
    ),
    [eventMarkers, duration, seekEvent],
  );

  // Rendered at the bottom of whichever panel page is open: an error anywhere
  // (FEN, script, subtitles, narration) must stay visible on both pages.
  const errorsBlock = useMemo(() => (initialSetup.error ||
    narrationError ||
    scriptEditError ||
    world.errors.length > 0 ||
    subtitleResult.errors.length > 0) && (
    <div className="errors" role="alert" aria-live="polite">
      {initialSetup.error && (
        <div className="err-row">
          <span className="err-line">FEN</span>
          <span id={fenErrorId}>{initialSetup.error}</span>
        </div>
      )}
      {narrationError && (
        <div className="err-row">
          <span className="err-line">AUD</span>
          <span id={narrationErrorId}>{narrationError}</span>
        </div>
      )}
      {scriptEditError && (
        <div className="err-row">
          <span className="err-line">EDIT</span>
          <span>{scriptEditError}</span>
        </div>
      )}
      {world.errors.map((er, i) => (
        <div key={i} className="err-row">
          <span className="err-line">L{er.line}</span>
          <span>{'error' in er ? er.error : ''}</span>
        </div>
      ))}
      {subtitleResult.errors.map((er, i) => (
        <div key={`subtitle-${i}`} className="err-row">
          <span className="err-line">S{er.line}</span>
          <span>{er.error}</span>
        </div>
      ))}
    </div>
  ), [
    initialSetup.error,
    narrationError,
    scriptEditError,
    world.errors,
    subtitleResult.errors,
    fenErrorId,
    narrationErrorId,
  ]);

  return (
    <div className="app">
      {/* Narration track: invisible, driven entirely by the playback clock. */}
      {narration && <audio ref={audioRef} src={narration.url} preload="auto" />}
      <header className="header">
        <div className="title-block">
          <div className="logo" aria-hidden="true">
            <img src="/gambit-mark.svg" alt="" />
          </div>
          <div>
            <h1 className="app-title">Gambit</h1>
            <div className="app-sub">Chess timeline renderer</div>
          </div>
        </div>
      </header>

      <main className="main">
        <div className="board-col">
          <Board
            positions={world.positions}
            lastMove={world.lastMove}
            highlights={world.highlights}
            arrows={world.arrows}
            captureFlash={world.captureFlash}
            check={world.check}
            time={time}
            interactive={tab === 'script'}
            legalTargets={legalTargets}
            onMoveGesture={onMoveGesture}
            onArrowGesture={onArrowGesture}
            onHighlightGesture={onHighlightGesture}
          />

          <div
            className={`subtitle-strip ${activeSubtitle ? '' : 'is-empty'} ${
              subtitleCues.length === 0 ? 'no-track' : ''
            }`}
            aria-live="polite"
            aria-atomic="true"
          >
            <p>{activeSubtitle ? formatSubtitleText(activeSubtitle.text) : ''}</p>
          </div>

          <div className="controls" role="group" aria-label="Playback controls">
            <button
              type="button"
              className="play-btn"
              onClick={pauseToggle}
              aria-label={`${playLabel} (space)`}
            >
              {playState === 'pause' ? (
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
                  <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
                </svg>
              ) : playState === 'replay' ? (
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path
                    d="M5 12 a 7 7 0 1 1 14 0 a 7 7 0 1 1 -14 0 M5 5 v6 h6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path d="M7 5 L19 12 L7 19 Z" fill="currentColor" />
                </svg>
              )}
            </button>
            <button type="button" className="ctrl-btn" onClick={restart} aria-label="Rewind to start">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  d="M5 5 v14 M19 5 L8 12 L19 19 Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <div
              className="time-readout"
              aria-label={`${fmtTime(time, 'always')} of ${fmtTime(duration, 'always')}`}
            >
              <span className="t-now">{fmtTime(time, 'always')}</span>
              <span className="t-sep" aria-hidden="true">/</span>
              <span className="t-tot">{fmtTime(duration, 'always')}</span>
            </div>

            <div className="timeline">
              {timelinePins}
              <div className="timeline-rail">
                <div className="scrub-fill" style={{ width: `${(time / duration) * 100}%` }} />
              </div>
              <div className="timeline-ticks" aria-hidden="true">
                {ticks.map((t) => (
                  <span
                    key={t}
                    className="timeline-tick"
                    style={{ left: `${(t / duration) * 100}%` }}
                  >
                    {fmtTime(t)}
                  </span>
                ))}
              </div>
              <div
                className="playhead"
                style={{ left: `${(time / duration) * 100}%` }}
                aria-hidden="true"
              >
                <div className="playhead-thumb" />
              </div>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.01}
                value={time}
                onChange={(e) => setTime(parseFloat(e.target.value))}
                className="scrub-input"
                aria-label="Timeline position"
                aria-valuetext={`${fmtTime(time, 'always')} of ${fmtTime(duration, 'always')}`}
              />
            </div>

            <div className="speed-group" role="group" aria-label="Playback speed">
              {[0.5, 1, 2, 4].map((s) => (
                <button
                  type="button"
                  key={s}
                  className="speed-btn"
                  aria-pressed={speed === s}
                  aria-label={`${s} times speed`}
                  onClick={() => setSpeed(s)}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside className="side-col">
          <div
            className="mode-tabs"
            role="tablist"
            aria-orientation="horizontal"
            aria-label="Side panel mode"
            onKeyDown={onTabKeyDown}
          >
            <button
              type="button"
              role="tab"
              id={scriptTabId}
              aria-controls={panelId}
              aria-selected={tab === 'script'}
              tabIndex={tab === 'script' ? 0 : -1}
              ref={scriptTabRef}
              className="tab-btn"
              onClick={() => setTab('script')}
            >
              Script
            </button>
            <button
              type="button"
              role="tab"
              id={setupTabId}
              aria-controls={panelId}
              aria-selected={tab === 'setup'}
              tabIndex={tab === 'setup' ? 0 : -1}
              ref={setupTabRef}
              className="tab-btn"
              onClick={() => setTab('setup')}
            >
              Setup
            </button>
          </div>
          {/* One tabpanel shell for both pages: the ARIA wiring and the
             errors-stay-visible rule live here once, not per page. */}
          <div
            className="editor"
            role="tabpanel"
            id={panelId}
            aria-labelledby={tab === 'script' ? scriptTabId : setupTabId}
          >
            {tab === 'script' ? (
              <>
              <div className="panel-header">
                <div className="panel-title-row">
                  <h2 className="panel-title" id={editorLabelId}>Script</h2>
                  <div className="subtitle-actions">
                    <div className="view-toggle" role="group" aria-label="Script view mode">
                      <button
                        type="button"
                        className="view-btn"
                        aria-pressed={scriptView === 'board'}
                        onClick={() => setScriptView('board')}
                      >
                        Moves
                      </button>
                      <button
                        type="button"
                        className="view-btn"
                        aria-pressed={scriptView === 'text'}
                        onClick={() => setScriptView('text')}
                      >
                        Text
                      </button>
                    </div>
                    {scriptFileName && <span className="subtitle-file">{scriptFileName}</span>}
                    {gestureUndo != null && (
                      <button
                        type="button"
                        className="upload-btn"
                        aria-label="Undo last board edit"
                        onClick={undoGestureLine}
                      >
                        Undo
                      </button>
                    )}
                    <ImportButton
                      id={scriptFileInputId}
                      accept=".gambit,.txt,text/plain"
                      label="Import script file"
                      onChange={onScriptFileChange}
                    />
                  </div>
                </div>
                {/* One hint per view: syntax belongs to Text, gestures to Moves. */}
                {scriptView === 'text' ? (
                  <p className="panel-hint">
                    [mm:ss.s] SAN · hl · a1-&gt;b2 · cl · rs · st · fen · br / ml
                  </p>
                ) : (
                  <p className="panel-hint">
                    Drag to move · right-drag arrow · right-click highlight
                  </p>
                )}
              </div>
              {scriptView === 'board' ? (
                <MoveList
                  events={events}
                  states={moveStates}
                  reachedEventIndex={reachedEventIndex}
                  onSeek={seekEvent}
                  listRef={editListRef}
                  labelId={editorLabelId}
                  onRetime={onRetimeEvent}
                  onDelete={onDeleteEvents}
                  onPointerEnter={pauseFollowOnHover}
                  onPointerLeave={resumeFollowOnLeave}
                />
              ) : (
                <textarea
                  id="script-text"
                  className="script-textarea"
                  spellCheck={false}
                  value={scriptText}
                  aria-labelledby={editorLabelId}
                  onChange={(e) => {
                    setScriptText(e.target.value);
                    setScriptFileName(null);
                    // A hand edit invalidates the gesture-undo snapshot: undoing
                    // past it would silently revert the user's typing too.
                    setGestureUndo(null);
                    setScriptEditError(null);
                  }}
                />
              )}
              </>
            ) : (
              <>
              <div className="panel-header">
                <div className="panel-title-row">
                  <h2 className="panel-title">Setup</h2>
                </div>
              </div>
              <div className="fen-field">
                <label htmlFor="start-fen">Start FEN</label>
                <input
                  id="start-fen"
                  type="text"
                  spellCheck={false}
                  value={fenText}
                  aria-invalid={initialSetup.error ? true : undefined}
                  aria-describedby={initialSetup.error ? fenErrorId : undefined}
                  aria-errormessage={initialSetup.error ? fenErrorId : undefined}
                  onChange={(e) => setFenText(e.target.value)}
                />
              </div>
              <section className="subtitle-editor grow" aria-labelledby={subtitleLabelId}>
                <div className="subtitle-editor-head">
                  <label id={subtitleLabelId} htmlFor="subtitle-text">Subtitles</label>
                  <div className="subtitle-actions">
                    {subtitleFileName && <span className="subtitle-file">{subtitleFileName}</span>}
                    <ImportButton
                      id={subtitleFileInputId}
                      accept=".srt,text/plain"
                      label="Import subtitle file"
                      onChange={onSubtitleFileChange}
                    />
                  </div>
                </div>
                <textarea
                  id="subtitle-text"
                  className="subtitle-textarea"
                  spellCheck={false}
                  value={subtitleText}
                  onChange={(e) => {
                    setSubtitleText(e.target.value);
                    setSubtitleFileName(null);
                  }}
                  placeholder={'1\n00:00:01,000 --> 00:00:04,000\nCentral control is established.'}
                />
              </section>
              <section className="subtitle-editor" aria-labelledby={narrationLabelId}>
                <div className="subtitle-editor-head">
                  <label id={narrationLabelId} htmlFor={narrationFileInputId}>Narration audio</label>
                  <div className="subtitle-actions">
                    {narration && (
                      <>
                        <span className="subtitle-file">{narration.name}</span>
                        {/* Duration outside the truncating span: metrics never
                           tail-truncate into an ellipsis. */}
                        <span className="narration-duration">
                          {fmtTime(narration.duration, 'always')}
                        </span>
                        <button
                          type="button"
                          className="upload-btn"
                          aria-label="Remove narration audio"
                          onClick={clearNarration}
                        >
                          Remove
                        </button>
                      </>
                    )}
                    <ImportButton
                      id={narrationFileInputId}
                      accept="audio/*"
                      label="Import narration audio file"
                      describedBy={narrationError ? narrationErrorId : undefined}
                      onChange={onNarrationFileChange}
                    />
                  </div>
                </div>
                <p className="panel-hint narration-hint">
                  Follows the timeline. Session-only; re-import after a reload.
                </p>
              </section>
              </>
            )}
            {errorsBlock}
          </div>
        </aside>
      </main>

      <footer className="footer">
        <span>Space play/pause · ←/→ ±1s · Click event or marker to seek</span>
        <span> · Staunty pieces by sadsnake1 (CC BY-NC-SA 4.0)</span>
      </footer>
    </div>
  );
}
