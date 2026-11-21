// The Moves view outline, present mode's mainline rows, and list keyboard focus.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load, rowText, worldWithEvents } from './support.mjs';

const { syncRovingTabStops } = await load('/src/components/useRovingTabIndex.ts');
const { buildMainline } = await load('/src/components/PresentationMoves.tsx');
const { buildMoveOutline } = await load('/src/lib/moveOutline.ts');

const mainlineFrom = (text) => {
  const { events, world } = worldWithEvents(text);
  return buildMainline(events, world.snapshots, world.rejectedEventIndexes);
};

// Every number in an outline is an index into the script's events.
const outlineOf = (text) => {
  const { events, world } = worldWithEvents(text);
  return buildMoveOutline(events, world.snapshots);
};

test('presentation rows close at a reset', async () => {
  // Fullmove counters on either side of a reset routinely coincide (most FENs
  // are fullmove 1), so pairing on the number alone would join the two rows.
  const { rows: presRows } = buildMainline(
    [
      { kind: 'move', san: 'e4', t: 1, line: 1 },
      { kind: 'reset', t: 2, line: 2 },
      { kind: 'move', san: 'Nc6', t: 3, line: 3 },
    ],
    [
      { chessState: { turn: 'w', fullmove: 1 }, branchDepth: 0 },
      { chessState: { turn: 'w', fullmove: 1 }, branchDepth: 0 },
      { chessState: { turn: 'b', fullmove: 1 }, branchDepth: 0 },
    ],
    new Set(),
  );
  assert.deepEqual(
    presRows.map(rowText),
    [
      [1, 'e4', null],
      [1, null, 'Nc6'],
    ],
    'a reset must start a new row instead of pairing across it',
  );
});

test('the presentation cursor clears at a setup, not at a rejected FEN', async () => {
  // The cursor index holds, per event, the mainline move the board represents
  // once the playhead has reached that event.
  const { cursorByEvent: presentationResetCursors } = mainlineFrom('[1] e4\n[2] rs\n[3] e4');
  assert.equal(
    presentationResetCursors[1],
    -1,
    'a setup event clears the current presentation move until the new line advances',
  );
  assert.equal(presentationResetCursors[2], 2);
  assert.equal(
    mainlineFrom('[1] e4\n[2] fen bad').cursorByEvent[1],
    0,
    'a rejected FEN does not clear the presentation cursor',
  );
});

test('a roving toolbar keeps exactly one tab stop', async () => {
  const rovingControls = [{ tabIndex: 0 }, { tabIndex: 0 }, { tabIndex: 0 }];
  assert.equal(syncRovingTabStops(rovingControls, 1), 1);
  assert.deepEqual(
    rovingControls.map((control) => control.tabIndex),
    [-1, 0, -1],
    'a mixed button/input toolbar must retain exactly one tab stop',
  );
});

test('mainline moves pair into numbered rows that carry their marks', async () => {
  assert.deepEqual(outlineOf('[1] e4\n[2] hl e4\n[3] e5\n[4] Nf3'), [
    {
      type: 'rows',
      rows: [
        { num: 1, white: { move: 0, marks: [1] }, black: { move: 2, marks: [] } },
        { num: 2, white: { move: 3, marks: [] }, black: null },
      ],
    },
  ]);
});

test('a variation is one flow block, and the main line resumes on a new row', async () => {
  assert.deepEqual(
    outlineOf('[1] e4\n[2] br\n[3] e5\n[4] Nf3\n[5] hl f3\n[6] Nc6\n[7] ml\n[8] c5'),
    [
      { type: 'rows', rows: [{ num: 1, white: { move: 0, marks: [] }, black: null }] },
      {
        type: 'variation',
        head: 1,
        lines: [2, 3, 4, 5, 6, 7],
        items: [
          { type: 'move', i: 2, number: '1…' },
          { type: 'move', i: 3, number: '2.' },
          { type: 'mark', i: 4 },
          // A Black move is numbered only when something interrupted the run.
          { type: 'move', i: 5, number: '2…' },
          { type: 'return', i: 6 },
        ],
      },
      { type: 'rows', rows: [{ num: 1, white: null, black: { move: 7, marks: [] } }] },
    ],
  );
  assert.equal(
    outlineOf('[1] e4\n[2] br\n[3] e5\n[4] Nf3\n[5] Nc6\n[6] ml')[1].items[2].number,
    null,
    'an uninterrupted Black reply carries no number',
  );
});

test('only the ml that returns to the main line closes a variation block', async () => {
  const outline = outlineOf('[1] e4\n[2] br\n[3] e5\n[4] br\n[5] Nf3\n[6] ml\n[7] ml\n[8] e5');
  assert.deepEqual(
    outline.map((block) => block.type),
    ['rows', 'variation', 'rows'],
  );
  assert.deepEqual(outline[1].items, [
    { type: 'move', i: 2, number: '1…' },
    { type: 'open', i: 3 },
    { type: 'move', i: 4, number: '2.' },
    { type: 'close', i: 5 },
    { type: 'return', i: 6 },
  ]);
  assert.deepEqual(outline[1].lines, [2, 3, 4, 5, 6, 7], 'deleting the variation takes its nested lines');
});

test('setups divide the outline, and unattached events stay reachable', async () => {
  assert.deepEqual(outlineOf('[1] hl e4\n[2] rs\n[3] hl\n[4] ml\n[5] e4\n[6] br\n[7] hl'), [
    { type: 'marks', marks: [0] },
    { type: 'divider', i: 1 },
    { type: 'error', i: 2 },
    // A stray `ml` is a script error that still gets a seekable mark.
    { type: 'marks', marks: [3] },
    { type: 'rows', rows: [{ num: 1, white: { move: 4, marks: [] }, black: null }] },
    // A parse error inside an open variation stays in its flow.
    { type: 'variation', head: 5, lines: [6, 7], items: [{ type: 'mark', i: 6 }] },
  ]);
});
