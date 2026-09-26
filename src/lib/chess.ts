import { Chess as ChessJs, DEFAULT_POSITION, type Move as ChessJsMove } from 'chess.js';

export type Side = 'w' | 'b';
export type PieceType = 'p' | 'r' | 'n' | 'b' | 'q' | 'k';
type Square = Readonly<{ type: PieceType; side: Side }> | null;
export type Board = readonly (readonly Square[])[];

// FEN is the sole chess-state representation. The extra fields are cheap,
// immutable readouts used to number move rows without reparsing the position.
export type GameState = Readonly<{
  fen: string;
  turn: Side;
  fullmove: number;
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
  return Object.freeze({
    fen: engine.fen({ forceEnpassantSquare: true }),
    turn: engine.turn(),
    fullmove: engine.moveNumber(),
  });
}

export function stateFromFEN(fen: string): GameState {
  return stateFromEngine(new ChessJs(fen.trim()));
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

export function checkedKingSquare(state: GameState): string | null {
  const engine = new ChessJs(state.fen);
  if (!engine.inCheck()) return null;
  return engine.findPiece({ type: 'k', color: engine.turn() })[0] ?? null;
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
    return `it's ${state.turn === 'w' ? 'White' : 'Black'} to move`;
  }
  const stuck = movesFrom(state, from).length === 0;
  return stuck ? `that ${PIECE_NAMES[piece.type]} has no legal move` : null;
}

export function parseSAN(san: string, state: GameState): Move | null {
  const trimmed = san.trim();
  const suffix = parseSANSuffix(trimmed);
  // chess.js accepts null moves in strict mode too; Gambit records only
  // actual board moves, which can be reapplied by their from/to squares.
  if (!suffix || suffix.san.startsWith('--')) return null;

  try {
    const move = new ChessJs(state.fen).move(suffix.san, { strict: true });
    return moveFromChessJs(move);
  } catch {
    return null;
  }
}

function playMove(state: GameState, move: Move): { engine: ChessJs; move: ChessJsMove } {
  const engine = new ChessJs(state.fen);
  const played = engine.move({
    from: chessJsSquare(idxToSq(move.from[0], move.from[1])),
    to: chessJsSquare(idxToSq(move.to[0], move.to[1])),
    ...(move.promotion ? { promotion: move.promotion } : {}),
  });
  return { engine, move: played };
}

export function applyMove(state: GameState, move: Move): GameState {
  return stateFromEngine(playMove(state, move).engine);
}

export function sanForMove(state: GameState, move: Move): string {
  return playMove(state, move).move.san;
}
