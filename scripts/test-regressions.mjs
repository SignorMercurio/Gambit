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
      lastEventIndexAt,
      MAX_SCRIPT_LINES,
    },
    { nextFreeTime, planLineInsert, planMoveGesture, removeLines, setLineTime },
    { beginAnnotationGesture, beginMoveGesture, finishBoardGesture },
    { boardViewPosition, squareFromBoardView },
    {
      BOARD_EXPORT_SIZE,
      BOARD_EXPORT_TIMEOUT_MESSAGE,
      boardPngFilename,
      downloadBoardPng,
      withTimeout,
    },
    { syncRovingTabStops },
    { buildMainline, buildMainlineCursorIndex },
    { BADGE_EDGE_MARGIN, BADGE_R, BOARD_SIZE, BadgeDisc, HlRing, badgeCenter, lastMoveSquares },
    { AUTHORED_ELSEWHERE_COMMANDS, COMMANDS, INSERTABLE_COMMANDS, SYNTAX_GROUPS },
    { SYNTAX_HINT },
    {
      annotationColors,
      annotationInk,
      annotationMarkColors,
      markerColors,
      markerForms,
      tokens: boardTokens,
    },
    { mindPieceStrength, mindRevealStrength, mindSink },
    { getActiveSubtitle, getSubtitleEnd, parseSrt },
    {
      BOARD_OVERLAY_LIFETIME,
      MAX_LIVE_ARROWS,
      REPLAY_STEP_SECONDS,
      buildWorld,
      setupFromFen,
      worldFrameAt,
    },
    {
      landBetween,
      MAX_SAFE_PLAYBACK_SECONDS,
      MAX_SCRIPT_TIMESTAMP_SECONDS,
      playbackDuration,
      timelineTicks,
    },
    { moveSoundEnabled, moveSoundKey, shouldPlayMoveSound },
    Chess,
    styles,
    boardSource,
  ] = await Promise.all([
    vite.ssrLoadModule('/src/lib/timeline.ts'),
    vite.ssrLoadModule('/src/lib/scriptEdit.ts'),
    vite.ssrLoadModule('/src/lib/boardGesture.ts'),
    vite.ssrLoadModule('/src/lib/boardOrientation.ts'),
    vite.ssrLoadModule('/src/lib/boardExport.ts'),
    vite.ssrLoadModule('/src/components/useRovingTabIndex.ts'),
    vite.ssrLoadModule('/src/components/PresentationMoves.tsx'),
    vite.ssrLoadModule('/src/components/Board.tsx'),
    vite.ssrLoadModule('/src/lib/commands.ts'),
    vite.ssrLoadModule('/src/components/SyntaxHint.tsx'),
    vite.ssrLoadModule('/src/lib/tokens.ts'),
    vite.ssrLoadModule('/src/lib/mind.ts'),
    vite.ssrLoadModule('/src/lib/subtitles.ts'),
    vite.ssrLoadModule('/src/lib/world.ts'),
    vite.ssrLoadModule('/src/lib/playback.ts'),
    vite.ssrLoadModule('/src/lib/moveSound.ts'),
    vite.ssrLoadModule('/src/lib/chess.ts'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Board.tsx', import.meta.url), 'utf8'),
  ]);

  const saturated = '[00:00.0] e4\n[00:00.1] e5';
  const events = parseScript(saturated);

  const replayAliases = parseScript('[1] rp\n[2] replay');
  assert.deepEqual(replayAliases.map((event) => event.kind), ['replay', 'replay']);
  assert.match(parseScript('[1] replay 1')[0].error, /takes no arguments/i);

  // Board orientation is a reversible view transform only. Every canonical
  // square must survive a screen-cell round trip in both perspectives so
  // pieces, overlays, and pointer gestures cannot disagree after a flip.
  for (const orientation of ['white', 'black']) {
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const view = boardViewPosition(f, r, orientation);
        assert.equal(squareFromBoardView(view.x, view.y, orientation), Chess.idxToSq(f, r));
      }
    }
  }
  // Which square is the top-left cell in each perspective. The inverse
  // (`squareFromBoardView(0, 0, …)`) needs no anchor of its own: the round trip
  // above closes it at f=0,r=7 and f=7,r=0.
  assert.deepEqual(boardViewPosition(0, 7, 'white'), { x: 0, y: 0 });
  assert.deepEqual(boardViewPosition(7, 0, 'black'), { x: 0, y: 0 });

  assert.equal(BOARD_EXPORT_SIZE, 1440);
  assert.equal(boardPngFilename(12.509), 'gambit-board-00-12-50.png');
  assert.equal(boardPngFilename(72.349), 'gambit-board-01-12-34.png');
  assert.equal(boardPngFilename(Number.NaN), 'gambit-board-00-00-00.png');

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

  // The character limit is checked before the line split, so one enormous
  // newline-free line must still fail on characters rather than sliding past
  // both guards. The bound is spelled out because `MAX_SCRIPT_CHARACTERS`
  // stays private to `timeline.ts`; keep the two in step.
  const oversizedByCharacters = parseScript('x'.repeat(1_000_001));
  assert.equal(oversizedByCharacters.length, 1);
  assert.match(oversizedByCharacters[0].error, /1,000,000-character limit/);
  assert.match(
    parseScript('x'.repeat(1_000_000))[0].error,
    /missing \[mm:ss\]/,
    'a script exactly at the limit reaches the line grammar',
  );

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
  // A left-press that can't start a move returns silently, which reads as a
  // dead board. The two cases worth naming look identical on screen — a piece
  // sits there and refuses to move — so the reason has to distinguish them.
  const startingState = Chess.stateFromFEN(Chess.STARTING_FEN);
  assert.ok(Object.isFrozen(startingState), 'chess snapshots are immutable values');
  assert.deepEqual(Object.keys(startingState).sort(), ['fen', 'fullmove', 'turn']);
  const cachedStartingMoves = Chess.legalMoves(startingState);
  assert.equal(cachedStartingMoves, Chess.legalMoves(startingState));
  assert.ok(Object.isFrozen(cachedStartingMoves));
  const startingBoard = Chess.board(startingState);
  assert.deepEqual(startingBoard[0][0], { type: 'r', side: 'w' });
  assert.deepEqual(startingBoard[7][0], { type: 'r', side: 'b' });
  {
    const start = startingState;
    assert.equal(
      Chess.explainNoMoves(start, 'e7'),
      "it's White to move",
      'pressing the opponent\'s piece names whose turn it is',
    );
    // Knight d2 absolutely pinned to the e1 king by the bishop on b4.
    const pinned = Chess.stateFromFEN('4k3/8/8/8/1b6/8/3N4/4K3 w - - 0 1');
    assert.equal(
      Chess.explainNoMoves(pinned, 'd2'),
      'that knight has no legal move',
      'a piece of the right colour with nowhere to go names the piece',
    );
    assert.equal(
      Chess.explainNoMoves(start, 'e4'),
      null,
      'an empty square warrants no message — nothing there offered a drag',
    );
    // The reason is re-derived, not taken on trust: a piece that *can* move
    // must never be handed a sentence saying it cannot.
    assert.equal(
      Chess.explainNoMoves(start, 'e2'),
      null,
      'a movable piece yields no explanation even if asked',
    );
  }

  const ambiguous = Chess.stateFromFEN('4k3/8/8/8/8/1N3N2/8/4K3 w - - 0 1');
  assert.equal(Chess.parseSAN('Nd2', ambiguous), null, 'ambiguous SAN must be rejected');
  assert.deepEqual(Chess.parseSAN('Nbd2', ambiguous)?.from, [1, 2]);
  for (const longPawnMove of ['e2e4', 'ee4', '2e4', 'e 4']) {
    assert.equal(
      Chess.parseSAN(longPawnMove, startingState),
      null,
      `non-SAN pawn move ${longPawnMove} must be rejected`,
    );
  }
  const e4Move = Chess.parseSAN('e4', startingState);
  assert.deepEqual(e4Move?.to, [4, 3]);
  const startingFen = startingState.fen;
  const afterE4 = Chess.applyMove(startingState, e4Move);
  assert.equal(startingState.fen, startingFen, 'applying a move does not mutate its input snapshot');
  assert.ok(Object.isFrozen(afterE4));
  assert.deepEqual(Chess.board(afterE4)[3][4], { type: 'p', side: 'w' });
  assert.deepEqual(Chess.parseSAN('e4!', startingState)?.to, [4, 3]);
  for (const normalizedSuffix of ['e4+', 'e4#']) {
    const move = Chess.parseSAN(normalizedSuffix, startingState);
    assert.ok(move, `${normalizedSuffix} follows chess.js suffix normalization`);
    assert.equal(Chess.sanForMove(startingState, move), 'e4');
  }
  for (const badSuffix of ['e4!?', 'e4?!', 'e4!+', 'e4++', 'e4?????']) {
    assert.equal(
      Chess.parseSAN(badSuffix, startingState),
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
  const normalizedRookCheck = Chess.parseSAN('Ra8#', rookCheck);
  assert.ok(normalizedRookCheck);
  assert.equal(Chess.sanForMove(rookCheck, normalizedRookCheck), 'Ra8+');
  assert.ok(Chess.parseSAN('Ra8', rookCheck), 'omitting a check marker stays compatible');

  let scholarsMate = startingState;
  for (const san of ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6']) {
    const move = Chess.parseSAN(san, scholarsMate);
    assert.ok(move, `fixture move ${san} must resolve`);
    scholarsMate = Chess.applyMove(scholarsMate, move);
  }
  assert.ok(Chess.parseSAN('Qxf7#', scholarsMate));
  assert.ok(Chess.parseSAN('Qxf7#!!', scholarsMate));
  const normalizedMate = Chess.parseSAN('Qxf7+', scholarsMate);
  assert.ok(normalizedMate);
  assert.equal(Chess.sanForMove(scholarsMate, normalizedMate), 'Qxf7#');
  assert.ok(Chess.parseSAN('Qxf7', scholarsMate));

  const quietCastle = Chess.stateFromFEN('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
  const quietCastleMove = Chess.parseSAN('O-O', quietCastle);
  assert.ok(quietCastleMove);
  assert.ok(Chess.parseSAN('O-O+', quietCastle));
  assert.equal(Chess.parseSAN('0-0', quietCastle), null, 'strict chess.js SAN rejects zero castling');
  assert.equal(Chess.parseSAN('o-o', quietCastle), null, 'strict chess.js SAN rejects lowercase castling');
  const castledBoard = Chess.board(Chess.applyMove(quietCastle, quietCastleMove));
  assert.deepEqual(castledBoard[0][6], { type: 'k', side: 'w' });
  assert.deepEqual(castledBoard[0][5], { type: 'r', side: 'w' });

  const promotion = Chess.stateFromFEN('7k/P7/8/8/8/8/8/7K w - - 0 1');
  assert.equal(Chess.parseSAN('a8', promotion), null, 'promotion piece must be explicit');
  const promotionMove = Chess.parseSAN('a8=Q', promotion);
  assert.equal(promotionMove?.promotion, 'q');
  assert.deepEqual(
    Chess.board(Chess.applyMove(promotion, promotionMove))[7][0],
    { type: 'q', side: 'w' },
  );

  const capture = Chess.stateFromFEN('7k/8/8/3p4/4P3/8/8/7K w - - 0 1');
  const captureMove = Chess.parseSAN('exd5', capture);
  assert.equal(captureMove?.capture, true);
  const capturedBoard = Chess.board(Chess.applyMove(capture, captureMove));
  assert.deepEqual(capturedBoard[4][3], { type: 'p', side: 'w' });
  assert.equal(capturedBoard[3][4], null);

  // FEN validation and default fields follow chess.js. Gambit retains only a
  // frozen canonical FEN plus the two move-list readouts.
  assert.throws(
    () => Chess.stateFromFEN('7k/8/8/8/8/8/PP6/4K3 w - b3 0 1'),
    /en[- ]passant/i,
  );
  const partialFen = Chess.stateFromFEN('4k3/8/8/8/8/8/8/4K3 w');
  assert.equal(partialFen.fen, '4k3/8/8/8/8/8/8/4K3 w - - 0 1');
  const validEp = Chess.stateFromFEN('7k/8/8/3pP3/8/8/8/7K w - d6 0 1');
  assert.equal(Chess.parseSAN('exd6', validEp)?.enPassant, true);

  assert.throws(
    () => Chess.stateFromFEN('8/8/8/8/8/8/8/4K3 w - - 0 1'),
    /king/i,
  );
  assert.throws(
    () => Chess.stateFromFEN('4k3/8/8/8/8/8/4K3/4K3 w - - 0 1'),
    /king/i,
  );
  assert.throws(
    () => Chess.stateFromFEN('P3k3/8/8/8/8/8/8/4K3 w - - 0 1'),
    /pawn/i,
  );

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

  const replayEvents = parseScript(
    '[1] e4\n[2] br\n[3] e5\n[4] ml\n[5] c5\n[10] rp',
  );
  const replayWorld = buildWorld(replayEvents, standardSetup);
  assert.equal(REPLAY_STEP_SECONDS, 0.5);
  assert.deepEqual(replayWorld.scriptErrors, []);
  assert.equal(replayWorld.visualEndTime, 11);
  assert.deepEqual(
    replayWorld.replaySequences.get(5).frames.map((frame) => frame.sourceEventIndex),
    [0, 4],
    'replay includes applied mainline moves and excludes every move inside br/ml',
  );
  const replayFirst = worldFrameAt(replayWorld, 5, 10);
  assert.equal(replayFirst.replaySourceEventIndex, 0);
  assert.equal(replayFirst.replayActive, true);
  assert.equal(
    worldFrameAt(replayWorld, 5, 10.5).replaySourceEventIndex,
    0,
    'the exact paused-seek boundary still shows the first replay move',
  );
  assert.equal(worldFrameAt(replayWorld, 5, 10.5001).replaySourceEventIndex, 4);
  assert.equal(worldFrameAt(replayWorld, 5, 11).replayActive, false);
  assert.strictEqual(
    worldFrameAt(replayWorld, 5, 10.75).snapshot,
    worldFrameAt(replayWorld, 5, 10.75).snapshot,
    'scrubbing to the same replay time selects the same immutable frame',
  );
  assert.deepEqual(
    buildMainline(
      replayEvents,
      replayWorld.moveStates,
      replayWorld.rejectedEventIndexes,
    ).map((row) => [row.white?.text ?? null, row.black?.text ?? null]),
    [['e4', 'c5']],
    'the replay directive never duplicates moves in the presentation PGN',
  );

  // The walk has to continue from where the replay left the board. This was
  // covered only indirectly: every replay script here ended on its `rp`, so the
  // hand-off to the *next* event was never asserted. It used to be a destructure
  // of the final frame back into the walk's locals — nine fields spelled out a
  // third time, and the one copy TypeScript could not check, since an omitted
  // field there typechecks clean and silently leaves the board stale.
  const afterReplay = buildWorld(
    parseScript('[1] e4\n[2] hl e4 pin\n[3] rp\n[8] hl d4'),
    standardSetup,
  );
  assert.deepEqual(afterReplay.scriptErrors, []);
  const settled = worldFrameAt(afterReplay, 2, 4).snapshot;
  const settledBoard = Chess.board(settled.chessState);
  assert.equal(settledBoard[3][4]?.side, 'w', 'the replayed move survives the replay');
  assert.equal(settledBoard[1][4], null, 'and the pawn is not still on its origin');
  assert.deepEqual(settled.highlights, [], 'replay clears overlays, pinned ones included');
  const nextEvent = worldFrameAt(afterReplay, 3, 8.1).snapshot;
  assert.equal(
    Chess.board(nextEvent.chessState)[3][4]?.side,
    'w',
    'the event after a replay builds on the position the replay ended at',
  );
  assert.deepEqual(
    nextEvent.highlights.map((h) => h.sq),
    ['d4'],
    'and adds to the cleared overlay set rather than a stale one',
  );

  const replayAcrossSetupEvents = parseScript(
    '[1] e4\n[2] st\n[3] d4\n[5] replay',
  );
  const replayAcrossSetups = buildWorld(replayAcrossSetupEvents, standardSetup);
  const setupReplayFrames = replayAcrossSetups.replaySequences.get(3).frames;
  assert.equal(setupReplayFrames.length, 2);
  const afterResetMove = Chess.board(setupReplayFrames[1].snapshot.chessState);
  assert.equal(afterResetMove[1][4]?.side, 'w', 'st restores the e-pawn before the next replay move');
  assert.equal(afterResetMove[3][3]?.side, 'w', 'the post-setup d4 move is still replayed');

  const replayAfterRejectedMove = buildWorld(
    parseScript('[1] e5\n[2] e4\n[5] rp'),
    standardSetup,
  );
  assert.deepEqual([...replayAfterRejectedMove.rejectedEventIndexes], [0]);
  assert.deepEqual(
    replayAfterRejectedMove.replaySequences.get(2).frames.map((frame) => frame.sourceEventIndex),
    [1],
    'moves rejected by the canonical world walk are not revived by replay',
  );

  const overlappingReplay = buildWorld(
    parseScript('[1] e4\n[2] e5\n[3] rp\n[3.5] Nf3'),
    standardSetup,
  );
  assert.equal(overlappingReplay.replaySequences.size, 0);
  assert.match(overlappingReplay.scriptErrors.find((error) => error.line === 3).error, /needs 1\.0s/i);

  const emptyReplay = buildWorld(parseScript('[1] rp'), standardSetup);
  assert.match(emptyReplay.scriptErrors[0].error, /at least one applied mainline move/i);

  const branchReplay = buildWorld(
    parseScript('[1] e4\n[2] br\n[3] e5\n[4] rp\n[5] ml'),
    standardSetup,
  );
  assert.match(branchReplay.scriptErrors.find((error) => error.line === 4).error, /main line/i);

  const mindReplay = buildWorld(
    parseScript('[1] e4\n[2] mind\n[3] rp'),
    standardSetup,
  );
  assert.match(mindReplay.scriptErrors.find((error) => error.line === 3).error, /requires reveal/i);

  const replayAtTail = buildWorld(
    parseScript('[1] e4\n[2] e5\n[29] rp'),
    standardSetup,
  );
  assert.equal(replayAtTail.visualEndTime, 30);
  assert.equal(playbackDuration(replayAtTail.visualEndTime), 33);
  assert.equal(playbackDuration(6), 30, 'the editor still keeps a scrubbable minimum');
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
  const finalRuntimeBoard = Chess.board(finalRuntimeState);
  assert.equal(finalRuntimeBoard[3][4]?.side, 'w');
  assert.equal(finalRuntimeBoard[4][4]?.side, 'b');
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

  // Mainline restore glides rather than snapping: a piece the branch moved
  // carries its branch-final square as moveFrom at the ml timestamp, and a
  // piece the branch captured fades back in via restoredAt. Pieces the branch
  // never disturbed keep their original (pre-branch) metadata untouched.
  const glideRestore = buildWorld(
    parseScript('[1] e4\n[2] br\n[3] d5\n[4] exd5\n[5] ml'),
    standardSetup,
  );
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
  // The cursor index holds, per event, the mainline move the board represents
  // once the playhead has reached that event.
  const presentationResetCursors = buildMainlineCursorIndex(
    parseScript('[1] e4\n[2] rs\n[3] e4'),
    new Set(),
  );
  assert.equal(
    presentationResetCursors[1],
    -1,
    'a setup event clears the current presentation move until the new line advances',
  );
  assert.equal(presentationResetCursors[2], 2);
  const rejectedPresentationFen = parseScript('[1] e4\n[2] fen bad');
  assert.equal(
    buildMainlineCursorIndex(rejectedPresentationFen, new Set([1]))[1],
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

  // The piece click is derived from the frame the board draws, never fired by
  // the event that produced it — so the key it watches has to hold three
  // relations at once, and none of them is visible from the audio side.
  const soundEvents = parseScript('[1] e4\n[2] e5\n[3] hl e4\n[4] rs\n[5] Nf3');
  const soundWorld = buildWorld(soundEvents, standardSetup);
  const soundKeyAt = (build, t) =>
    moveSoundKey(worldFrameAt(build, lastEventIndexAt(soundEvents, t), t).snapshot.lastMove);
  assert.equal(soundKeyAt(soundWorld, 0), null, 'a board before its first move names no move');
  assert.equal(
    shouldPlayMoveSound(null, soundKeyAt(soundWorld, 0), true),
    false,
    'loading the app is not a move landing',
  );
  assert.equal(
    soundKeyAt(soundWorld, 1.2),
    soundKeyAt(soundWorld, 1.9),
    'two frames inside one move are the same move',
  );
  assert.equal(
    soundKeyAt(soundWorld, 2.5),
    soundKeyAt(soundWorld, 3.5),
    'an annotation event does not re-land the move under it',
  );
  assert.equal(
    shouldPlayMoveSound(soundKeyAt(soundWorld, 1.5), soundKeyAt(soundWorld, 2.5), true),
    true,
    'crossing into the next move clicks',
  );
  assert.equal(
    soundKeyAt(soundWorld, 4.5),
    null,
    'a reset leaves no move to name, so the rewound board stays silent',
  );
  // A scrub is one comparison between where the playhead left and where it
  // landed, so ten crossed moves are one click rather than ten.
  const scrubbed = soundKeyAt(soundWorld, 5.5);
  assert.equal(shouldPlayMoveSound(soundKeyAt(soundWorld, 0), scrubbed, true), true);
  assert.equal(
    shouldPlayMoveSound(scrubbed, soundKeyAt(soundWorld, 5.9), true),
    false,
    'the frames after a scrub landing must not re-fire it',
  );
  // Editing the script rebuilds every snapshot. Comparing object identity here
  // would click at every keystroke; the key is a value for exactly that reason.
  assert.equal(
    soundKeyAt(buildWorld(parseScript('[1] e4\n[2] e5\n[3] hl e4\n[4] rs\n[5] Nf3'), standardSetup), 2.5),
    soundKeyAt(soundWorld, 2.5),
    'rebuilding the same script re-derives the same move key',
  );
  // `rp` re-lands moves the script already played. Keying on squares alone
  // would make every replayed move after the first one silent.
  const replaySoundEvents = parseScript('[1] e4\n[2] e5\n[3] rp');
  const replaySoundWorld = buildWorld(replaySoundEvents, standardSetup);
  const replaySoundKeyAt = (t) =>
    moveSoundKey(
      worldFrameAt(replaySoundWorld, lastEventIndexAt(replaySoundEvents, t), t).snapshot.lastMove,
    );
  assert.equal(
    shouldPlayMoveSound(replaySoundKeyAt(1.5), replaySoundKeyAt(3), true),
    true,
    'a replayed move is a new landing, not the same one held',
  );
  assert.equal(
    shouldPlayMoveSound(replaySoundKeyAt(3), replaySoundKeyAt(3.5 + 0.1), true),
    true,
    'each replay step lands its own move — the exact boundary still holds the outgoing one',
  );

  // Muting gates the speaking, and only the speaking. The hook keeps calling
  // the same comparison and advancing the same latch while muted, so the flag
  // belongs inside this predicate rather than around its call: wrapping the
  // call instead would freeze the latch, and unmuting would then click for the
  // move the playhead had been parked on for a minute.
  const mutedLanding = [soundKeyAt(soundWorld, 1.5), soundKeyAt(soundWorld, 2.5)];
  assert.equal(
    shouldPlayMoveSound(...mutedLanding, true),
    true,
    'the same landing that clicks unmuted...',
  );
  assert.equal(
    shouldPlayMoveSound(...mutedLanding, false),
    false,
    '...is silent while muted',
  );
  assert.equal(
    shouldPlayMoveSound(mutedLanding[1], mutedLanding[1], true),
    false,
    'and unmuting on a move already latched does not replay it',
  );
  // The persisted flag rides the same '0'/'1' draft convention as the other
  // transport preferences. Default ON has to survive a value that is neither:
  // a truncated or foreign entry that read as muted would hand a creator a
  // recording with no click in it and nothing on screen to explain why.
  assert.equal(moveSoundEnabled('1'), true, "'1' is the stored on value");
  assert.equal(moveSoundEnabled('0'), false, "'0' is the only muting value");
  for (const junk of ['', 'true', 'false', '00', ' 0']) {
    assert.equal(
      moveSoundEnabled(junk),
      true,
      `a draft of ${JSON.stringify(junk)} falls back to the sound being on`,
    );
  }

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

  // A rasterize that never settles left the export button disabled and playback
  // paused for the rest of the session, because the caller's `finally` waits on
  // a promise that never resolves. The ceiling is what makes the existing
  // 'Retry PNG' state reachable at all.
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
  // The loser's timer must be cleared, or a 15s handle would keep the process
  // (and, in the browser, the tab's timer queue) alive after every export.
  const beforeTimers = process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;
  await withTimeout(Promise.resolve(1), 60_000, 'unused');
  assert.equal(
    process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length,
    beforeTimers,
    'the timeout handle is cleared when the work wins the race',
  );

  // Timing out abandons the rasterize but cannot cancel it. If it settles later
  // it must stay silent: a PNG landing in Downloads after the band said the
  // export failed is stamped with a time the board has long since left. Both
  // impure steps are seams, so this exercises the contract rather than grepping
  // the source — a source check passes an `if (aborted) console.warn()` and
  // fails a rename of `blob`.
  {
    const fakeBlob = { size: 1 };
    const runExport = async (aborted) => {
      const delivered = [];
      const controller = new AbortController();
      if (aborted) controller.abort();
      await downloadBoardPng({}, 12.5, {
        signal: controller.signal,
        exporter: Promise.resolve({ toBlob: async () => fakeBlob }),
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
        exporter: Promise.resolve({ toBlob: async () => null }),
        deliver: () => {
          throw new Error('delivered an empty PNG');
        },
      }),
      /empty PNG/,
      'an empty rasterize is an error, not a silent no-op',
    );
  }

  // Errors accumulate in two passes, so their natural order is by stage, not by
  // script. The band is read against the text the author is about to fix, and
  // role="status" announces it in that same order.
  {
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
  }

  // The insert menu is the script language's only catalogue, and the reason it
  // exists is that the language outgrew its interface: the parser reached
  // twelve kinds while `mind`, `reveal`, and `pin` never got a surface. Chain
  // the catalogue to something the compiler already forces to be exhaustive.
  // markerColors is Record<MarkerKind, string> and MarkerKind is
  // ParsedEvent['kind'] | 'err', so a thirteenth kind fails typecheck until
  // it's added there — and fails here until it's also in COMMANDS, i.e. until
  // it is reachable in the UI.
  const parserKinds = new Set(Object.keys(markerColors).filter((k) => k !== 'err'));
  const cataloguedKinds = new Set(COMMANDS.map((c) => c.kind));
  assert.deepEqual(
    [...cataloguedKinds].sort(),
    [...parserKinds].sort(),
    'every parser event kind is listed in the insert menu catalogue',
  );

  // Each one-click command must write a line the parser accepts as its own
  // kind, through the real insert path rather than a hand-built line. A body
  // that parses to an error would put a red line in the script the moment the
  // user clicked a menu row.
  //
  // One loop, not two. A hand-built `parseScript(\`[00:01.0] ${c.body}\`)` pass
  // used to run first, and it could not fail on its own: `planLineInsert`
  // writes the body verbatim after a formatted timestamp, and an ErrorEvent
  // carries no `kind`, so the kind assertion below already fails on anything
  // that parses to an error. The planner form is strictly stronger — it also
  // catches a body that plans a conflict instead of an edit.
  for (const c of INSERTABLE_COMMANDS) {
    const plan = planLineInsert([], '', 1, c.body);
    assert.equal(plan.kind, 'edit', `${c.token} plans an edit into an empty script`);
    const events = parseScript(plan.text);
    assert.equal(events.length, 1, `${c.token} inserts exactly one event`);
    assert.equal(events[0].kind, c.kind, `${c.token} parses as the kind it advertises`);
  }

  // The split is the menu's whole shape: the argument-free kinds insert, and
  // the ones needing a square or a position route to the board and to Setup.
  assert.equal(INSERTABLE_COMMANDS.length, 8);
  // Asserted through AUTHORED_ELSEWHERE_COMMANDS rather than by re-deriving
  // `c.body == null` here: that array is what the menu's second section
  // renders, and re-spelling its definition in the test left the export
  // itself — the last link in the catalogue-to-UI chain — untouched by the
  // suite.
  assert.deepEqual(
    AUTHORED_ELSEWHERE_COMMANDS.map((c) => c.kind).sort(),
    ['arrow', 'fen', 'highlight', 'move'],
    'only the kinds with another authoring path opt out of one-click insert',
  );
  assert.equal(
    AUTHORED_ELSEWHERE_COMMANDS.length + INSERTABLE_COMMANDS.length,
    COMMANDS.length,
    'the two menu sections partition the catalogue — no command is unreachable',
  );
  for (const c of AUTHORED_ELSEWHERE_COMMANDS) {
    assert.ok(c.via, `${c.token} tells the user where it is authored instead`);
  }

  // The Text view's syntax line is the catalogue's second surface, and the
  // chain above stopped at the menu — nothing asserted that the hint names
  // every kind, which is precisely how it came to name ten of twelve.
  //
  // Asserted against the rendered element, not against SYNTAX_GROUPS. Two
  // earlier forms compared the groups to COMMANDS — first by length, then by
  // content and order — and *neither could fail*: the reduce that builds
  // SYNTAX_GROUPS appends exactly one name per command on both of its
  // branches, so both the length and the flattened list equal COMMANDS'
  // by construction, for any COMMANDS. Swapping length for content changed
  // nothing about which input could vary.
  //
  // Coverage is now structural — the groups are derived from the catalogue, so
  // the hint cannot name ten of twelve again — and what is left to check is the
  // rendering, which is not: `group.join(' / ')` written as `group[0]` drops
  // `ml` and `reveal` from the string a reader actually sees, silently. That is
  // the same hole, one layer down, and it is why `SYNTAX_HINT` is an importable
  // module instead of a local in `App.tsx`.
  const hintText = (node) => {
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(hintText).join('');
    return hintText(node.props?.children);
  };
  const hint = hintText(SYNTAX_HINT);
  for (const c of COMMANDS) {
    const name = c.token === '->' ? c.syntax : c.token;
    assert.ok(name, `${c.kind} has a name to print`);
    assert.equal(
      hint.split(name).length - 1,
      1,
      `the syntax line names ${c.kind} exactly once, as \`${name}\``,
    );
  }
  // `->` alone reads as punctuation, so the hint borrows the catalogue's own
  // example rather than inventing one — it shipped `a1->b2` while the insert
  // menu two panels away taught `f3->e5`.
  assert.doesNotMatch(hint, /(?<![\w>])->(?![\w])/, 'the arrow is shown as a move, not as bare punctuation');
  // The separators are what make the pairs legible: a pair is one unit, and
  // `br / ml` must not read as two independent commands in a `·` list.
  assert.ok(hint.startsWith('[mm:ss.s] '), 'the line leads with the timestamp shape');
  assert.deepEqual(
    hint.slice('[mm:ss.s] '.length).split(' · '),
    SYNTAX_GROUPS.map((g) => g.join(' / ')),
    'every group renders, joined as a pair or standing alone',
  );
  // A pair renders as one unwrappable unit, so `closes` has to name a real
  // token — and the two halves have to stay adjacent. Reading the relation off
  // array position (the earlier form) meant moving `rp` between `mind` and
  // `reveal` silently rendered `rp / reveal` as a pair.
  const tokens_ = COMMANDS.map((c) => c.token);
  for (const c of COMMANDS) {
    if (c.closes == null) continue;
    // Adjacency alone; a preceding `includes(c.closes)` was a message alias for
    // it, since `tokens_[i - 1] === c.closes` already implies membership and
    // `tokens_[-1]` is undefined when the closer comes first.
    assert.equal(
      tokens_[tokens_.indexOf(c.token) - 1],
      c.closes,
      `${c.token} sits directly after the ${c.closes} it closes, and that token exists`,
    );
  }
  assert.deepEqual(
    SYNTAX_GROUPS.filter((g) => g.length > 1),
    [['br', 'ml'], ['mind', 'reveal']],
    'the two paired kinds group, and nothing else does',
  );

  // Comments are stripped before any CSS/TS reader below pulls a value: these
  // rules carry long prose that mentions the very properties being read
  // ('.playhead-thumb' explains its own `top:` in words), and a bare regex
  // happily matches the explanation instead of the declaration. It also keeps
  // `[^}]*` rule scans honest, since prose is the only place a stray brace
  // would come from.
  const bare = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '');
  const bareStyles = bare(styles);

  // Every rule for a selector, across all tiers. Escapes the selector itself,
  // so callers write plain CSS: an earlier form took a regex fragment, and
  // `cssRules('\\.subtitle-strip')` beside `cssRule('.subtitle-strip')` meant
  // swapping one for the other failed silently in one direction, since an
  // unescaped `.` matches any character. One spelling also fixed the stricter
  // dialect's own hazard: a `.subtitle-strip{` written without the space
  // dropped that tier out of the set, `smallest()` fell back to base padding,
  // and the cue-fits-track assertion passed vacuously while staying green.
  const cssRules = (selector, source = bareStyles) =>
    source.match(
      new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`, 'g'),
    ) ?? [];

  // The one rule for a top-level selector. Built on `cssRules` rather than
  // beside it: these were two readers for the same text with two matching
  // dialects, and the divergence that mattered was invisible at the call site
  // — `cssRules` read comment-stripped source while `cssRule` sliced the raw
  // file to the next `}`, so the `[^}]*` hazard `bare` exists to prevent was
  // unguarded in exactly the reader with thirteen call sites. The `\n` prefix
  // is what keeps `cssRule('.marker')` from matching a `.timeline .marker`
  // rule; `anchor` picks between same-selector tiers.
  const cssRule = (selector, anchor = '') => {
    const rule = cssRules(`\n${selector}`).find((r) => r.includes(anchor));
    assert.ok(rule, `${selector} exists`);
    return rule;
  };

  // Recording layout is an authored invariant: normal laptop heights keep
  // the 720px artifact, while only genuinely short desktop viewports use the
  // 560px fallback. Guard the real CSS surface so the old dvh formulas cannot
  // quietly return.
  assert.match(styles, /--artifact-fit-width:\s*var\(--artifact-width\)/);
  assert.match(styles, /@media \(max-width:\s*1240px\)/);
  // Between the stack point and the old 1380px one the side panel flexes into
  // whatever the board leaves, so 1280x800 gets a two-column layout instead of
  // stacking the panel under the board and pushing the transport 889px down the
  // page. The band must keep the board on its authored track: the panel is what
  // yields, never the recording artifact.
  assert.match(
    styles,
    /@media \(min-width:\s*1241px\) and \(max-width:\s*1380px\)[\s\S]*?grid-template-columns:\s*var\(--artifact-fit-width\) minmax\(0,\s*1fr\)/,
    'the intermediate two-column band flexes the panel, never the artifact',
  );
  assert.match(
    styles,
    /@media \(min-width:\s*1081px\) and \(max-height:\s*760px\)[\s\S]*?--artifact-fit-width:\s*560px/,
  );
  // docs/design.md names this the enforcement of the 720px recording-frame
  // invariant, so it asserts the property rather than one spelling of its
  // violation. Banning the literal `100dvh` let `100vh` through — the reflex
  // spelling of the very thing being banned — along with `90svh`,
  // `clamp(400px, 90dvh, 720px)`, and any indirection through a second custom
  // property that holds the formula. An allowlist has no such gaps: the
  // artifact is the authored token or a literal size, full stop.
  //
  // Both tokens, not just the outer one. The allowlist blesses
  // `var(--artifact-width)`, so checking only `--artifact-fit-width` closed
  // every indirection *except* the one it depends on: redeclaring
  // `--artifact-width: min(720px, calc(100dvh - 220px))` in a media query
  // passed, and shrank the recording frame on every ordinary laptop.
  const fitValues = [
    ...bare(styles).matchAll(/--artifact-(?:fit-)?width:\s*([^;]+);/g),
  ].map((m) => m[1].trim());
  assert.ok(fitValues.length >= 3, 'the artifact size is declared for the base and the 560px band');
  for (const value of fitValues) {
    assert.match(
      value,
      /^(var\(--artifact-width\)|\d+px)$/,
      'the recording frame is an authored size, never derived from the viewport',
    );
  }
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

  const cssNum = (source, prop, label = prop) => {
    const m = bare(source).match(new RegExp(`(?:^|[;{\\s])${prop}:\\s*(-?[\\d.]+)`));
    assert.ok(m, `${label} is declared as a number so the geometry stays derivable`);
    return Number(m[1]);
  };
  // Asserts rather than indexing a null match: `padding` rewritten as the
  // `padding-block`/`padding-inline` pair this stylesheet also uses is a legal
  // edit, and it turned this helper into a TypeError — a stack trace where the
  // suite's job is to name what broke.
  const cssLengths = (source, prop) => {
    const m = bare(source).match(new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;]+)[;}]`));
    assert.ok(m, `${prop} is declared as a length shorthand`);
    return m[1].trim().split(/\s+/).map((v) => Number.parseFloat(v));
  };
  // Top-level `@media` blocks, brace-balanced. Splitting on `@media` would be
  // shorter and wrong: the text after a query's closing brace belongs to no
  // query, and the reserve guard below asks whether one *specific* block holds
  // both halves of a pair.
  const styleRegions = () => {
    const src = bare(styles);
    const regions = [];
    let cursor = 0;
    for (let at = src.indexOf('\n@media'); at !== -1; at = src.indexOf('\n@media', at + 1)) {
      let depth = 0;
      for (let i = at; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) {
          if (at > cursor) regions.push({ query: null, css: src.slice(cursor, at) });
          regions.push({
            query: src.slice(at, src.indexOf('{', at)).trim(),
            css: src.slice(at, i + 1),
          });
          cursor = i + 1;
          at = i;
          break;
        }
      }
    }
    if (cursor < src.length) regions.push({ query: null, css: src.slice(cursor) });
    return regions;
  };
  const mediaBlocks = () => styleRegions().flatMap((r) => (r.query === null ? [] : [r.css]));

  // Media-query modelling, shared by the cascade guards below. `conditions`
  // returns null for a query it cannot express, so each caller decides what
  // that means rather than silently reading it as "matches everywhere".
  const FEATURE = /\((min|max)-(width|height):\s*(\d+)px\)/g;
  const conditions = (query) => {
    const parsed = [...query.matchAll(FEATURE)].map((m) => ({
      bound: m[1],
      axis: m[2],
      px: Number(m[3]),
    }));
    const modelled = query.replace(FEATURE, '').replace(/@media|and|\s/g, '');
    return modelled === '' ? parsed : null;
  };
  const matches = (conds, w, h) =>
    conds.every(({ bound, axis, px }) => {
      const v = axis === 'width' ? w : h;
      return bound === 'min' ? v >= px : v <= px;
    });

  // Representative viewports: every breakpoint in the stylesheet and one pixel
  // either side, so both ladders are sampled on both sides of every step. Media
  // queries are step functions, so this finite grid covers every distinct
  // combination the cascade can produce.
  //
  // Shared by the two guards that need to evaluate the cascade rather than read
  // it — the subtitle fit below, and the 560px band's co-application check.
  // They used to share it by nesting, which is not sharing.
  const axis = (which) => {
    const seen = new Set([320, 4000]);
    for (const m of bareStyles.matchAll(new RegExp(`(?:min|max)-${which}:\\s*(\\d+)px`, 'g'))) {
      const n = Number(m[1]);
      seen.add(n - 1);
      seen.add(n);
      seen.add(n + 1);
    }
    return [...seen].filter((n) => n >= 320);
  };
  const widths = axis('width');
  const heights = axis('height');
  // Stated where it is knowable. A counter incremented inside the fit loop
  // said the same thing later and could not fail: that loop has no `continue`
  // and no early exit, so its trip count is fixed before it starts.
  assert.ok(
    widths.length * heights.length > 100,
    'the breakpoint sample covers both ladders on both sides of every step',
  );

  // The cue is read at delivery size, not authoring size, so it is sized as a
  // share of the composed frame the way broadcast captions are. But its track
  // is `auto`: a cue too big for the track's declared minimum grows the row,
  // and a *one-line* cue that grows the row shifts the transport the moment a
  // subtitle appears — exactly the layout stability the fixed track exists to
  // provide. That shipped: the 761-840px band kept the base cue while dropping
  // the track, because cue and track lived in different rules and nothing tied
  // them together. They are now one colocated token pair, and this guard
  // enforces the colocation rather than checking a single tier.
  {
    // Evaluated at real viewports rather than by taking a minimum over the
    // file. The previous form credited every tier with the *smallest* strip
    // padding declared anywhere, and larger chrome is the harder constraint —
    // so it leaned lenient in exactly the direction that matters. It could not
    // do better in that shape: the strip's padding tiers sit on a different
    // breakpoint ladder (1040/920/600) from the token tiers (920/760/600), so
    // "the padding that applies at this tier" was not expressible at all.
    //
    // Verified escape: adding `@media (max-height: 700px) { .subtitle-strip {
    // padding-top: 4px } }` and then dropping the 920 tier's track from 57px to
    // 54px passed, while at any viewport 840 < h <= 920 the real chrome is 17px
    // and a one-line 29px cue needs 56.44px — the row grows and the transport
    // shifts the moment a subtitle appears.
    //
    // Media queries are step functions, so a finite set of representative
    // viewports — every declared breakpoint, and one pixel either side of it —
    // covers every distinct combination the cascade can produce. Both ladders
    // are then resolved the way the browser resolves them, in source order, and
    // the fit is checked where the numbers actually meet.
    // A region is a tier iff it declares something the fit actually reads.
    // Selecting on the substring "subtitle" instead meant any block merely
    // mentioning the word had to be modellable, so adding the accessibility
    // rule DESIGN.md asks for — `@media (prefers-reduced-motion: reduce) {
    // .subtitle-strip p { transition: none } }`, which moves none of the five
    // numbers — failed the suite with a message about width/height terms.
    const READS =
      /(--subtitle-track-height|--subtitle-cue-size)\s*:|\.subtitle-strip[^{}]*\{[^}]*(padding[\w-]*|border-block|line-height)\s*:/;
    const tiers = [];
    for (const region of styleRegions()) {
      if (!READS.test(region.css)) continue;
      const conds = region.query === null ? [] : conditions(region.query);
      assert.ok(
        conds,
        `${region.query} moves a number the subtitle fit reads, so this guard has to be able to place it`,
      );
      tiers.push({ conds, css: region.css, decls: new Map() });
    }
    assert.ok(tiers.length >= 5, 'the subtitle ladders are found across the sheet');

    // Declarations parsed once per tier, in source order, through the file's
    // one rule scanner. The grid below asks ~400 questions; resolving each by
    // re-scanning the stylesheet meant 8k regex compiles and ~35MB re-read per
    // `npm test`, and — worse for a file whose subject is exactly this — it was
    // a third and fourth spelling of `cssRules`, seventy lines under the
    // comment explaining why there is only one.
    const SELECTORS = [':root', '.subtitle-strip', '.subtitle-strip p'];
    const DECL = /(?:^|[;{])\s*([\w-]+)\s*:\s*([^;}]+)/g;
    for (const tier of tiers) {
      for (const selector of SELECTORS) {
        const entries = [];
        for (const rule of cssRules(selector, tier.css)) {
          for (const [, prop, value] of rule.slice(rule.indexOf('{')).matchAll(DECL)) {
            entries.push([prop, value.trim()]);
          }
        }
        tier.decls.set(selector, entries);
      }
    }

    const px = (v) => Number.parseFloat(v);
    const resolve = (w, h, selector, prop) => {
      let value = null;
      for (const tier of tiers) {
        if (!matches(tier.conds, w, h)) continue;
        for (const [p, v] of tier.decls.get(selector)) if (p === prop) value = v;
      }
      return value;
    };

    // Block padding resolved per longhand, in declaration order — `padding`,
    // `padding-block`, and the two sides all write the same two numbers, and
    // which one wins is a question of order rather than of precedence. Reading
    // only the `padding` shorthand is what made an earlier helper throw a
    // TypeError when the base rule was restated as the `padding-block` /
    // `padding-inline` pair this stylesheet also uses elsewhere: a legal,
    // behavior-identical edit, answered with a stack trace instead of a verdict.
    const blockPadding = (w, h) => {
      let top = null;
      let bottom = null;
      for (const tier of tiers) {
        if (!matches(tier.conds, w, h)) continue;
        for (const [prop, value] of tier.decls.get('.subtitle-strip')) {
          const parts = value.split(/\s+/).map(px);
          if (prop === 'padding') [top, bottom] = [parts[0], parts[2] ?? parts[0]];
          else if (prop === 'padding-block') [top, bottom] = [parts[0], parts[1] ?? parts[0]];
          else if (prop === 'padding-top') top = parts[0];
          else if (prop === 'padding-bottom') bottom = parts[0];
        }
      }
      assert.ok(
        top !== null && bottom !== null,
        `the subtitle strip declares its block padding (unresolved at ${w}x${h})`,
      );
      return [top, bottom];
    };


    for (const w of widths) {
      for (const h of heights) {
        const track = px(resolve(w, h, ':root', '--subtitle-track-height'));
        const cue = px(resolve(w, h, ':root', '--subtitle-cue-size'));
        const lh = px(resolve(w, h, '.subtitle-strip p', 'line-height'));
        const [padTop, padBottom] = blockPadding(w, h);
        // The 2px `border-block` is part of the border-box the track measures,
        // and leaving it out is what made the base-tier comment claim a 46px
        // content box where the browser has 44.
        const border = px(resolve(w, h, '.subtitle-strip', 'border-block')) * 2;
        const needed = cue * lh + padTop + padBottom + border;
        assert.ok(
          needed <= track,
          `at ${w}x${h} a one-line ${cue}px cue needs ${needed.toFixed(2)}px and the track declares ${track}px`,
        );
      }
    }

    // Every `:root` that redefines either token must redefine both — that is
    // the structural property, and it is what makes the per-tier fit checkable
    // at all. A tier that moves one number in isolation fails here.
    const roots = cssRules(':root');
    const pairs = roots
      .filter((r) => /--subtitle-(track-height|cue-size)/.test(r))
      .map((r) => ({
        track: cssNum(r, '--subtitle-track-height', 'the tier track'),
        cue: cssNum(r, '--subtitle-cue-size', 'the tier cue'),
      }));
    assert.ok(pairs.length >= 4, 'every subtitle tier declares its pair');
    // The fit itself is checked on the viewport grid above; colocation is what
    // keeps a tier from moving one of the two numbers without the other, which
    // the grid would then catch as a real overflow rather than as a drift.

    // Below ~3% of the composed frame the cue stops surviving the downscale
    // this tool exists to produce; the base was 21px (2.6%). Derive the frame
    // from the tokens rather than restating 798 as a literal.
    const base = pairs[0];
    const artifact = cssNum(cssRule(':root'), '--artifact-width');
    const seam = cssNum(cssRule(':root'), '--board-seam');
    const frame = artifact + base.track - seam;
    assert.ok(
      base.cue / frame >= 0.03,
      `the cue holds a caption-scale share of the ${frame}px frame`,
    );

    // The 560px frame is narrower, so the base cue would wrap to two lines,
    // double the track, and land the floating bar on the subtitles. Found by
    // the artifact size it declares rather than by its query text: the point
    // is that whichever tier shrinks the board also shrinks the cue.
    const shortDesktop = roots.find((r) => /--artifact-fit-width:\s*560px/.test(r));
    assert.ok(shortDesktop, 'the 560px band declares its own artifact size');
    assert.ok(
      cssNum(shortDesktop, '--subtitle-cue-size') < base.cue,
      'the 560px frame scales its cue down with the artifact',
    );
    // Every viewport the 560 band matches also matches the taller height tiers,
    // and media queries add no specificity — being declared last is the only
    // thing that lets its smaller pair win. Nothing in the block itself says so,
    // and the first attempt at this patched around the ordering with a
    // complement query rather than fixing it.
    //
    // Stated positionally over the real block list rather than as one pairwise
    // `indexOf` comparison against a query string. That form was wrong twice
    // over: it failed *open* (a needle that no longer matches returns -1, and
    // `n > -1` is permanently true, so retuning `920px` to `900px` disarmed the
    // guard silently), and it said nothing about tiers not yet written — a new
    // `max-height: 800px` block appended after the 560 band passed it while
    // handing the 560px board a 27px cue.
    const regions = styleRegions().filter((r) => r.query !== null);
    const bandAt = regions.findIndex((r) => /--artifact-fit-width:\s*560px/.test(r.css));
    assert.notEqual(bandAt, -1, 'the 560px band is a top-level media block');
    const bandConds = conditions(regions[bandAt].query);
    assert.ok(bandConds, 'the 560px band states itself in width/height terms');
    const COUPLED = /--(artifact-fit-width|subtitle-cue-size|subtitle-track-height)\s*:/;
    // "Can co-apply" is answered by the evaluator, not by reading the query
    // text: a later block may redeclare the pair only if no viewport satisfies
    // both it and the band. Two earlier forms each guessed at that from the
    // header — first requiring a `max-height` (which let a plain
    // `@media (min-width: 1081px)` block through, no `max-height`, skipped by
    // the filter, overriding the band everywhere it matches), then requiring a
    // `max-width` <= 1080 (which fails a later block gated only on height, one
    // that can never co-apply, and invites the next reader to widen the regex
    // rather than to use the model sitting in scope).
    for (const [i, region] of regions.entries()) {
      if (i <= bandAt || !COUPLED.test(region.css)) continue;
      const conds = conditions(region.query);
      assert.ok(
        conds,
        `${region.query} redeclares the coupled tokens after the 560px band, so this guard has to be able to place it`,
      );
      const overlap = widths.some((w) =>
        heights.some((h) => matches(bandConds, w, h) && matches(conds, w, h)),
      );
      assert.ok(
        !overlap,
        `${region.query} is declared after the 560px band and can co-apply with it, so it would override the band's artifact/cue pair`,
      );
    }
  }

  // Present hides the header, panel, and footer and fixes the transport, so
  // the artifact is `.app`'s only in-flow child. Un-centered it pinned to the
  // top of a viewport-tall #root and left a 258px void above the floating bar
  // on a 1210px-tall window — the recording frame sitting at the top edge of
  // its own presentation view.
  {
    const present = cssRule('.app--present');
    assert.match(present, /min-height:\s*100dvh/, 'present fills the viewport it centers in');
    // `safe` is the whole reason this is sound on a short window: plain
    // `center` overflows in both directions and puts the board's top edge
    // above the scroll origin, where it can never be scrolled back into view.
    assert.match(
      present,
      /justify-content:\s*safe center/,
      'centering degrades to top-aligned rather than pushing the board out of reach',
    );
    // Centering on the bare viewport would slide the artifact under the fixed
    // bar; the reserve is what makes "centered" mean "centered in what's left".
    assert.match(
      present,
      /padding-bottom:\s*var\(--present-bar-reserve\)/,
      'the floating transport keeps a reserved footprint',
    );
    // ...and gives it back wherever the bar is put in flow, or present mode
    // parks an empty 130px band under an in-flow console. Checked per query
    // block, not as two global tallies: equal counts also pass when a tier
    // un-floats the bar and a *different* tier drops the reserve, which is the
    // pairing this is for. The earlier form also matched one exact single-line
    // string, so reformatting the rule would have silently disarmed it.
    const unfloated = mediaBlocks().filter((b) =>
      /\.app--present \.controls \{[^}]*position:\s*static/.test(b),
    );
    assert.ok(unfloated.length >= 2, 'the bar goes in flow on narrow and on short viewports');
    for (const block of unfloated) {
      assert.match(
        block,
        /\.app--present\s*\{[^}]*--present-bar-reserve:\s*0/,
        `${block.slice(0, block.indexOf('{')).trim()} un-floats the bar without dropping its reserve`,
      );
    }
    // The artifact stays its authored size through all of it — the standing
    // invariant this section is most likely to erode.
    assert.doesNotMatch(present, /--artifact-fit-width/);
  }

  // The scrub thumb is the only part of the transport that *looks* draggable,
  // and it was drawn 10px above the rail — inside the pin row, where the
  // marker hit extensions sit above the scrub input. Pressing it activated a
  // seek button instead of starting a drag, so the affordance was dead while
  // the bare rail 10px below scrubbed fine. Re-derive the arithmetic here
  // rather than pinning the literal, so the next row-height or gap edit fails
  // this instead of silently sliding the thumb off the rail again.
  {
    const root = cssRule(':root');
    const token = (name) => cssNum(root, `--${name}`, `--${name}`);
    const pinRow = token('tl-pin-row');
    const rail = token('tl-rail');
    const gap = token('tl-row-gap');
    const padTop = token('tl-pad-top');
    const thumb = cssRule('.playhead-thumb');
    const thumbSize = cssNum(thumb, 'height');
    // Deliberately no `--tl-crown` term: marker geometry below is measured from
    // the timeline's own top, while the thumb's `top:` is measured from the
    // playhead, which starts one crown higher. Adding the crown here would keep
    // the suite green while changing what the pin-vs-thumb assertion means.
    const railCenter = padTop + pinRow + gap + rail / 2;

    // The offset is a calc() over those tokens rather than their hand-summed
    // total, so it cannot drift when a row height changes — which is the
    // failure that shipped. Assert the derivation, not the arithmetic: a
    // literal here would be exactly the regression, however correct today.
    const top = thumb.match(/top:\s*calc\(([\s\S]*?)\);/);
    assert.ok(top, 'the scrub thumb derives its offset instead of hardcoding it');
    for (const name of ['tl-crown', 'tl-pad-top', 'tl-pin-row', 'tl-row-gap', 'tl-rail']) {
      assert.ok(
        top[1].includes(`var(--${name})`),
        `the thumb offset accounts for --${name}`,
      );
    }
    // The grid it is derived from must be the grid that is actually drawn.
    assert.match(
      cssRule('.timeline'),
      /grid-template-rows:\s*var\(--tl-pin-row\) var\(--tl-rail\)/,
      'the ruler rows and the thumb offset read the same tokens',
    );

    // A 14px thumb on a 6px rail overhangs it, so clearing the *rail* is not
    // enough: the pin's hit extension has to stop above the thumb itself.
    const markerBottom = padTop + (pinRow + cssNum(cssRule('.marker'), 'height')) / 2;
    const [, , insetBottom] = cssLengths(cssRule('.marker::before'), 'inset');
    assert.ok(
      markerBottom - insetBottom <= railCenter - thumbSize / 2,
      'a pin hit target never covers the scrub thumb it sits above',
    );
    // The strand's own top is the same crown, so the thumb's offset is
    // measured from where the playhead actually starts.
    assert.match(
      cssRule('.playhead'),
      /top:\s*calc\(-1 \* var\(--tl-crown\)\)/,
      'the playhead strand and the thumb share one crown',
    );
  }

  // The authored `hl` and the automatic last-move mark are two different
  // meanings on the same board, and they used to be the same amber flood 3%
  // of alpha apart (0.55 vs 0.52) — in the recording, a viewer could not tell
  // "the tool moved a piece here" from "the teacher is pointing here". Kind is
  // never color alone, so they must differ in FORM. The authored `hl` is the
  // one that takes a form: it is rare and aimed, and a ring points where a
  // flood only washes. The last move keeps the flood because it marks two
  // squares on every single move — ringing those put a hard box on every move
  // of the recording, and a box around an empty origin square read as a
  // selection artifact rather than as chess.
  {
    assert.ok(boardTokens.boardLastMoveOnDark, 'the last move keeps its flood tokens');
    // The ring is opaque, and that is load-bearing rather than incidental: a
    // translucent stroke takes on whatever square it covers, so the same token
    // composited to two colors and needed a per-square-color alpha pair to
    // compensate. Opaque is one pen everywhere, so one token replaces the pair.
    assert.match(
      boardTokens.boardHighlightRing,
      /^#[0-9a-f]{6}$/i,
      'the `hl` ring is an opaque stroke, so it does not take on the square under it',
    );
    // No assertion that the per-square-color variants are absent: `git log -S`
    // over the whole history shows `boardHighlightRingOnLight`/`OnDark` were
    // never committed under those or any names — the 0.72/0.88 pair was a
    // considered and rejected design, so guarding it by spelling could only
    // ever catch someone independently inventing those two exact strings. The
    // opacity invariant is covered behaviorally two lines up (a six-digit hex
    // has no alpha) and again where the rendered element's stroke is read.
    // The board stop is tuned for the flood and is nearly cream's luminance;
    // a ring drawn in it measured 1.15:1 there. The ring uses marker amber,
    // which is also what this event's timeline pin and seek dot already use —
    // asserted here as an equality until `tokens.ts` was changed to *define* it
    // as `markerColors.highlight`. One highlight reading identically on the
    // board, the pin, and the seek dot is now a fact about the source, not a
    // coincidence this file re-checks after the fact.
    assert.equal(
      boardTokens.boardHighlight,
      undefined,
      'the old flood token is gone, so nothing can quietly re-flood `hl`',
    );
    const lastMoveRect = boardSource.slice(
      boardSource.indexOf('{lastMove &&'),
      boardSource.indexOf('litHighlights.map'),
    );
    assert.ok(lastMoveRect.length > 0, 'the last-move overlay slice found its bounds');
    assert.match(
      lastMoveRect,
      /fill={fill}/,
      'the last move stays a flood — a ring on every move is visual noise',
    );
    assert.doesNotMatch(lastMoveRect, /stroke=/, 'the last move never takes a stroke');
    // …and which fill each square gets is asserted by calling the rule, not by
    // quoting it. `lastMoveSquares` returns the pair, so the guard can state
    // the thing that actually matters — an annotated move repaints only where
    // it *landed* — instead of matching a ternary that any rename breaks.
    // e2 (light) → e5 (dark), so the pair also pins the per-square amber stops
    // in place; a single flood value for both would pass a same-color move.
    const plain = { fromF: 4, fromR: 1, toF: 4, toR: 4, t: 0 };
    assert.deepEqual(
      lastMoveSquares(plain).map((sq) => sq.fill),
      [boardTokens.boardLastMoveOnLight, boardTokens.boardLastMoveOnDark],
      'an unannotated move is amber on both squares, per-square alpha unchanged',
    );
    const judged = lastMoveSquares({ ...plain, annotation: 'blunder' });
    assert.equal(
      judged[0].fill,
      boardTokens.boardLastMoveOnLight,
      'the origin square keeps the amber, so a move still reads directionally',
    );
    assert.equal(
      judged[1].fill,
      annotationColors.blunder,
      'the landing square carries the judgment',
    );
    assert.ok(
      judged[1].alpha > 0 && judged[1].alpha < 1,
      'the judgment is a tint over the square, not a repaint of it',
    );
    // Both `hl` surfaces — the live overlay and the in-flight gesture preview —
    // go through one component, so a preview can never promise a mark the
    // committed script would not draw. `HlRing` returns the element, so this
    // reads the props it actually renders: calling it is cheap and needs no
    // renderer, and unlike matching call-site text it survives a rename.
    //
    // Returning the element is what makes the geometry safe at all. As a props
    // bag every call site spread it, and `{...hlRingCircle(v)} r={30}` won
    // silently — a verified escape past three earlier versions of this guard,
    // each of which policed a proxy: the count of call sites, then the count of
    // token names, then where the color could be spelled. That last one also
    // failed CI on a *comment* mentioning the token, which is how a guard gets
    // deleted by whoever trips it first.
    const ring = HlRing({ view: { x: 0, y: 0 } }).props;
    assert.equal(ring.fill, 'none', 'the ring is a stroke, never a flood');
    assert.equal(ring.stroke, boardTokens.boardHighlightRing);
    assert.ok(ring.r > 0 && ring.r < 50, 'the ring stays inside its square');
    assert.deepEqual([ring.cx, ring.cy], [50, 50], 'the ring centers on its square');
    assert.deepEqual(
      HlRing({ view: { x: 3, y: 2 } }).props,
      { ...ring, cx: 350, cy: 250 },
      'only the center moves with the square — one pen, one radius, everywhere',
    );
    // The optional props may move the ring's opacity and its growth, and
    // nothing else. A call site cannot reach the pen.
    const scaled = HlRing({ view: { x: 0, y: 0 }, opacity: 0.5, scale: 2 }).props;
    assert.deepEqual(
      { ...scaled, opacity: ring.opacity, transform: ring.transform },
      ring,
      'opacity and scale are the only things a call site can vary',
    );
    assert.match(
      scaled.transform,
      /^translate\(50 50\) scale\(2\) translate\(-50 -50\)$/,
      'growth pivots on the ring’s own center, not the square’s origin',
    );
    // A fourth source census used to sit here, banning the amber's spelling
    // anywhere outside this function. It was verified to fail in both
    // directions at once: a hand-rolled `stroke={tokens['boardHighlightRing']}`
    // — a genuine second pen in the exact highlight amber — passed, while
    // hoisting `const HL_PEN = tokens.boardHighlightRing` inside the same file,
    // a behavior-identical refactor, failed CI. Four versions, four proxies for
    // "where may this color be written".
    //
    // It is gone rather than sharpened. The invariant it was reaching for is
    // already closed one layer down: both `hl` surfaces call `HlRing`, which
    // returns the element, so the geometry is unreachable from a call site and
    // `tsc` says so. And the duplicated literal that made its sibling
    // assertion (`boardHighlightRing === markerColors.highlight`) necessary is
    // gone too — `tokens.ts` now defines the ring *as* `markerColors.highlight`
    // rather than restating `#f0b429`, so the equality holds by construction
    // and neither a runtime check nor a text scan has anything left to catch.
  }

  // Move-quality marks: chess.com's classification set, adopted deliberately
  // against PRODUCT.md's original anti-reference. Two tables, because the
  // board and the panel are two different grounds; both are
  // `Record<MoveAnnotation, string>`, so TypeScript already forces each
  // exhaustive and a fifth quality cannot ship colorless.
  {
    const channel = (c) => {
      const n = c / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (hex) => {
      const n = parseInt(hex.slice(1), 16);
      return (
        0.2126 * channel((n >> 16) & 255) +
        0.7152 * channel((n >> 8) & 255) +
        0.0722 * channel(n & 255)
      );
    };
    const contrast = (a, b) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    // Sanity-check the arithmetic before trusting it — a broken ratio function
    // passes every assertion below by inventing large numbers. Both ends of
    // the scale, on pairs whose answer is fixed by the spec: black on white is
    // the maximum, and mid-grey on white is not (a function that returned its
    // first argument's luminance would pass the first check alone).
    assert.equal(contrast('#ffffff', '#000000').toFixed(2), '21.00');
    assert.equal(contrast('#ffffff', '#777777').toFixed(2), '4.48');

    // The move list is chrome and holds body AA. This is the floor the board
    // badge deliberately gave up (see below), so it is the one that has to be
    // guarded — otherwise "we accepted a contrast cost on the badge" quietly
    // becomes "we accepted it everywhere".
    //
    // Measured on the *worst* backdrop a mark renders against, not the common
    // one. The panel well alone was the common one, and it passed `brilliant`
    // at 4.69 while the variation inset — lighter, and the surface half the
    // annotated moves in a script sit on — had it at 4.16.
    //
    // The current row is not in this set: its pill is studio-steel-blue, where
    // every mark measures under 2:1, so `sanLabel` drops the color there and
    // inherits the row's chalk rather than pretending a lighter teal fixes it.
    const CHROME_BACKDROPS = {
      'panel well': '#283045',
      'variation inset': '#31384c',
    };
    for (const [where, backdrop] of Object.entries(CHROME_BACKDROPS)) {
      for (const [quality, hex] of Object.entries(annotationMarkColors)) {
        const ratio = contrast(backdrop, hex);
        assert.ok(
          ratio >= 4.5,
          `${quality}'s mark is 13px/700 body text and holds AA on the ${where} (${ratio.toFixed(2)}:1)`,
        );
      }
    }

    // The board badge is the same set on a different ground, and there it
    // takes a contrast cost knowingly: white ink is under the 3:1 large-text
    // floor on `mistake` (1.96) and `brilliant` (2.80), and there is no rim to
    // buy any of it back. Recorded rather than guarded — a floor this design
    // cannot meet is not a floor, it is a deleted test waiting to happen.
    //
    // What *is* guarded is the rim's absence, because that is the drift this
    // replica keeps inviting and the one thing a call site could reintroduce.
    // Asserted by calling `BadgeDisc` and reading the element it returns, the
    // way `HlRing` is checked above. The first version of this guard matched
    // JSX source text between `r={BADGE_R}` and `<text` — and an earlier
    // `<text` inside a comment put the end before the start, so it sliced the
    // empty string and passed for a rim, a halo, or a disc that had been
    // deleted outright.
    const disc = BadgeDisc({ annotation: 'great', cx: 100, cy: 200 }).props;
    assert.equal(disc.stroke, undefined, 'the disc has no rim');
    assert.equal(disc.strokeWidth, undefined, 'nor a rim by another name');
    assert.equal(disc.fill, annotationColors.great, 'the disc is its quality’s fill');
    assert.deepEqual([disc.cx, disc.cy, disc.r], [100, 200, BADGE_R]);
    assert.equal(annotationInk, '#ffffff', 'the badge glyph is white, as in the reference');

    // The badge hangs off its square's top-right corner, which puts it outside
    // the 800-unit viewBox on the h-file and the 8th rank. The PNG export
    // rasterizes that same box, so an unclamped badge ships a sliced disc in
    // the artifact — and only for edge moves, which is exactly the case a
    // hand-check of the opening position never reaches.
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        const [cx, cy] = badgeCenter({ x, y });
        for (const [axis, v] of [['x', cx], ['y', cy]]) {
          assert.ok(
            v - BADGE_R >= 0 && v + BADGE_R <= BOARD_SIZE,
            `the badge on view cell ${x},${y} stays on the board (${axis}=${v})`,
          );
        }
      }
    }
    // …and it really does hang off the corner wherever the board allows it. A
    // clamp wide enough to swallow the overhang everywhere satisfies the loop
    // above while silently restoring the contained badge this replaced — a
    // verified escape: `limit = BOARD_SIZE - SQ / 2` parks the h-file badge in
    // the middle of its square's top edge and stays on the board.
    //
    // So pin both halves of the rule. Interior squares get the corner itself…
    assert.deepEqual(
      badgeCenter({ x: 3, y: 3 }),
      [400, 300],
      'an interior badge centers on its square’s corner rather than inside it',
    );
    // …and an edge square gets the closest point to that corner the board
    // still permits, which is exactly one radius plus the margin in. That is
    // the two rules composed rather than the clamp's arithmetic restated: it
    // stays blind to a retuned margin (a design choice the loop above already
    // bounds) and catches a clamp that gives up more of the overhang than
    // staying on the board costs.
    assert.deepEqual(
      badgeCenter({ x: 7, y: 0 }),
      [BOARD_SIZE - BADGE_R - BADGE_EDGE_MARGIN, BADGE_R + BADGE_EDGE_MARGIN],
      'a corner badge sits as close to its corner as the viewBox allows',
    );
  }

  // Kind is never color alone, asserted as a relation between two tables
  // rather than as CSS source text. `markerColors` and `markerForms` are both
  // `Record<MarkerKind, …>`, so TypeScript already forces each exhaustive over
  // every event kind; what it cannot state is that two kinds sharing a color
  // must not share a form. That is this.
  //
  // The previous version compared the two rules' declaration bodies, and it
  // failed in both directions. Re-declaring `rp` with the base rule's own
  // values — `border-radius: var(--radius-hairline); background: currentColor`,
  // a pin pixel-identical to a move's in the same blue, the exact bug — read as
  // "different text" and passed. Rewriting the real two-segment shape into
  // `background-image`/`background-size` longhands, behavior-identical, read as
  // changed and failed. Forms are data now, so neither is expressible.
  // The reset family: three spellings of "put the board back" plus the error
  // pin, which wears vermillion because a broken line reads as a reset of the
  // author's expectations. They share a color because they share a meaning.
  const RESET_FAMILY = new Set(['reset', 'start', 'fen', 'err']);
  const sharedColor = new Map();
  for (const [kind, color] of Object.entries(markerColors)) {
    const peers = sharedColor.get(color) ?? [];
    peers.push(kind);
    sharedColor.set(color, peers);
  }
  for (const peers of sharedColor.values()) {
    const forms = peers.map((k) => markerForms[k]);
    for (const kind of peers) {
      assert.ok(markerForms[kind], `${kind} declares a pin form`);
    }
    // Kinds that are two halves of one gesture (`br`/`ml`, `mind`/`reveal`) or
    // one meaning with three spellings (`rs`/`st`/`fen`, plus `err`) are
    // *supposed* to look alike, so sameness is only a bug when the kinds are
    // independent. `closes` names the paired halves; the reset family shares a
    // color because it shares a meaning. `rp` and `move` are neither, which is
    // why they are the pair this rule exists for.
    const paired = (a, b) =>
      COMMANDS.some((c) => (c.kind === a && c.closes) || (c.kind === b && c.closes)) ||
      (RESET_FAMILY.has(a) && RESET_FAMILY.has(b));
    for (let i = 0; i < peers.length; i += 1) {
      for (let j = i + 1; j < peers.length; j += 1) {
        if (paired(peers[i], peers[j])) continue;
        assert.notEqual(
          forms[i],
          forms[j],
          `${peers[i]} and ${peers[j]} share a marker color, so they must not share a pin form`,
        );
      }
    }
  }
  // Every form the table names must be a form the stylesheet can draw.
  for (const form of new Set(Object.values(markerForms))) {
    if (form === 'bar') continue; // the base `.marker` rule; no modifier needed
    assert.ok(
      cssRules(`.marker[data-form='${form}']`).length > 0,
      `the stylesheet draws the '${form}' pin form`,
    );
  }

  // Time chips sit on two different backdrops, and the lighter one (a
  // variation's inset) is the one that fails first. A resting opacity fade
  // pushed them to 4.18:1, under the 4.5:1 body floor — the fade reads as
  // restraint but spends contrast to get it, and the 10.5px mono already
  // carries the quiet.
  assert.doesNotMatch(
    styles,
    /\.pgn-time-edit\s*\{[^}]*opacity:/,
    'the time chip earns its quiet from its token and size, never a contrast-eating fade',
  );
  // Editor controls keep the WCAG 2.5.8 24px floor via transparent ::before
  // extensions; the visible pills stay small so row rhythm is unchanged. Each
  // of these measured just under 24 before the extension existed.
  //
  // This asserted only that an `inset:` declaration *existed*, which any value
  // satisfies: rewriting both to `inset: 0 0` — deleting the entire hit area —
  // was verified to leave the suite green. It also covered two of the four
  // controls in the family. Now it checks the direction (an extension grows the
  // box outward, so no component may be positive and at least one must be
  // negative) across all four, and the true 24px arithmetic for the one control
  // whose box is fully declared in CSS.
  //
  // Honest about its own reach: `.pgn-mv`, `.pgn-ret`, and `.pgn-time-edit` are
  // sized by padding plus font metrics, so their real target height is a
  // browser measurement this file cannot make. For those three the floor still
  // rests on having been measured once — the guard pins the mechanism, not the
  // number.
  const HIT_EXTENSIONS = ['.pgn-mv', '.pgn-ret', '.pgn-time-edit', '.pgn-x'];
  for (const sel of HIT_EXTENSIONS) {
    // `[^{]*` spans a grouped selector — .pgn-mv::before shares its rule.
    const rule = bareStyles.match(
      new RegExp(`\\${sel}::before[^{]*\\{[^}]*\\}`),
    );
    assert.ok(rule, `${sel} keeps a hit-area extension to the 24px floor`);
    const inset = cssLengths(rule[0], 'inset');
    assert.ok(
      inset.every((v) => v <= 0) && inset.some((v) => v < 0),
      `${sel}'s hit extension grows its target outward (found inset: ${inset.join(' ')})`,
    );
  }
  {
    // `.pgn-x` is a declared 16px box, so its target is arithmetic, not a
    // measurement: 16 + 5 + 5 either side.
    const x = cssRule('.pgn-x', 'width');
    const [pad] = cssLengths(cssRule('.pgn-x::before'), 'inset');
    for (const axis of ['width', 'height']) {
      assert.ok(
        cssNum(x, axis) - 2 * pad >= 24,
        `the row × clears the 24px floor on ${axis}`,
      );
    }
  }
  {
    // The move-sound toggle's height is declared, so its vertical target is
    // arithmetic: 30 + 7 + 7. Its width is font metrics and out of reach here,
    // which is why the label is the wider axis and the height is the one that
    // had to be extended.
    //
    // Pinned at 44, not `>= 24`: a 30px button already clears the 2.5.8 floor
    // on its own, so the weaker assertion passes with the extension deleted
    // outright — verified by rewriting the inset to `0 0` and watching the
    // suite stay green. 44 is the convention the stylesheet states for every
    // sub-44px control here (.ctrl-btn, .speed-btn, .present-toggle), so it is
    // the number that can actually fail.
    const mute = cssRule('.mute-btn', 'height');
    const [padBlock, padInline] = cssLengths(cssRule('.mute-btn::before'), 'inset');
    assert.ok(
      padBlock < 0 && padInline <= 0,
      `the move-sound toggle's hit extension grows its target outward (found inset: ${padBlock} ${padInline})`,
    );
    assert.equal(
      cssNum(mute, 'height') - 2 * padBlock,
      44,
      'the move-sound toggle reaches the transport\'s 44px hit convention',
    );
    // Its two states are the segmented pair the rate selector and the view
    // toggle already wear — chalk on the 12% stop, foley-slate at rest, both
    // clear of the 4.5:1 body floor. `.present-toggle`'s steel-blue pressed
    // fill is 2.85:1 against the same chalk, so a standalone pressed rule here
    // is how this control would quietly acquire it.
    assert.equal(
      cssRules(`.mute-btn[aria-pressed='true']`).length,
      1,
      'the move-sound toggle has exactly one pressed rule',
    );
    assert.match(
      bareStyles,
      /\.speed-btn\[aria-pressed='true'\],[^{]*\.mute-btn\[aria-pressed='true'\]\s*\{[^}]*background:\s*var\(--tonal-white-12\)/,
      'it shares the segmented pressed treatment rather than declaring its own fill',
    );
    // The console grid restates its column list in four tiers and hand-places
    // every child. Rate and sound therefore ride one wrapper: a tier that
    // places `.speed-group` directly would leave the sound toggle to
    // auto-place into whatever cell that tier left free — a control landing on
    // the timeline at one viewport band only, which is exactly the class of
    // bug no single-viewport check finds.
    assert.doesNotMatch(
      bareStyles,
      /\.speed-group\s*\{[^}]*grid-(?:row|column|area)/,
      'no tier places the rate selector itself; the transport-prefs wrapper carries both',
    );
    for (const block of mediaBlocks().filter((b) =>
      /\.controls\s*\{[^}]*grid-template-columns/.test(b),
    )) {
      assert.match(
        block,
        /\.transport-prefs\s*\{[^}]*grid-row/,
        `${block.slice(0, block.indexOf('{')).trim()} re-places the console's children, so it must place the prefs wrapper too`,
      );
    }
  }
  // Undo appears the instant a board gesture lands. Anchoring the toggle left
  // and Import right keeps it from displacing either — a control that moves
  // out from under the cursor right after an edit is the one the author is
  // most likely to reach for next.
  assert.match(
    styles,
    /\.panel-title-row \.import-btn\s*\{[^}]*margin-left:\s*auto/,
    'Import stays pinned right so a transient Undo cannot shove the row',
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
  assert.ok(mindAt(10.3) > 0 && mindAt(10.3) < 1, 'the mid-ramp is a real ramp');
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
