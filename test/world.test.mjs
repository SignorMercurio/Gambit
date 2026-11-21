// The snapshot walk: applied and rejected events, overlays, and br/ml structure.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load, standardSetup, worldWithEvents, worldFrom, rowText } from './support.mjs';

const { parseScript } = await load('/src/lib/timeline.ts');
const { buildMainline } = await load('/src/components/PresentationMoves.tsx');
const {
  BOARD_OVERLAY_LIFETIME,
  MAX_LIVE_ARROWS,
  buildWorld,
  setupFromFen,
} = await load('/src/lib/world.ts');
const Chess = await load('/src/lib/chess.ts');

test('the standard setup has no error', async () => {
  assert.equal(standardSetup.error, null);
});

test('object-prototype names are rejected moves, never command kinds', async () => {
  // Command dispatch is own-key based; an inherited key would become a
  // function-valued event kind that every switch silently drops.
  const { events: prototypeNames, world: prototypeWorld } = worldWithEvents(
    '[00:01] constructor\n[00:02] __proto__',
  );

  assert.deepEqual(prototypeNames.map((event) => event.kind), ['move', 'move']);
  assert.deepEqual([...prototypeWorld.rejectedEventIndexes], [0, 1]);
  assert.equal(prototypeWorld.scriptErrors.length, 2);
});

test('a null move is a script error, not a crash', async () => {
  // chess.js accepts null moves even in strict mode.
  for (const san of ['--', '--!', '--+', '--??']) {
    const build = worldFrom(`[1] ${san}\n[2] e4`);
    assert.match(build.scriptErrors[0].error, /Invalid move/);
    assert.deepEqual([...build.rejectedEventIndexes], [0]);
    assert.equal(Chess.board(build.snapshots.at(-1).chessState)[3][4]?.type, 'p');
  }
});

test('a Start FEN chess.js would mis-load is a setup error the walk survives', async () => {
  const kingCapture = buildWorld(
    parseScript('[00:01] Rxe8'),
    setupFromFen('4k3/4R3/8/8/8/8/8/4K3 w - - 0 1'),
  );
  assert.equal(kingCapture.snapshots.at(-1).chessState.fen, Chess.STARTING_FEN);
});

test('rejected events keep snapshots aligned and stay out of the presentation', async () => {
  const { events: runtimeEvents, world: runtimeWorld } = worldWithEvents(
    '[00:01] e5\n[00:02] e4\n[00:03] fen bad\n[00:04] e5',
  );
  assert.deepEqual([...runtimeWorld.rejectedEventIndexes], [0, 2]);
  assert.deepEqual(runtimeWorld.scriptErrors.map((error) => error.line), [1, 3]);
  // snapshots[i] is the position before event i, rejected events included.
  assert.deepEqual(runtimeWorld.snapshots.slice(0, -1).map(({ chessState }) => ({
    fullmove: chessState.fullmove,
    turn: chessState.turn,
  })), [
    { fullmove: 1, turn: 'w' },
    { fullmove: 1, turn: 'w' },
    { fullmove: 1, turn: 'b' },
    { fullmove: 1, turn: 'b' },
  ]);
  const finalRuntimeState = runtimeWorld.snapshots.at(-1).chessState;
  const finalRuntimeBoard = Chess.board(finalRuntimeState);
  assert.equal(finalRuntimeBoard[3][4]?.side, 'w');
  assert.equal(finalRuntimeBoard[4][4]?.side, 'b');
  assert.deepEqual(
    buildMainline(
      runtimeEvents,
      runtimeWorld.snapshots,
      runtimeWorld.rejectedEventIndexes,
    ).rows.map(rowText),
    [[1, 'e4', 'e5']],
    'presentation follows the moves that actually changed the board',
  );
});

test('errors report in script order', async () => {
  // Errors accumulate in two passes, so their natural order is by stage. The
  // fixture mixes parse and replay errors to expose that.
  const scrambled = buildWorld(
    parseScript(
      [
        '[00:01] e4',
        '[00:02] Nf9',
        '[00:03] hl zz9',
        '[00:04] Qxd9',
        '[00:05] Bb5',
      ].join('\n'),
    ),
    setupFromFen(''),
  );
  const lines = scrambled.scriptErrors.map((er) => er.line);
  assert.deepEqual(
    lines,
    [...lines].sort((a, b) => a - b),
    'the errors band reports lines in script order',
  );
  assert.ok(lines.length >= 2, 'the ordering fixture actually produces several errors');
});

