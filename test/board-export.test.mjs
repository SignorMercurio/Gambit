// PNG export: naming, the timeout ceiling, and the abort contract.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from './support.mjs';

const { beginAnnotationGesture, beginMoveGesture } = await load('/src/lib/boardGesture.ts');
const {
  BOARD_EXPORT_SIZE,
  BOARD_EXPORT_TIMEOUT_MESSAGE,
  BOARD_GESTURE_CLASS,
  boardPngFilename,
  downloadBoardPng,
  withTimeout,
} = await load('/src/lib/boardExport.ts');
const { GestureOverlay } = await load('/src/components/Board.tsx');

test('the export is 1440px and named for the board time', async () => {
  assert.equal(BOARD_EXPORT_SIZE, 1440);
  assert.equal(boardPngFilename(12.509), 'gambit-board-00-12-50.png');
  assert.equal(boardPngFilename(72.349), 'gambit-board-01-12-34.png');
  assert.equal(boardPngFilename(Number.NaN), 'gambit-board-00-00-00.png');
});

test('an export that never settles times out', async () => {
  // The caller's `finally` waits on this promise, so without a ceiling a hung
  // rasterize never reaches the 'Retry PNG' state.
  await assert.rejects(
    () => withTimeout(new Promise(() => {}), 10, BOARD_EXPORT_TIMEOUT_MESSAGE),
    { message: BOARD_EXPORT_TIMEOUT_MESSAGE },
    'an export that never settles rejects instead of hanging forever',
  );
  assert.equal(
    await withTimeout(Promise.resolve('done'), 10_000, 'unused'),
    'done',
    'work that finishes in time passes its value straight through',
  );
});

test('the timeout clears its timer and honors abort', async () => {
  // An uncleared loser's timer keeps the process (or the tab's timer queue)
  // alive after every export.
  const liveTimers = () => process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;
  const beforeTimers = liveTimers();
  await withTimeout(Promise.resolve(1), 60_000, 'unused');
  assert.equal(
    liveTimers(),
    beforeTimers,
    'the timeout handle is cleared when the work wins the race',
  );

  {
    const controller = new AbortController();
    const pending = withTimeout(new Promise(() => {}), 60_000, 'unused', controller.signal);
    controller.abort(new Error('unmounted'));
    await assert.rejects(pending, /unmounted/);
    assert.equal(liveTimers(), beforeTimers);

    {
      const abort = new AbortController();
      let finish;
      const delayed = new Promise((resolve) => { finish = resolve; });
      let rasterizes = 0;
      const delivered = [];
      const work = downloadBoardPng({}, 0, {
        signal: abort.signal,
        exporter: { toBlob: () => { rasterizes++; return delayed; } },
        deliver: (blob) => delivered.push(blob),
      });
      await Promise.resolve();
      abort.abort();
      finish({});
      await work;
      assert.deepEqual(delivered, [], 'abort during rasterize prevents late delivery');
      assert.equal(rasterizes, 1);
    }
  }
});

test('an abandoned export delivers nothing', async () => {
  // Timing out abandons the rasterize but cannot cancel it. Both impure steps
  // are seams, so this exercises the contract instead of grepping the source.
  {
    const fakeBlob = { size: 1 };
    const runExport = async (aborted) => {
      const delivered = [];
      const controller = new AbortController();
      if (aborted) controller.abort();
      await downloadBoardPng({}, 12.5, {
        signal: controller.signal,
        exporter: { toBlob: async () => fakeBlob },
        deliver: (blob, filename) => delivered.push({ blob, filename }),
      });
      return delivered;
    };
    assert.deepEqual(
      await runExport(true),
      [],
      'an abandoned export delivers nothing, however late it settles',
    );
    assert.deepEqual(
      await runExport(false),
      [{ blob: fakeBlob, filename: 'gambit-board-00-12-50.png' }],
      'a live export delivers exactly one file, named for the board time',
    );
    await assert.rejects(
      downloadBoardPng({}, 0, {
        exporter: { toBlob: async () => null },
        deliver: () => {
          throw new Error('delivered an empty PNG');
        },
      }),
      /empty PNG/,
      'an empty rasterize is an error, not a silent no-op',
    );
  }
});

test('the gesture preview carries the class a snapshot removes', async () => {
  // The class is the snapshot's only hook on the editor-only preview; both
  // gesture kinds are checked.
  {
    const previewOwner = { pointerId: 1, buttonBit: 2 };
    const previews = [
      beginAnnotationGesture(previewOwner, 'e4', () => {}, () => {}),
      beginMoveGesture(previewOwner, 'g1', new Set(['f3']), () => {}),
    ].map((gesture) =>
      renderToStaticMarkup(
        createElement(GestureOverlay, { gesture, positions: {}, orientation: 'white' }),
      ),
    );
    for (const preview of previews) {
      const wrapper = preview.slice(0, preview.indexOf('>') + 1);
      assert.match(wrapper, /^<svg /, 'the gesture preview renders as one wrapper element');
      assert.ok(
        wrapper.includes(`class="${BOARD_GESTURE_CLASS}"`),
        'and that wrapper carries the class the snapshot removes it by',
      );
    }
  }
});
