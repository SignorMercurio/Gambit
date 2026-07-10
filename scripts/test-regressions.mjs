import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({
  root: process.cwd(),
  configFile: false,
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
});

try {
  const { parseScript } = await vite.ssrLoadModule('/src/lib/timeline.ts');
  const { nextFreeTime, planLineInsert, planMoveGesture } = await vite.ssrLoadModule(
    '/src/lib/scriptEdit.ts',
  );
  const { beginAnnotationGesture, beginMoveGesture, finishBoardGesture } =
    await vite.ssrLoadModule('/src/lib/boardGesture.ts');

  const saturated = '[00:00.0] e4\n[00:00.1] e5';
  const events = parseScript(saturated);

  assert.equal(
    nextFreeTime(saturated, 0.05, 0.1),
    null,
    'a saturated interval must not overflow past the next event',
  );

  const linePlan = planLineInsert(events, saturated, 0.05, 'hl e4');
  assert.equal(linePlan.kind, 'conflict');
  assert.match(linePlan.error, /no free 0\.1s slot/i);

  const movePlan = planMoveGesture(events, saturated, 0.05, 'Nf3', () => false);
  assert.equal(movePlan.kind, 'conflict');

  const roomy = '[00:00.0] e4\n[00:01.0] e5';
  const roomyPlan = planLineInsert(parseScript(roomy), roomy, 0.05, 'hl e4');
  assert.equal(roomyPlan.kind, 'edit');
  assert.equal(roomyPlan.t, 0.1);

  const moveCalls = [];
  let currentMoveCommit = (from, to) => moveCalls.push(`start:${from}-${to}`);
  const moveGesture = beginMoveGesture('g1', new Set(['f3']), currentMoveCommit);
  currentMoveCommit = (from, to) => moveCalls.push(`latest:${from}-${to}`);
  finishBoardGesture(moveGesture, 'f3');
  assert.deepEqual(
    moveCalls,
    ['start:g1-f3'],
    'pointer-up must use the callback captured at pointer-down',
  );

  const annotationCalls = [];
  let currentArrowCommit = (from, to) => annotationCalls.push(`start-arrow:${from}-${to}`);
  const annotationGesture = beginAnnotationGesture(
    'c4',
    currentArrowCommit,
    (square) => annotationCalls.push(`start-highlight:${square}`),
  );
  currentArrowCommit = (from, to) => annotationCalls.push(`latest-arrow:${from}-${to}`);
  finishBoardGesture(annotationGesture, 'f7');
  assert.deepEqual(annotationCalls, ['start-arrow:c4-f7']);

  // Keep reassigned callbacks live so the test proves snapshotting rather
  // than passing because an optimizer erased unused assignments.
  assert.equal(typeof currentMoveCommit, 'function');
  assert.equal(typeof currentArrowCommit, 'function');
} finally {
  await vite.close();
}

console.log('regression tests passed');
