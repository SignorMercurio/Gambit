import { Chess as ChessJs, DEFAULT_POSITION, type Move as ChessJsMove } from 'chess.js';

export type Side = 'w' | 'b';
export type PieceType = 'p' | 'r' | 'n' | 'b' | 'q' | 'k';
type Square = Readonly<{ type: PieceType; side: Side }> | null;
export type Board = readonly (readonly Square[])[];

// FEN is the sole chess-state representation. The extra fields are cheap,
// immutable readouts taken while the engine is already loaded: move-row
// numbering, and the checked king's square, so neither reparses the position.
export type GameState = Readonly<{
  fen: string;
  turn: Side;
  fullmove: number;
  check: string | null;
}>;

export type Move = {
  from: [number, number];
  to: [number, number];
  capture: boolean;
  promotion?: PieceType;
  castle?: 'K' | 'Q';
  enPassant?: boolean;
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const STARTING_FEN = DEFAULT_POSITION;
const SAN_SUFFIX_RE = /^([^+#!?\s]+)([+#])?(!!|\?\?|!|\?)?$/;

type SANSuffix = {
  // The SAN chess.js reads, check or mate suffix included.
  san: string;
  annotation: '!!' | '!' | '?' | '??' | null;
};

// Gambit's quality marks remain script syntax. Chess.js owns the SAN before
// them, including how explicit check and mate suffixes are normalized.
export function parseSANSuffix(san: string): SANSuffix | null {
  const match = san.match(SAN_SUFFIX_RE);
  if (!match) return null;
  return {
    san: match[1] + (match[2] ?? ''),
    annotation: (match[3] as SANSuffix['annotation'] | undefined) ?? null,
  };
}

export function sqToIdx(sq: string): { f: number; r: number } {
  return { f: sq.charCodeAt(0) - 97, r: parseInt(sq[1], 10) - 1 };
}

export function idxToSq(f: number, r: number): string {
  return FILES[f] + (r + 1);
}

type ChessJsSquare = ChessJsMove['from'];

function chessJsSquare(sq: string): ChessJsSquare {
  return sq as ChessJsSquare;
}

function stateFromEngine(engine: ChessJs): GameState {
  const turn = engine.turn();
  return Object.freeze({
    fen: engine.fen({ forceEnpassantSquare: true }),
    turn,
    fullmove: engine.moveNumber(),
    check: engine.inCheck() ? (engine.findPiece({ type: 'k', color: turn })[0] ?? null) : null,
  });
}

const SIDE_NAMES: Record<Side, string> = { w: 'White', b: 'Black' };

function owns(engine: ChessJs, sq: string, type: PieceType, side: Side): boolean {
  const piece = engine.get(chessJsSquare(sq));
  return piece?.type === type && piece.color === side;
}

// chess.js checks FEN syntax and king counts, then loads whatever position
// lies beneath. Three claims it takes on trust break Gambit's board: a side
// not to move already in check lets the script capture a king (and the next
// load throws mid-walk); a castling right with no rook in the corner moves
// whatever piece stands there as if it were one; an en-passant square with no
// pawn behind it removes whatever piece does stand there. Each is rejected as
// typo-like input, not repaired behind the author's back.
function positionError(engine: ChessJs): string | null {
  const turn = engine.turn();
  const waiting: Side = turn === 'w' ? 'b' : 'w';
  const [waitingKing] = engine.findPiece({ type: 'k', color: waiting });
  if (waitingKing && engine.isAttacked(waitingKing, turn)) {
    return `Invalid FEN: ${SIDE_NAMES[waiting]} is in check with ${SIDE_NAMES[turn]} to move`;
  }
  for (const side of ['w', 'b'] as const) {
    const rank = side === 'w' ? 1 : 8;
    const rights = engine.getCastlingRights(side);
    for (const [wing, corner] of [['k', 'h'], ['q', 'a']] as const) {
      if (!rights[wing]) continue;
      if (!owns(engine, `e${rank}`, 'k', side) || !owns(engine, `${corner}${rank}`, 'r', side)) {
        const right = side === 'w' ? wing.toUpperCase() : wing;
        return `Invalid FEN: castling right ${right} needs the king on e${rank} and a rook on ${corner}${rank}`;
      }
    }
  }
  const ep = engine.fen({ forceEnpassantSquare: true }).split(' ')[3];
  if (ep !== '-') {
    // The pawn that just double-stepped stands one rank behind the square,
    // toward the side that moved it; the square and its origin are empty.
    const step = turn === 'w' ? 1 : -1;
    const epRank = Number(ep[1]);
    const empty = (sq: string) => !engine.get(chessJsSquare(sq));
    if (
      !empty(ep) ||
      !empty(`${ep[0]}${epRank + step}`) ||
      !owns(engine, `${ep[0]}${epRank - step}`, 'p', waiting)
    ) {
      return `Invalid FEN: en-passant square ${ep} has no ${SIDE_NAMES[waiting]} pawn that just passed it`;
    }
  }
  return null;
}

export function stateFromFEN(fen: string): GameState {
  const engine = new ChessJs(fen.trim());
  const error = positionError(engine);
  if (error) throw new Error(error);
  return stateFromEngine(engine);
}

// Chess.js lists a8..h1; Gambit's board uses rank 1 at index zero.
export function board(state: GameState): Board {
  return new ChessJs(state.fen)
    .board()
    .reverse()
    .map((rank) =>
      rank.map((piece) =>
        piece ? { type: piece.type, side: piece.color } : null,
      ),
    );
}

function moveFromChessJs(move: ChessJsMove): Move {
  const from = sqToIdx(move.from);
  const to = sqToIdx(move.to);
  const enPassant = move.isEnPassant();
  const castle = move.isKingsideCastle() ? 'K' : move.isQueensideCastle() ? 'Q' : null;
  return {
    from: [from.f, from.r],
    to: [to.f, to.r],
    capture: move.isCapture() || enPassant,
    ...(move.promotion ? { promotion: move.promotion } : {}),
    ...(castle ? { castle } : {}),
    ...(enPassant ? { enPassant: true } : {}),
  };
}

const LEGAL_MOVES_CACHE = new WeakMap<GameState, readonly Move[]>();

export function legalMoves(state: GameState): readonly Move[] {
  const cached = LEGAL_MOVES_CACHE.get(state);
  if (cached) return cached;
  const moves = Object.freeze(
    new ChessJs(state.fen).moves({ verbose: true }).map(moveFromChessJs),
  );
  LEGAL_MOVES_CACHE.set(state, moves);
  return moves;
}

// The gesture questions, answered here rather than in App: which squares a
// piece can reach, which legal moves connect two squares, whether two moves
// name the same squares. Each would otherwise restate that `Move.from` and
// `Move.to` are [file, rank] tuples in a file that owns no chess.
function movesFrom(state: GameState, from: string): readonly Move[] {
  const { f, r } = sqToIdx(from);
  return legalMoves(state).filter((m) => m.from[0] === f && m.from[1] === r);
}

export function legalTargets(state: GameState, from: string): ReadonlySet<string> {
  const out = new Set<string>();
  for (const m of movesFrom(state, from)) out.add(idxToSq(m.to[0], m.to[1]));
  return out;
}

export function movesBetween(
  state: GameState,
  from: string,
  to: string,
): readonly Move[] {
  const { f, r } = sqToIdx(to);
  return movesFrom(state, from).filter((m) => m.to[0] === f && m.to[1] === r);
}

// Coordinate comparison, not SAN string equality: a scripted line may carry
// check or annotation suffixes the generated SAN never has.
export function sameMoveSquares(a: Move, b: Move): boolean {
  return (
    a.from[0] === b.from[0] &&
    a.from[1] === b.from[1] &&
    a.to[0] === b.to[0] &&
    a.to[1] === b.to[1] &&
    (a.promotion ?? null) === (b.promotion ?? null)
  );
}

const PIECE_NAMES: Record<PieceType, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export function explainNoMoves(state: GameState, from: string): string | null {
  const piece = new ChessJs(state.fen).get(chessJsSquare(from));
  if (!piece) return null;
  if (piece.color !== state.turn) {
    return `it's ${SIDE_NAMES[state.turn]} to move`;
  }
  const stuck = movesFrom(state, from).length === 0;
  return stuck ? `that ${PIECE_NAMES[piece.type]} has no legal move` : null;
}

type PlayedMove = Readonly<{ move: Move; next: GameState }>;

// buildWorld replays the whole script on every keystroke, and one engine load
// per move is most of its cost. A move is a pure function of (position, SAN),
// so results are memoized by value — never a second copy of board state, just
// the same answer again. Returning the same `next` object also keeps
// `legalMoves`' identity cache warm across rebuilds. Least-recently-used
// entries go first, so an unchanged script prefix stays hot while edits churn
// the tail.
const PLAYED_CACHE = new Map<string, PlayedMove | null>();
const PLAYED_CACHE_LIMIT = 4096;

export function playSAN(san: string, state: GameState): PlayedMove | null {
  const suffix = parseSANSuffix(san.trim());
  // chess.js accepts null moves in strict mode too; Gambit records only
  // actual board moves, which can be reapplied by their from/to squares.
  if (!suffix || suffix.san.startsWith('--')) return null;

  const key = `${state.fen}|${suffix.san}`;
  const cached = PLAYED_CACHE.get(key);
  if (cached !== undefined) {
    PLAYED_CACHE.delete(key);
    PLAYED_CACHE.set(key, cached);
    return cached;
  }

  let played: PlayedMove | null;
  try {
    const engine = new ChessJs(state.fen);
    const move = moveFromChessJs(engine.move(suffix.san, { strict: true }));
    Object.freeze(move.from);
    Object.freeze(move.to);
    played = Object.freeze({ move: Object.freeze(move), next: stateFromEngine(engine) });
  } catch {
    played = null;
  }
  PLAYED_CACHE.set(key, played);
  if (PLAYED_CACHE.size > PLAYED_CACHE_LIMIT) {
    PLAYED_CACHE.delete(PLAYED_CACHE.keys().next().value!);
  }
  return played;
}

export function parseSAN(san: string, state: GameState): Move | null {
  return playSAN(san, state)?.move ?? null;
}

export function sanForMove(state: GameState, move: Move): string {
  return new ChessJs(state.fen).move({
    from: chessJsSquare(idxToSq(move.from[0], move.from[1])),
    to: chessJsSquare(idxToSq(move.to[0], move.to[1])),
    ...(move.promotion ? { promotion: move.promotion } : {}),
  }).san;
}
