// The chess.js adapter: SAN, FEN, and the questions the board gesture asks.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load } from './support.mjs';

const Chess = await load('/src/lib/chess.ts');

const startingState = Chess.stateFromFEN(Chess.STARTING_FEN);

test('game states are frozen values with cached legal moves', async () => {
  assert.ok(Object.isFrozen(startingState), 'chess snapshots are immutable values');
  assert.deepEqual(Object.keys(startingState).sort(), ['check', 'fen', 'fullmove', 'turn']);
  assert.equal(startingState.check, null);
  const cachedStartingMoves = Chess.legalMoves(startingState);
  assert.equal(cachedStartingMoves, Chess.legalMoves(startingState));
  assert.ok(Object.isFrozen(cachedStartingMoves));
  const startingBoard = Chess.board(startingState);
  assert.deepEqual(startingBoard[0][0], { type: 'r', side: 'w' });
  assert.deepEqual(startingBoard[7][0], { type: 'r', side: 'b' });
});

test('a refused press explains itself', async () => {
  assert.equal(
    Chess.explainNoMoves(startingState, 'e7'),
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
    Chess.explainNoMoves(startingState, 'e4'),
    null,
    'an empty square warrants no message — nothing there offered a drag',
  );
  // The reason is re-derived, not taken on trust: a piece that *can* move
  // must never be handed a sentence saying it cannot.
  assert.equal(
    Chess.explainNoMoves(startingState, 'e2'),
    null,
    'a movable piece yields no explanation even if asked',
  );
});

test('the gesture asks for targets and moves by square name', async () => {
  // By square name only, so the [file, rank] tuple layout stays inside the adapter.
  assert.deepEqual(
    [...Chess.legalTargets(startingState, 'e2')].sort(),
    ['e3', 'e4'],
    'a pawn offers exactly its own destinations',
  );
  assert.equal(Chess.legalTargets(startingState, 'e4').size, 0, 'an empty square reaches nothing');
  assert.equal(
    Chess.legalTargets(startingState, 'e7').size,
    0,
    "the opponent's piece reaches nothing on this turn",
  );
  // Four promotions share one destination: the set collapses them, and the
  // move list must not, or the gesture could not pick the queen.
  const promoting = Chess.stateFromFEN('7k/4P3/8/8/8/8/8/4K3 w - - 0 1');
  assert.deepEqual([...Chess.legalTargets(promoting, 'e7')], ['e8']);
  const promotions = Chess.movesBetween(promoting, 'e7', 'e8');
  assert.equal(promotions.length, 4, 'every promotion piece is a distinct move');
  assert.equal(
    promotions.find((m) => !m.promotion || m.promotion === 'q')?.promotion,
    'q',
    'the queen is reachable by the rule the move gesture uses',
  );
  assert.deepEqual(Chess.movesBetween(promoting, 'e7', 'd8'), [], 'no move, no candidates');
  const [queen, rook] = [
    promotions.find((m) => m.promotion === 'q'),
    promotions.find((m) => m.promotion === 'r'),
  ];
  assert.ok(Chess.sameMoveSquares(queen, queen));
  assert.equal(
    Chess.sameMoveSquares(queen, rook),
    false,
    'two promotions on the same squares are not the same move',
  );
});

test('ambiguous or coordinate-style SAN is rejected', async () => {
  const ambiguous = Chess.stateFromFEN('4k3/8/8/8/8/1N3N2/8/4K3 w - - 0 1');
  assert.equal(Chess.parseSAN('Nd2', ambiguous), null, 'ambiguous SAN must be rejected');
  assert.deepEqual(Chess.parseSAN('Nbd2', ambiguous)?.from, [1, 2]);
  for (const longPawnMove of ['e2e4', 'ee4', '2e4', 'e 4', 'e4 e5']) {
    assert.equal(
      Chess.parseSAN(longPawnMove, startingState),
      null,
      `non-SAN pawn move ${longPawnMove} must be rejected`,
    );
  }
});

test('playing a move returns a new frozen state', async () => {
  const e4Move = Chess.parseSAN('e4', startingState);
  assert.deepEqual(e4Move?.to, [4, 3]);
  const startingFen = startingState.fen;
  const afterE4 = Chess.playSAN('e4', startingState).next;
  assert.equal(startingState.fen, startingFen, 'applying a move does not mutate its input snapshot');
  assert.ok(Object.isFrozen(afterE4));
  assert.deepEqual(Chess.board(afterE4)[3][4], { type: 'p', side: 'w' });
  assert.deepEqual(Chess.parseSAN('e4!', startingState)?.to, [4, 3]);
});

