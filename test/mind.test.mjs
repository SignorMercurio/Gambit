// Mind's-eye visibility curves, all derived from the playback clock.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load } from './support.mjs';

const { mindPieceStrength, mindRevealStrength, mindSink } = await load('/src/lib/mind.ts');

test('the void sinks on the clock and stays saturated', async () => {
  // Never a CSS transition: that runs on wall time, so a paused scrub across
  // `mind` would depend on how the playhead arrived, not on script + FEN + time.
  const mindAt = (t) =>
    mindSink({ since: 10, touches: new Map(), held: new Set() }, Number.NEGATIVE_INFINITY, t);
  assert.equal(mindAt(10), 0, 'the void starts lit at the mind event');
  assert.equal(mindAt(10.6), 1, 'and is fully sunk one ramp later');
  assert.equal(mindAt(999), 1, 'and stays sunk for the rest of the phase');
  assert.ok(mindAt(10.3) > 0 && mindAt(10.3) < 1, 'the mid-ramp is a real ramp');
  // A reset inside mind mode empties the sketch but must not re-sink the
  // board: `since` is the phase clock, so the depth stays saturated.
  assert.equal(mindAt(20), 1, 'a later frame in the same phase is still fully dark');
});

test('reveal mirrors the sink, and a script that never darkens stays lit', async () => {
  assert.equal(mindSink(null, 5, 5), 1, 'reveal starts from the fully sunk void');
  assert.equal(mindSink(null, 5, 5.6), 0, 'and lifts over the same ramp');
  assert.equal(mindSink(null, Number.NEGATIVE_INFINITY, 0), 0, 'never-darkened boards are lit');
  assert.equal(mindRevealStrength(5, 5), 0, 'pieces start hidden at reveal');
  assert.equal(mindRevealStrength(5, 5.5), 1, 'and return on the authored reveal ramp');
  assert.equal(
    mindRevealStrength(Number.NEGATIVE_INFINITY, 0),
    1,
    'pieces stay fully visible when no mind phase has occurred',
  );
});

test('the move on the board is held at full strength', async () => {
  // Gaps between moves outlast the forgetting curve, so the current move's
  // squares are rehearsed until the next move; everything else fades.
  const sketch = { touches: new Map([['e4', 10]]), rehearsed: new Set(['e4']) };
  assert.equal(mindPieceStrength(sketch, 'e4', 19), 1, 'the move on the board is never forgotten');
  const stale = { touches: new Map([['e4', 10]]), rehearsed: new Set() };
  assert.equal(mindPieceStrength(stale, 'e4', 10), 1, 'a freshly named square is at full strength');
  assert.equal(mindPieceStrength(stale, 'e4', 19), 0, 'and is gone once nothing restates it');
  assert.equal(mindPieceStrength(stale, 'd4', 10), 0, 'squares the script never named stay dark');
});
