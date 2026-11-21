// The piece click: a side effect derived from the rendered `lastMove`, never a
// second copy of board state. The ref in `useMoveSound` is a latch, not state.
// It compares a string key, not object identity, because `buildWorld`
// re-derives fresh snapshots on every keystroke.

import { useEffect, useRef } from 'react';
import type { LastMove } from './world';

const MOVE_SOUND_URL = '/sounds/move.mp3';
// A round-robin pool: at 4× moves can land closer than the sample is long, and
// restarting one element would cut the previous click off.
const PLAYER_COUNT = 4;
// Sits under a narration voice in the recording.
const VOLUME = 0.5;

let players: HTMLAudioElement[] | null = null;
let nextPlayer = 0;
// Offline video render (src/lib/renderMode.ts) takes the click instead of the
// speakers, so the renderer can mix it at the frame it landed on.
let sink: (() => void) | null = null;

export function setMoveSoundSink(next: (() => void) | null): void {
  sink = next;
}

function playMoveSound(): void {
  if (sink) return sink();
  // Lazy: test/move-sound.test.mjs imports this module without a DOM.
  players ??= Array.from({ length: PLAYER_COUNT }, () => {
    const audio = new Audio(MOVE_SOUND_URL);
    audio.preload = 'auto';
    audio.volume = VOLUME;
    return audio;
  });
  const player = players[nextPlayer];
  nextPlayer = (nextPlayer + 1) % PLAYER_COUNT;
  player.currentTime = 0;
  // A refused play, missing device or bad sample costs the click and nothing else.
  void player.play().catch(() => undefined);
}

type MoveSoundKey = string | null;

// Identity of the move on the board. Includes the timestamp because a script
// can play the same move twice (e.g. an `rp` replay).
export function moveSoundKey(lastMove: LastMove | null): MoveSoundKey {
  if (!lastMove) return null;
  return `${lastMove.fromF}${lastMove.fromR}${lastMove.toF}${lastMove.toR}@${lastMove.t}`;
}

export function shouldPlayMoveSound(
  previous: MoveSoundKey,
  current: MoveSoundKey,
  enabled: boolean,
): boolean {
  return enabled && current !== null && previous !== current;
}

// The persisted mute flag ('0'/'1'). Only the exact '0' mutes; any other
// stored value keeps the default of sound on.
export function moveSoundEnabled(draft: string): boolean {
  return draft !== '0';
}

/**
 * Click once per move the board arrives at: the first frame, a rewind to no
 * move, and re-renders are silent, and a scrub clicks once. `enabled` gates the
 * click, never the latch, so unmuting does not replay the current move.
 */
export function useMoveSound(key: MoveSoundKey, enabled: boolean): void {
  const previous = useRef<MoveSoundKey>(key);

  useEffect(() => {
    const play = shouldPlayMoveSound(previous.current, key, enabled);
    previous.current = key;
    if (play) playMoveSound();
  }, [key, enabled]);
}
