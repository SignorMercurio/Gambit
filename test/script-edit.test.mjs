// Text transforms and gesture planners: every editing surface writes through these.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load, worldWithEvents, worldFrom } from './support.mjs';

const { parseScript, parseScriptLine, formatScriptTime } = await load('/src/lib/timeline.ts');
const {
  planLineInsert,
  planMoveGesture,
  removeLines,
  setLineTime,
} = await load('/src/lib/scriptEdit.ts');
const {
  MAX_SAFE_PLAYBACK_SECONDS,
  MAX_SCRIPT_TIMESTAMP_SECONDS,
} = await load('/src/lib/playback.ts');

const saturated = '[00:00.0] e4\n[00:00.1] e5';
const mainline = '[00:01.0] e4\n[00:03.0] Nc6';
const variation = '[00:01.0] e4\n[00:02.0] br\n[00:03.0] Nf6\n[00:04.0] ml\n[00:06.0] Nc6';
const planLine = (text, t, body) => planLineInsert(parseScript(text), text, t, body);
const planMove = (text, t, san, rejected = new Set(), isNext = () => false) =>
  planMoveGesture(parseScript(text), text, t, san, isNext, rejected);
const noErrors = (text) => assert.deepEqual(parseScript(text).filter((e) => 'error' in e), []);

test('a saturated grid is a conflict for lines and moves alike', async () => {
  const linePlan = planLine(saturated, 0.05, 'hl e4');
  assert.equal(linePlan.kind, 'conflict');
  assert.match(linePlan.error, /no free 0\.1s slot/i);

  const movePlan = planMove(saturated, 0.05, 'Nf3');
  assert.equal(movePlan.kind, 'conflict');
});

test('a line insert takes the next free slot and reports its landing bound', async () => {
  const roomy = '[00:00.0] e4\n[00:01.0] e5';
  const roomyPlan = planLine(roomy, 0.05, 'hl e4');
  assert.equal(roomyPlan.kind, 'edit');
  assert.equal(roomyPlan.t, 0.1);
  assert.equal(roomyPlan.nextT, 1, 'the paused landing stops short of the next scripted event');
});

test('a playhead parked just under the next event still finds the slot below', async () => {
  // The paused playhead parks 0.05s before the next event, and Math.round
  // half-up puts that on the cap's decisecond; the clamp must step back.
  const parked = '[00:00.0] e4\n[00:00.5] e5';
  const parkedPlan = planLine(parked, 0.45, 'hl e4');
  assert.equal(parkedPlan.kind, 'edit');
  assert.equal(
    parkedPlan.t,
    0.4,
    'a playhead parked just under the next event must still find the slot below it',
  );
});

test('a stamp never sorts before the previous event', async () => {
  // Off-grid neighbours share a decisecond, so rounding could slip the stamp
  // before Nf3 and run it against a position the gesture never previewed.
  const offGrid = '[0:05.16] Nf3\n[0:05.24] hl e4';
  const offGridPlan = planLine(offGrid, 5.2, 'hl d5');
  assert.equal(
    offGridPlan.kind,
    'conflict',
    'a stamp must never sort before the previous scripted event',
  );
});

test('replaying the scripted next move only seeks', async () => {
  assert.deepEqual(planMove(mainline, 2, 'Nc6', new Set(), (san) => san === 'Nc6'), {
    kind: 'seek',
    t: 3,
  });
});

test('a different move wraps itself in a br/ml variation', async () => {
  const wrapPlan = planMove(mainline, 2, 'c5');
  assert.equal(wrapPlan.kind, 'edit');
  assert.equal(wrapPlan.t, 2);
  assert.equal(wrapPlan.text.split('\n').length, mainline.split('\n').length + 3);
  assert.match(wrapPlan.text, /^\[00:01\.9\] br$/m);
  assert.match(wrapPlan.text, /^\[00:02\] c5$/m);
  assert.match(wrapPlan.text, /^\[00:02\.5\] ml$/m);
  noErrors(wrapPlan.text);
});

test('a wrap with no room is a conflict, never a plain insert', async () => {
  // A plain insert before a future SAN can leave that SAN legal for the other
  // side and silently change its meaning.
  const pinchedMainline = '[1.95] e4\n[2.2] e5';
  const pinchedPlan = planMove(pinchedMainline, 2, 'c5');
  assert.equal(pinchedPlan.kind, 'conflict');
});

test('a rejected FEN does not cut continuity', async () => {
  // The planner reads the world's applied/rejected outcome, so the future e5
  // is still protected by a full variation.
  const rejectedFenScript = '[1] e4\n[3] fen bad\n[4] e5';
  const rejectedFenPlan = planMove(rejectedFenScript, 2, 'c5', new Set([1]));
  assert.equal(rejectedFenPlan.kind, 'edit');
  assert.match(rejectedFenPlan.text, /^\[00:02\] c5$/m);
  assert.match(rejectedFenPlan.text, /\bbr$/m);
  assert.match(rejectedFenPlan.text, /\bml$/m);
});

