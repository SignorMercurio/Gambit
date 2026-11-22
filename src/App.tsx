// Main app: owns the script, Start FEN, the playback clock and transport
// state. It does not follow the clock frame by frame: `BoardColumn` draws the
// frame, and App re-renders only when state or the reached event changes.

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { BoardColumn } from './components/BoardColumn';
import { BOARD_EXPORT_SIZE } from './lib/boardExport';
import type { BoardOrientation } from './lib/boardOrientation';
import * as Chess from './lib/chess';
import { DEFAULT_SCRIPT, DEFAULT_SUBTITLES } from './lib/defaults';
import { createClock, useClockValue } from './lib/clock';
import { moveSoundEnabled } from './lib/moveSound';
import { getSubtitleEnd, parseSrt } from './lib/subtitles';
import { TEXT_ENTRY_SELECTOR } from './components/InsertMenu';
import { PresentationMoves } from './components/PresentationMoves';
import { SidePanel, type PanelTab, type ScriptView } from './components/SidePanel';
import { useBoardExport, type BoardExportState } from './components/useBoardExport';
import { useNarration } from './components/useNarration';
import {
  planLineInsert,
  planMoveGesture,
  removeLines,
  setLineTime,
  type ScriptEditPlan,
} from './lib/scriptEdit';
import { fmtTime, lastEventIndexAt, parseScript } from './lib/timeline';
import { useLatest } from './components/useLatest';
import { buildWorld, setupFromFen, worldFrameAt } from './lib/world';
import { landBetween, playbackDuration } from './lib/playback';
import { RENDER_MODE, installRenderHandle } from './lib/renderMode';

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

const DRAFT_KEYS = {
  script: 'gambit:draft:script',
  subtitles: 'gambit:draft:subtitles',
  fen: 'gambit:draft:start-fen',
  orientation: 'gambit:draft:board-orientation',
  scriptView: 'gambit:draft:script-view',
  presentPgn: 'gambit:draft:present-pgn',
  moveSound: 'gambit:draft:move-sound',
} as const;

// Pointer idle time before present-mode chrome fades out during playback.
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
  // Debounced against per-keystroke writes; the pagehide flush covers a tab
  // closing inside the debounce window.
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

