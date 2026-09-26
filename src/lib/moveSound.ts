// The piece click: an ephemeral side effect of the frame the clock produced,
// never a second copy of board state.
//
// The sound is derived, not fired. Nothing tells this module "a move just
// happened" — it watches the same `lastMove` the board is already rendering and
// speaks when that value changes. That is what keeps the invariant intact: the
// ref below is a "have I already said this one" latch, not state, and dropping
// it changes nothing about the frame script + FEN + time render.
//
// A string key rather than the snapshot's object identity, for the same reason.
// `buildWorld` re-derives a fresh snapshot graph on every keystroke in the
// script editor; comparing references would click at every one of them, while
// the same move at the same timestamp re-derives the same key and stays silent.

import { useEffect, useRef } from 'react';
import type { LastMove } from './world';

const MOVE_SOUND_URL = '/sounds/move.mp3';
// Round-robin pool rather than one element. At 4× a script can land moves
// closer together than the sample is long, and restarting a single element
// mid-play cuts the previous click off instead of layering it.
const PLAYER_COUNT = 4;
// Under a narration track rather than over it. The click is the board
// confirming itself, and the output of this tool is a recording with a voice
// on it; a full-level click is the loudest thing in that mix.
const VOLUME = 0.5;

let players: HTMLAudioElement[] | null = null;
let nextPlayer = 0;

function playMoveSound(): void {
  // Lazy, on first play: the regression suite imports this module without a
  // DOM for the pure policy below.
  players ??= Array.from({ length: PLAYER_COUNT }, () => {
    const audio = new Audio(MOVE_SOUND_URL);
    audio.preload = 'auto';
    audio.volume = VOLUME;
    return audio;
  });
  const player = players[nextPlayer];
  nextPlayer = (nextPlayer + 1) % PLAYER_COUNT;
  player.currentTime = 0;
  // Feedback, never a dependency. Playback in every Gambit flow starts from a
  // user gesture, so autoplay policy should not reach here — but a refused
  // play, a missing output device or an undecodable sample all arrive as this
  // rejection, and must cost the click and nothing else, least of all the
  // frame that caused it.
  void player.play().catch(() => undefined);
}

type MoveSoundKey = string | null;

// Identity of the move the board is currently showing. The timestamp is part of
// it because one script can play the same move twice — an `rp` replay re-lands
// every prior mainline move — and squares alone would turn the second one into
// silence.
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

// The mute flag's draft-string policy, in the '0'/'1' convention the other
// persisted toggles use. Sound is on by default, and the default has to win
// against anything that is not the exact off value: a truncated, foreign or
// half-written localStorage entry must not silently hand a creator a recording
// with no click in it.
export function moveSoundEnabled(draft: string): boolean {
  return draft !== '0';
}

/**
 * Speak once per move the board arrives at. The first frame is silent (nothing
 * was crossed to reach it), a reset or a rewind to the start is silent (no move
 * to name), and ordinary re-renders are silent. A scrub across ten moves lands
 * on one key and therefore clicks once rather than ten times.
 *
 * `enabled` gates the speaking, never the latch. Muting means no `play()` call
 * at all rather than a zero volume — but the "have I said this one" ref still
 * advances while muted, so unmuting speaks the *next* move rather than
 * replaying the one the playhead happens to be sitting on.
 */
export function useMoveSound(key: MoveSoundKey, enabled: boolean): void {
  const previous = useRef<MoveSoundKey>(key);

  useEffect(() => {
    const play = shouldPlayMoveSound(previous.current, key, enabled);
    previous.current = key;
    if (play) playMoveSound();
  }, [key, enabled]);
}
