// The board column: the board, the subtitle strip and the transport. It is the
// one subtree that follows the playback clock frame by frame; `App` and the
// editor panel re-render only when state or the reached event changes.

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { AskCard } from './AskCard';
import { Board } from './Board';
import { useRovingTabIndex } from './useRovingTabIndex';
import type { BoardOrientation } from '../lib/boardOrientation';
import type { GameState } from '../lib/chess';
import { useClockTime, type Clock } from '../lib/clock';
import { moveSoundKey, useMoveSound } from '../lib/moveSound';
import { timelineTicks } from '../lib/playback';
import { formatSubtitleText, getActiveSubtitle, type SubtitleCue } from '../lib/subtitles';
import { activeAskAt, fmtTime, type TimelineEvent } from '../lib/timeline';
import { markerColors, markerForms, markerKindFor } from '../lib/tokens';
import { worldFrameAtTime, type WorldBuild } from '../lib/world';

type PlayState = 'play' | 'pause' | 'replay';

// Transport glyphs live at module scope: this column re-renders every playback
// frame, and a stable element identity lets React bail out of the subtree.
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

type BoardColumnProps = {
  clock: Clock;
  boardRef: { current: HTMLDivElement | null };
  events: TimelineEvent[];
  // Time-sorted asks only: `activeAskAt` searches these every frame.
  asks: TimelineEvent[];
  worldBuild: WorldBuild;
  errorLines: ReadonlySet<number>;
  subtitleCues: SubtitleCue[];
  duration: number;
  orientation: BoardOrientation;
  // The Script tab outside present mode; a running replay still disables gestures.
  editable: boolean;
  playing: boolean;
  onPauseToggle: () => void;
  onSeek: (t: number) => void;
  onTransportKey: (e: { code: string; repeat: boolean }) => boolean;
  speed: number;
  onSpeed: (speed: number) => void;
  moveSoundOn: boolean;
  onToggleMoveSound: () => void;
  // Gestures pass the frame they were drawn on: Board captures these at
  // pointer-down, so a commit uses the time and position the author saw.
  onGestureLine: (body: string, time: number) => void;
  onMoveGesture: (from: string, to: string, time: number, chessState: GameState) => void;
  onMoveRejected: (from: string, time: number, chessState: GameState) => void;
  // Present-only buttons, riding the floating transport.
  presentControls: ReactNode;
};

export function BoardColumn(p: BoardColumnProps) {
  const { clock, events, duration, speed, moveSoundOn, onSpeed, onToggleMoveSound, onSeek } = p;
  const { errorLines, subtitleCues, asks } = p;
  const time = useClockTime(clock);

  // A successful `rp` selects one of its mainline frames by the clock.
  const worldFrame = worldFrameAtTime(p.worldBuild, events, time);
  const world = worldFrame.snapshot;

  // Keyed by the drawn frame, not the event behind it, so every landing sounds
  // through one rule.
  useMoveSound(moveSoundKey(world.lastMove), moveSoundOn);

  const activeSubtitle = getActiveSubtitle(subtitleCues, time);
  const activeSubtitleText = activeSubtitle ? formatSubtitleText(activeSubtitle.text) : '';
  // A live question card takes the subtitle strip; an overlapping cue yields.
  const activeAsk = activeAskAt(asks, time);

  // Clock-independent rows are memoized so a tick skips them.
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
  // Rate and SFX share one wrapper: the transport grid names one cell per
  // child, so a second bare child would auto-place into a free cell.
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
              onClick={() => onSpeed(s)}
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
          onClick={onToggleMoveSound}
        >
          SFX
        </button>
      </div>
    ),
    [speed, moveSoundOn, onSpeed, onToggleMoveSound],
  );

  const playState: PlayState = p.playing ? 'pause' : time >= duration ? 'replay' : 'play';
  const playLabel = PLAY_LABELS[playState];
  const currentTimeText = fmtTime(time, 'always');
  const durationText = fmtTime(duration, 'always');
  const timeRangeText = `${currentTimeText} of ${durationText}`;

  // One roving tab stop for the whole pin row (toolbar pattern): arrows walk
  // pins, Tab leaves the row.
  const pinsRoving = useRovingTabIndex<HTMLDivElement>('.marker');

  // Error lines pin too, so a broken line can be seen and sought.
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
          // FEN) are move/fen events whose line the world walk rejected.
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
              onClick={() => onSeek(e.t)}
              style={{
                left: `${(e.t / duration) * 100}%`,
                color: markerColors[kind],
              }}
            />
          );
        })}
      </div>
    ),
    [events, errorLines, duration, onSeek, pinsRoving],
  );

  return (
    <div className="board-col">
      <Board
        boardRef={p.boardRef}
        positions={world.positions}
        lastMove={world.lastMove}
        highlights={world.highlights}
        arrows={world.arrows}
        captureFlash={world.lastCapture}
        check={world.check}
        mind={world.mind}
        revealedAt={world.revealedAt}
        time={time}
        orientation={p.orientation}
        interactive={p.editable && worldFrame.replaySourceEventIndex === null}
        chessState={world.chessState}
        onMoveRejected={(from) => p.onMoveRejected(from, time, world.chessState)}
        onMoveGesture={(from, to) => p.onMoveGesture(from, to, time, world.chessState)}
        onArrowGesture={(from, to) => p.onGestureLine(`${from}->${to}`, time)}
        onHighlightGesture={(sq) => p.onGestureLine(`hl ${sq}`, time)}
      />

      <div
        className={`subtitle-strip ${activeAsk ? 'is-ask' : activeSubtitle ? '' : 'is-empty'} ${
          // A script with questions needs the subtitle track even without an SRT.
          subtitleCues.length === 0 && asks.length === 0 ? 'no-track' : ''
        }`}
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
          onClick={p.onPauseToggle}
          aria-label={`${playLabel} (space)`}
        >
          {PLAY_GLYPHS[playState]}
        </button>
        {/* Rewind keeps the play state; the play button owns replay from
           the end. */}
        <button
          type="button"
          className="ctrl-btn"
          onClick={() => clock.set(0)}
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
            onChange={(e) => clock.set(parseFloat(e.target.value))}
            onKeyDown={(e) => {
              // Scrubbing parks focus here and the window shortcuts skip
              // inputs, so the keymap is mirrored over the native arrows.
              if (p.onTransportKey(e)) e.preventDefault();
            }}
            className="scrub-input"
            aria-label="Timeline position"
            aria-valuetext={timeRangeText}
          />
        </div>

        {transportPrefs}

        {p.presentControls}
      </div>
    </div>
  );
}