test('a rejected SAN still protects the line after it', async () => {
  // Unlike a malformed FEN, a rejected SAN is position-dependent: a move
  // inserted before it could make it legal and silently revive the bad line.
  const rejectedMoveScript = '[3] e5';
  const rejectedMoveWorld = worldFrom(rejectedMoveScript);
  assert.deepEqual([...rejectedMoveWorld.rejectedEventIndexes], [0]);
  const rejectedMovePlan = planMove(rejectedMoveScript, 2, 'e4', rejectedMoveWorld.rejectedEventIndexes);
  assert.equal(rejectedMovePlan.kind, 'edit');
  assert.match(rejectedMovePlan.text, /\bbr$/m);
  assert.match(rejectedMovePlan.text, /\bml$/m);
  const { events: rejectedMoveAfterEvents, world: rejectedMoveAfterWorld } =
    worldWithEvents(rejectedMovePlan.text);
  const originalMoveIndex = rejectedMoveAfterEvents.findIndex(
    (event) => !('error' in event) && event.kind === 'move' && event.san === 'e5',
  );
  assert.ok(
    rejectedMoveAfterWorld.rejectedEventIndexes.has(originalMoveIndex),
    'the originally rejected SAN must remain rejected after the gesture edit',
  );
});

test('a move inside an open variation extends it and pushes its ml', async () => {
  const extendPlan = planMove(variation, 3.95, 'd4');
  assert.equal(extendPlan.kind, 'edit');
  assert.equal(extendPlan.t, 4.1);
  assert.equal(extendPlan.nextT, 5.1, 'the paused landing must stop short of the pushed ml');
  assert.match(extendPlan.text, /^\[00:04\.1\] d4$/m);
  assert.match(extendPlan.text, /^\[00:05\.1\] ml$/m);
  noErrors(extendPlan.text);
});

test('an open variation cannot overflow its restore boundary', async () => {
  const saturatedVariation =
    '[1.8] br\n[1.85] e4\n[2.0] hl a1\n[2.1] hl b1\n[2.2] ml\n[2.3] e5';
  assert.equal(
    planMove(saturatedVariation, 1.9, 'c5').kind,
    'conflict',
    'an open variation must not overflow its mainline restore boundary',
  );
});

test("a gesture line lands strictly between mind's-eye events", async () => {
  const mindScript = '[00:01] mind\n[00:02] e4\n[00:05] reveal';
  const mindEvents = parseScript(mindScript);
  assert.deepEqual(
    mindEvents.map((e) => e.kind),
    ['mind', 'move', 'reveal'],
  );
  const mindInsert = planLine(mindScript, 3, 'hl e4');
  assert.equal(mindInsert.kind, 'edit');
  assert.ok(
    mindInsert.t > 2 && mindInsert.t < 5,
    'a gesture stamp stays strictly between the move and the reveal',
  );
});

test('removeLines treats its input as a set', async () => {
  // A duplicate id must not cascade into deleting the following line.
  assert.equal(
    removeLines('[00:01] e4\n[00:02] e5\n[00:03] Nf3', [2, 2]),
    '[00:01] e4\n[00:03] Nf3',
  );
});

test('setLineTime rewrites in place or relocates, and reports the line', async () => {
  // The Moves toolbar restores focus by the reported line, not by whichever
  // index-keyed React child was reused.
  assert.deepEqual(
    setLineTime('[00:01] hl e4\n[00:02] hl d4', 1, 3),
    { text: '[00:02] hl d4\n[00:03] hl e4', line: 2 },
  );
  assert.deepEqual(
    setLineTime('  [ 00:01 ]   hl e4  \n[00:03] hl d4', 1, 2),
    { text: '  [00:02]   hl e4  \n[00:03] hl d4', line: 1 },
    'an in-place retime preserves indentation and body whitespace',
  );
});

test('planners never emit a timestamp the parser rejects', async () => {
  assert.equal(
    planLineInsert([], '', MAX_SCRIPT_TIMESTAMP_SECONDS + 1, 'hl e4').kind,
    'conflict',
    'gesture planners never emit a timestamp their parser rejects',
  );
  assert.equal(
    parseScriptLine(`${formatScriptTime(MAX_SAFE_PLAYBACK_SECONDS)} hl e4`)?.t,
    MAX_SCRIPT_TIMESTAMP_SECONDS,
    'defensive timestamp formatting stays inside the authored ceiling',
  );
});
