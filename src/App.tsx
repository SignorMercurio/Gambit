// Main app: orchestrates state from a script, drives playback,
// renders the board, the timeline scrubber, and the editor panel.

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
import { InsertMenu, TEXT_ENTRY_SELECTOR } from './components/InsertMenu';
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
  timelineTicks,
} from './lib/playback';

type NarrationTrack = { url: string; name: string; duration: number };
// The failure message exists only in the error state, so the two cannot
// disagree about whether the last export failed.
type BoardExportState =
  | { status: 'idle' | 'exporting' | 'success' }
  | { status: 'error'; message: string };
type BoardExportOperation = {
  controller: AbortController;
  done: Promise<void>;
  release: () => void;
};
// Element ids for ARIA wiring. Literals rather than `useId`: there is one App
// per document and no server render, so a fixed name is already unique — the
// same reason `start-fen` and `subtitle-text` were always literals.
const editorLabelId = 'script-editor-label';
const subtitleLabelId = 'subtitle-label';
const narrationLabelId = 'narration-label';
const narrationFileInputId = 'narration-file';
const narrationErrorId = 'narration-error';
const scriptImportErrorId = 'script-import-error';
const subtitleImportErrorId = 'subtitle-import-error';
const setupTabId = 'setup-tab';
const scriptTabId = 'script-tab';
const panelId = 'side-panel';
const fenErrorId = 'fen-error';

// How many error rows the band shows before collapsing the rest behind a
// count. Three keeps the band a fixed, readable strip: the common case (one
// typo) never gets a toggle, and a broken paste reports its scale instead of
// burying it in a 140px scroll well.
const ERRORS_COLLAPSED_ROWS = 3;

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

// Pluck the selected file and reset the input so re-picking the same file
// fires change again. Shared intake for every import affordance.
function takeSelectedFile(e: React.ChangeEvent<HTMLInputElement>): File | null {
  const file = e.currentTarget.files?.[0];
  e.currentTarget.value = '';
  return file ?? null;
}

