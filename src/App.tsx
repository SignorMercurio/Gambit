// Main app: orchestrates state from a script, drives playback,
// renders the board, the timeline scrubber, and the editor panel.

import { useState, useEffect, useRef, useMemo, useCallback, useId } from 'react';
import { Board } from './components/Board';
import * as Chess from './lib/chess';
import { DEFAULT_SCRIPT, DEFAULT_SUBTITLES } from './lib/defaults';
import { formatSubtitleText, getActiveSubtitle, getSubtitleEnd, parseSrt } from './lib/subtitles';
import { MoveList } from './components/MoveList';
import { PresentationMoves } from './components/PresentationMoves';
import { scrollEviIntoView } from './lib/scrollEventIntoView';
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
} from './lib/timeline';
import { markerColors } from './lib/tokens';
import { useRovingTabIndex } from './components/useRovingTabIndex';
import { buildWorld, setupFromFen } from './lib/world';
import {
  landBetween,
  MAX_SAFE_PLAYBACK_SECONDS,
  playbackDuration,
  playStateAt,
  timelineTicks,
  type PlayState,
} from './lib/playback';

type NarrationTrack = { url: string; name: string; duration: number };
const LEGAL_MOVES_CACHE = new WeakMap<Chess.GameState, Chess.Move[]>();

function legalMovesFor(state: Chess.GameState): Chess.Move[] {
  const cached = LEGAL_MOVES_CACHE.get(state);
  if (cached) return cached;
  const moves = Chess.legalMoves(state);
  LEGAL_MOVES_CACHE.set(state, moves);
  return moves;
}

function isInteractiveShortcutTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(
    target.closest('button, input, textarea, select, [role="button"], [role="tab"], [contenteditable="true"]'),
  );
}

const PLAY_LABELS: Record<PlayState, string> = {
  play: 'Play',
  pause: 'Pause',
  replay: 'Restart playback',
};

const DRAFT_KEYS = {
  script: 'gambit:draft:script',
  subtitles: 'gambit:draft:subtitles',
  fen: 'gambit:draft:start-fen',
  scriptView: 'gambit:draft:script-view',
  presentPgn: 'gambit:draft:present-pgn',
} as const;

// Idle timeout before present-mode chrome (floating transport + cursor) fades
// out during playback, video-player style.
const PRESENT_IDLE_MS = 2000;

const SCRIPT_CHANGED_DURING_GESTURE_ERROR =
  'Cannot record this gesture because the script changed while the pointer was held. Try again from the updated position.';
const MAX_TEXT_IMPORT_BYTES = 1_000_000;

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

// Render-mirrored ref: always the latest committed value, for callbacks that
// must read state at call time without taking it as a dep (which would
// re-identify them — and re-subscribe listeners — on every change).
function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

