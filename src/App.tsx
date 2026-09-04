// Main app: orchestrates state from a script, drives playback,
// renders the board, the timeline scrubber, and the editor panel.

import { useState, useEffect, useRef, useMemo, useCallback, useId } from 'react';
import { Board } from './components/Board';
import {
  BOARD_EXPORT_SIZE,
  BOARD_EXPORT_TIMEOUT_MESSAGE,
  BOARD_EXPORT_TIMEOUT_MS,
  downloadBoardPng,
  loadExporter,
  withTimeout,
} from './lib/boardExport';
import type { BoardOrientation } from './lib/boardOrientation';
import {
  clearNarration as clearStoredNarration,
  loadNarration,
  saveNarration,
} from './lib/narrationStore';
import * as Chess from './lib/chess';
import { DEFAULT_SCRIPT, DEFAULT_SUBTITLES } from './lib/defaults';
import { moveSoundEnabled, moveSoundKey, useMoveSound } from './lib/moveSound';
import { formatSubtitleText, getActiveSubtitle, getSubtitleEnd, parseSrt } from './lib/subtitles';
import { InsertMenu } from './components/InsertMenu';
import { MoveList } from './components/MoveList';
import { SYNTAX_HINT } from './components/SyntaxHint';
import { PresentationMoves } from './components/PresentationMoves';
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
import { markerColors, markerForms, markerKindFor } from './lib/tokens';
import { useLatest } from './components/useLatest';
import { useRovingTabIndex } from './components/useRovingTabIndex';
import { buildWorld, setupFromFen, worldFrameAt } from './lib/world';
import {
  landBetween,
  MAX_SAFE_PLAYBACK_SECONDS,
  playbackDuration,
  playStateAt,
  timelineTicks,
  type PlayState,
} from './lib/playback';

type NarrationTrack = { url: string; name: string; duration: number };
type BoardExportState = 'idle' | 'exporting' | 'success' | 'error';
// Just the surfaces where a printable character means "type this character".
// Narrower than isInteractiveShortcutTarget on purpose: see the `/` branch in
// the window keydown listener.
function isTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(
    target.closest('input, textarea, [contenteditable="true"]'),
  );
}

// The wider set is built on the narrower one rather than restating it: every
// text-entry surface is also an interactive one, and spelling the three
// selectors twice meant a fourth (a `[role="textbox"]`) had to be remembered in
// both places, after which `/` and Space would disagree about what counts as
// typing.
function isInteractiveShortcutTarget(target: EventTarget | null): boolean {
  return (
    isTextEntryTarget(target) ||
    (target instanceof HTMLElement &&
      Boolean(target.closest('button, select, [role="button"], [role="tab"]')))
  );
}

// How many error rows the band shows before collapsing the rest behind a
// count. Three keeps the band a fixed, readable strip: the common case (one
// typo) never gets a toggle, and a broken paste reports its scale instead of
// burying it in a 140px scroll well.
const ERRORS_COLLAPSED_ROWS = 3;

// One row per export state, the same shape PLAY_LABELS uses below. These were
// three inline four-branch ternaries, two of them byte-identical copies.
const EXPORT_LABELS: Record<BoardExportState, string> = {
  idle: 'Export PNG',
  exporting: 'Exporting…',
  success: 'Saved',
  error: 'Retry PNG',
};
const EXPORT_GLYPHS: Record<BoardExportState, string> = {
  idle: 'PNG',
  exporting: '…',
  success: '✓',
  error: '!',
};

// Transport glyphs. Module scope, not inline JSX: `App` re-renders on every
// animation frame of playback, and an element rebuilt per frame is an element
// React must reconcile per frame — while these depend on nothing the clock
// changes. Hoisted, the identity is stable and React bails out of the subtree,
// the same reason `timelinePins` and the tick row below are memoized. `Board`
// already does this for its own static layers (CHECK_GLOW_DEFS, SQUARE_RECTS).
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

// Named separately because it is used on its own, not through a state table.
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