test('an unclosed br and a stray ml are errors that reject nothing', async () => {
  const { events: unclosedBranchEvents, world: unclosedBranchWorld } =
    worldWithEvents('[00:01] br\n[00:02] e4');
  assert.equal(unclosedBranchWorld.scriptErrors[0].line, 1);
  assert.match(unclosedBranchWorld.scriptErrors[0].error, /without matching 'mainline'/);
  assert.deepEqual([...unclosedBranchWorld.rejectedEventIndexes], []);
  assert.deepEqual(
    buildMainline(
      unclosedBranchEvents,
      unclosedBranchWorld.snapshots,
      new Set([0]),
    ).rows,
    [],
    'outcome filtering must never flatten variation depth in presentation',
  );

  // Reported but not rejected, so presentation still reads the depth the
  // stream encodes.
  const strayMainlineWorld = worldFrom('[00:01] e4\n[00:02] ml');
  assert.equal(strayMainlineWorld.scriptErrors[0].line, 2);
  assert.match(strayMainlineWorld.scriptErrors[0].error, /without matching 'branch'/);
  assert.deepEqual([...strayMainlineWorld.rejectedEventIndexes], []);
});

test('each snapshot knows how many variations are open', async () => {
  // The one count of br/ml structure: the Moves view, present mode's main
  // line, and the walk itself all read it instead of re-deriving it.
  const { snapshots } = worldFrom(
    '[1] e4\n[2] br\n[3] e5\n[4] br\n[5] Nf3\n[6] ml\n[7] ml\n[8] e5\n[9] ml',
  );
  assert.deepEqual(
    snapshots.map((snapshot) => snapshot.branchDepth),
    [0, 0, 1, 1, 2, 2, 1, 0, 0, 0],
    'snapshots[i] is the world before event i; a stray ml leaves the depth at zero',
  );
});

test('mainline restore keeps the branch-entry overlays', async () => {
  const restoredOverlays = worldFrom('[0] hl e4 pin\n[1] br\n[2] hl d4 pin\n[3] ml');
  assert.deepEqual(
    restoredOverlays.snapshots.at(-1).highlights.map((highlight) => highlight.sq),
    ['e4'],
    'mainline restore keeps the branch-entry overlay snapshot',
  );
});

test('mainline restore glides pieces home instead of snapping', async () => {
  const glideRestore = worldFrom('[1] e4\n[2] br\n[3] d5\n[4] exd5\n[5] ml');
  const glidePositions = Object.values(glideRestore.snapshots.at(-1).positions);
  const whitePawn = glidePositions.find((p) => p.side === 'w' && p.f === 4 && p.r === 3);
  assert.deepEqual(
    [whitePawn.moveFromF, whitePawn.moveFromR, whitePawn.moveT],
    [3, 4, 5],
    'a branch-moved piece must glide home from its branch-final square at the ml timestamp',
  );
  const blackPawn = glidePositions.find((p) => p.side === 'b' && p.f === 3 && p.r === 6);
  assert.equal(blackPawn.captured, undefined);
  assert.equal(
    blackPawn.restoredAt,
    5,
    'a branch-captured piece must fade back in at the ml timestamp',
  );
  const bystander = glidePositions.find((p) => p.side === 'b' && p.f === 0 && p.r === 6);
  assert.equal(bystander.restoredAt, undefined);
  assert.equal(bystander.moveT, undefined, 'undisturbed pieces must not gain glide metadata');
  // The branch-entry snapshot itself must keep pre-branch metadata: the glide
  // rewrite rebinds, never mutates shared history.
  const branchEntry = Object.values(glideRestore.snapshots[2].positions).find(
    (p) => p.side === 'w' && p.f === 4 && p.r === 3,
  );
  assert.equal(branchEntry.moveT, 1, 'glide rewrite must not mutate the shared branch-entry snapshot');
});