function useDraftText(key: string, fallback: string) {
  const [value, setValue] = useState(() => loadDraft(key, fallback));
  // Debounced: a synchronous localStorage write per keystroke is jank waiting
  // to happen on large scripts. The pagehide flush covers the tab closing
  // inside the debounce window, so at most a blink of typing is at risk.
  useEffect(() => {
    const id = window.setTimeout(() => saveDraft(key, value), 300);
    const flush = () => saveDraft(key, value);
    window.addEventListener('pagehide', flush);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('pagehide', flush);
    };
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
  latestRead: { current: number },
  onRead: (text: string, fileName: string) => void,
  onError: (message: string) => void,
): void {
  const file = takeSelectedFile(e);
  if (!file) return;
  const request = ++latestRead.current;
  if (file.size > MAX_TEXT_IMPORT_BYTES) {
    onError(`Could not import "${file.name}": text files are limited to 1 MB.`);
    return;
  }
  file.text().then(
    (text) => {
      if (latestRead.current === request) onRead(text, file.name);
    },
    () => {
      if (latestRead.current === request) onError(`Could not read "${file.name}".`);
    },
  );
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
  // Narration audio rides the playback clock. Session-only by design: object
  // URLs die with the page and audio blobs don't fit the localStorage drafts.
  const [narration, setNarration] = useState<NarrationTrack | null>(null);
  const [narrationError, setNarrationError] = useState<string | null>(null);
  const pendingNarrationRef = useRef<{
    url: string;
    probe: HTMLAudioElement;
  } | null>(null);

  const duration = useMemo(() => {
    const lastEvent = events[events.length - 1];
    return playbackDuration(
      lastEvent?.t,
      getSubtitleEnd(subtitleCues),
      // Like subtitles, narration that outlasts the chess script extends
      // playback so the tail of the recording stays audible.
      narration?.duration,
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
  const [scriptViewRaw, setScriptView] = useDraftText(DRAFT_KEYS.scriptView, 'moves');
  const scriptView: 'moves' | 'text' = scriptViewRaw === 'text' ? 'text' : 'moves';
  // Present mode: a distraction-free view for screen recording. The editing
  // chrome (header, side panel, footer) hides and the board grows; an optional
  // read-only mainline PGN can ride alongside. Purely a view flag — the board
  // stays determined by script + FEN + time.
  const [present, setPresent] = useState(false);
  const [presentPgnRaw, setPresentPgn] = useDraftText(DRAFT_KEYS.presentPgn, '0');
  const presentPgn = presentPgnRaw === '1';
  // Chrome (floating transport + cursor) fades out while present + playing +
  // pointer idle; pointer movement or contact brings it back.
  const [chromeHidden, setChromeHidden] = useState(false);
  const scriptTextRef = useLatest(scriptText);
  // The pause-landing rule must follow the transport state at release, not
  // the pointer-down snapshot: playback can flip mid-drag (Space, auto-pause
  // at the end), and landing by the captured value would park a paused board
  // exactly on the event's timestamp — the age-0 invisibility pitfall.
  const playingRef = useLatest(playing);
  // pauseToggle reads the clock only for its at-end restart branch; a `time`
  // dep would re-identify it (and the window keydown listener) every frame.
  const timeRef = useLatest(time);
  // Pre-insert script snapshot for one-step undo of the last board gesture or
  // structured edit. Hand edits clear it so undo never reverts typing.
  const [gestureUndo, setGestureUndo] = useState<string | null>(null);
  const [scriptEditError, setScriptEditError] = useState<string | null>(null);
  const [scriptImportError, setScriptImportError] = useState<string | null>(null);
  const [subtitleImportError, setSubtitleImportError] = useState<string | null>(null);

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
  const scriptImportErrorId = useId();
  const subtitleImportErrorId = useId();
  const setupTabId = useId();
  const scriptTabId = useId();
  const panelId = useId();
  const fenErrorId = useId();
  const setupTabRef = useRef<HTMLButtonElement>(null);
  const scriptTabRef = useRef<HTMLButtonElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const latestScriptReadRef = useRef(0);
  const latestSubtitleReadRef = useRef(0);

  const onTabKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      e.stopPropagation();
      const next = tab === 'script' ? 'setup' : 'script';
      setTab(next);
      // Both tab buttons stay mounted, so focus can follow selection
      // synchronously without inserting an uncancelled frame of latency.
      (next === 'script' ? scriptTabRef : setupTabRef).current?.focus();
    },
    [tab],
  );

  const onScriptFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setScriptImportError(null);
    readSelectedTextFile(
      e,
      latestScriptReadRef,
      (text, fileName) => {
        setScriptText(text);
        setScriptFileName(fileName);
        setGestureUndo(null);
        setScriptEditError(null);
      },
      setScriptImportError,
    );
  }, []);

  const onSubtitleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSubtitleImportError(null);
    readSelectedTextFile(
      e,
      latestSubtitleReadRef,
      (text, fileName) => {
        setSubtitleText(text);
        setSubtitleFileName(fileName);
      },
      setSubtitleImportError,
    );
  }, []);

  const cancelPendingNarration = useCallback(() => {
    const pending = pendingNarrationRef.current;
    pendingNarrationRef.current = null;
    if (!pending) return;
    // Nulling the ref is the whole cancel: both probe handlers open with an
    // identity guard against it, so a late fire is already a no-op.
    URL.revokeObjectURL(pending.url);
  }, []);

  const onNarrationFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = takeSelectedFile(e);
      if (!file) return;
      cancelPendingNarration();
      const url = URL.createObjectURL(file);
      // Probe metadata off-DOM so a broken file never becomes the live track.
      // Only the latest selection may commit: a slow earlier probe must not
      // overwrite a newer file or resurrect audio after Remove.
      const probe = new Audio();
      const pending = { url, probe };
      pendingNarrationRef.current = pending;
      probe.preload = 'metadata';
      probe.src = url;
      probe.onloadedmetadata = () => {
        if (pendingNarrationRef.current !== pending) return;
        pendingNarrationRef.current = null;
        const audioDuration = Number.isFinite(probe.duration)
          ? Math.min(probe.duration, MAX_SAFE_PLAYBACK_SECONDS)
          : 0;
        setNarrationError(null);
        setNarration({ url, name: file.name, duration: audioDuration });
      };
      probe.onerror = () => {
        if (pendingNarrationRef.current !== pending) return;
        pendingNarrationRef.current = null;
        URL.revokeObjectURL(url);
        setNarrationError(`Could not decode audio file: "${file.name}"`);
      };
    },
    [cancelPendingNarration],
  );

  const clearNarration = useCallback(() => {
    cancelPendingNarration();
    setNarrationError(null);
    setNarration(null);
  }, [cancelPendingNarration]);

  // State owns the live URL: replacing or removing a track cleans up the
  // previous one, and unmounting cleans up the current one.
  useEffect(() => () => {
    if (narration) URL.revokeObjectURL(narration.url);
  }, [narration]);

  useEffect(() => cancelPendingNarration, [cancelPendingNarration]);

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

  // snapshots[0] is the initial state; snapshots[i + 1] is the state after
  // events[i]. World derivation is pure and independently regression-tested;
  // React only selects the snapshot for the current playback clock.
  const { snapshots, scriptErrors, moveStates, rejectedEventIndexes } = useMemo(
    () => buildWorld(events, initialSetup),
    [events, initialSetup],
  );

  const reachedEventIndex = lastEventIndexAt(events, time);

  // snapshots[i + 1] is the state AFTER events[i], so the reached index maps
  // straight to a snapshot slot. Board owns timed overlay visibility; passing
  // the stable snapshot arrays avoids filtering and rebuilding them at 60Hz.
  const world = snapshots[reachedEventIndex + 1];

  // Full-script errors are returned once beside the board snapshots. Keeping
  // a growing copy on every snapshot made an all-error script retain O(N²)
  // references even though no playhead-scoped consumer remained.
  const errorLines = useMemo(
    () => new Set(scriptErrors.map((er) => er.line)),
    [scriptErrors],
  );

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
      for (const m of legalMovesFor(world.chessState)) {
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
      const candidates = legalMovesFor(world.chessState).filter(
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
      const plan = planMoveGesture(
        events,
        scriptText,
        time,
        san,
        matchesScripted,
        rejectedEventIndexes,
      );
      if (plan.kind === 'seek') {
        setScriptEditError(null);
        seekEvent(plan.t);
      } else {
        applyEditPlan(plan);
      }
    },
    [
      world.chessState,
      events,
      time,
      scriptText,
      seekEvent,
      gestureIsStale,
      applyEditPlan,
      rejectedEventIndexes,
    ],
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
    (line: number, t: number) => {
      const edit = setLineTime(scriptText, line, t);
      commitScriptEdit(edit.text);
      return edit.line;
    },
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
    if (timeRef.current >= duration) {
      setTime(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  }, [duration]);

  const enterPresent = useCallback(() => setPresent(true), []);
  const exitPresent = useCallback(() => setPresent(false), []);
  const togglePresentPgn = useCallback(
    () => setPresentPgn((v) => (v === '1' ? '0' : '1')),
    [setPresentPgn],
  );

  // Present-mode chrome auto-hide: fade the floating transport and cursor
  // after the pointer is idle during playback; pointer movement or contact
  // brings them back. Re-arms on play/pause so pausing always reveals the
  // chrome. The pointer handler fires at sample rate during a recording, so it
  // dispatches only on a real reveal — the board is already re-rendering every
  // frame, and a redundant setState here would schedule a second pass on top.
  const chromeHiddenRef = useLatest(chromeHidden);
  useEffect(() => {
    if (!present) {
      setChromeHidden(false);
      return;
    }
    let timer = 0;
    const arm = () => {
      if (chromeHiddenRef.current) setChromeHidden(false);
      window.clearTimeout(timer);
      if (playing) timer = window.setTimeout(() => setChromeHidden(true), PRESENT_IDLE_MS);
    };
    arm();
    window.addEventListener('pointermove', arm, { passive: true });
    // Touchscreens do not promise a pointermove for a stationary tap. Listen
    // on the window so a tap can reveal controls even while the hidden bar is
    // deliberately pointer-inert.
    window.addEventListener('pointerdown', arm, { passive: true });
    window.addEventListener('focusin', arm);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', arm);
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('focusin', arm);
    };
  }, [present, playing, chromeHiddenRef]);

  // The one transport keymap (Space toggle, ←/→ ±1s), shared by the global
  // shortcut listener and the scrub input's handler so the two can't drift
  // from each other or from the footer's documentation. Returns whether the
  // key was a transport key; preventDefault policy stays with each caller.
  const handleTransportKey = useCallback(
    (e: { code: string; repeat: boolean }): boolean => {
      if (e.code === 'Space') {
        if (!e.repeat) pauseToggle();
        return true;
      }
      if (e.code === 'ArrowLeft') {
        setTime((t) => Math.max(0, t - 1));
        return true;
      }
      if (e.code === 'ArrowRight') {
        setTime((t) => Math.min(duration, t + 1));
        return true;
      }
      return false;
    },
    [pauseToggle, duration],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Escape leaves present mode from anywhere — the chrome that would host
      // an Exit button may be faded out, so the key must always work. Not
      // guarded on `present`: leaving it out of the deps keeps this listener
      // from re-subscribing on every toggle, and exiting when already out is
      // a no-op.
      if (e.key === 'Escape') {
        setPresent(false);
        return;
      }
      if (isInteractiveShortcutTarget(e.target)) return;
      // Space scrolls the page by default; the arrows keep their native
      // scroll behavior at window level.
      if (e.code === 'Space') e.preventDefault();
      handleTransportKey(e);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleTransportKey]);

  const ticks = useMemo(() => timelineTicks(duration), [duration]);

  const activeSubtitle = getActiveSubtitle(subtitleCues, time);
  const activeSubtitleText = useMemo(
    () => activeSubtitle ? formatSubtitleText(activeSubtitle.text) : '',
    [activeSubtitle],
  );

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
    if (tab !== 'script' || scriptView !== 'moves') followPausedRef.current = false;
  }, [tab, scriptView]);

  useEffect(() => {
    if (!playing || followPausedRef.current) return;
    // Null in present mode, where the panel is unmounted — no mode flag needed.
    const list = editListRef.current;
    if (!list) return;
    if (reachedEventIndex < 0) {
      list.scrollTop = 0;
      return;
    }
    // The PGN list nests event elements, so the reached event is located by
    // its data-evi attribute (shared helper); playback/hover gating is above.
    scrollEviIntoView(list, reachedEventIndex);
  }, [reachedEventIndex, playing, tab, scriptView]);

  const playState = playStateAt(playing, time, duration);
  const playLabel = PLAY_LABELS[playState];
  const currentTimeText = fmtTime(time, 'always');
  const durationText = fmtTime(duration, 'always');
  const timeRangeText = `${currentTimeText} of ${durationText}`;

  // One roving tab stop for the whole pin row (toolbar pattern): a script's
  // dozens of pins must not each cost keyboard users a Tab press between the
  // transport and the speed selector. Arrows walk pins; Tab leaves the row.
  const pinsRef = useRef<HTMLDivElement | null>(null);
  const pinsRoving = useRovingTabIndex(pinsRef, '.marker');

  // Event pins depend only on the parsed script, not the clock — memoized so
  // 60Hz frames reuse the element and React bails out of the subtree. Error
  // lines pin too (vermillion pennants): a broken line is a timeline fact
  // the author must be able to see and seek without scrubbing onto it.
  const timelinePins = useMemo(
    () => (
      <div
        className="timeline-pins"
        role="toolbar"
        aria-orientation="horizontal"
        aria-label="Event markers"
        ref={pinsRef}
        onKeyDown={pinsRoving.onKeyDown}
        onFocus={pinsRoving.onFocus}
      >
        {events.map((e, i) => {
          // Parse errors are error events; runtime errors (illegal SAN, bad
          // FEN) stay move/fen events whose line the snapshot builder
          // rejected. Both pin as vermillion pennants.
          const kind = 'error' in e || errorLines.has(e.line) ? 'err' : e.kind;
          const isErr = kind === 'err';
          return (
            <button
              type="button"
              key={i}
              className="marker"
              data-kind={kind}
              title={isErr ? `L${e.line} ${e.raw} — script error` : e.raw}
              aria-label={
                isErr
                  ? `Seek to ${fmtTime(e.t, 'auto')}: script error, line ${e.line}: ${e.raw}`
                  : `Seek to ${fmtTime(e.t, 'auto')}: ${e.raw}`
              }
              onClick={() => seekEvent(e.t)}
              style={{
                left: `${(e.t / duration) * 100}%`,
                color: markerColors[kind],
              }}
            />
          );
        })}
      </div>
    ),
    [events, errorLines, duration, seekEvent, pinsRoving],
  );

  // Rendered at the bottom of whichever panel page is open: an error anywhere
  // (FEN, script, subtitles, narration) must stay visible on both pages.
  const errorsBlock = useMemo(() => (initialSetup.error ||
    narrationError ||
    scriptImportError ||
    subtitleImportError ||
    scriptEditError ||
    scriptErrors.length > 0 ||
    subtitleResult.errors.length > 0) && (
    // role="status" (implicitly polite): errors persist and update as the
    // user types — an assertive alert would interrupt every edit.
    <div className="errors" role="status">
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
      {scriptImportError && (
        <div className="err-row">
          <span className="err-line">SCRIPT</span>
          <span id={scriptImportErrorId}>{scriptImportError}</span>
        </div>
      )}
      {subtitleImportError && (
        <div className="err-row">
          <span className="err-line">SRT</span>
          <span id={subtitleImportErrorId}>{subtitleImportError}</span>
        </div>
      )}
      {scriptErrors.map((er, i) => (
        <div key={i} className="err-row">
          <span className="err-line">L{er.line}</span>
          <span>{er.error}</span>
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
    scriptImportError,
    subtitleImportError,
    scriptEditError,
    scriptErrors,
    subtitleResult.errors,
    fenErrorId,
    narrationErrorId,
    scriptImportErrorId,
    subtitleImportErrorId,
  ]);

  return (
    <div
      className={[
        'app',
        present && 'app--present',
        present && presentPgn && 'app--present-pgn',
        present && chromeHidden && 'app--idle',
      ]
        .filter(Boolean)
        .join(' ')}
    >
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
        <button
          type="button"
          className="present-btn"
          onClick={enterPresent}
          aria-label="Enter present mode"
        >
          Present
        </button>
      </header>

      <main className="main">
        <div className="board-col">
          <Board
            positions={world.positions}
            lastMove={world.lastMove}
            highlights={world.highlights}
            arrows={world.arrows}
            captureFlash={world.lastCapture}
            check={world.check}
            mind={world.mind}
            revealedAt={world.revealedAt}
            time={time}
            interactive={tab === 'script' && !present}
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
            <p>{activeSubtitleText}</p>
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
              aria-label={timeRangeText}
            >
              <span className="t-now">{currentTimeText}</span>
              <span className="t-sep" aria-hidden="true">/</span>
              <span className="t-tot">{durationText}</span>
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
                onKeyDown={(e) => {
                  // Every mouse scrub parks focus here, and the global
                  // shortcuts ignore focused inputs — so the transport keymap
                  // is mirrored, with the range's native 0.01-step arrow
                  // handling suppressed on handled keys.
                  if (handleTransportKey(e)) e.preventDefault();
                }}
                className="scrub-input"
                aria-label="Timeline position"
                aria-valuetext={timeRangeText}
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

            {/* Present-only controls: they ride the floating transport, so
               they auto-hide with the rest of the chrome during recording. */}
            {present && (
              <div className="present-controls">
                <button
                  type="button"
                  className="present-toggle"
                  aria-pressed={presentPgn}
                  onClick={togglePresentPgn}
                  aria-label="Toggle move list"
                >
                  PGN
                </button>
                <button
                  type="button"
                  className="exit-present-btn"
                  onClick={exitPresent}
                  aria-label="Exit present mode (Escape)"
                >
                  Exit
                </button>
              </div>
            )}
          </div>
        </div>

        {present && presentPgn && (
          <PresentationMoves
            events={events}
            states={moveStates}
            reachedEventIndex={reachedEventIndex}
            rejectedEventIndexes={rejectedEventIndexes}
          />
        )}

        {/* Unmounted rather than hidden in present mode: display:none would
           keep the whole editor — including MoveList, which rebuilds at every
           event crossing — reconciling on the 60Hz recording path for a panel
           nobody can see. Nothing is lost; script, subtitles, FEN and the file
           names are all App state. */}
        {!present && (
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
                          aria-pressed={scriptView === 'moves'}
                          onClick={() => setScriptView('moves')}
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
                        describedBy={scriptImportError ? scriptImportErrorId : undefined}
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
                {scriptView === 'moves' ? (
                  <MoveList
                    events={events}
                    states={moveStates}
                    reachedEventIndex={reachedEventIndex}
                    errorLines={errorLines}
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
                      setScriptImportError(null);
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
                        describedBy={subtitleImportError ? subtitleImportErrorId : undefined}
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
                      setSubtitleImportError(null);
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
        )}
      </main>

      {!present && (
        <footer className="footer">
          <span>Space play/pause · ←/→ ±1s · Click event or marker to seek</span>
          <span>
            {' · Pieces: '}
            <a
              href="https://github.com/lichess-org/lila/tree/master/public/piece/staunty"
              target="_blank"
              rel="noreferrer"
            >
              Staunty by sadsnake1
            </a>
            {' · '}
            <a href="/licenses/LICENSE-pieces.txt">CC BY-NC-SA 4.0</a>
          </span>
        </footer>
      )}
    </div>
  );
}
