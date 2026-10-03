// Main app: orchestrates state from a script, drives playback,
// renders the board, the timeline scrubber, and the editor panel.

import { useState, useEffect, useRef, useMemo, useCallback, type CSSProperties } from 'react';
import { Board } from './components/Board';
import { BOARD_EXPORT_SIZE } from './lib/boardExport';
import type { BoardOrientation } from './lib/boardOrientation';
import * as Chess from './lib/chess';
import { DEFAULT_SCRIPT, DEFAULT_SUBTITLES } from './lib/defaults';
import { moveSoundEnabled, moveSoundKey, useMoveSound } from './lib/moveSound';
import { formatSubtitleText, getActiveSubtitle, getSubtitleEnd, parseSrt } from './lib/subtitles';
import { TEXT_ENTRY_SELECTOR } from './components/InsertMenu';
import { AskCard } from './components/AskCard';
import { PresentationMoves } from './components/PresentationMoves';
import { SidePanel, type PanelTab } from './components/SidePanel';
import { useBoardExport, type BoardExportState } from './components/useBoardExport';
import { useNarration } from './components/useNarration';
import {
  planLineInsert,
  planMoveGesture,
  removeLines,
  setLineTime,
  type ScriptEditPlan,
} from './lib/scriptEdit';
import {
  activeAskAt,
  fmtTime,
  lastEventIndexAt,
  parseScript,
} from './lib/timeline';
import { markerColors, markerForms, markerKindFor } from './lib/tokens';
import { useLatest } from './components/useLatest';
import { useRovingTabIndex } from './components/useRovingTabIndex';
import { buildWorld, setupFromFen, worldFrameAt } from './lib/world';
import { landBetween, playbackDuration, timelineTicks } from './lib/playback';


const EXPORT_LABELS: Record<BoardExportState['status'], string> = {
  idle: 'Export PNG',
  exporting: 'Exporting…',
  success: 'Saved',
  error: 'Retry PNG',
};
const EXPORT_GLYPHS: Record<BoardExportState['status'], string> = {
  idle: 'PNG',
  exporting: '…',
  success: '✓',
  error: '!',
};

type PlayState = 'play' | 'pause' | 'replay';

// Transport glyphs live at module scope: `App` re-renders every playback frame,
// and a stable element identity lets React bail out of the subtree.
const PLAY_GLYPHS: Record<PlayState, React.ReactElement> = {
  pause: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
    </svg>
  ),
  replay: (
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
  ),
  play: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M7 5 L19 12 L7 19 Z" fill="currentColor" />
    </svg>
  ),
};

const REWIND_GLYPH = (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      d="M5 5 v14 M19 5 L8 12 L19 19 Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

const SPEEDS = [0.5, 1, 2, 4];

const PLAY_LABELS: Record<PlayState, string> = {
  play: 'Play',
  pause: 'Pause',
  replay: 'Restart playback',
};

const DRAFT_KEYS = {
  script: 'gambit:draft:script',
  subtitles: 'gambit:draft:subtitles',
  fen: 'gambit:draft:start-fen',
  orientation: 'gambit:draft:board-orientation',
  scriptView: 'gambit:draft:script-view',
  presentPgn: 'gambit:draft:present-pgn',
  moveSound: 'gambit:draft:move-sound',
} as const;

// Idle timeout before present-mode chrome (floating transport + cursor) fades
// out during playback, video-player style.
const PRESENT_IDLE_MS = 2000;

const SCRIPT_CHANGED_DURING_GESTURE_ERROR =
  'Cannot record this gesture because the script changed while the pointer was held. Try again from the updated position.';
const MAX_TEXT_IMPORT_BYTES = 1_000_000;

function saveDraft(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Local persistence is best-effort; playback must keep working if storage is unavailable.
  }
}

