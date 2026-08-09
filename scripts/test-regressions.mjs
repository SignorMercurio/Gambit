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
    {
      parseScript,
      parseScriptLine,
      parseTime,
      fmtTime,
      formatScriptTime,
      rewriteScriptLineTime,
      splitSanAnnotation,
      MAX_SCRIPT_LINES,
    },
    { nextFreeTime, planLineInsert, planMoveGesture, removeLines, setLineTime },
    { beginAnnotationGesture, beginMoveGesture, finishBoardGesture },
    { syncRovingTabStops },
    { buildMainline, findMainlineCursor },
    { mindPieceStrength, mindRevealStrength, mindSink },
    { getActiveSubtitle, getSubtitleEnd, parseSrt },
    {
      BOARD_OVERLAY_LIFETIME,
      MAX_LIVE_ARROWS,
      buildWorld,
      setupFromFen,
    },
    {
      landBetween,
      MAX_SAFE_PLAYBACK_SECONDS,
      MAX_SCRIPT_TIMESTAMP_SECONDS,
      playbackDuration,
      timelineTicks,
    },
    Chess,
    styles,
  ] = await Promise.all([
    vite.ssrLoadModule('/src/lib/timeline.ts'),
    vite.ssrLoadModule('/src/lib/scriptEdit.ts'),
    vite.ssrLoadModule('/src/lib/boardGesture.ts'),
    vite.ssrLoadModule('/src/components/useRovingTabIndex.ts'),
    vite.ssrLoadModule('/src/components/PresentationMoves.tsx'),
    vite.ssrLoadModule('/src/lib/mind.ts'),
    vite.ssrLoadModule('/src/lib/subtitles.ts'),
    vite.ssrLoadModule('/src/lib/world.ts'),
    vite.ssrLoadModule('/src/lib/playback.ts'),
    vite.ssrLoadModule('/src/lib/chess.ts'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);

  const saturated = '[00:00.0] e4\n[00:00.1] e5';
  const events = parseScript(saturated);

  // Script parsing and timestamp rewriting share one line grammar. In-place
  // edits preserve authored whitespace; malformed or body-less lines stay
  // invalid instead of being silently repaired by the structured editor.
  assert.deepEqual(parseScriptLine('  [ 0:05.1 ]   hl e4 pin  '), {
    t: 5.1,
    body: 'hl e4 pin',
  });
  assert.equal(
    rewriteScriptLineTime('  [ 0:05.1 ]   hl e4 pin  ', 7.2),
    '  [00:07.2]   hl e4 pin  ',
  );
  assert.equal(parseScriptLine('// [00:01] e4'), null);
  assert.equal(parseScriptLine('[1::2] e4'), null);
  assert.equal(rewriteScriptLineTime('[00:05]   ', 7), null);
  assert.equal(rewriteScriptLineTime('[00:05] e4', Number.NaN), null);
  assert.match(parseScript('[1::2] e4')[0].error, /invalid timestamp/i);
  assert.ok(Number.isNaN(parseTime('00:60')), 'colon timestamps keep seconds below 60');
  assert.equal(parseTime('60'), 60, 'plain seconds remain a supported shorthand');
  assert.match(parseScript('[00:99] e4')[0].error, /invalid timestamp/i);
  assert.ok(
    Number.isNaN(parseTime(`1${'0'.repeat(308)}`)),
    'timestamps beyond safe decisecond arithmetic fail visibly',
  );
  assert.equal(
    parseTime(String(MAX_SCRIPT_TIMESTAMP_SECONDS)),
    MAX_SCRIPT_TIMESTAMP_SECONDS,
  );
  assert.ok(Number.isNaN(parseTime(String(MAX_SCRIPT_TIMESTAMP_SECONDS + 1))));

  // Command dispatch must be own-key based. Object-prototype names are SAN
  // candidates and therefore fail visibly at world replay; they must never
  // become function/object-valued event kinds that every switch drops.
  const prototypeNames = parseScript('[00:01] constructor\n[00:02] __proto__');
  assert.deepEqual(prototypeNames.map((event) => event.kind), ['move', 'move']);

  // One highlight line can name at most the 64 board squares. Repetition is
  // normalized before world/render work so a tiny semantic event cannot fan
  // out into an arbitrarily large SVG subtree.
  const dedupedHighlight = parseScript('[00:01] hl e4,E4,e4,d5')[0];
  assert.deepEqual(dedupedHighlight.squares, ['e4', 'd5']);
  const oversizedScript = Array.from(
    { length: MAX_SCRIPT_LINES + 1 },
    (_, index) => `# ${index}`,
  ).join('\n');
  const oversizedEvents = parseScript(oversizedScript);
  assert.equal(oversizedEvents.length, 1);
  assert.match(oversizedEvents[0].error, /line limit/i);

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

  // A different move before a future SAN must never degrade to a plain
  // mainline insert when there is no room for br/move/ml. The later SAN can
  // remain legal for the other side and silently change meaning.
  const pinchedMainline = '[1.95] e4\n[2.2] e5';
  const pinchedPlan = planMoveGesture(
    parseScript(pinchedMainline),
    pinchedMainline,
    2,
    'c5',
    () => false,
  );
  assert.equal(pinchedPlan.kind, 'conflict');

  // A parsed-but-invalid FEN is not a continuity cut. Planner state scanning
  // receives the world's applied/rejected outcome and still protects the
  // different future move with a complete variation.
  const rejectedFenScript = '[1] e4\n[3] fen bad\n[4] e5';
  const rejectedFenPlan = planMoveGesture(
    parseScript(rejectedFenScript),
    rejectedFenScript,
    2,
    'c5',
    () => false,
    new Set([1]),
  );
  assert.equal(rejectedFenPlan.kind, 'edit');
  assert.match(rejectedFenPlan.text, /^\[00:02\] c5$/m);
  assert.match(rejectedFenPlan.text, /\bbr$/m);
  assert.match(rejectedFenPlan.text, /\bml$/m);

  // A runtime-rejected SAN is position-dependent, unlike a malformed FEN.
  // Inserting a legal move before it may make it legal, so the planner must
  // keep it as a future continuity boundary and isolate the gesture in a
  // variation instead of silently reviving the author's bad line.
  const rejectedMoveScript = '[3] e5';
  const rejectedMoveEvents = parseScript(rejectedMoveScript);
  const rejectedMoveSetup = setupFromFen(Chess.STARTING_FEN);
  const rejectedMoveWorld = buildWorld(rejectedMoveEvents, rejectedMoveSetup);
  assert.deepEqual([...rejectedMoveWorld.rejectedEventIndexes], [0]);
  const rejectedMovePlan = planMoveGesture(
    rejectedMoveEvents,
    rejectedMoveScript,
    2,
    'e4',
    () => false,
    rejectedMoveWorld.rejectedEventIndexes,
  );
  assert.equal(rejectedMovePlan.kind, 'edit');
  assert.match(rejectedMovePlan.text, /\bbr$/m);
  assert.match(rejectedMovePlan.text, /\bml$/m);
  const rejectedMoveAfterEvents = parseScript(rejectedMovePlan.text);
  const rejectedMoveAfterWorld = buildWorld(rejectedMoveAfterEvents, rejectedMoveSetup);
  const originalMoveIndex = rejectedMoveAfterEvents.findIndex(
    (event) => !('error' in event) && event.kind === 'move' && event.san === 'e5',
  );
  assert.ok(
    rejectedMoveAfterWorld.rejectedEventIndexes.has(originalMoveIndex),
    'the originally rejected SAN must remain rejected after the gesture edit',
  );

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

  const saturatedVariation =
    '[1.8] br\n[1.85] e4\n[2.0] hl a1\n[2.1] hl b1\n[2.2] ml\n[2.3] e5';
  assert.equal(
    planMoveGesture(
      parseScript(saturatedVariation),
      saturatedVariation,
      1.9,
      'c5',
      () => false,
    ).kind,
    'conflict',
    'an open variation must not overflow its mainline restore boundary',
  );

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
  assert.deepEqual(Chess.parseSAN('e4!', Chess.initialState())?.to, [4, 3]);
  for (const badSuffix of ['e4+', 'e4#', 'e4!?', 'e4?!', 'e4!+', 'e4++', 'e4?????']) {
    assert.equal(
      Chess.parseSAN(badSuffix, Chess.initialState()),
      null,
      `${badSuffix} must not bypass the shared SAN suffix grammar`,
    );
  }
  assert.deepEqual(splitSanAnnotation('Qxf7#!!'), { text: 'Qxf7#', mark: '!!' });
  assert.deepEqual(
    splitSanAnnotation('e4!?'),
    { text: 'e4!?', mark: null },
    'unsupported marks stay intact on the visible invalid SAN',
  );

  const rookCheck = Chess.stateFromFEN('7k/8/8/8/8/8/8/R3K3 w - - 0 1');
  assert.ok(Chess.parseSAN('Ra8+', rookCheck));
  assert.equal(Chess.parseSAN('Ra8#', rookCheck), null);
  assert.ok(Chess.parseSAN('Ra8', rookCheck), 'omitting a check marker stays compatible');

  let scholarsMate = Chess.initialState();
  for (const san of ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6']) {
    const move = Chess.parseSAN(san, scholarsMate);
    assert.ok(move, `fixture move ${san} must resolve`);
    scholarsMate = Chess.applyMove(scholarsMate, move);
  }
  assert.ok(Chess.parseSAN('Qxf7#', scholarsMate));
  assert.ok(Chess.parseSAN('Qxf7#!!', scholarsMate));
  assert.equal(Chess.parseSAN('Qxf7+', scholarsMate), null);
  assert.ok(Chess.parseSAN('Qxf7', scholarsMate));

  const quietCastle = Chess.stateFromFEN('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
  assert.ok(Chess.parseSAN('O-O', quietCastle));
  assert.equal(Chess.parseSAN('O-O+', quietCastle), null);

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

  assert.throws(
    () => Chess.stateFromFEN('8/8/8/8/8/8/8/4K3 w - - 0 1'),
    /one king per side/i,
  );
  assert.throws(
    () => Chess.stateFromFEN('4k3/8/8/8/8/8/4K3/4K3 w - - 0 1'),
    /one king per side/i,
  );
  const adjacentKings = Chess.stateFromFEN('8/8/8/8/8/8/4k3/4K3 w - - 0 1');
  assert.equal(Chess.parseSAN('Kxe2', adjacentKings), null, 'a king is never a capture target');

  // Subtitle lookup keeps the latest-started active cue while still falling
  // back to an earlier long cue after a shorter overlap ends.
  const overlappingCues = [
    { start: 0, end: 10, text: 'long', line: 1 },
    { start: 1, end: 2, text: 'short', line: 2 },
    { start: 3, end: 4, text: 'later', line: 3 },
  ];
  assert.equal(getSubtitleEnd(overlappingCues), 10);
  assert.equal(getActiveSubtitle(overlappingCues, 1.5)?.text, 'short');
  assert.equal(getActiveSubtitle(overlappingCues, 2.5)?.text, 'long');
  assert.equal(getActiveSubtitle(overlappingCues, 20), null);

  const missingSeparatorSrt = `1
00:00:00,000 --> 00:00:01,000
First
2
00:00:01,000 --> 00:00:02,000
Second`;
  const recoveredSrt = parseSrt(missingSeparatorSrt);
  assert.deepEqual(recoveredSrt.cues.map((cue) => cue.text), ['First', 'Second']);
  assert.deepEqual(recoveredSrt.errors, [
    { line: 4, error: 'missing blank line before subtitle cue' },
  ]);

  const malformedThenValidSrt = `1
not a timestamp
broken
2
00:00:01,000 --> 00:00:02,000
Recovered`;
  const recoveredAfterMalformed = parseSrt(malformedThenValidSrt);
  assert.deepEqual(recoveredAfterMalformed.cues.map((cue) => cue.text), ['Recovered']);
  assert.equal(recoveredAfterMalformed.errors.length, 2);

  const bareMissingSeparatorSrt = `00:00:00,000 --> 00:00:01,000
First
00:00:01,000 --> 00:00:02,000
Second`;
  const recoveredBareSrt = parseSrt(bareMissingSeparatorSrt);
  assert.deepEqual(recoveredBareSrt.cues.map((cue) => cue.text), ['First', 'Second']);
  assert.deepEqual(recoveredBareSrt.errors, [
    { line: 3, error: 'missing blank line before subtitle cue' },
  ]);

  const arrowTextSrt = `1
00:00:00,000 --> 00:00:02,000
2024
Look --> there`;
  const arrowTextCue = parseSrt(arrowTextSrt);
  assert.deepEqual(arrowTextCue.errors, []);
  assert.equal(arrowTextCue.cues[0].text, '2024\nLook --> there');

  // World replay is the canonical applied/rejected outcome shared by the
  // renderer, presentation PGN, and gesture planner.
  const standardSetup = setupFromFen(Chess.STARTING_FEN);
  assert.equal(standardSetup.error, null);
  const runtimeEvents = parseScript(
    '[00:01] e5\n[00:02] e4\n[00:03] fen bad\n[00:04] e5',
  );
  const runtimeWorld = buildWorld(runtimeEvents, standardSetup);
  assert.deepEqual([...runtimeWorld.rejectedEventIndexes], [0, 2]);
  assert.deepEqual(runtimeWorld.scriptErrors.map((error) => error.line), [1, 3]);
  assert.deepEqual(runtimeWorld.moveStates, [
    { fullmove: 1, turn: 'w' },
    { fullmove: 1, turn: 'w' },
    { fullmove: 1, turn: 'b' },
    { fullmove: 1, turn: 'b' },
  ]);
  const finalRuntimeState = runtimeWorld.snapshots.at(-1).chessState;
  assert.equal(finalRuntimeState.board[3][4]?.side, 'w');
  assert.equal(finalRuntimeState.board[4][4]?.side, 'b');
  assert.deepEqual(
    buildMainline(
      runtimeEvents,
      runtimeWorld.moveStates,
      runtimeWorld.rejectedEventIndexes,
    ).map((row) => [row.num, row.white?.text ?? null, row.black?.text ?? null]),
    [[1, 'e4', 'e5']],
    'presentation follows the moves that actually changed the board',
  );

  const prototypeWorld = buildWorld(prototypeNames, standardSetup);
  assert.deepEqual([...prototypeWorld.rejectedEventIndexes], [0, 1]);
  assert.equal(prototypeWorld.scriptErrors.length, 2);

  const unclosedBranchEvents = parseScript('[00:01] br\n[00:02] e4');
  const unclosedBranchWorld = buildWorld(unclosedBranchEvents, standardSetup);
  assert.equal(unclosedBranchWorld.scriptErrors[0].line, 1);
  assert.deepEqual([...unclosedBranchWorld.rejectedEventIndexes], []);
  assert.deepEqual(
    buildMainline(
      unclosedBranchEvents,
      unclosedBranchWorld.moveStates,
      new Set([0]),
    ),
    [],
    'outcome filtering must never flatten variation depth in presentation',
  );

  const restoredOverlayEvents = parseScript(
    '[0] hl e4 pin\n[1] br\n[2] hl d4 pin\n[3] ml',
  );
  const restoredOverlays = buildWorld(restoredOverlayEvents, standardSetup);
  assert.deepEqual(
    restoredOverlays.snapshots.at(-1).highlights.map((highlight) => highlight.sq),
    ['e4'],
    'mainline restore keeps the branch-entry overlay snapshot',
  );

  const expiredOverlayEvents = parseScript('[0] hl e4\n[3] Nf3');
  const expiredOverlays = buildWorld(expiredOverlayEvents, standardSetup);
  assert.deepEqual(expiredOverlays.snapshots[1].highlights.map((highlight) => highlight.sq), ['e4']);
  assert.deepEqual(expiredOverlays.snapshots.at(-1).highlights, []);

  const boardSquares = Array.from(
    { length: 64 },
    (_, index) => `${String.fromCharCode(97 + (index % 8))}${Math.floor(index / 8) + 1}`,
  );
  const longOverlayScript = Array.from(
    { length: 500 },
    (_, index) => `[${(index / 10).toFixed(1)}] hl ${boardSquares[index % boardSquares.length]}`,
  ).join('\n');
  const boundedOverlays = buildWorld(parseScript(longOverlayScript), standardSetup);
  const overlayWindowBound = Math.ceil(BOARD_OVERLAY_LIFETIME.highlight / 0.1) + 1;
  assert.ok(
    Math.max(...boundedOverlays.snapshots.map((snapshot) => snapshot.highlights.length)) <=
      overlayWindowBound,
    'expired overlays are pruned from later snapshots instead of growing quadratically',
  );

  const uniqueArrowCount = Math.min(MAX_LIVE_ARROWS * 4, boardSquares.length ** 2);
  const uniqueArrowScript = Array.from({ length: uniqueArrowCount }, (_, index) => {
    const from = boardSquares[Math.floor(index / boardSquares.length)];
    const to = boardSquares[index % boardSquares.length];
    return `[0] ${from}->${to} pin`;
  }).join('\n');
  const boundedArrows = buildWorld(parseScript(uniqueArrowScript), standardSetup);
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
  const reusedArrowBudget = buildWorld(parseScript(expiredArrowBudgetScript), standardSetup);
  assert.deepEqual(reusedArrowBudget.scriptErrors, []);
  assert.deepEqual(
    reusedArrowBudget.snapshots.at(-1).arrows.map((arrow) => `${arrow.from}-${arrow.to}`),
    ['h8-a1'],
    'expired arrows release the live-overlay budget before a new event applies',
  );

  const restatedOverlayScript = Array.from(
    { length: 500 },
    () => '[1] hl e4',
  ).join('\n');
  const restatedOverlays = buildWorld(parseScript(restatedOverlayScript), standardSetup);
  assert.equal(
    restatedOverlays.snapshots.at(-1).highlights.length,
    1,
    'restating one visual key does not stack identical SVG geometry',
  );
  const pinnedRestatement = buildWorld(
    parseScript('[1] hl e4 pin\n[2] hl e4\n[99] Nf3'),
    standardSetup,
  );
  assert.equal(pinnedRestatement.snapshots.at(-1).highlights[0]?.pinned, true);

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
  assert.deepEqual(
    setLineTime('  [ 00:01 ]   hl e4  \n[00:03] hl d4', 1, 2),
    { text: '  [00:02]   hl e4  \n[00:03] hl d4', line: 1 },
    'an in-place retime preserves indentation and body whitespace',
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
  const presentationResetEvents = parseScript('[1] e4\n[2] rs\n[3] e4');
  assert.equal(
    findMainlineCursor(presentationResetEvents, 1),
    -1,
    'a setup event clears the current presentation move until the new line advances',
  );
  assert.equal(findMainlineCursor(presentationResetEvents, 2), 2);
  const rejectedPresentationFen = parseScript('[1] e4\n[2] fen bad');
  assert.equal(
    findMainlineCursor(rejectedPresentationFen, 1, new Set([1])),
    0,
    'a rejected FEN does not clear the presentation cursor',
  );

  const rovingControls = [{ tabIndex: 0 }, { tabIndex: 0 }, { tabIndex: 0 }];
  assert.equal(syncRovingTabStops(rovingControls, 1), 1);
  assert.deepEqual(
    rovingControls.map((control) => control.tabIndex),
    [-1, 0, -1],
    'a mixed button/input toolbar must retain exactly one tab stop',
  );

  assert.deepEqual(timelineTicks(30), [0, 5, 10, 15, 20, 25, 30]);
  const hugeTicks = timelineTicks(999_999_999);
  assert.ok(hugeTicks.length <= 24, 'authored timestamps cannot create millions of DOM ticks');
  assert.ok(hugeTicks.every(Number.isFinite));
  const extremeTicks = timelineTicks(Number.MAX_VALUE);
  assert.ok(extremeTicks.length <= 24);
  assert.ok(extremeTicks.every(Number.isFinite));
  assert.equal(new Set(extremeTicks).size, extremeTicks.length);
  assert.doesNotMatch(fmtTime(Number.MAX_VALUE), /Infinity|NaN/);
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
  assert.match(
    styles,
    /@media \(max-width:\s*760px\)[\s\S]*?\.app--present \.controls\s*\{[\s\S]*?display:\s*grid/,
    'present mode restores the mobile transport grid after its desktop flex override',
  );
  assert.match(
    styles,
    /@media \(max-width:\s*760px\)[\s\S]*?\.app--present-pgn \.main\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*var\(--artifact-fit-width\)\)/,
    'the phone PGN stacks instead of crushing the recording artifact beside a fixed panel',
  );

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
  assert.equal(mindRevealStrength(5, 5), 0, 'pieces start hidden at reveal');
  assert.equal(mindRevealStrength(5, 5.5), 1, 'and return on the authored reveal ramp');
  assert.equal(
    mindRevealStrength(Number.NEGATIVE_INFINITY, 0),
    1,
    'pieces stay fully visible when no mind phase has occurred',
  );

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
