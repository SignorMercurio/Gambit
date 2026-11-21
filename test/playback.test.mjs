// The clock store and clock policies: the ruler, the paused landing, and
// duration ceilings.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load } from './support.mjs';

const {
  landBetween,
  MAX_SAFE_PLAYBACK_SECONDS,
  MAX_SCRIPT_TIMESTAMP_SECONDS,
  playbackDuration,
  timelineTicks,
} = await load('/src/lib/playback.ts');
const { createClock } = await load('/src/lib/clock.ts');

test('timeline ticks stay readable and bounded', async () => {
  assert.deepEqual(timelineTicks(30), [0, 5, 10, 15, 20, 25, 30]);
  for (const max of [999_999_999, Number.MAX_VALUE]) {
    const ticks = timelineTicks(max);
    assert.ok(ticks.length <= 24, 'authored timestamps cannot create millions of DOM ticks');
    assert.ok(ticks.every(Number.isFinite));
    assert.equal(new Set(ticks).size, ticks.length);
  }
});

test('a paused landing stays between events and inside the clock ceiling', async () => {
  const pinchedLanding = landBetween(2, 2.1);
  assert.ok(pinchedLanding > 2 && pinchedLanding < 2.1);
  assert.equal(
    landBetween(MAX_SAFE_PLAYBACK_SECONDS),
    MAX_SAFE_PLAYBACK_SECONDS,
    'tail landing cannot advance beyond the formatter/clock arithmetic boundary',
  );
  assert.ok(
    landBetween(MAX_SCRIPT_TIMESTAMP_SECONDS) > MAX_SCRIPT_TIMESTAMP_SECONDS,
    'the latest authored event retains a visible post-event landing',
  );
  assert.equal(
    playbackDuration(MAX_SCRIPT_TIMESTAMP_SECONDS),
    MAX_SAFE_PLAYBACK_SECONDS,
    'the authored ceiling reserves the full three-second script tail',
  );
});

test('the clock notifies subscribers only when the time changes', async () => {
  const clock = createClock();
  const seen = [];
  const unsubscribe = clock.subscribe(() => seen.push(clock.get()));
  clock.set(1.5);
  clock.set(1.5);
  clock.set((t) => t + 1);
  clock.set((t) => Math.min(t, 10));
  assert.deepEqual(seen, [1.5, 2.5], 'a repeated or clamped-to-itself time is not a tick');
  unsubscribe();
  clock.set(0);
  assert.deepEqual(seen, [1.5, 2.5], 'an unsubscribed listener hears nothing');
  assert.equal(clock.get(), 0);
});