function useDraftText(key: string, fallback: string) {
  const [value, setValue] = useState(() => {
    try {
      return window.localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  });
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

export default function App() {
  const [scriptText, setScriptText] = useDraftText(DRAFT_KEYS.script, DEFAULT_SCRIPT);
  const [scriptFileName, setScriptFileName] = useState<string | null>(null);
  const [subtitleText, setSubtitleText] = useDraftText(DRAFT_KEYS.subtitles, DEFAULT_SUBTITLES);
  const [subtitleFileName, setSubtitleFileName] = useState<string | null>(null);
  const [fenText, setFenText] = useDraftText(DRAFT_KEYS.fen, Chess.STARTING_FEN);
  const [orientationRaw, setOrientation] = useDraftText(DRAFT_KEYS.orientation, 'white');
  const orientation: BoardOrientation = orientationRaw === 'black' ? 'black' : 'white';
  const events = useMemo(() => parseScript(scriptText), [scriptText]);
  // The questions alone, still time-sorted: the live-card lookup per frame is
  // a binary search over these rather than a backward walk over every event.
  const asks = useMemo(() => events.filter((e) => e.kind === 'ask'), [events]);
  const subtitleResult = useMemo(() => parseSrt(subtitleText), [subtitleText]);
  const subtitleCues = subtitleResult.cues;
  const initialSetup = useMemo(() => setupFromFen(fenText), [fenText]);
  const worldBuild = useMemo(
    () => buildWorld(events, initialSetup),
    [events, initialSetup],
  );

  const [time, setTime] = useState(0);
  // Paused on load: playback is a deliberate act — the transport, space, or a
  // seek starts it.
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  // Side panel: the script editor is the primary surface; setup (start FEN,
  // subtitles, narration audio) lives on its own quieter page.
  const [tab, setTab] = useState<PanelTab>('script');
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
  // The piece click's on/off, persisted like the other transport preferences.
  // Default ON, and `moveSoundEnabled` — not `=== '1'` — is what makes the
  // default survive a junk draft rather than reading as muted.
  const [moveSoundRaw, setMoveSoundDraft] = useDraftText(DRAFT_KEYS.moveSound, '1');
  const moveSoundOn = moveSoundEnabled(moveSoundRaw);
  // Chrome (floating transport + cursor) fades out while present + playing +
  // pointer idle; pointer movement or contact brings it back.
  const [chromeHidden, setChromeHidden] = useState(false);
  const chromeHiddenRef = useLatest(chromeHidden);
  const scriptTextRef = useLatest(scriptText);
  // The pause-landing rule must follow the transport state at release, not
  // the pointer-down snapshot: playback can flip mid-drag (Space, auto-pause
  // at the end), and landing by the captured value would park a paused board
  // exactly on the event's timestamp — the age-0 invisibility pitfall.
  const playingRef = useLatest(playing);
  // pauseToggle reads the clock only for its at-end restart branch; a `time`
  // dep would re-identify it (and the window keydown listener) every frame.
  // The board export reads it after its awaits, when a closed-over `time` is
  // stale.
  const timeRef = useLatest(time);
  // Pre-insert script snapshot for one-step undo of the last board gesture or
  // structured edit. Hand edits clear it so undo never reverts typing.
  const [gestureUndo, setGestureUndo] = useState<string | null>(null);
  const [errorsExpanded, setErrorsExpanded] = useState(false);
  const [scriptEditError, setScriptEditError] = useState<string | null>(null);
  const [scriptImportError, setScriptImportError] = useState<string | null>(null);
  const [subtitleImportError, setSubtitleImportError] = useState<string | null>(null);

  const boardRef = useRef<HTMLDivElement | null>(null);
  // While the export lock is held, every surface that could change the
  // committed board stands still (see useBoardExport).
  const {
    state: boardExport,
    lockRef: exportLockRef,
    waitIdle: waitForBoardExport,
    exportBoard,
  } = useBoardExport({ boardRef, timeRef, playingRef, setPlaying });
  const boardExportError = boardExport.status === 'error' ? boardExport.message : null;
  const exporting = boardExport.status === 'exporting';

  const narrationTrack = useNarration({
    time,
    playing,
    speed,
    lockRef: exportLockRef,
    waitForUnlock: waitForBoardExport,
  });
  const { narration } = narrationTrack;

  const duration = useMemo(() => {
    return playbackDuration(
      worldBuild.visualEndTime,
      getSubtitleEnd(subtitleCues),
      // Like subtitles, narration that outlasts the chess script extends
      // playback so the tail of the recording stays audible.
      narration?.duration,
    );
  }, [worldBuild.visualEndTime, subtitleCues, narration]);

  useEffect(() => {
    if (exportLockRef.current) return;
    setTime((t) => Math.min(t, duration));
  }, [duration, exporting, exportLockRef]);

  const latestScriptReadRef = useRef(0);
  const latestSubtitleReadRef = useRef(0);

  // The one way the script text is replaced: four pieces move with it, or the
  // next surface to replace it gets the subset wrong — the text, the
  // imported-file name it no longer comes from, the one-step gesture-undo
  // snapshot, and any edit error raised against the text now gone. The import
  // error is not among them: it names a file that never loaded.
  const applyScript = useCallback(
    (text: string, opts?: { fileName?: string | null; undo?: string | null }) => {
      if (exportLockRef.current) return;
      latestScriptReadRef.current++;
      setScriptText(text);
      setScriptFileName(opts?.fileName ?? null);
      // Callers that pass no snapshot drop the old one: undoing past a hand
      // edit or a fresh import would silently revert the user's own text.
      setGestureUndo(opts?.undo ?? null);
      setScriptEditError(null);
    },
    [setScriptText, exportLockRef],
  );

  // A hand edit in the Text view. Typing is also what dismisses the script
  // import error, mirroring the subtitle textarea.
  const onScriptTextEdit = useCallback(
    (text: string) => {
      applyScript(text);
      setScriptImportError(null);
    },
    [applyScript],
  );

  const applySubtitles = useCallback(
    (text: string, fileName: string | null = null) => {
      if (exportLockRef.current) return;
      latestSubtitleReadRef.current++;
      setSubtitleText(text);
      setSubtitleFileName(fileName);
      setSubtitleImportError(null);
    },
    [setSubtitleText, exportLockRef],
  );

  // Shared intake for the script and subtitle imports. Only the newest pick
  // may commit, and only once any PNG capture has finished.
  const importTextFile = useCallback(
    (
      file: File,
      latestRead: { current: number },
      onRead: (text: string, fileName: string) => void,
      setError: (message: string | null) => void,
    ) => {
      if (exportLockRef.current) return;
      setError(null);
      const request = ++latestRead.current;
      if (file.size > MAX_TEXT_IMPORT_BYTES) {
        setError(`Could not import "${file.name}": text files are limited to 1 MB.`);
        return;
      }
      file.text().then(
        async (text) => {
          await waitForBoardExport();
          if (latestRead.current === request) onRead(text, file.name);
        },
        () => {
          if (latestRead.current === request) setError(`Could not read "${file.name}".`);
        },
      );
    },
    [waitForBoardExport, exportLockRef],
  );

  const onImportScript = useCallback(
    (file: File) => importTextFile(
      file,
      latestScriptReadRef,
      (text, fileName) => applyScript(text, { fileName }),
      setScriptImportError,
    ),
    [importTextFile, applyScript],
  );

  const onImportSubtitles = useCallback(
    (file: File) => importTextFile(file, latestSubtitleReadRef, applySubtitles, setSubtitleImportError),
    [importTextFile, applySubtitles],
  );

  const onFenText = useCallback(
    (text: string) => { if (!exportLockRef.current) setFenText(text); },
    [setFenText, exportLockRef],
  );

  const onOrientation = useCallback(
    (next: BoardOrientation) => { if (!exportLockRef.current) setOrientation(next); },
    [setOrientation, exportLockRef],
  );

  const lastTickRef = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) {
      lastTickRef.current = null;
      return;
    }
    function tick(now: number) {
      if (exportLockRef.current) return;
      if (lastTickRef.current == null) lastTickRef.current = now;
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      setTime((t) => Math.min(duration, t + dt * speed));
      raf = requestAnimationFrame(tick);
    }
    let raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, duration, exportLockRef]);

  // Playback stops at the end. Read from committed state rather than from
  // inside the tick's `setTime` updater: updaters must stay pure (StrictMode
  // runs them twice, and React may run them later than the tick), so a
  // `setPlaying` there fires on React's schedule, not the clock's.
  useEffect(() => {
    if (playing && time >= duration) setPlaying(false);
  }, [playing, time, duration]);

  const { scriptErrors, snapshots, rejectedEventIndexes } = worldBuild;

  const reachedEventIndex = lastEventIndexAt(events, time);

  // Most events select their stable authored snapshot. A successful `rp`
  // selects one of its half-second mainline frames from the same playback
  // clock; Present follows the source move without duplicating PGN rows.
  const worldFrame = worldFrameAt(worldBuild, reachedEventIndex, time);
  const world = worldFrame.snapshot;
  const presentationEventIndex =
    worldFrame.replaySourceEventIndex ?? reachedEventIndex;

  // The piece click reads the frame the board draws, not the event behind it,
  // so every landing sounds through one rule; present mode keeps it, and muting
  // gates the call (no `play()` at all) rather than the volume.
  useMoveSound(moveSoundKey(world.lastMove), moveSoundOn);

  // Full-script errors are returned once beside the board snapshots. Keeping
  // a growing copy on every snapshot made an all-error script retain O(N²)
  // references even though no playhead-scoped consumer remained.
  const errorLines = useMemo(
    () => new Set(scriptErrors.map((er) => er.line)),
    [scriptErrors],
  );

  // Event-anchored seek: while playing, land on t and let it animate; while
  // paused, land just past it so the click shows what it named — and never
  // shows more (the landing stays clamped before the next event). The boundary
  // is looked up from the current events; for freshly written lines the events
  // array is stale, so those callers pass the boundary they just placed to
  // landBetween directly.
  const seekEvent = useCallback(
    (t: number) => {
      if (exportLockRef.current) return;
      setTime(
        playingRef.current ? t : landBetween(t, events[lastEventIndexAt(events, t) + 1]?.t),
      );
    },
    [events],
  );

  // One commit contract for every programmatic script edit (gestures and
  // structured edits): apply, keeping the prior text as the one-step undo.
  // All it adds to `applyScript` is the landing — while paused, `landT` moves
  // the playhead just past what the edit wrote so the board shows its settled
  // result, and nothing more.
  const commitScriptEdit = useCallback(
    (next: string, landT?: number) => {
      if (exportLockRef.current) return;
      applyScript(next, { undo: scriptText });
      if (landT != null && !playingRef.current) setTime(landT);
    },
    [scriptText, applyScript],
  );

  // Both gestures reject the same way: the script text changed between
  // pointer-down and pointer-up (hand edit, undo), so any plan would be built
  // against text the gesture never previewed. Leaves the script untouched.
  const gestureIsStale = (): boolean => {
    if (exportLockRef.current) return true;
    if (scriptTextRef.current === scriptText) return false;
    setScriptEditError(SCRIPT_CHANGED_DURING_GESTURE_ERROR);
    return true;
  };

  // The one way a planner's edit reaches React: surface a conflict, or commit
  // the new text and land the paused playhead between the line it wrote and
  // whatever follows.
  const applyEditPlan = (plan: ScriptEditPlan) => {
    if (plan.kind === 'conflict') setScriptEditError(plan.error);
    else commitScriptEdit(plan.text, landBetween(plan.t, plan.nextT));
  };

  // Board gestures (Script tab only): each gesture becomes one script line
  // stamped at the playhead — stamping policy lives in planLineInsert.
  const recordGestureLine = (body: string) => {
    if (gestureIsStale()) return;
    applyEditPlan(planLineInsert(events, scriptText, time, body));
  };

  // The insert menu's handle on the gesture commit path: stable, so the
  // memoized side panel can skip clock frames, while the call still reads the
  // playhead and script current at click time.
  const recordGestureLineRef = useLatest(recordGestureLine);
  const onInsert = useCallback(
    (body: string) => recordGestureLineRef.current(body),
    [recordGestureLineRef],
  );

  // A press that can't start a move says why, in the EDIT row the planners
  // already write to, so gesture feedback has one home.
  const onMoveRejected = (from: string) => {
    const reason = Chess.explainNoMoves(world.chessState, from);
    if (!reason) return;
    setScriptEditError(`Can't move from ${from} at ${fmtTime(time, 'always')}: ${reason}.`);
  };

  // Move gestures: chess resolution happens here against the current position;
  // the branch-aware policy is planMoveGesture's (scriptEdit.ts). The plan is
  // either a seek or new text plus landing boundaries; committing stays here.
  const onMoveGesture = (from: string, to: string) => {
    if (gestureIsStale()) return;
    const candidates = Chess.movesBetween(world.chessState, from, to);
    // Promotion records a queen; underpromotion stays a hand edit.
    const mv = candidates.find((m) => !m.promotion || m.promotion === 'q');
    if (!mv) return;
    const san = Chess.sanForMove(world.chessState, mv);
    const matchesScripted = (scriptedSan: string) => {
      const scripted = Chess.parseSAN(scriptedSan, world.chessState);
      return !!scripted && Chess.sameMoveSquares(scripted, mv);
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
  };

  // Structured edits from the PGN script view. Free-form times by design:
  // the script re-sorts (and the line relocates) when an edit crosses other
  // events, and any structural damage surfaces as visible errors — same
  // snapshot-undo safety net as the gestures.
  const onRetimeEvent = useCallback(
    (line: number, t: number) => {
      if (exportLockRef.current) return null;
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

  const pauseToggle = useCallback(() => {
    if (exportLockRef.current) return;
    if (timeRef.current >= duration) {
      setTime(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  }, [duration]);

  // Shared by the header and present-mode buttons: the whole accessibility
  // contract (announced size, disabled-while-exporting, error in the tooltip).
  // The size comes from BOARD_EXPORT_SIZE so it cannot outlive the output.
  const exportButtonProps = {
    type: 'button' as const,
    onClick: exportBoard,
    disabled: exporting,
    'aria-label': `Export current board as a ${BOARD_EXPORT_SIZE} by ${BOARD_EXPORT_SIZE} PNG`,
    title: boardExportError ?? 'Export current board as PNG',
  };

  useEffect(() => () => {
    latestScriptReadRef.current++;
    latestSubtitleReadRef.current++;
  }, []);

  // Present-mode chrome auto-hide: fade the floating transport and cursor
  // after the pointer is idle during playback; pointer movement or contact
  // brings them back. Re-arms on play/pause so pausing always reveals the
  // chrome. The pointer handler fires at sample rate during a recording, so it
  // only sets state when the chrome is actually hidden: useState's eager
  // bail-out rarely applies while `setTime` updates App every frame, and each
  // miss is a full extra App render pass.
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
  }, [present, playing]);

  // The one transport keymap (Space toggle, ←/→ ±1s), shared by the global
  // shortcut listener and the scrub input's handler so the two can't drift
  // from each other or from the footer's documentation. Returns whether the
  // key was a transport key; preventDefault policy stays with each caller.
  const handleTransportKey = useCallback(
    (e: { code: string; repeat: boolean }): boolean => {
      if (exportLockRef.current) return false;
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
      if (exportLockRef.current) return;
      // Escape leaves present mode from anywhere — the chrome that would host
      // an Exit button may be faded out, so the key must always work. Not
      // guarded on `present`: leaving it out of the deps keeps this listener
      // from re-subscribing on every toggle, and exiting when already out is
      // a no-op.
      if (e.key === 'Escape') {
        setPresent(false);
        return;
      }
      // Transport keys stay off every text entry and interactive control:
      // Space would re-trigger a focused button. (`/` is InsertMenu's own.)
      if (
        e.target instanceof HTMLElement &&
        e.target.closest(
          `${TEXT_ENTRY_SELECTOR}, button, select, [role="button"], [role="tab"]`,
        )
      ) return;
      // Space scrolls the page by default; the arrows keep their native
      // scroll behavior at window level.
      if (e.code === 'Space') e.preventDefault();
      handleTransportKey(e);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleTransportKey]);


  const activeSubtitle = getActiveSubtitle(subtitleCues, time);
  const activeSubtitleText = activeSubtitle ? formatSubtitleText(activeSubtitle.text) : '';
  // A question card takes the subtitle track while its countdown runs; an
  // overlapping cue yields, since the card is written for narration's silence.
  const activeAsk = activeAskAt(asks, time);

  // The ruler's ticks depend only on the duration; memoized like
  // `timelinePins` so per-frame renders of `.controls` reuse the row.
  const tickRow = useMemo(
    () => (
      <div className="timeline-ticks" aria-hidden="true">
        {timelineTicks(duration).map((t) => (
          <span key={t} className="timeline-tick" style={{ left: `${(t / duration) * 100}%` }}>
            {fmtTime(t)}
          </span>
        ))}
      </div>
    ),
    [duration],
  );
  // Rate and SFX ride one wrapper: the transport grid gives each child one
  // named cell and every tier redraws the map, so a second bare child would
  // auto-place into whatever cell a tier left free. Memoized because neither
  // depends on the clock.
  const transportPrefs = useMemo(
    () => (
      <div className="transport-prefs">
        <div className="speed-group" role="group" aria-label="Playback speed">
          {SPEEDS.map((s) => (
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
        <button
          type="button"
          className="mute-btn"
          aria-pressed={moveSoundOn}
          aria-label="Move SFX"
          onClick={() => setMoveSoundDraft((v) => (moveSoundEnabled(v) ? '0' : '1'))}
        >
          SFX
        </button>
      </div>
    ),
    [speed, moveSoundOn, setMoveSoundDraft],
  );

  const playState: PlayState = playing ? 'pause' : time >= duration ? 'replay' : 'play';
  const playLabel = PLAY_LABELS[playState];
  const currentTimeText = fmtTime(time, 'always');
  const durationText = fmtTime(duration, 'always');
  const timeRangeText = `${currentTimeText} of ${durationText}`;

  // One roving tab stop for the whole pin row (toolbar pattern): a script's
  // dozens of pins must not each cost keyboard users a Tab press between the
  // transport and the speed selector. Arrows walk pins; Tab leaves the row.
  const pinsRoving = useRovingTabIndex<HTMLDivElement>('.marker');

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
        ref={pinsRoving.ref}
        onKeyDown={pinsRoving.onKeyDown}
        onFocus={pinsRoving.onFocus}
      >
        {events.map((e, i) => {
          // Parse errors are error events; runtime errors (illegal SAN, bad
          // FEN) stay move/fen events whose line the snapshot builder
          // rejected. Both pin as vermillion pennants.
          const kind = 'error' in e ? 'err' : markerKindFor(e.kind, e.line, errorLines);
          const isErr = kind === 'err';
          return (
            <button
              type="button"
              key={i}
              className="marker"
              data-form={markerForms[kind]}
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

  return (
    <div
      className={`app${present ? ' app--present' : ''}${
        present && presentPgn ? ' app--present-pgn' : ''
      }${present && chromeHidden ? ' app--idle' : ''}`}
      aria-busy={exporting || undefined}
    >
      {/* Narration track: invisible, driven entirely by the playback clock. */}
      {narration && <audio ref={narrationTrack.audioRef} src={narration.url} preload="auto" />}
      <div className="sr-only" role="status" aria-live="polite">
        {exporting && 'Exporting board PNG.'}
        {boardExport.status === 'success' && 'Board PNG downloaded.'}
        {boardExportError}
      </div>
      <header className="header" {...(exporting ? { inert: '' } : {})}>
        <div className="title-block">
          <div className="logo" aria-hidden="true">
            <img src="/gambit-mark.svg" alt="" />
          </div>
          <div>
            <h1 className="app-title">Gambit</h1>
            <div className="app-sub">Chess timeline renderer</div>
          </div>
        </div>
        <div className="header-actions">
          <button
            {...exportButtonProps}
            className="present-btn export-board-btn"
          >
            <span className="export-board-label-wide">
              {EXPORT_LABELS[boardExport.status]}
            </span>
            <span className="export-board-label-compact" aria-hidden="true">
              {EXPORT_GLYPHS[boardExport.status]}
            </span>
          </button>
          <button
            type="button"
            className="present-btn"
            onClick={() => setPresent(true)}
            aria-label="Enter present mode"
          >
            Present
          </button>
        </div>
      </header>

      <main className="main" {...(exporting ? { inert: '' } : {})}>
        <div className="board-col">
          <Board
            boardRef={boardRef}
            positions={world.positions}
            lastMove={world.lastMove}
            highlights={world.highlights}
            arrows={world.arrows}
            captureFlash={world.lastCapture}
            check={world.check}
            mind={world.mind}
            revealedAt={world.revealedAt}
            time={time}
            orientation={orientation}
            interactive={tab === 'script' && !present && worldFrame.replaySourceEventIndex === null && !exporting}
            chessState={world.chessState}
            onMoveRejected={onMoveRejected}
            onMoveGesture={onMoveGesture}
            onArrowGesture={(from, to) => recordGestureLine(`${from}->${to}`)}
            onHighlightGesture={(sq) => recordGestureLine(`hl ${sq}`)}
          />

          <div
            className={`subtitle-strip ${activeAsk ? 'is-ask' : activeSubtitle ? '' : 'is-empty'} ${
              // A script with questions needs the subtitle track even without an SRT.
              subtitleCues.length === 0 && asks.length === 0 ? 'no-track' : ''
            }`}
            // The card's amber arrives from `markerColors`, like every marker's.
            style={activeAsk ? ({ '--ask-ink': markerColors.ask } as CSSProperties) : undefined}
            aria-live="polite"
            aria-atomic="true"
          >
            {activeAsk ? <AskCard ask={activeAsk} time={time} /> : <p>{activeSubtitleText}</p>}
          </div>

          <div className="controls" role="group" aria-label="Playback controls">
            <button
              type="button"
              className="play-btn"
              onClick={pauseToggle}
              aria-label={`${playLabel} (space)`}
            >
              {PLAY_GLYPHS[playState]}
            </button>
            {/* Rewind preserves the play state (editor convention): while
               playing it replays from 0; while paused or at the end it returns
               to 0 paused. The gradient play button owns "replay from the
               end", so the two transport buttons never duplicate. */}
            <button
              type="button"
              className="ctrl-btn"
              onClick={() => { if (!exportLockRef.current) setTime(0); }}
              aria-label="Rewind to start"
            >
              {REWIND_GLYPH}
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
              {tickRow}
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
                onChange={(e) => {
                  if (!exportLockRef.current) setTime(parseFloat(e.target.value));
                }}
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

            {transportPrefs}

            {/* Present-only controls: they ride the floating transport, so
               they auto-hide with the rest of the chrome during recording. */}
            {present && (
              <div className="present-controls">
                <button
                  {...exportButtonProps}
                  className="present-toggle"
                >
                  {EXPORT_GLYPHS[boardExport.status]}
                </button>
                <button
                  type="button"
                  className="present-toggle"
                  aria-pressed={presentPgn}
                  onClick={() => setPresentPgn((v) => (v === '1' ? '0' : '1'))}
                  aria-label="Toggle move list"
                >
                  PGN
                </button>
                <button
                  type="button"
                  className="present-toggle"
                  onClick={() => setPresent(false)}
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
            snapshots={snapshots}
            reachedEventIndex={presentationEventIndex}
            rejectedEventIndexes={rejectedEventIndexes}
          />
        )}

        {/* Unmounted rather than hidden in present mode: display:none would
           keep the whole editor — including MoveList, which rebuilds at every
           event crossing — reconciling on the 60Hz recording path for a panel
           nobody can see. Nothing is lost; script, subtitles, FEN and the file
           names are all App state. */}
        {!present && (
          <SidePanel
            tab={tab}
            onTab={setTab}
            scriptView={scriptView}
            onScriptView={setScriptView}
            scriptText={scriptText}
            onScriptText={onScriptTextEdit}
            scriptFileName={scriptFileName}
            undoText={gestureUndo}
            onUndo={applyScript}
            onImportScript={onImportScript}
            events={events}
            snapshots={snapshots}
            reachedEventIndex={reachedEventIndex}
            errorLines={errorLines}
            playing={playing}
            onSeek={seekEvent}
            onRetime={onRetimeEvent}
            onDelete={onDeleteEvents}
            onInsert={onInsert}
            timeLabel={currentTimeText}
            fenText={fenText}
            onFenText={onFenText}
            orientation={orientation}
            onOrientation={onOrientation}
            subtitleText={subtitleText}
            onSubtitleText={applySubtitles}
            subtitleFileName={subtitleFileName}
            onImportSubtitles={onImportSubtitles}
            narration={narration}
            onImportNarration={narrationTrack.importFile}
            onClearNarration={narrationTrack.clear}
            fenError={initialSetup.error}
            narrationError={narrationTrack.error}
            boardExportError={boardExportError}
            scriptEditError={scriptEditError}
            scriptImportError={scriptImportError}
            subtitleImportError={subtitleImportError}
            scriptErrors={scriptErrors}
            subtitleErrors={subtitleResult.errors}
            errorsExpanded={errorsExpanded}
            onErrorsExpanded={setErrorsExpanded}
          />
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
            {' (modified)'}
            {' · '}
            <a href="/licenses/LICENSE-pieces.txt">CC BY-NC-SA 4.0</a>
          </span>
        </footer>
      )}
    </div>
  );
}