function loadDraft(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveDraft(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Local persistence is best-effort; playback must keep working if storage is unavailable.
  }
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
// accept types and the button/input pairing stay in one place. `id` is only
// for an importer whose visible text is a `<label htmlFor>` (narration); the
// other two inputs are opened by the button's ref and need no identity.
function ImportButton({
  id,
  accept,
  label,
  onChange,
  describedBy,
}: {
  id?: string;
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
        className="upload-btn import-btn"
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
  const [orientationRaw, setOrientation] = useDraftText(DRAFT_KEYS.orientation, 'white');
  const orientation: BoardOrientation = orientationRaw === 'black' ? 'black' : 'white';
  const events = useMemo(() => parseScript(scriptText), [scriptText]);
  const subtitleResult = useMemo(() => parseSrt(subtitleText), [subtitleText]);
  const subtitleCues = subtitleResult.cues;
  const initialSetup = useMemo(() => setupFromFen(fenText), [fenText]);
  const worldBuild = useMemo(
    () => buildWorld(events, initialSetup),
    [events, initialSetup],
  );
  // Narration audio rides the playback clock. The object URL is session-only —
  // it dies with the page — but the bytes behind it are a draft like the script
  // and the subtitles, kept in IndexedDB because they do not fit localStorage.
  const [narration, setNarration] = useState<NarrationTrack | null>(null);
  const [narrationError, setNarrationError] = useState<string | null>(null);
  const pendingNarrationRef = useRef<{
    url: string;
    probe: HTMLAudioElement;
  } | null>(null);
  // Latched by any deliberate act on the track — importing or removing — and
  // never unlatched: it exists only to stop the restore from overruling one.
  const narrationChosenRef = useRef(false);

  const duration = useMemo(() => {
    return playbackDuration(
      worldBuild.visualEndTime,
      getSubtitleEnd(subtitleCues),
      // Like subtitles, narration that outlasts the chess script extends
      // playback so the tail of the recording stays audible.
      narration?.duration,
    );
  }, [worldBuild.visualEndTime, subtitleCues, narration]);

  const [time, setTime] = useState(0);
  // Paused on load. The board is an authoring surface before it is a
  // recording: opening the app used to start the clock immediately, so a
  // returning author's first act was to catch a script already in motion and
  // scrub back to where they were. Playback is a deliberate act — the
  // transport, space, or a seek starts it.
  const [playing, setPlaying] = useState(false);
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
  // The piece click's on/off, persisted like the other transport preferences.
  // Default ON, and `moveSoundEnabled` — not `=== '1'` — is what makes the
  // default survive a junk draft rather than reading as muted.
  const [moveSoundRaw, setMoveSoundDraft] = useDraftText(DRAFT_KEYS.moveSound, '1');
  const moveSoundOn = moveSoundEnabled(moveSoundRaw);
  // The insert menu only exists in the Moves view of the Script tab; `/` is
  // inert everywhere else so the key never fires at a surface that can't show
  // the result of pressing it.
  const canInsert = !present && tab === 'script' && scriptView === 'moves';
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
  // Read by the window keydown listener, which must not re-subscribe every
  // time the user flips a tab.
  const canInsertRef = useLatest(canInsert);
  // Pre-insert script snapshot for one-step undo of the last board gesture or
  // structured edit. Hand edits clear it so undo never reverts typing.
  const [gestureUndo, setGestureUndo] = useState<string | null>(null);
  const [insertOpen, setInsertOpen] = useState(false);
  const [errorsExpanded, setErrorsExpanded] = useState(false);
  const [scriptEditError, setScriptEditError] = useState<string | null>(null);
  const [scriptImportError, setScriptImportError] = useState<string | null>(null);
  const [subtitleImportError, setSubtitleImportError] = useState<string | null>(null);
  const [boardExportState, setBoardExportState] = useState<BoardExportState>('idle');
  const [boardExportError, setBoardExportError] = useState<string | null>(null);

  useEffect(() => {
    setTime((t) => Math.min(t, duration));
  }, [duration]);

  // Leaving the Moves view unmounts the menu's trigger; drop the open flag with
  // it so returning doesn't land on a panel the user never reopened.
  useEffect(() => {
    if (!canInsert) setInsertOpen(false);
  }, [canInsert]);

  const editorLabelId = useId();
  const subtitleLabelId = useId();
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
  const boardRef = useRef<HTMLDivElement | null>(null);
  const boardExportInFlightRef = useRef(false);
  const boardExportResetRef = useRef<number | null>(null);
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

  // The one way the script text is replaced: four pieces move with it, or the
  // next surface to replace it gets the subset wrong — the text, the
  // imported-file name it no longer comes from, the one-step gesture-undo
  // snapshot, and any edit error raised against the text now gone. The import
  // error is not among them: it names a file that never loaded.
  const applyScript = useCallback(
    (text: string, opts?: { fileName?: string | null; undo?: string | null }) => {
      setScriptText(text);
      setScriptFileName(opts?.fileName ?? null);
      // Callers that pass no snapshot drop the old one: undoing past a hand
      // edit or a fresh import would silently revert the user's own text.
      setGestureUndo(opts?.undo ?? null);
      setScriptEditError(null);
    },
    [setScriptText],
  );

  const onScriptFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setScriptImportError(null);
      readSelectedTextFile(
        e,
        latestScriptReadRef,
        (text, fileName) => applyScript(text, { fileName }),
        setScriptImportError,
      );
    },
    [applyScript],
  );

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
    // identity guard against it, so a late fire is already a no-op. Detach and
    // reset the probe too, so superseded large files stop loading metadata.
    pending.probe.onloadedmetadata = null;
    pending.probe.onerror = null;
    pending.probe.removeAttribute('src');
    pending.probe.load();
    URL.revokeObjectURL(pending.url);
  }, []);

  // Shared by the file picker and by the restore-on-load below, so a track read
  // back from storage has to clear exactly the bar a freshly picked one does.
  // A separate restore path would be a second definition of "playable", and the
  // one that runs on load is the one nobody is watching.
  const adoptNarration = useCallback(
    (blob: Blob, name: string, source: 'import' | 'restore') => {
      cancelPendingNarration();
      const url = URL.createObjectURL(blob);
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
        setNarration({ url, name, duration: audioDuration });
        // Stored only once the probe has accepted it: the draft is a track the
        // app knows it can play, not whatever the picker last handed over.
        if (source === 'import') void saveNarration({ blob, name });
      };
      probe.onerror = () => {
        if (pendingNarrationRef.current !== pending) return;
        pendingNarrationRef.current = null;
        URL.revokeObjectURL(url);
        if (source === 'import') {
          setNarrationError(`Could not decode audio file: "${name}"`);
          // No `clearNarration` here on purpose: a rejected import never
          // reached the store, and the previous track is still the live one.
          return;
        }
        // A stored track that no longer decodes — a codec the browser dropped,
        // or bytes that did not survive. Drop it rather than failing this load
        // and every later one, and stay quiet: the author did nothing to be
        // told about, and the panel already shows no track.
        void clearStoredNarration();
      };
    },
    [cancelPendingNarration],
  );

  const onNarrationFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = takeSelectedFile(e);
      if (!file) return;
      narrationChosenRef.current = true;
      adoptNarration(file, file.name, 'import');
    },
    [adoptNarration],
  );

  // Restoring is async, and an author who picks a file before it lands must not
  // have last session's track land on top. The ref, not `narration` state: a
  // pick is a decision the moment it is made, well before the probe commits it.
  useEffect(() => {
    let cancelled = false;
    void loadNarration().then((stored) => {
      if (cancelled || !stored || narrationChosenRef.current) return;
      adoptNarration(stored.blob, stored.name, 'restore');
    });
    return () => {
      cancelled = true;
    };
  }, [adoptNarration]);

  const clearNarration = useCallback(() => {
    narrationChosenRef.current = true;
    cancelPendingNarration();
    setNarrationError(null);
    setNarration(null);
    void clearStoredNarration();
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

  const { scriptErrors, moveStates, rejectedEventIndexes } = worldBuild;

  const reachedEventIndex = lastEventIndexAt(events, time);

  // Most events select their stable authored snapshot. A successful `rp`
  // selects one of its half-second mainline frames from the same playback
  // clock; Present follows the source move without duplicating PGN rows.
  const worldFrame = worldFrameAt(worldBuild, reachedEventIndex, time);
  const world = worldFrame.snapshot;
  const presentationEventIndex =
    worldFrame.replaySourceEventIndex ?? reachedEventIndex;

  // The piece click reads the frame the board is about to draw rather than any
  // event that produced it, so playback, an `rp` replay step, a scrub landing
  // and a gesture's own paused landing all sound through one rule — and present
  // mode keeps it, because the click belongs to the recording. Muting gates the
  // call rather than the volume: a muted click makes no `play()` at all.
  useMoveSound(moveSoundKey(world.lastMove), moveSoundOn);

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
  // structured edits): apply, keeping the prior text as the one-step undo.
  // All it adds to `applyScript` is the landing — while paused, `landT` moves
  // the playhead just past what the edit wrote so the board shows its settled
  // result, and nothing more.
  const commitScriptEdit = useCallback(
    (next: string, landT?: number) => {
      applyScript(next, { undo: scriptText });
      if (landT != null && !playingRef.current) setTime(landT);
    },
    [scriptText, applyScript],
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
    applyScript(gestureUndo);
  }, [gestureUndo, applyScript]);

  const legalTargets = useCallback(
    (from: string) => Chess.legalTargets(world.chessState, from),
    [world.chessState],
  );

  // A press that can't start a move used to return in silence, which reads as
  // a dead board rather than a refused gesture. Reuses the EDIT row the
  // planners already write to, so gesture feedback has one home.
  const onMoveRejected = useCallback(
    (from: string) => {
      const reason = Chess.explainNoMoves(world.chessState, from);
      if (!reason) return;
      setScriptEditError(
        `Can't move from ${from} at ${fmtTime(timeRef.current, 'always')}: ${reason}.`,
      );
    },
    [world.chessState, timeRef],
  );

  // Move gestures: chess resolution (legality, SAN, same-move comparison)
  // happens here against the current position; the branch-aware policy —
  // advance / extend / wrap / plain-insert fallback — is planMoveGesture's
  // (scriptEdit.ts). The plan is either a seek or new text plus landing
  // boundaries; committing stays a React concern.
  const onMoveGesture = useCallback(
    (from: string, to: string) => {
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

  const exportBoard = useCallback(async () => {
    if (boardExportInFlightRef.current) return;
    const resumePlayback = playingRef.current;
    boardExportInFlightRef.current = true;
    if (boardExportResetRef.current != null) {
      window.clearTimeout(boardExportResetRef.current);
      boardExportResetRef.current = null;
    }
    setBoardExportError(null);
    setBoardExportState('exporting');
    setPlaying(false);
    const abandoned = new AbortController();
    try {
      // One ceiling over the whole operation, not just the rasterize: the frame
      // wait, the exporter's dynamic import, and the rasterize can each stall,
      // and an await that never settles never runs the `finally` — which is
      // what used to leave playback paused and this button disabled for the
      // rest of the session.
      await withTimeout(
        (async () => {
          // Start the exporter chunk now: it needs nothing the frame wait
          // produces, so awaiting it afterwards only added a cold fetch to the
          // pause. Both are inside the one ceiling.
          const exporter = loadExporter();
          // Let React commit the paused clock before cloning the board. Two
          // frames also let SVG/image layout settle without advancing the
          // authored time.
          //
          // Raced against a timer, because requestAnimationFrame does not fire
          // in a hidden or throttled tab and this wait would otherwise never
          // resolve — the actual cause of the export hang seen here. Nothing is
          // painting in that state, so the frames have nothing to settle and
          // skipping them costs the export nothing.
          await Promise.race([
            new Promise<void>((resolve) => {
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            }),
            new Promise<void>((resolve) => window.setTimeout(resolve, 200)),
          ]);
          const board = boardRef.current;
          if (!board) throw new Error('The board is not available.');
          await downloadBoardPng(board, timeRef.current, { signal: abandoned.signal, exporter });
        })(),
        BOARD_EXPORT_TIMEOUT_MS,
        BOARD_EXPORT_TIMEOUT_MESSAGE,
      );
      setBoardExportState('success');
      boardExportResetRef.current = window.setTimeout(() => {
        setBoardExportState('idle');
        boardExportResetRef.current = null;
      }, 1800);
    } catch (error) {
      // The rasterize we gave up on can still be running. Tell it not to
      // deliver a file the user has already been told they aren't getting.
      abandoned.abort();
      const detail = error instanceof Error ? error.message : 'Unknown browser error.';
      setBoardExportError(`Could not export board PNG: ${detail}`);
      setBoardExportState('error');
    } finally {
      boardExportInFlightRef.current = false;
      setPlaying(resumePlayback);
    }
  }, [playingRef, timeRef]);

  // Two buttons run this — one in the header, one in present mode — and the
  // half they share is the whole accessibility contract: the announced size,
  // the disabled-while-exporting rule, and the convention that the error rides
  // in the tooltip. Present mode has no visible label to contradict a stale
  // one, so a fix landing in only one copy is invisible exactly where it
  // matters. The size is templated off the exporter's own constant rather than
  // spelled out, so the announcement cannot outlive a change to the output.
  const exportButtonProps = {
    type: 'button' as const,
    onClick: exportBoard,
    disabled: boardExportState === 'exporting',
    'aria-label': `Export current board as a ${BOARD_EXPORT_SIZE} by ${BOARD_EXPORT_SIZE} PNG`,
    title: boardExportError ?? 'Export current board as PNG',
  };

  useEffect(() => () => {
    if (boardExportResetRef.current != null) {
      window.clearTimeout(boardExportResetRef.current);
    }
  }, []);

  const enterPresent = useCallback(() => setPresent(true), []);
  const exitPresent = useCallback(() => setPresent(false), []);
  const togglePresentPgn = useCallback(
    () => setPresentPgn((v) => (v === '1' ? '0' : '1')),
    [setPresentPgn],
  );
  const toggleMoveSound = useCallback(
    () => setMoveSoundDraft((v) => (moveSoundEnabled(v) ? '0' : '1')),
    [setMoveSoundDraft],
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
      // `/` opens the insert menu. Its guard is narrower than the transport's:
      // the transport keys must stay off every control (Space would re-trigger
      // a focused button), but `/` is only ever ambiguous inside real text
      // entry, and blocking it on buttons would kill the shortcut exactly when
      // focus is parked on the move list.
      if (e.key === '/' && !isTextEntryTarget(e.target)) {
        if (!canInsertRef.current) return;
        e.preventDefault();
        setInsertOpen(true);
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


  const activeSubtitle = getActiveSubtitle(subtitleCues, time);
  const activeSubtitleText = useMemo(
    () => activeSubtitle ? formatSubtitleText(activeSubtitle.text) : '',
    [activeSubtitle],
  );

  // Three booleans, rebuilt as an array + filter + join on every frame of
  // playback. None of them is a clock input.
  const appClass = useMemo(
    () =>
      [
        'app',
        present && 'app--present',
        present && presentPgn && 'app--present-pgn',
        present && chromeHidden && 'app--idle',
      ]
        .filter(Boolean)
        .join(' '),
    [present, presentPgn, chromeHidden],
  );

  // The ruler's fixed furniture. It sits inside `.controls`, which re-renders
  // on every animation frame of playback, and depends only on the script: the
  // ticks on the duration they divide. Unmemoized it rebuilt a tick element
  // and a style object per division, every frame, for a row whose content had
  // not changed since the last edit — next to `timelinePins`, which is
  // memoized for exactly this reason.
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
  // Rate and the piece click's on/off ride one wrapper rather than two grid
  // children. The transport grid restates its column list in four tiers and
  // places every child by hand, so a second bare child would auto-place into
  // whatever cell each tier happened to leave free — a control that lands on
  // the timeline at one viewport width only. Memoized because `App` re-renders
  // on every animation frame of playback and neither the rate selector nor the
  // SFX toggle depends on the clock.
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
          onClick={toggleMoveSound}
        >
          SFX
        </button>
      </div>
    ),
    [speed, moveSoundOn, toggleMoveSound],
  );

  const playState = playStateAt(playing, time, duration);
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

  // Rendered at the bottom of whichever panel page is open: an error anywhere
  // (FEN, script, subtitles, narration) must stay visible on both pages.
  // Built as one ordered list rather than eight inline conditionals so the band
  // can count itself — a fixed 140px cap turned six errors into a nested scroll
  // region inside an already-scrolling panel, which hides the very thing it is
  // trying to report.
  const errorRows = useMemo(() => {
    // Rows are keyed by position, not by `tag`. The tag looked like a free
    // identity — one row per source, one event per line — but `S{line}` is not
    // unique: an SRT can produce two errors on the same line (a missing blank
    // separator *and* an empty cue), and both rows then render with `key="S4"`
    // in the one surface whose job is to report malformed input completely.
    // The index is position-stable inside this memo and cannot drift from a
    // label, which is what the tag was chosen to avoid.
    const rows: { tag: string; text: string; id?: string }[] = [];
    if (initialSetup.error) rows.push({ tag: 'FEN', text: initialSetup.error, id: fenErrorId });
    if (narrationError) rows.push({ tag: 'AUD', text: narrationError, id: narrationErrorId });
    if (boardExportError) rows.push({ tag: 'PNG', text: boardExportError });
    if (scriptEditError) rows.push({ tag: 'EDIT', text: scriptEditError });
    if (scriptImportError) {
      rows.push({ tag: 'SCRIPT', text: scriptImportError, id: scriptImportErrorId });
    }
    if (subtitleImportError) {
      rows.push({ tag: 'SRT', text: subtitleImportError, id: subtitleImportErrorId });
    }
    // Already line-sorted by buildWorld; the band preserves that order.
    for (const er of scriptErrors) rows.push({ tag: `L${er.line}`, text: er.error });
    for (const er of subtitleResult.errors) rows.push({ tag: `S${er.line}`, text: er.error });
    return rows;
  }, [
    initialSetup.error,
    narrationError,
    boardExportError,
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

  const errorsBlock = useMemo(() => {
    if (errorRows.length === 0) return false;
    const collapsed = !errorsExpanded && errorRows.length > ERRORS_COLLAPSED_ROWS;
    const shown = collapsed ? errorRows.slice(0, ERRORS_COLLAPSED_ROWS) : errorRows;
    return (
      // role="status" (implicitly polite): errors persist and update as the
      // user types — an assertive alert would interrupt every edit.
      <div className={`errors${errorsExpanded ? ' errors--expanded' : ''}`} role="status">
        {shown.map((row, i) => (
          <div key={i} className="err-row">
            <span className="err-line">{row.tag}</span>
            <span id={row.id}>{row.text}</span>
          </div>
        ))}
        {errorRows.length > ERRORS_COLLAPSED_ROWS && (
          <button
            type="button"
            className="errors-toggle"
            aria-expanded={errorsExpanded}
            onClick={() => setErrorsExpanded((v) => !v)}
          >
            {collapsed ? `Show ${errorRows.length - ERRORS_COLLAPSED_ROWS} more` : 'Show fewer'}
          </button>
        )}
      </div>
    );
  }, [errorRows, errorsExpanded]);

  return (
    <div
      className={appClass}
    >
      {/* Narration track: invisible, driven entirely by the playback clock. */}
      {narration && <audio ref={audioRef} src={narration.url} preload="auto" />}
      <div className="sr-only" role="status" aria-live="polite">
        {boardExportState === 'exporting' && 'Exporting board PNG.'}
        {boardExportState === 'success' && 'Board PNG downloaded.'}
        {boardExportState === 'error' && boardExportError}
      </div>
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
        <div className="header-actions">
          <button
            {...exportButtonProps}
            className="present-btn export-board-btn"
          >
            <span className="export-board-label-wide">
              {EXPORT_LABELS[boardExportState]}
            </span>
            <span className="export-board-label-compact" aria-hidden="true">
              {EXPORT_GLYPHS[boardExportState]}
            </span>
          </button>
          <button
            type="button"
            className="present-btn"
            onClick={enterPresent}
            aria-label="Enter present mode"
          >
            Present
          </button>
        </div>
      </header>

      <main className="main">
        <div className="board-col">
          <Board
            ref={boardRef}
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
            interactive={tab === 'script' && !present && !worldFrame.replayActive}
            legalTargets={legalTargets}
            onMoveRejected={onMoveRejected}
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
              {PLAY_GLYPHS[playState]}
            </button>
            <button type="button" className="ctrl-btn" onClick={restart} aria-label="Rewind to start">
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

            {transportPrefs}

            {/* Present-only controls: they ride the floating transport, so
               they auto-hide with the rest of the chrome during recording. */}
            {present && (
              <div className="present-controls">
                <button
                  {...exportButtonProps}
                  className="present-toggle"
                >
                  {EXPORT_GLYPHS[boardExportState]}
                </button>
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
                    {/* The tab directly above already reads "Script". Kept in
                        the DOM because it names the editor for assistive tech
                        (aria-labelledby), hidden because repeating the tab
                        label spent a row of a panel that is always short. */}
                    <h2 className="sr-only" id={editorLabelId}>Script</h2>
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
                        accept=".gambit,.txt,text/plain"
                        label="Import script file"
                        describedBy={scriptImportError ? scriptImportErrorId : undefined}
                        onChange={onScriptFileChange}
                      />
                    </div>
                  </div>
                  {/* One hint per view: syntax belongs to Text, gestures to Moves. */}
                  {scriptView === 'text' ? (
                    SYNTAX_HINT
                  ) : (
                    <p className="panel-hint">
                      Drag to move · right-drag arrow · right-click highlight
                    </p>
                  )}
                </div>
                {scriptView === 'moves' ? (
                  <>
                  <MoveList
                    events={events}
                    states={moveStates}
                    reachedEventIndex={reachedEventIndex}
                    errorLines={errorLines}
                    onSeek={seekEvent}
                    playing={playing}
                    labelId={editorLabelId}
                    onRetime={onRetimeEvent}
                    onDelete={onDeleteEvents}
                  />
                  {/* The structured editor could retime and delete but never
                      create, so nine of twelve event kinds had no way in.
                      Insertion reuses recordGestureLine — the board gesture's
                      own commit path — rather than opening a second one. */}
                  <InsertMenu
                    open={insertOpen}
                    onOpenChange={setInsertOpen}
                    onInsert={recordGestureLine}
                    timeLabel={currentTimeText}
                  />
                  </>
                ) : (
                  <textarea
                    id="script-text"
                    className="script-textarea"
                    spellCheck={false}
                    value={scriptText}
                    aria-labelledby={editorLabelId}
                    onChange={(e) => {
                      applyScript(e.target.value);
                      // Typing here is what dismisses the script import error,
                      // mirroring the subtitle textarea below.
                      setScriptImportError(null);
                    }}
                  />
                )}
                </>
              ) : (
                <>
                {/* No header band: with the title hidden this one held nothing
                    but padding and a rule above the first field. */}
                <h2 className="sr-only">Setup</h2>
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
                <div className="orientation-field">
                  <span className="orientation-label">Board orientation</span>
                  <div className="view-toggle" role="group" aria-label="Board orientation">
                    <button
                      type="button"
                      className="view-btn"
                      aria-pressed={orientation === 'white'}
                      onClick={() => setOrientation('white')}
                    >
                      White
                    </button>
                    <button
                      type="button"
                      className="view-btn"
                      aria-pressed={orientation === 'black'}
                      onClick={() => setOrientation('black')}
                    >
                      Black
                    </button>
                  </div>
                </div>
                <section className="subtitle-editor grow" aria-labelledby={subtitleLabelId}>
                  <div className="subtitle-editor-head">
                    <label id={subtitleLabelId} htmlFor="subtitle-text">Subtitles</label>
                    <div className="subtitle-actions">
                      {subtitleFileName && <span className="subtitle-file">{subtitleFileName}</span>}
                      <ImportButton
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
                    Follows the timeline. Kept with the script across reloads.
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
            {' (modified)'}
            {' · '}
            <a href="/licenses/LICENSE-pieces.txt">CC BY-NC-SA 4.0</a>
          </span>
        </footer>
      )}
    </div>
  );
}