// A hidden tab may never paint. Whichever boundary wins must cancel both
// the queued frame and the fallback timer, including when App unmounts.
function waitForBoardPaint(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    let frame = 0;
    const finish = () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = window.setTimeout(finish, 200);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
    else frame = requestAnimationFrame(() => { frame = requestAnimationFrame(finish); });
  });
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
  // Bumped by every deliberate act on the track — importing or removing — and
  // by unmount. A probe or restore carries the number it started under and
  // commits only if it is still current, so the latest act wins, a remove
  // beats any probe in flight, and the restore never overrules a pick.
  const narrationRequestRef = useRef(0);

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
  // Paused on load: playback is a deliberate act — the transport, space, or a
  // seek starts it.
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
  // exportBoard reads it after its awaits, when a closed-over `time` is stale.
  const timeRef = useLatest(time);
  // Pre-insert script snapshot for one-step undo of the last board gesture or
  // structured edit. Hand edits clear it so undo never reverts typing.
  const [gestureUndo, setGestureUndo] = useState<string | null>(null);
  const [errorsExpanded, setErrorsExpanded] = useState(false);
  const [scriptEditError, setScriptEditError] = useState<string | null>(null);
  const [scriptImportError, setScriptImportError] = useState<string | null>(null);
  const [subtitleImportError, setSubtitleImportError] = useState<string | null>(null);
  const [boardExport, setBoardExport] = useState<BoardExportState>({ status: 'idle' });
  const boardExportError = boardExport.status === 'error' ? boardExport.message : null;
  const boardExportRef = useRef<BoardExportOperation | null>(null);
  const exporting = boardExport.status === 'exporting';

  // Imports may finish during a PNG capture. Wait for that single operation,
  // then let the import's own identity check decide whether it is still current.
  const waitForBoardExport = useCallback(async () => {
    while (boardExportRef.current) await boardExportRef.current.done;
  }, []);

  useEffect(() => {
    if (boardExportRef.current) return;
    setTime((t) => Math.min(t, duration));
  }, [duration, exporting]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const boardExportResetRef = useRef<number | null>(null);
  const latestScriptReadRef = useRef(0);
  const latestSubtitleReadRef = useRef(0);

  const onTabKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    e.stopPropagation();
    const next = tab === 'script' ? 'setup' : 'script';
    setTab(next);
    // Both tab buttons stay mounted, so focus can follow selection
    // synchronously without inserting an uncancelled frame of latency.
    e.currentTarget
      .querySelector<HTMLElement>(`#${next === 'script' ? scriptTabId : setupTabId}`)
      ?.focus();
  };

  // The one way the script text is replaced: four pieces move with it, or the
  // next surface to replace it gets the subset wrong — the text, the
  // imported-file name it no longer comes from, the one-step gesture-undo
  // snapshot, and any edit error raised against the text now gone. The import
  // error is not among them: it names a file that never loaded.
  const applyScript = useCallback(
    (text: string, opts?: { fileName?: string | null; undo?: string | null }) => {
      if (boardExportRef.current) return;
      latestScriptReadRef.current++;
      setScriptText(text);
      setScriptFileName(opts?.fileName ?? null);
      // Callers that pass no snapshot drop the old one: undoing past a hand
      // edit or a fresh import would silently revert the user's own text.
      setGestureUndo(opts?.undo ?? null);
      setScriptEditError(null);
    },
    [setScriptText],
  );

  const applySubtitles = (text: string, fileName: string | null = null) => {
    if (boardExportRef.current) return;
    latestSubtitleReadRef.current++;
    setSubtitleText(text);
    setSubtitleFileName(fileName);
    setSubtitleImportError(null);
  };

  // Shared intake for the script and subtitle imports. Only the newest pick
  // may commit, and only once any PNG capture has finished.
  const importTextFile = (
    e: React.ChangeEvent<HTMLInputElement>,
    latestRead: { current: number },
    onRead: (text: string, fileName: string) => void,
    setError: (message: string | null) => void,
  ) => {
    if (boardExportRef.current) return;
    setError(null);
    const file = takeSelectedFile(e);
    if (!file) return;
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
  };

  // Shared by the file picker and the restore-on-load below: a separate restore
  // path would be a second definition of "playable".
  const adoptNarration = useCallback(
    (blob: Blob, name: string, source: 'import' | 'restore', request: number) => {
      const url = URL.createObjectURL(blob);
      // Probe metadata off-DOM so a broken file never becomes the live track.
      // Only the latest request may commit: a slow earlier probe must not
      // overwrite a newer file or resurrect audio after Remove. A superseded
      // probe still settles, and settling is where it frees its URL.
      const probe = new Audio();
      probe.preload = 'metadata';
      probe.src = url;
      probe.onloadedmetadata = async () => {
        // Each probe settles once; a later error must not reach a live track.
        probe.onloadedmetadata = probe.onerror = null;
        await waitForBoardExport();
        if (narrationRequestRef.current !== request) {
          URL.revokeObjectURL(url);
          return;
        }
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
        probe.onloadedmetadata = probe.onerror = null;
        URL.revokeObjectURL(url);
        if (narrationRequestRef.current !== request) return;
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
    [waitForBoardExport],
  );

  const onNarrationFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (boardExportRef.current) return;
    const file = takeSelectedFile(e);
    if (!file) return;
    adoptNarration(file, file.name, 'import', ++narrationRequestRef.current);
  };

  // Restoring is async, and an author who picks a file before it lands must not
  // have last session's track land on top. The ref, not `narration` state: a
  // pick is a decision the moment it is made, well before the probe commits it.
  // The restore claims no number of its own, so any act since it started wins.
  // Cleanup (unmount) bumps the counter, superseding the restore and every
  // probe still in flight.
  useEffect(() => {
    const request = narrationRequestRef.current;
    void loadNarration().then((stored) => {
      if (!stored || narrationRequestRef.current !== request) return;
      adoptNarration(stored.blob, stored.name, 'restore', request);
    });
    return () => {
      narrationRequestRef.current++;
    };
  }, [adoptNarration]);

  const clearNarration = () => {
    if (boardExportRef.current) return;
    narrationRequestRef.current++;
    setNarrationError(null);
    setNarration(null);
    void clearStoredNarration();
  };

  // State owns the live URL: replacing or removing a track cleans up the
  // previous one, and unmounting cleans up the current one.
  useEffect(() => () => {
    if (narration) URL.revokeObjectURL(narration.url);
  }, [narration]);

  const lastTickRef = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) {
      lastTickRef.current = null;
      return;
    }
    function tick(now: number) {
      if (boardExportRef.current) return;
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
      if (!terminal) raf = requestAnimationFrame(tick);
    }
    let raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, duration]);

  // Narration follows the playback clock; the clock stays the single source
  // of truth so the board remains fully determined by script + time. One
  // idempotent application: rate, a drift snap that also covers seeks, and
  // play/pause — re-applied when the <audio> element remounts on narration
  // change. Past the track's end the element is paused, never played: `play()`
  // on an ended element would restart it from zero. A seek back into the track
  // snaps first, which clears `ended`, so the resume below still happens.
  //
  // 0.25s tick granularity matches the snap tolerance: any seek larger than the
  // tolerance crosses a tick boundary, while steady playback runs this ~4x/s
  // instead of every animation frame. `time` is deliberately left out of the
  // effect's deps and sampled through narrationDriftTick.
  const narrationDriftTick = narration ? Math.round(time * 4) : 0;
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !narration) return;
    el.playbackRate = speed;
    const target = Math.min(time, narration.duration);
    if (Math.abs(el.currentTime - target) > 0.25) el.currentTime = target;
    if (playing && time < narration.duration) {
      // `ended` too: the element can finish a few ticks before the clock
      // reaches `narration.duration` (audio clock drift, or a VBR length
      // estimate), and this runs every tick, not only on a state change.
      if (el.paused && !el.ended) {
        el.play().catch(() => {
          // Autoplay rejection: playback starts from a user gesture in every
          // Gambit flow, but if a browser still refuses, stay silent.
        });
      }
    } else {
      el.pause();
    }
  }, [narrationDriftTick, narration, playing, speed]);

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
      if (boardExportRef.current) return;
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
      if (boardExportRef.current) return;
      applyScript(next, { undo: scriptText });
      if (landT != null && !playingRef.current) setTime(landT);
    },
    [scriptText, applyScript],
  );

  // Both gestures reject the same way: the script text changed between
  // pointer-down and pointer-up (hand edit, undo), so any plan would be built
  // against text the gesture never previewed. Leaves the script untouched.
  const gestureIsStale = (): boolean => {
    if (boardExportRef.current) return true;
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
      if (boardExportRef.current) return null;
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
    if (boardExportRef.current) return;
    if (timeRef.current >= duration) {
      setTime(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  }, [duration]);

  const exportBoard = async () => {
    if (boardExportRef.current) return;
    const resumePlayback = playingRef.current;
    let release!: () => void;
    const operation: BoardExportOperation = {
      controller: new AbortController(),
      done: new Promise<void>((resolve) => { release = resolve; }),
      release: () => release(),
    };
    boardExportRef.current = operation;
    if (boardExportResetRef.current != null) {
      window.clearTimeout(boardExportResetRef.current);
      boardExportResetRef.current = null;
    }
    setBoardExport({ status: 'exporting' });
    setPlaying(false);
    try {
      // One ceiling over the whole operation, not just the rasterize: the frame
      // wait, the dynamic import, and the rasterize can each stall, and an
      // await that never settles never runs the `finally`.
      await withTimeout(
        (async () => {
          // Load and settle concurrently, with both rejections observed from
          // the start. The lock keeps the committed board fixed while cloning.
          const [exporter] = await Promise.all([
            loadExporter(),
            waitForBoardPaint(operation.controller.signal),
          ]);
          const board = boardRef.current;
          if (!board) throw new Error('The board is not available.');
          await downloadBoardPng(board, timeRef.current, {
            signal: operation.controller.signal,
            exporter,
          });
        })(),
        BOARD_EXPORT_TIMEOUT_MS,
        BOARD_EXPORT_TIMEOUT_MESSAGE,
        operation.controller.signal,
      );
      if (boardExportRef.current !== operation) return;
      setBoardExport({ status: 'success' });
      boardExportResetRef.current = window.setTimeout(() => {
        setBoardExport({ status: 'idle' });
        boardExportResetRef.current = null;
      }, 1800);
    } catch (error) {
      // The rasterize we gave up on can still be running. Tell it not to
      // deliver a file the user has already been told they aren't getting.
      operation.controller.abort();
      if (boardExportRef.current !== operation) return;
      const detail = error instanceof Error ? error.message : 'Unknown browser error.';
      setBoardExport({ status: 'error', message: `Could not export board PNG: ${detail}` });
    } finally {
      if (boardExportRef.current === operation) {
        boardExportRef.current = null;
        setPlaying(resumePlayback);
      }
      operation.release();
    }
  };

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
    const operation = boardExportRef.current;
    boardExportRef.current = null;
    operation?.controller.abort();
    operation?.release();
    if (boardExportResetRef.current != null) {
      window.clearTimeout(boardExportResetRef.current);
    }
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
      if (boardExportRef.current) return false;
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
      if (boardExportRef.current) return;
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

  // Rendered at the bottom of whichever panel page is open, so an error
  // anywhere stays visible on both pages; one ordered list so the band can
  // count itself. Rows are keyed by index, not `tag`: `S{line}` is not unique
  // (one SRT line can raise two errors).
  const errorRows: { tag: string; text: string; id?: string }[] = [];
  if (initialSetup.error) errorRows.push({ tag: 'FEN', text: initialSetup.error, id: fenErrorId });
  if (narrationError) errorRows.push({ tag: 'AUD', text: narrationError, id: narrationErrorId });
  if (boardExportError) errorRows.push({ tag: 'PNG', text: boardExportError });
  if (scriptEditError) errorRows.push({ tag: 'EDIT', text: scriptEditError });
  if (scriptImportError) {
    errorRows.push({ tag: 'SCRIPT', text: scriptImportError, id: scriptImportErrorId });
  }
  if (subtitleImportError) {
    errorRows.push({ tag: 'SRT', text: subtitleImportError, id: subtitleImportErrorId });
  }
  // Already line-sorted by buildWorld; the band preserves that order.
  for (const er of scriptErrors) errorRows.push({ tag: `L${er.line}`, text: er.error });
  for (const er of subtitleResult.errors) errorRows.push({ tag: `S${er.line}`, text: er.error });

  const errorsCollapsed = !errorsExpanded && errorRows.length > ERRORS_COLLAPSED_ROWS;
  const errorsBlock = errorRows.length > 0 && (
    // role="status" (implicitly polite): errors persist and update as the
    // user types — an assertive alert would interrupt every edit.
    <div className={`errors${errorsExpanded ? ' errors--expanded' : ''}`} role="status">
      {(errorsCollapsed ? errorRows.slice(0, ERRORS_COLLAPSED_ROWS) : errorRows).map((row, i) => (
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
          {errorsCollapsed ? `Show ${errorRows.length - ERRORS_COLLAPSED_ROWS} more` : 'Show fewer'}
        </button>
      )}
    </div>
  );

  return (
    <div
      className={`app${present ? ' app--present' : ''}${
        present && presentPgn ? ' app--present-pgn' : ''
      }${present && chromeHidden ? ' app--idle' : ''}`}
      aria-busy={exporting || undefined}
    >
      {/* Narration track: invisible, driven entirely by the playback clock. */}
      {narration && <audio ref={audioRef} src={narration.url} preload="auto" />}
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
            {/* Rewind preserves the play state (editor convention): while
               playing it replays from 0; while paused or at the end it returns
               to 0 paused. The gradient play button owns "replay from the
               end", so the two transport buttons never duplicate. */}
            <button
              type="button"
              className="ctrl-btn"
              onClick={() => { if (!boardExportRef.current) setTime(0); }}
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
                  if (!boardExportRef.current) setTime(parseFloat(e.target.value));
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
                    {/* Visually hidden (the tab above reads "Script"); the h2
                        exists to name the editor via aria-labelledby. */}
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
                          onClick={() => applyScript(gestureUndo)}
                        >
                          Undo
                        </button>
                      )}
                      <ImportButton
                        accept=".gambit,.txt,text/plain"
                        label="Import script file"
                        describedBy={scriptImportError ? scriptImportErrorId : undefined}
                        onChange={(e) => importTextFile(
                          e,
                          latestScriptReadRef,
                          (text, fileName) => applyScript(text, { fileName }),
                          setScriptImportError,
                        )}
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
                    snapshots={snapshots}
                    reachedEventIndex={reachedEventIndex}
                    errorLines={errorLines}
                    onSeek={seekEvent}
                    playing={playing}
                    labelId={editorLabelId}
                    onRetime={onRetimeEvent}
                    onDelete={onDeleteEvents}
                  />
                  {/* Insertion reuses recordGestureLine — the board gesture's
                      own commit path — rather than opening a second one. */}
                  <InsertMenu
                    onInsert={recordGestureLine}
                    timeLabel={currentTimeText}
                  />
                  </>
                ) : (
                  <textarea
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
                    onChange={(e) => {
                      if (!boardExportRef.current) setFenText(e.target.value);
                    }}
                  />
                </div>
                <div className="orientation-field">
                  <span className="orientation-label">Board orientation</span>
                  <div className="view-toggle" role="group" aria-label="Board orientation">
                    <button
                      type="button"
                      className="view-btn"
                      aria-pressed={orientation === 'white'}
                      onClick={() => { if (!boardExportRef.current) setOrientation('white'); }}
                    >
                      White
                    </button>
                    <button
                      type="button"
                      className="view-btn"
                      aria-pressed={orientation === 'black'}
                      onClick={() => { if (!boardExportRef.current) setOrientation('black'); }}
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
                        onChange={(e) => importTextFile(
                          e,
                          latestSubtitleReadRef,
                          applySubtitles,
                          setSubtitleImportError,
                        )}
                      />
                    </div>
                  </div>
                  <textarea
                    id="subtitle-text"
                    className="subtitle-textarea"
                    spellCheck={false}
                    value={subtitleText}
                    onChange={(e) => applySubtitles(e.target.value)}
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
