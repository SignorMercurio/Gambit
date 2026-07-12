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

  // The paused playhead parks 0.05s before the next event (the landing
  // convention), and Math.round half-up puts that on the cap's decisecond.
  // The clamp must step back to the free slot below — not report a spurious
  // conflict while room remains.
  assert.equal(
    nextFreeTime('[00:00.0] e4\n[00:00.5] e5', 0.45, 0.5),
    0.4,
    'a playhead parked just under the next event must still find the slot below it',
  );

  // Off-grid timestamps sharing a decisecond: grid rounding must never slip
  // the stamp back across the previous event (it would execute against a
  // position the gesture never previewed), so a pinched interval is an
  // explicit conflict.
  const offGrid = '[0:05.16] Nf3\n[0:05.24] hl e4';
  const offGridPlan = planLineInsert(parseScript(offGrid), offGrid, 5.2, 'hl d5');
  assert.equal(
    offGridPlan.kind,
    'conflict',
    'a stamp must never sort before the previous scripted event',
  );

  // Branch-aware policy: replaying the scripted next move only seeks —
  // nothing is written.
  const mainline = '[00:01.0] e4\n[00:03.0] Nc6';
  const mainlineEvents = parseScript(mainline);
  assert.deepEqual(planMoveGesture(mainlineEvents, mainline, 2, 'Nc6', (san) => san === 'Nc6'), {
    kind: 'seek',
    t: 3,
  });

  // A different move wraps itself in a br/ml variation: exactly three new
  // lines, the move stamped on the playhead, and the result round-trips
  // through parseScript without errors.
  const wrapPlan = planMoveGesture(mainlineEvents, mainline, 2, 'c5', () => false);
  assert.equal(wrapPlan.kind, 'edit');
  assert.equal(wrapPlan.t, 2);
  assert.equal(wrapPlan.text.split('\n').length, mainline.split('\n').length + 3);
  assert.match(wrapPlan.text, /^\[00:01\.9\] br$/m);
  assert.match(wrapPlan.text, /^\[00:02\] c5$/m);
  assert.match(wrapPlan.text, /^\[00:02\.5\] ml$/m);
  assert.deepEqual(parseScript(wrapPlan.text).filter((e) => 'error' in e), []);

  // A move while a variation is open extends it, pushing the variation's ml
  // later when the new move would land on or past it — the one sanctioned
  // rewrite of an existing line.
  const variation = '[00:01.0] e4\n[00:02.0] br\n[00:03.0] Nf6\n[00:04.0] ml\n[00:06.0] Nc6';
  const extendPlan = planMoveGesture(parseScript(variation), variation, 3.95, 'd4', () => false);
  assert.equal(extendPlan.kind, 'edit');
  assert.equal(extendPlan.t, 4.1);
  assert.equal(extendPlan.nextT, 5.1, 'the paused landing must stop short of the pushed ml');
  assert.match(extendPlan.text, /^\[00:04\.1\] d4$/m);
  assert.match(extendPlan.text, /^\[00:05\.1\] ml$/m);
  assert.deepEqual(parseScript(extendPlan.text).filter((e) => 'error' in e), []);

  // finishBoardGesture commit routing: a move commits only onto a legal
  // target square, and an annotation resolves to a highlight on its own
  // square, an arrow elsewhere, nothing off-board.
  const moveCalls = [];
  const moveGesture = beginMoveGesture('g1', new Set(['f3']), (from, to) =>
    moveCalls.push(`${from}-${to}`),
  );
  finishBoardGesture(moveGesture, 'e5'); // not a legal target
  finishBoardGesture(moveGesture, 'g1'); // released on the origin
  finishBoardGesture(moveGesture, null); // released off-board
  finishBoardGesture(moveGesture, 'f3');
  assert.deepEqual(moveCalls, ['g1-f3'], 'a move commits only onto a legal target');

  const annotationCalls = [];
  const annotationGesture = beginAnnotationGesture(
    'c4',
    (from, to) => annotationCalls.push(`arrow:${from}-${to}`),
    (square) => annotationCalls.push(`highlight:${square}`),
  );
  finishBoardGesture(annotationGesture, null); // released off-board
  finishBoardGesture(annotationGesture, 'c4'); // same square: highlight
  finishBoardGesture(annotationGesture, 'f7'); // dragged away: arrow
  assert.deepEqual(annotationCalls, ['highlight:c4', 'arrow:c4-f7']);
} finally {
  await vite.close();
}

console.log('regression tests passed');
