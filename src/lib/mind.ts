// Mind's-eye domain state and playback-clock-derived visibility. Keeping this
// pure and UI-independent lets the snapshot walk own the world while Board
// remains only its renderer.

import { clamp01, timedProgress } from './animation';

export type MindWorld = {
  since: number;
  touches: ReadonlyMap<string, number>;
  // Squares named by the move currently on the board, held at full strength
  // until the next move takes over.
  held: ReadonlySet<string>;
};

export type MindFrame = {
  touches: ReadonlyMap<string, number>;
  rehearsed: ReadonlySet<string>;
};

const FRESH_SECONDS = 1.5;
const FORGET_SECONDS = 3;
const SINK_SECONDS = 0.6;
const REVEAL_SECONDS = 0.45;

// How deep the void is right now. `mind` sinks it and `reveal` lifts it on
// the playback clock, so scrubbing to the same time always produces the same
// frame instead of depending on wall-time CSS transitions.
export function mindSink(mind: MindWorld | null, revealedAt: number, time: number): number {
  if (mind) return timedProgress(time - mind.since, SINK_SECONDS);
  // Never in mind mode: revealedAt is -Infinity, so the age saturates and the
  // board reads fully lit without a sentinel branch.
  return 1 - timedProgress(time - revealedAt, SINK_SECONDS);
}

// Pieces return slightly faster than the void lifts, preserving the authored
// reveal overlap while keeping the whole effect clock-derived.
export function mindRevealStrength(revealedAt: number, time: number): number {
  return timedProgress(time - revealedAt, REVEAL_SECONDS);
}

// What is actively rehearsed stays fully visible. Everything else follows the
// linear forgetting curve so the effect remains legible rather than snapping.
export function mindPieceStrength(frame: MindFrame, square: string, time: number): number {
  if (frame.rehearsed.has(square)) return 1;
  const touched = frame.touches.get(square);
  if (touched == null) return 0;
  const age = time - touched;
  if (age < FRESH_SECONDS) return 1;
  return clamp01(1 - (age - FRESH_SECONDS) / (FORGET_SECONDS - FRESH_SECONDS));
}
