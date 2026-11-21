// The piece click: derived from the frame's last move, never fired by an event.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load, worldWithEvents } from './support.mjs';

const { lastEventIndexAt } = await load('/src/lib/timeline.ts');
const { worldFrameAt } = await load('/src/lib/world.ts');
const { moveSoundEnabled, moveSoundKey, shouldPlayMoveSound } = await load('/src/lib/moveSound.ts');

const soundScript = '[1] e4\n[2] e5\n[3] hl e4\n[4] rs\n[5] Nf3';
const sound = worldWithEvents(soundScript);
const soundKeyAt = ({ events, world }, t) =>
  moveSoundKey(worldFrameAt(world, lastEventIndexAt(events, t), t).snapshot.lastMove);

test('the key names the move on the board, not the event behind it', async () => {
  assert.equal(soundKeyAt(sound, 0), null, 'a board before its first move names no move');
  assert.equal(
    shouldPlayMoveSound(null, soundKeyAt(sound, 0), true),
    false,
    'loading the app is not a move landing',
  );
  assert.equal(
    soundKeyAt(sound, 1.2),
    soundKeyAt(sound, 1.9),
    'two frames inside one move are the same move',
  );
  assert.equal(
    soundKeyAt(sound, 2.5),
    soundKeyAt(sound, 3.5),
    'an annotation event does not re-land the move under it',
  );
  assert.equal(
    shouldPlayMoveSound(soundKeyAt(sound, 1.5), soundKeyAt(sound, 2.5), true),
    true,
    'crossing into the next move clicks',
  );
  assert.equal(
    soundKeyAt(sound, 4.5),
    null,
    'a reset leaves no move to name, so the rewound board stays silent',
  );
});

test('a scrub across many moves clicks once', async () => {
  // One comparison between where the playhead left and where it landed.
  const scrubbed = soundKeyAt(sound, 5.5);
  assert.equal(shouldPlayMoveSound(soundKeyAt(sound, 0), scrubbed, true), true);
  assert.equal(
    shouldPlayMoveSound(scrubbed, soundKeyAt(sound, 5.9), true),
    false,
    'the frames after a scrub landing must not re-fire it',
  );
});

test('rebuilding the same script re-derives the same key', async () => {
  // An identity key would click at every keystroke. Built independently, never
  // from `sound` itself: the assertion is about the rebuild.
  assert.equal(
    soundKeyAt(worldWithEvents(soundScript), 2.5),
    soundKeyAt(sound, 2.5),
    'rebuilding the same script re-derives the same move key',
  );
});

test('a replayed move is a new landing', async () => {
  // Keying on squares alone would silence every replayed move.
  const replaySound = worldWithEvents('[1] e4\n[2] e5\n[3] rp');
  assert.equal(
    shouldPlayMoveSound(soundKeyAt(replaySound, 1.5), soundKeyAt(replaySound, 3), true),
    true,
    'a replayed move is a new landing, not the same one held',
  );
  assert.equal(
    shouldPlayMoveSound(soundKeyAt(replaySound, 3), soundKeyAt(replaySound, 3.5 + 0.1), true),
    true,
    'each replay step lands its own move — the exact boundary still holds the outgoing one',
  );
});

test('muting gates the click, not the latch', async () => {
  // The flag lives inside the predicate so the latch keeps advancing while
  // muted; wrapping the call would make unmuting click a long-parked move.
  const mutedLanding = [soundKeyAt(sound, 1.5), soundKeyAt(sound, 2.5)];
  assert.equal(
    shouldPlayMoveSound(...mutedLanding, true),
    true,
    'the same landing that clicks unmuted...',
  );
  assert.equal(
    shouldPlayMoveSound(...mutedLanding, false),
    false,
    '...is silent while muted',
  );
  assert.equal(
    shouldPlayMoveSound(mutedLanding[1], mutedLanding[1], true),
    false,
    'and unmuting on a move already latched does not replay it',
  );
});

test('the mute draft defaults to on', async () => {
  // Only '0' mutes: a corrupt entry read as muted would yield a silent
  // recording with nothing on screen to explain why.
  assert.equal(moveSoundEnabled('1'), true, "'1' is the stored on value");
  assert.equal(moveSoundEnabled('0'), false, "'0' is the only muting value");
  for (const junk of ['', 'true', 'false', '00', ' 0']) {
    assert.equal(
      moveSoundEnabled(junk),
      true,
      `a draft of ${JSON.stringify(junk)} falls back to the sound being on`,
    );
  }
});