test('a setup inside a variation re-mints piece identity', async () => {
  // The setup matches the branch-entry types and counts, so only identity
  // can differ.
  const pawnSetup = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  const setupBranch = worldFrom(`[1] br\n[2] fen ${pawnSetup}\n[3] ml`);
  assert.deepEqual(setupBranch.snapshots.at(-1).positions, standardSetup.positions);
  const nestedSetup = worldFrom(`[1] br\n[2] e4\n[3] br\n[4] fen ${pawnSetup}\n[5] ml\n[6] ml`);
  assert.deepEqual(nestedSetup.scriptErrors, []);
  const restoredPawn = Object.values(nestedSetup.snapshots.at(-1).positions)
    .find((p) => p.side === 'w' && p.f === 4 && p.r === 1);
  assert.deepEqual([restoredPawn.moveFromF, restoredPawn.moveFromR, restoredPawn.moveT], [4, 3, 6]);
});

test('unpinned overlays expire from later snapshots', async () => {
  const expiredOverlays = worldFrom('[0] hl e4\n[3] Nf3');
  assert.deepEqual(expiredOverlays.snapshots[1].highlights.map((highlight) => highlight.sq), ['e4']);
  assert.deepEqual(expiredOverlays.snapshots.at(-1).highlights, []);
});

test('expired highlights are pruned rather than accumulated', async () => {
  const boardSquares = Array.from(
    { length: 64 },
    (_, index) => `${String.fromCharCode(97 + (index % 8))}${Math.floor(index / 8) + 1}`,
  );
  const longOverlayScript = Array.from(
    { length: 500 },
    (_, index) => `[${(index / 10).toFixed(1)}] hl ${boardSquares[index % boardSquares.length]}`,
  ).join('\n');
  const boundedOverlays = worldFrom(longOverlayScript);
  const overlayWindowBound = Math.ceil(BOARD_OVERLAY_LIFETIME.highlight / 0.1) + 1;
  assert.ok(
    Math.max(...boundedOverlays.snapshots.map((snapshot) => snapshot.highlights.length)) <=
      overlayWindowBound,
    'expired overlays are pruned from later snapshots instead of growing quadratically',
  );
});

test('live arrows are capped, and expiry frees the budget', async () => {
  const boardSquares = Array.from(
    { length: 64 },
    (_, index) => `${String.fromCharCode(97 + (index % 8))}${Math.floor(index / 8) + 1}`,
  );

  const uniqueArrowCount = Math.min(MAX_LIVE_ARROWS * 4, boardSquares.length ** 2);
  const uniqueArrowScript = Array.from({ length: uniqueArrowCount }, (_, index) => {
    const from = boardSquares[Math.floor(index / boardSquares.length)];
    const to = boardSquares[index % boardSquares.length];
    return `[0] ${from}->${to} pin`;
  }).join('\n');
  const boundedArrows = worldFrom(uniqueArrowScript);
  assert.ok(
    Math.max(...boundedArrows.snapshots.map((snapshot) => snapshot.arrows.length)) <=
      MAX_LIVE_ARROWS,
    'unique same-time arrows cannot restore quadratic snapshot growth',
  );
  assert.ok(boundedArrows.scriptErrors.some((error) => /Too many live arrows/.test(error.error)));

  const expiredArrowBudgetScript = [
    ...uniqueArrowScript
      .split('\n')
      .slice(0, MAX_LIVE_ARROWS)
      .map((line) => line.replace(/ pin$/, '')),
    '[3] h8->a1',
  ].join('\n');
  const reusedArrowBudget = worldFrom(expiredArrowBudgetScript);
  assert.deepEqual(reusedArrowBudget.scriptErrors, []);
  assert.deepEqual(
    reusedArrowBudget.snapshots.at(-1).arrows.map((arrow) => `${arrow.from}-${arrow.to}`),
    ['h8-a1'],
    'expired arrows release the live-overlay budget before a new event applies',
  );
});

test('restating a highlight does not stack, and a pin outlasts it', async () => {
  const restatedOverlayScript = Array.from(
    { length: 500 },
    () => '[1] hl e4',
  ).join('\n');
  const restatedOverlays = worldFrom(restatedOverlayScript);
  assert.equal(
    restatedOverlays.snapshots.at(-1).highlights.length,
    1,
    'restating one visual key does not stack identical SVG geometry',
  );
  const pinnedRestatement = worldFrom('[1] hl e4 pin\n[2] hl e4\n[99] Nf3');
  assert.equal(pinnedRestatement.snapshots.at(-1).highlights[0]?.pinned, true);
});
