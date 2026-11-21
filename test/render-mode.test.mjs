// Offline render: the handle the frame grabber drives.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load, worldWithEvents } from './support.mjs';

const { createClock } = await load('/src/lib/clock.ts');
const { installRenderHandle } = await load('/src/lib/renderMode.ts');

test('seek reports a landing by the live click rule', async (t) => {
  // The handle lives on `window` and waits on animation frames.
  globalThis.window = globalThis;
  globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  t.after(() => {
    delete globalThis.window;
    delete globalThis.requestAnimationFrame;
  });

  const { events, world } = worldWithEvents('[1] e4\n[2] e5\n[3] hl e4\n[4] rs\n[5] Nf3');
  const clock = createClock();
  const uninstall = installRenderHandle(clock, () => ({ events, worldBuild: world, duration: 5 }));
  const { seek, duration } = globalThis.gambitRender;

  assert.equal(duration(), 5);
  const landings = [];
  for (const time of [0, 1, 1.5, 2.2, 3.5, 4.5, 5]) landings.push(await seek(time));
  assert.deepEqual(
    landings,
    [false, true, false, true, false, false, true],
    'the opening frame, a frame inside a move, an annotation and a reset are silent',
  );
  assert.equal(clock.get(), 5, 'the grabber only chooses the time');

  uninstall();
  assert.equal(globalThis.gambitRender, undefined);
});
