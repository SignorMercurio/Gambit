// Main app: orchestrates state from a script, drives playback,
// renders the board, the timeline scrubber, and the editor panel.

import { useState, useEffect, useRef, useMemo, useCallback, useId } from 'react';
import { Board, type CaptureFlash, type LastMove, type PiecePos } from './components/Board';
import * as Chess from './lib/chess';
import { parseScript, type ParsedEvent, type TimelineEvent } from './lib/timeline';
import { markerColors } from './lib/tokens';

type Positions = Record<string, PiecePos>;

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

function setupFromFen(fenText: string): { positions: Positions; chessState: Chess.GameState; error: string | null } {
  try {
    const chessState = fenText.trim() ? Chess.stateFromFEN(fenText) : Chess.initialState();
    return { chessState, positions: positionsFromBoard(chessState.board), error: null };
  } catch (err) {
    const chessState = Chess.initialState();
    const message = err instanceof Error ? err.message : 'Invalid FEN';
    return { chessState, positions: positionsFromBoard(chessState.board), error: message };
  }
}

function movePosition(positions: Positions, mv: Chess.Move): Positions {
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
  if (mv.capture) {
    const capF = tf;
    const capR = mv.enPassant ? fr : tr;
    for (const [k, v] of Object.entries(out)) {
      if (k === moverId) continue;
      if (!v.captured && v.f === capF && v.r === capR) {
        out[k] = { ...v, captured: true };
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
    };
  }
  if (mv.castle) {
    const homeRank = tr;
    const rookFromF = mv.castle === 'K' ? 7 : 0;
    const rookToF = mv.castle === 'K' ? 5 : 3;
    for (const [k, v] of Object.entries(out)) {
      if (!v.captured && v.f === rookFromF && v.r === homeRank && v.type === 'r') {
        out[k] = { ...v, f: rookToF };
        break;
      }
    }
  }
  return out;
}

const DEFAULT_SCRIPT = `# Chess Timeline: SAN moves, hl, arrows, cl, rs, br/ml
# Move annotations: append !! ! ? ?? to any SAN to badge the destination square.
# Persistent overlays: append \`pin\` to hl or arrow — they stay on
# screen until the next cl or rs (no auto-fade).
[00:01] e4!
[00:03] hl e4
[00:05] e2->e4
[00:07] cl
[00:08] e5?
[00:10] Nf3
[00:12] f3->e5
[00:14] Nc6
# Variation: 3.Bc4 — the Italian Game
[00:16] br
[00:18] Bc4
[00:20] c4->f7
[00:22] Bc5
# Sub-variation: 4.b4 — the Evans Gambit
[00:24] br
[00:26] b4
[00:28] hl b4
[00:30] Bxb4??
[00:32] c3
[00:34] ml
# back to Italian after 3...Bc5; play the quiet 4.c3
[00:36] c3
[00:38] ml
# back to main line after 2...Nc6; play 3.Bb5 — Ruy Lopez proper
[00:40] Bb5
[00:42] hl a6,b5,c6
[00:44] a6
[00:46] Ba4!!
[00:48] Nf6
[00:50] O-O`;

const HIGHLIGHT_LIFETIME = 2.5;
const ARROW_LIFETIME = 2.5;
const NOW_PLAYING_LIFETIME = 2.5;

// Deciseconds via `Math.floor(t*10)` avoids 9.95→10 rollover.
// `fine`: 'never' = mm:ss; 'auto' = mm:ss[.t] when fractional; 'always' = mm:ss.t.
function fmtTime(t: number, fine: 'never' | 'auto' | 'always' = 'never'): string {
  const totalDeciseconds = Math.max(0, Math.floor(t * 10));
  const totalSeconds = Math.floor(totalDeciseconds / 10);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  const tenths = totalDeciseconds % 10;
  const head = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  if (fine === 'never') return head;
  if (fine === 'auto' && tenths === 0) return head;
  return `${head}.${tenths}`;
}

const KIND_COLOR_VAR: Record<ParsedEvent['kind'], string> = {
  move: 'var(--color-studio-steel-blue)',
  highlight: 'var(--color-markup-amber)',
  arrow: 'var(--color-annotation-persimmon)',
  clear: 'var(--color-clear-marker)',
  reset: 'var(--color-studio-vermillion)',
  branch: 'var(--color-rim-light-pewter)',
  mainline: 'var(--color-rim-light-pewter)',
};

function eventBody(e: Exclude<TimelineEvent, { error: string }>): string {
  switch (e.kind) {
    case 'move':
      return e.san;
    case 'highlight':
      return e.squares.join(', ');
    case 'arrow':
      return `${e.from} → ${e.to}`;
    case 'clear':
      return 'cleared annotations';
    case 'reset':
      return 'board reset';
    case 'branch':
      return 'begin variation';
    case 'mainline':
      return 'end variation';
  }
}

function generateTicks(duration: number): number[] {
  const interval = duration > 180 ? 60 : duration > 90 ? 30 : duration > 60 ? 15 : duration > 30 ? 10 : 5;
  const ticks: number[] = [];
  for (let t = 0; t <= duration + 0.001; t += interval) ticks.push(Math.round(t * 10) / 10);
  return ticks;
}

export default function App() {
  const [scriptText, setScriptText] = useState(DEFAULT_SCRIPT);
  const [fenText, setFenText] = useState(Chess.STARTING_FEN);
  const events = useMemo(() => parseScript(scriptText), [scriptText]);
  const initialSetup = useMemo(() => setupFromFen(fenText), [fenText]);
  const duration = useMemo(() => {
    const last = events[events.length - 1];
    return Math.max(30, (last ? last.t : 0) + 3);
  }, [events]);

  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [showEditor, setShowEditor] = useState(false);

  useEffect(() => {
    setTime((t) => Math.min(t, duration));
  }, [duration]);

  const editorLabelId = useId();
  const eventsLabelId = useId();
  const replayTabId = useId();
  const scriptTabId = useId();
  const panelId = useId();
  const fenErrorId = useId();
  const replayTabRef = useRef<HTMLButtonElement>(null);
  const scriptTabRef = useRef<HTMLButtonElement>(null);

  const onTabKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      e.stopPropagation();
      const next = !showEditor;
      setShowEditor(next);
      // Match the ARIA Tabs pattern: focus follows selection on arrow keys.
      requestAnimationFrame(() => {
        (next ? scriptTabRef : replayTabRef).current?.focus();
      });
    },
    [showEditor],
  );

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

  // snapshots[0] is the initial state; snapshots[i+1] is the state AFTER
  // applying events[i]. Per-frame render binary-searches by `time` to pick the
  // current snapshot, then filters highlights/arrows by their lifetime windows.
  type WorldSnap = {
    positions: Positions;
    chessState: Chess.GameState;
    lastMove: LastMove | null;
    highlights: { sq: string; t: number; pinned?: boolean }[];
    arrows: { from: string; to: string; t: number; pinned?: boolean }[];
    lastCapture: CaptureFlash | null;
    errors: TimelineEvent[];
  };

  const snapshots = useMemo<WorldSnap[]>(() => {
    type BranchSnap = WorldSnap & {
      line: number;
      t: number;
      raw: string;
    };

    let positions = initialSetup.positions;
    let chessState = initialSetup.chessState;
    let lastMove: LastMove | null = null;
    // Rebound (not mutated) so prior snapshots share their array references.
    let highlights: { sq: string; t: number; pinned?: boolean }[] = [];
    let arrows: { from: string; to: string; t: number; pinned?: boolean }[] = [];
    let lastCapture: CaptureFlash | null = null;
    const errorAcc: TimelineEvent[] = [];
    const branchStack: BranchSnap[] = [];

    const list: WorldSnap[] = [];
    const snapshot = (errors: TimelineEvent[] = errorAcc.slice()): WorldSnap => ({
      positions,
      chessState,
      lastMove,
      highlights,
      arrows,
      lastCapture,
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
            positions = initialSetup.positions;
            chessState = initialSetup.chessState;
            lastMove = null;
            highlights = [];
            arrows = [];
            lastCapture = null;
            break;
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
            }
            break;
          }
          case 'move': {
            const mv = Chess.parseSAN(ev.san, chessState);
            if (!mv) {
              errorAcc.push({ t: ev.t, error: `Invalid move: "${ev.san}"`, line: ev.line, raw: ev.raw });
            } else {
              positions = movePosition(positions, mv);
              chessState = Chess.applyMove(chessState, mv);
              lastMove = {
                fromF: mv.from[0],
                fromR: mv.from[1],
                toF: mv.to[0],
                toR: mv.to[1],
                annotation: ev.annotation,
              };
              if (mv.capture) lastCapture = { f: mv.to[0], r: mv.to[1], t: ev.t, id: `${ev.line}` };
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
      list.push(snapshot());
    }

    return list;
  }, [events, initialSetup]);

  const world = useMemo(() => {
    // Largest i such that events[i].t <= time → snapshot index i + 1.
    // Events with t === time are applied (inclusive on the lower side).
    let lo = 0;
    let hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (events[mid].t <= time) lo = mid + 1;
      else hi = mid;
    }
    const snap = snapshots[lo];

    const visibleHighlights = snap.highlights
      .filter((h) => h.pinned || time - h.t < HIGHLIGHT_LIFETIME)
      .map((h) => h.sq);
    const visibleArrows = snap.arrows
      .filter((a) => a.pinned || time - a.t < ARROW_LIFETIME)
      .map((a) => ({ from: a.from, to: a.to }));
    const captureFlash =
      snap.lastCapture && time - snap.lastCapture.t < 0.5 ? snap.lastCapture : null;

    return {
      positions: snap.positions,
      lastMove: snap.lastMove,
      highlights: visibleHighlights,
      arrows: visibleArrows,
      errors: snap.errors,
      captureFlash,
    };
  }, [snapshots, events, time]);

  const restart = useCallback(() => {
    setTime(0);
    setPlaying(true);
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
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
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

  // Variation depth per event for the side panel's nested indent. The
  // `branch` row sits at parent depth (so it visibly opens a new level
  // beneath it), and the matching `mainline` row sits at parent depth too
  // (so closing the variation aligns with where it started).
  const eventDepths = useMemo(() => {
    const depths: number[] = [];
    let depth = 0;
    for (const e of events) {
      if ('error' in e) {
        depths.push(depth);
        continue;
      }
      if (e.kind === 'branch') {
        depths.push(depth);
        depth++;
      } else if (e.kind === 'mainline') {
        depth = Math.max(0, depth - 1);
        depths.push(depth);
      } else {
        depths.push(depth);
      }
    }
    return depths;
  }, [events]);

  // Now-Playing: most recent past non-error event within the lifetime window.
  const currentEvent = useMemo<ParsedEvent | null>(() => {
    let lo = 0;
    let hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (events[mid].t <= time) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo - 1; i >= 0; i--) {
      const e = events[i];
      if ('error' in e) continue;
      if (time - e.t >= NOW_PLAYING_LIFETIME) return null;
      return e;
    }
    return null;
  }, [events, time]);

  const playState: 'play' | 'pause' | 'replay' = playing
    ? 'pause'
    : time >= duration
    ? 'replay'
    : 'play';
  const playLabel = playState === 'pause' ? 'Pause' : playState === 'replay' ? 'Restart playback' : 'Play';

  return (
    <div className="app">
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
        <div
          className="header-actions"
          role="tablist"
          aria-orientation="horizontal"
          aria-label="Side panel mode"
          onKeyDown={onTabKeyDown}
        >
          <button
            type="button"
            role="tab"
            id={replayTabId}
            aria-controls={panelId}
            aria-selected={!showEditor}
            tabIndex={showEditor ? -1 : 0}
            ref={replayTabRef}
            className="tab-btn"
            onClick={() => setShowEditor(false)}
          >
            Replay
          </button>
          <button
            type="button"
            role="tab"
            id={scriptTabId}
            aria-controls={panelId}
            aria-selected={showEditor}
            tabIndex={showEditor ? 0 : -1}
            ref={scriptTabRef}
            className="tab-btn"
            onClick={() => setShowEditor(true)}
          >
            Script
          </button>
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
          />

          <div
            className={`now-playing ${currentEvent ? '' : 'is-idle'}`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <span
              className="np-rail"
              style={
                currentEvent
                  ? { background: KIND_COLOR_VAR[currentEvent.kind] }
                  : undefined
              }
              aria-hidden="true"
            />
            {currentEvent ? (
              <>
                <span className="np-time">{fmtTime(currentEvent.t, 'auto')}</span>
                <span className={`np-kind kind-${currentEvent.kind}`}>{currentEvent.kind}</span>
                <span className="np-body">{eventBody(currentEvent)}</span>
              </>
            ) : (
              <>
                <span className="np-idle-text" aria-hidden="true">idle</span>
                <span aria-hidden="true" />
                <span aria-hidden="true" />
              </>
            )}
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
            <button type="button" className="ctrl-btn" onClick={restart} aria-label="Restart from beginning">
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
              <div className="timeline-pins">
                {eventMarkers.map((e, i) => (
                  <button
                    type="button"
                    key={i}
                    className="marker"
                    aria-label={`Seek to ${fmtTime(e.t, 'auto')}: ${e.raw}`}
                    onClick={() => setTime(e.t)}
                    style={{
                      left: `${(e.t / duration) * 100}%`,
                      color: markerColors[e.kind],
                    }}
                  />
                ))}
              </div>
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
          {showEditor ? (
            <div
              className="editor"
              role="tabpanel"
              id={panelId}
              aria-labelledby={scriptTabId}
            >
              <div className="panel-header">
                <h2 className="panel-title" id={editorLabelId}>Script</h2>
                <p className="panel-hint">
                  [mm:ss.s] SAN · hl · a1-&gt;b2 · cl · rs · br / ml
                </p>
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
              <textarea
                spellCheck={false}
                value={scriptText}
                aria-labelledby={editorLabelId}
                onChange={(e) => setScriptText(e.target.value)}
              />
              {(initialSetup.error || world.errors.length > 0) && (
                <div className="errors" role="alert" aria-live="polite">
                  {initialSetup.error && (
                    <div className="err-row">
                      <span className="err-line">FEN</span>
                      <span id={fenErrorId}>{initialSetup.error}</span>
                    </div>
                  )}
                  {world.errors.map((er, i) => (
                    <div key={i} className="err-row">
                      <span className="err-line">L{er.line}</span>
                      <span>{'error' in er ? er.error : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div
              className="moves-panel"
              role="tabpanel"
              id={panelId}
              aria-labelledby={replayTabId}
            >
              <div className="panel-header">
                <h2 className="panel-title" id={eventsLabelId}>Events</h2>
                <p className="panel-hint">{events.length} total</p>
              </div>
              <ol
                className="event-list"
                aria-labelledby={eventsLabelId}
                style={{ listStyle: 'none', margin: 0 }}
              >
                {events.map((e, i) => {
                  const past = e.t <= time;
                  const active = e.t <= time && time - e.t < 0.6;
                  const kind = 'error' in e ? 'err' : e.kind;
                  const depth = eventDepths[i] ?? 0;
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        className={`event-row ${past ? 'past' : ''} ${active ? 'active' : ''} kind-${kind}`}
                        aria-current={active ? 'step' : undefined}
                        onClick={() => setTime(e.t)}
                        style={{ ['--depth' as string]: depth } as React.CSSProperties}
                      >
                        <span className="ev-time">{fmtTime(e.t, 'auto')}</span>
                        <span className={`ev-kind kind-${kind}`}>{kind}</span>
                        <span className="ev-body">
                          {'error' in e ? e.error : eventBody(e)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </aside>
      </main>

      <footer className="footer">
        <span>Space play/pause · ←/→ ±1s · Click event or marker to seek</span>
        <span> · Staunty pieces by sadsnake1 (CC BY-NC-SA 4.0)</span>
      </footer>
    </div>
  );
}