// Only the newest pick may commit.
function importTextFile(
  file: File,
  latestRead: { current: number },
  onRead: (text: string, fileName: string) => void,
  setError: (message: string | null) => void,
): void {
  setError(null);
  const request = ++latestRead.current;
  if (file.size > MAX_TEXT_IMPORT_BYTES) {
    setError(`Could not import "${file.name}": text files are limited to 1 MB.`);
    return;
  }
  file.text().then(
    (text) => {
      if (latestRead.current === request) onRead(text, file.name);
    },
    () => {
      if (latestRead.current === request) setError(`Could not read "${file.name}".`);
    },
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
  const asks = useMemo(() => events.filter((e) => e.kind === 'ask'), [events]);
  const subtitleResult = useMemo(() => parseSrt(subtitleText), [subtitleText]);
  const subtitleCues = subtitleResult.cues;
  const initialSetup = useMemo(() => setupFromFen(fenText), [fenText]);
  const worldBuild = useMemo(
    () => buildWorld(events, initialSetup),
    [events, initialSetup],
  );

  const [clock] = useState(createClock);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [tab, setTab] = useState<PanelTab>('script');
  const [scriptViewRaw, setScriptView] = useDraftText(DRAFT_KEYS.scriptView, 'moves');
  const scriptView: ScriptView = scriptViewRaw === 'text' ? 'text' : 'moves';
  // Present mode is purely a view flag: the board stays script + FEN + time.
  const [present, setPresent] = useState(RENDER_MODE);
  const [presentPgnRaw, setPresentPgn] = useDraftText(DRAFT_KEYS.presentPgn, '0');
  const presentPgn = presentPgnRaw === '1';
  // `moveSoundEnabled`, not `=== '1'`, keeps a junk draft at the default ON.
  const [moveSoundRaw, setMoveSoundDraft] = useDraftText(DRAFT_KEYS.moveSound, '1');
  const moveSoundOn = moveSoundEnabled(moveSoundRaw);
  const [chromeHidden, setChromeHidden] = useState(false);
  const chromeHiddenRef = useLatest(chromeHidden);
  const scriptTextRef = useLatest(scriptText);
  // Landing reads the transport state at release, not pointer-down: playback
  // can flip mid-drag, and a paused board parked exactly on an event's
  // timestamp shows it at age 0 (invisible).
  const playingRef = useLatest(playing);
  // Text before the last gesture or structured edit, for one-step undo. Every
  // other replacement clears it so undo never reverts typing or an import.
  const [gestureUndo, setGestureUndo] = useState<string | null>(null);
  const [errorsExpanded, setErrorsExpanded] = useState(false);
  const [scriptEditError, setScriptEditError] = useState<string | null>(null);
  const [scriptImportError, setScriptImportError] = useState<string | null>(null);
  const [subtitleImportError, setSubtitleImportError] = useState<string | null>(null);

  const boardRef = useRef<HTMLDivElement | null>(null);
  const { state: boardExport, exportBoard } = useBoardExport({ boardRef, clock });
  const boardExportError = boardExport.status === 'error' ? boardExport.message : null;
  const exporting = boardExport.status === 'exporting';

  const narrationTrack = useNarration({ clock, playing, speed });
  const { narration } = narrationTrack;

  const duration = useMemo(() => {
    return playbackDuration(
      worldBuild.visualEndTime,
      getSubtitleEnd(subtitleCues),
      // Narration that outlasts the script extends playback, like subtitles.
      narration?.duration,
    );
  }, [worldBuild.visualEndTime, subtitleCues, narration]);

  useEffect(() => {
    clock.set((t) => Math.min(t, duration));
  }, [clock, duration]);

  const renderSourceRef = useLatest({ events, worldBuild, duration });
  useEffect(
    () => (RENDER_MODE ? installRenderHandle(clock, () => renderSourceRef.current) : undefined),
    [clock, renderSourceRef],
  );

  const latestScriptReadRef = useRef(0);
  const latestSubtitleReadRef = useRef(0);

  // The one way the script text is replaced. Text, file name, undo snapshot
  // and edit error move together; the import error does not, since it names a
  // file that never loaded.
  const applyScript = useCallback(
    (text: string, opts?: { fileName?: string | null; undo?: string | null }) => {
      latestScriptReadRef.current++;
      setScriptText(text);
      setScriptFileName(opts?.fileName ?? null);
      setGestureUndo(opts?.undo ?? null);
      setScriptEditError(null);
    },
    [setScriptText],
  );

  // Typing also dismisses the script import error, as in the subtitle textarea.
  const onScriptTextEdit = useCallback(
    (text: string) => {
      applyScript(text);
      setScriptImportError(null);
    },
    [applyScript],
  );

  const applySubtitles = useCallback(
    (text: string, fileName: string | null = null) => {
      latestSubtitleReadRef.current++;
      setSubtitleText(text);
      setSubtitleFileName(fileName);
      setSubtitleImportError(null);
    },
    [setSubtitleText],
  );

  const onImportScript = useCallback(
    (file: File) => importTextFile(
      file,
      latestScriptReadRef,
      (text, fileName) => applyScript(text, { fileName }),
      setScriptImportError,
    ),
    [applyScript],
  );

  const onImportSubtitles = useCallback(
    (file: File) => importTextFile(file, latestSubtitleReadRef, applySubtitles, setSubtitleImportError),
    [applySubtitles],
  );

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
      const next = Math.min(duration, clock.get() + dt * speed);
      clock.set(next);
      // Also stops a playhead that was sought or clamped onto the end.
      if (next >= duration) setPlaying(false);
      raf = requestAnimationFrame(tick);
    }
    let raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clock, playing, speed, duration]);

  const { scriptErrors, snapshots, rejectedEventIndexes } = worldBuild;

  // The two things outside the board column that follow the clock, each as an
  // index that changes only when the playhead crosses an event.
  // The side panel is unmounted in present mode, so nothing reads this then.
  const reachedEventIndex = useClockValue(clock, (t) =>
    present ? -1 : lastEventIndexAt(events, t),
  );
  // During a successful `rp`, Present highlights the replayed source move.
  const showPresentPgn = present && presentPgn;
  const presentationEventIndex = useClockValue(clock, (t) => {
    if (!showPresentPgn) return -1;
    const reached = lastEventIndexAt(events, t);
    return worldFrameAt(worldBuild, reached, t).replaySourceEventIndex ?? reached;
  });

  const errorLines = useMemo(
    () => new Set(scriptErrors.map((er) => er.line)),
    [scriptErrors],
  );

  // Event-anchored seek: playing lands on t; paused lands just past t, clamped
  // before the next event. Freshly written lines are not in `events` yet, so
  // those callers pass their own boundary to landBetween.
  const seekEvent = useCallback(
    (t: number) => {
      clock.set(
        playingRef.current ? t : landBetween(t, events[lastEventIndexAt(events, t) + 1]?.t),
      );
    },
    [clock, events],
  );

  // Commit path for every programmatic edit: keeps the prior text as undo and,
  // while paused, lands the playhead at `landT`.
  const commitScriptEdit = useCallback(
    (next: string, landT?: number) => {
      applyScript(next, { undo: scriptText });
      if (landT != null && !playingRef.current) clock.set(landT);
    },
    [clock, scriptText, applyScript],
  );

  // A gesture is stale when the script changed between pointer-down and up:
  // its plan would target text it never previewed.
  const gestureIsStale = (): boolean => {
    if (scriptTextRef.current === scriptText) return false;
    setScriptEditError(SCRIPT_CHANGED_DURING_GESTURE_ERROR);
    return true;
  };

  // The one way a planner's edit reaches React.
  const applyEditPlan = (plan: ScriptEditPlan) => {
    if (plan.kind === 'conflict') setScriptEditError(plan.error);
    else commitScriptEdit(plan.text, landBetween(plan.t, plan.nextT));
  };

  // Each board gesture becomes one script line, stamped at the frame it was
  // drawn on; stamping policy lives in planLineInsert.
  const recordGestureLine = (body: string, time: number) => {
    if (gestureIsStale()) return;
    applyEditPlan(planLineInsert(events, scriptText, time, body));
  };

  // Stable for the memoized side panel; the call reads the playhead and
  // script current at click time.
  const recordGestureLineRef = useLatest(recordGestureLine);
  const onInsert = useCallback(
    (body: string) => recordGestureLineRef.current(body, clock.get()),
    [clock, recordGestureLineRef],
  );

  // Gesture feedback has one home: the edit error the planners write to.
  const onMoveRejected = (from: string, time: number, chessState: Chess.GameState) => {
    const reason = Chess.explainNoMoves(chessState, from);
    if (!reason) return;
    setScriptEditError(`Can't move from ${from} at ${fmtTime(time, 'always')}: ${reason}.`);
  };

  // Chess resolution happens here against the drawn position; the
  // branch-aware policy is planMoveGesture's.
  const onMoveGesture = (from: string, to: string, time: number, chessState: Chess.GameState) => {
    if (gestureIsStale()) return;
    const candidates = Chess.movesBetween(chessState, from, to);
    // Promotion records a queen; underpromotion stays a hand edit.
    const mv = candidates.find((m) => !m.promotion || m.promotion === 'q');
    if (!mv) return;
    const san = Chess.sanForMove(chessState, mv);
    const matchesScripted = (scriptedSan: string) => {
      const scripted = Chess.parseSAN(scriptedSan, chessState);
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

  // Retimes are free-form: the script re-sorts when an edit crosses other
  // events, and structural damage surfaces as script errors.
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

  const pauseToggle = useCallback(() => {
    if (clock.get() >= duration) {
      clock.set(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  }, [clock, duration]);

  // Shared by the header and present-mode export buttons.
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

  // Present-mode chrome hides after pointer idle during playback and re-arms
  // on play/pause. `arm` sets state only when hidden, so a stream of
  // pointermoves never re-renders App.
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
    // A stationary tap fires no pointermove; listening on window lets a tap
    // reveal the hidden, pointer-inert bar.
    window.addEventListener('pointerdown', arm, { passive: true });
    window.addEventListener('focusin', arm);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', arm);
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('focusin', arm);
    };
  }, [present, playing]);

  // The one transport keymap, shared by the window listener and the scrub
  // input (and documented in the footer). Callers own preventDefault.
  const handleTransportKey = useCallback(
    (e: { code: string; repeat: boolean }): boolean => {
      if (e.code === 'Space') {
        if (!e.repeat) pauseToggle();
        return true;
      }
      if (e.code === 'ArrowLeft') {
        clock.set((t) => Math.max(0, t - 1));
        return true;
      }
      if (e.code === 'ArrowRight') {
        clock.set((t) => Math.min(duration, t + 1));
        return true;
      }
      return false;
    },
    [clock, pauseToggle, duration],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Escape exits present mode from anywhere, since the Exit button may be
      // faded; unguarded so `present` stays out of the deps.
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
      // Only Space's page scroll is suppressed; arrows keep native scrolling.
      if (e.code === 'Space') e.preventDefault();
      handleTransportKey(e);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleTransportKey]);

  const toggleMoveSound = useCallback(
    () => setMoveSoundDraft((v) => (moveSoundEnabled(v) ? '0' : '1')),
    [setMoveSoundDraft],
  );

  return (
    <div
      className={`app${present ? ' app--present' : ''}${
        showPresentPgn ? ' app--present-pgn' : ''
      }${present && chromeHidden ? ' app--idle' : ''}${RENDER_MODE ? ' app--render' : ''}`}
    >
      {/* Driven entirely by the playback clock (useNarration). */}
      {narration && <audio ref={narrationTrack.audioRef} src={narration.url} preload="auto" />}
      <div className="sr-only" role="status" aria-live="polite">
        {exporting && 'Exporting board PNG.'}
        {boardExport.status === 'success' && 'Board PNG downloaded.'}
        {boardExportError}
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

      <main className="main">
        <BoardColumn
          clock={clock}
          boardRef={boardRef}
          events={events}
          asks={asks}
          worldBuild={worldBuild}
          errorLines={errorLines}
          subtitleCues={subtitleCues}
          duration={duration}
          orientation={orientation}
          editable={tab === 'script' && !present}
          playing={playing}
          onPauseToggle={pauseToggle}
          onSeek={seekEvent}
          onTransportKey={handleTransportKey}
          speed={speed}
          onSpeed={setSpeed}
          moveSoundOn={moveSoundOn}
          onToggleMoveSound={toggleMoveSound}
          onGestureLine={recordGestureLine}
          onMoveGesture={onMoveGesture}
          onMoveRejected={onMoveRejected}
          presentControls={
            // Present-only controls ride the floating transport and auto-hide
            // with it.
            present && (
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
            )
          }
        />

        {showPresentPgn && (
          <PresentationMoves
            events={events}
            snapshots={snapshots}
            reachedEventIndex={presentationEventIndex}
            rejectedEventIndexes={rejectedEventIndexes}
          />
        )}

        {/* Unmounted, not hidden, in present mode; all its state lives in App. */}
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
            clock={clock}
            fenText={fenText}
            onFenText={setFenText}
            orientation={orientation}
            onOrientation={setOrientation}
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
