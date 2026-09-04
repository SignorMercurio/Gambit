// Small pure playback policies shared by the React transport and regression
// tests. These functions describe clock behavior; they do not own clock state.

export type PlayState = 'play' | 'pause' | 'replay';

// Every formatter and generated script line works in deciseconds. Keeping
// accepted playback times within this arithmetic boundary prevents `t * 10`
// from overflowing or losing integer identity while remaining far beyond any
// plausible recording duration.
export const MAX_SAFE_PLAYBACK_SECONDS = Number.MAX_SAFE_INTEGER / 10;
const SCRIPT_TAIL_SECONDS = 3;
const SUBTITLE_TAIL_SECONDS = 1;
export const MAX_SCRIPT_TIMESTAMP_SECONDS =
  MAX_SAFE_PLAYBACK_SECONDS - SCRIPT_TAIL_SECONDS;
export const MAX_SUBTITLE_TIMESTAMP_SECONDS =
  MAX_SAFE_PLAYBACK_SECONDS - SUBTITLE_TAIL_SECONDS;

export function isValidScriptTimestamp(time: number): boolean {
  return Number.isFinite(time) && time >= 0 && time <= MAX_SCRIPT_TIMESTAMP_SECONDS;
}

export function playbackDuration(
  lastEventTime = 0,
  subtitleEnd = 0,
  narrationDuration = 0,
): number {
  return Math.min(
    MAX_SAFE_PLAYBACK_SECONDS,
    Math.max(
      30,
      lastEventTime + SCRIPT_TAIL_SECONDS,
      subtitleEnd + SUBTITLE_TAIL_SECONDS,
      narrationDuration,
    ),
  );
}

export function playStateAt(
  playing: boolean,
  time: number,
  duration: number,
): PlayState {
  if (playing) return 'pause';
  return time >= duration ? 'replay' : 'play';
}

// Paused event seeks land just after the event so age-based visuals are
// visible, while staying strictly before the next distinct event.
export function landBetween(t: number, nextT?: number): number {
  if (nextT == null) return Math.min(MAX_SAFE_PLAYBACK_SECONDS, t + 0.5);
  const gap = nextT - t;
  return Math.min(
    MAX_SAFE_PLAYBACK_SECONDS,
    t + Math.min(0.5, Math.max(gap - 0.05, gap / 2)),
  );
}

const MAX_TIMELINE_TICKS = 24;

function baseTickInterval(duration: number): number {
  if (duration > 180) return 60;
  if (duration > 90) return 30;
  if (duration > 60) return 15;
  if (duration > 30) return 10;
  return 5;
}

// Round an interval up to a readable 1/2/5 × 10^n step.
function niceInterval(minimum: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(minimum));
  const normalized = minimum / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export function timelineTicks(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [0];
  const minimumInterval = duration / (MAX_TIMELINE_TICKS - 1);
  const interval = Math.max(
    baseTickInterval(duration),
    niceInterval(minimumInterval),
  );
  const ticks: number[] = [];
  const count = Math.min(MAX_TIMELINE_TICKS - 1, Math.floor(duration / interval));
  for (let i = 0; i <= count; i++) {
    const t = i * interval;
    ticks.push(t <= MAX_SAFE_PLAYBACK_SECONDS ? Math.round(t * 10) / 10 : t);
  }
  return ticks;
}
