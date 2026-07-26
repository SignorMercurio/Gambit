import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const vite = await createServer({
  root: process.cwd(),
  configFile: false,
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
});

try {
  // Independent entry points: load them concurrently (the module graph
  // dedupes shared deps), and read the stylesheet in the same batch.
  const [
    { parseScript },
    { nextFreeTime, planLineInsert, planMoveGesture, removeLines, setLineTime },
    { beginAnnotationGesture, beginMoveGesture, finishBoardGesture },
    { syncRovingTabStops },
    { buildMainline },
    { mindPieceStrength, mindSink },
    Chess,
    styles,
  ] = await Promise.all([
    vite.ssrLoadModule('/src/lib/timeline.ts'),
    vite.ssrLoadModule('/src/lib/scriptEdit.ts'),
    vite.ssrLoadModule('/src/lib/boardGesture.ts'),
    vite.ssrLoadModule('/src/components/useRovingTabIndex.ts'),
    vite.ssrLoadModule('/src/components/PresentationMoves.tsx'),
    vite.ssrLoadModule('/src/components/Board.tsx'),
    vite.ssrLoadModule('/src/lib/chess.ts'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);

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
  const owner = { pointerId: 1, buttonBit: 1 };
  const moveCalls = [];
  const moveGesture = beginMoveGesture(owner, 'g1', new Set(['f3']), (from, to) =>
    moveCalls.push(`${from}-${to}`),
  );
  finishBoardGesture(moveGesture, 'e5'); // not a legal target
  finishBoardGesture(moveGesture, 'g1'); // released on the origin
  finishBoardGesture(moveGesture, null); // released off-board
  finishBoardGesture(moveGesture, 'f3');
  assert.deepEqual(moveCalls, ['g1-f3'], 'a move commits only onto a legal target');

  const annotationCalls = [];
  const annotationGesture = beginAnnotationGesture(
    owner,
    'c4',
    (from, to) => annotationCalls.push(`arrow:${from}-${to}`),
    (square) => annotationCalls.push(`highlight:${square}`),
  );
  finishBoardGesture(annotationGesture, null); // released off-board
  finishBoardGesture(annotationGesture, 'c4'); // same square: highlight
  finishBoardGesture(annotationGesture, 'f7'); // dragged away: arrow
  assert.deepEqual(annotationCalls, ['highlight:c4', 'arrow:c4-f7']);

  // Mind's-eye events parse as simple keywords, and a generated line
  // round-trips: the planners treat them like any other structural event.
  const mindScript = '[00:01] mind\n[00:02] e4\n[00:05] reveal';
  const mindEvents = parseScript(mindScript);
  assert.deepEqual(
    mindEvents.map((e) => e.kind),
    ['mind', 'move', 'reveal'],
  );
  const mindInsert = planLineInsert(mindEvents, mindScript, 3, 'hl e4');
  assert.equal(mindInsert.kind, 'edit');
  assert.ok(
    mindInsert.t > 2 && mindInsert.t < 5,
    'a gesture stamp stays strictly between the move and the reveal',
  );

  // SAN is conservative: ambiguous or coordinate-like input must surface as
  // a script error instead of silently choosing a legal move, and promotions
  // must name the promoted piece explicitly.
  const ambiguous = Chess.stateFromFEN('4k3/8/8/8/8/1N3N2/8/4K3 w - - 0 1');
  assert.equal(Chess.parseSAN('Nd2', ambiguous), null, 'ambiguous SAN must be rejected');
  assert.deepEqual(Chess.parseSAN('Nbd2', ambiguous)?.from, [1, 2]);
  for (const longPawnMove of ['e2e4', 'ee4', '2e4', 'e 4']) {
    assert.equal(
      Chess.parseSAN(longPawnMove, Chess.initialState()),
      null,
      `non-SAN pawn move ${longPawnMove} must be rejected`,
    );
  }
  assert.deepEqual(Chess.parseSAN('e4', Chess.initialState())?.to, [4, 3]);

  const promotion = Chess.stateFromFEN('7k/P7/8/8/8/8/8/7K w - - 0 1');
  assert.equal(Chess.parseSAN('a8', promotion), null, 'promotion piece must be explicit');
  assert.equal(Chess.parseSAN('a8=Q', promotion)?.promotion, 'q');

  // FEN en-passant metadata is a trust boundary. A side/rank mismatch used
  // to let axb3 remove both white pawns; malformed FEN must fail visibly and
  // forged GameState input must still be rejected by move generation.
  assert.throws(
    () => Chess.stateFromFEN('7k/8/8/8/8/8/PP6/4K3 w - b3 0 1'),
    /en passant/i,
  );
  const forgedEp = Chess.stateFromFEN('7k/8/8/8/8/8/PP6/4K3 w - - 0 1');
  forgedEp.enPassant = 'b3';
  assert.equal(Chess.parseSAN('axb3', forgedEp), null);
  const validEp = Chess.stateFromFEN('7k/8/8/3pP3/8/8/8/7K w - d6 0 1');
  assert.equal(Chess.parseSAN('exd6', validEp)?.enPassant, true);

  // Defensive line deletion treats its input as a set. Duplicate line ids
  // must not cascade into deleting the following authored line.
  assert.equal(
    removeLines('[00:01] e4\n[00:02] e5\n[00:03] Nf3', [2, 2]),
    '[00:01] e4\n[00:03] Nf3',
  );

  // A retime that crosses another event reports the transformed line number.
  // The Moves toolbar uses that stable script location to restore focus to
  // the edited chip instead of whichever index-keyed React child was reused.
  assert.deepEqual(
    setLineTime('[00:01] hl e4\n[00:02] hl d4', 1, 3),
    { text: '[00:02] hl d4\n[00:03] hl e4', line: 2 },
  );

  // Present mode's mainline walk must close its pending row at a reset. The
  // fullmove counters on either side of one routinely coincide (most FENs are
  // fullmove 1), so pairing on the number alone glued a post-reset Black move
  // into the pre-reset White move's row.
  const presRows = buildMainline(
    [
      { kind: 'move', san: 'e4', t: 1, line: 1 },
      { kind: 'reset', t: 2, line: 2 },
      { kind: 'move', san: 'Nc6', t: 3, line: 3 },
    ],
    [
      { turn: 'w', fullmove: 1 },
      { turn: 'w', fullmove: 1 },
      { turn: 'b', fullmove: 1 },
    ],
  );
  assert.deepEqual(
    presRows.map((r) => [r.num, r.white?.text ?? null, r.black?.text ?? null]),
    [
      [1, 'e4', null],
      [1, null, 'Nc6'],
    ],
    'a reset must start a new row instead of pairing across it',
  );

  const rovingControls = [{ tabIndex: 0 }, { tabIndex: 0 }, { tabIndex: 0 }];
  assert.equal(syncRovingTabStops(rovingControls, 1), 1);
  assert.deepEqual(
    rovingControls.map((control) => control.tabIndex),
    [-1, 0, -1],
    'a mixed button/input toolbar must retain exactly one tab stop',
  );

  // Recording layout is an authored invariant: normal laptop heights keep
  // the 720px artifact, while only genuinely short desktop viewports use the
  // 560px fallback. Guard the real CSS surface so the old dvh formulas cannot
  // quietly return.
  assert.match(styles, /--artifact-fit-width:\s*var\(--artifact-width\)/);
  assert.match(styles, /@media \(max-width:\s*1380px\)/);
  assert.match(
    styles,
    /@media \(min-width:\s*1081px\) and \(max-height:\s*760px\)[\s\S]*?--artifact-fit-width:\s*560px/,
  );
  assert.doesNotMatch(styles, /--artifact-fit-width:[^;]*100dvh/);

  // The mind's-eye void is derived from the playback clock, never animated by
  // CSS: a transition runs on wall time, so a paused scrub across `mind` would
  // render a frame that depends on how the playhead arrived rather than on
  // script + FEN + time. Assert the ramp itself — same inputs, same depth.
  const mindAt = (t) =>
    mindSink({ since: 10, touches: new Map(), held: new Set() }, Number.NEGATIVE_INFINITY, t);
  assert.equal(mindAt(10), 0, 'the void starts lit at the mind event');
  assert.equal(mindAt(10.6), 1, 'and is fully sunk one ramp later');
  assert.equal(mindAt(999), 1, 'and stays sunk for the rest of the phase');
  assert.equal(mindAt(10.3), mindAt(10.3), 'the mid-ramp depth is a pure function of time');
  assert.ok(mindAt(10.3) > 0 && mindAt(10.3) < 1);
  // A reset inside mind mode empties the sketch but must not re-sink the
  // board: `since` is the phase clock, so the depth stays saturated.
  assert.equal(mindAt(20), 1, 'a later frame in the same phase is still fully dark');
  // Mirrored on the way out, and saturated for scripts that never darken.
  assert.equal(mindSink(null, 5, 5), 1, 'reveal starts from the fully sunk void');
  assert.equal(mindSink(null, 5, 5.6), 0, 'and lifts over the same ramp');
  assert.equal(mindSink(null, Number.NEGATIVE_INFINITY, 0), 0, 'never-darkened boards are lit');

  // Gaps between moves (4–12s in a real script) outlast the forgetting curve,
  // so the move on the board is rehearsed: its squares hold at full strength
  // until the next move takes over, while everything else fades to nothing.
  const sketch = { touches: new Map([['e4', 10]]), rehearsed: new Set(['e4']) };
  assert.equal(mindPieceStrength(sketch, 'e4', 19), 1, 'the move on the board is never forgotten');
  const stale = { touches: new Map([['e4', 10]]), rehearsed: new Set() };
  assert.equal(mindPieceStrength(stale, 'e4', 10), 1, 'a freshly named square is at full strength');
  assert.equal(mindPieceStrength(stale, 'e4', 19), 0, 'and is gone once nothing restates it');
  assert.equal(mindPieceStrength(stale, 'd4', 10), 0, 'squares the script never named stay dark');

  // One cheap smoke check that the CSS shortcut has not come back.
  assert.doesNotMatch(
    styles,
    /\.board--mind/,
    'mind mode must not re-grow a CSS fill swap — the void is derived from the clock',
  );
} finally {
  await vite.close();
}

console.log('regression tests passed');