test('check and mate suffixes follow chess.js', async () => {
  const rookCheck = Chess.stateFromFEN('7k/8/8/8/8/8/8/R3K3 w - - 0 1');
  let scholarsMate = startingState;
  for (const san of ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6']) {
    const played = Chess.playSAN(san, scholarsMate);
    assert.ok(played, `fixture move ${san} must resolve`);
    scholarsMate = played.next;
  }
  // Any of the three markers parses and sanForMove answers the canonical one.
  // One table, so every position checks all nine cases.
  for (const [state, base, canonical] of [
    [startingState, 'e4', 'e4'],
    [rookCheck, 'Ra8', 'Ra8+'],
    [scholarsMate, 'Qxf7', 'Qxf7#'],
  ]) {
    for (const suffix of ['', '+', '#']) {
      const written = base + suffix;
      const move = Chess.parseSAN(written, state);
      assert.ok(move, `${written} follows chess.js suffix normalization`);
      assert.equal(
        Chess.sanForMove(state, move),
        canonical,
        `${written} canonicalizes to ${canonical}`,
      );
    }
  }
  for (const badSuffix of ['e4!?', 'e4?!', 'e4!+', 'e4++', 'e4?????']) {
    assert.equal(
      Chess.parseSAN(badSuffix, startingState),
      null,
      `${badSuffix} must not bypass the shared SAN suffix grammar`,
    );
  }

  assert.equal(
    Chess.parseSAN('Ra8 +', rookCheck),
    null,
    'a detached check marker is not SAN',
  );
  assert.ok(Chess.parseSAN('Qxf7#!!', scholarsMate));
});

test('castling is spelled O-O', async () => {
  const quietCastle = Chess.stateFromFEN('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
  const quietCastleMove = Chess.parseSAN('O-O', quietCastle);
  assert.ok(quietCastleMove);
  assert.ok(Chess.parseSAN('O-O+', quietCastle));
  assert.equal(Chess.parseSAN('0-0', quietCastle), null, 'strict chess.js SAN rejects zero castling');
  assert.equal(Chess.parseSAN('o-o', quietCastle), null, 'strict chess.js SAN rejects lowercase castling');
  const castledBoard = Chess.board(Chess.playSAN('O-O', quietCastle).next);
  assert.deepEqual(castledBoard[0][6], { type: 'k', side: 'w' });
  assert.deepEqual(castledBoard[0][5], { type: 'r', side: 'w' });
});

test('a promotion must name its piece', async () => {
  const promotion = Chess.stateFromFEN('7k/P7/8/8/8/8/8/7K w - - 0 1');
  assert.equal(Chess.parseSAN('a8', promotion), null, 'promotion piece must be explicit');
  const promotionMove = Chess.parseSAN('a8=Q', promotion);
  assert.equal(promotionMove?.promotion, 'q');
  assert.deepEqual(
    Chess.board(Chess.playSAN('a8=Q', promotion).next)[7][0],
    { type: 'q', side: 'w' },
  );
});

test('a capture is flagged and applied', async () => {
  const capture = Chess.stateFromFEN('7k/8/8/3p4/4P3/8/8/7K w - - 0 1');
  const captureMove = Chess.parseSAN('exd5', capture);
  assert.equal(captureMove?.capture, true);
  const capturedBoard = Chess.board(Chess.playSAN('exd5', capture).next);
  assert.deepEqual(capturedBoard[4][3], { type: 'p', side: 'w' });
  assert.equal(capturedBoard[3][4], null);
});

test('FEN follows chess.js plus three position checks', async () => {
  // The three position checks are the ones chess.js takes on trust.
  for (const [fen, reason] of [
    ['7k/8/8/8/8/8/PP6/4K3 w - b3 0 1', /en[- ]passant/i],
    ['8/8/8/8/8/8/8/4K3 w - - 0 1', /king/i],
    ['4k3/8/8/8/8/8/4K3/4K3 w - - 0 1', /king/i],
    ['P3k3/8/8/8/8/8/8/4K3 w - - 0 1', /pawn/i],
    // Black already in check on White's move: Rxe8 would capture the king.
    ['4k3/4R3/8/8/8/8/8/4K3 w - - 0 1', /Black is in check with White to move/],
    // A K right with a knight in the corner would castle the knight.
    ['4k3/8/8/8/8/8/8/4K2N w K - 0 1', /castling right K needs .* rook on h1/],
    ['3k3r/8/8/8/8/8/8/4K3 b k - 0 1', /castling right k needs the king on e8/],
    // An e6 target with no black pawn on e5 would let dxe6 remove the knight.
    ['4k3/8/8/3PN3/8/8/8/4K3 w - e6 0 1', /en-passant square e6/],
  ]) {
    assert.throws(() => Chess.stateFromFEN(fen), reason);
  }
  const partialFen = Chess.stateFromFEN('4k3/8/8/8/8/8/8/4K3 w');
  assert.equal(partialFen.fen, '4k3/8/8/8/8/8/8/4K3 w - - 0 1');
  const validEp = Chess.stateFromFEN('7k/8/8/3pP3/8/8/8/7K w - d6 0 1');
  assert.equal(Chess.parseSAN('exd6', validEp)?.enPassant, true);
  assert.equal(Chess.stateFromFEN('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1').turn, 'b');
  assert.equal(Chess.stateFromFEN('4k3/8/8/8/8/8/8/R3K3 b - - 0 1').check, null);
  assert.equal(Chess.stateFromFEN('4k3/8/8/8/8/8/8/4R1K1 b - - 0 1').check, 'e8');
});

test('playSAN is memoized by position and SAN', async () => {
  // By value, so rebuilds share `next` and its legal-move cache.
  const played = Chess.playSAN('e4', startingState);
  assert.equal(Chess.playSAN('e4!', Chess.stateFromFEN(Chess.STARTING_FEN)), played);
  assert.ok(Object.isFrozen(played) && Object.isFrozen(played.move.from));
  assert.equal(Chess.playSAN('e5', startingState), null);
});
