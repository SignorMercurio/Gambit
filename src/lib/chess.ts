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

export type MoveState = Pick<GameState, 'fullmove' | 'turn'>;

export type Move = {
  from: [number, number];
  to: [number, number];
  piece: PieceType;
  capture: boolean;
  promotion?: PieceType;
  castle?: 'K' | 'Q';
  enPassant?: boolean;
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const STARTING_FEN = DEFAULT_POSITION;
const SAN_SUFFIX_RE = /^([^+#!?\s]+)([+#])?(!!|\?\?|!|\?)?$/;

export type SANSuffix = {
  text: string;
  check: '+' | '#' | null;
  annotation: '!!' | '!' | '?' | '??' | null;
};

// Gambit's quality marks remain script syntax. Chess.js owns the SAN before
// them, including how explicit check and mate suffixes are normalized.
export function parseSANSuffix(san: string): SANSuffix | null {
  const match = san.match(SAN_SUFFIX_RE);
  if (!match) return null;
  return {
    text: match[1],
    check: (match[2] as '+' | '#' | undefined) ?? null,
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
    piece: move.piece,
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
  const { f, r } = sqToIdx(from);
  const stuck = !legalMoves(state).some((move) => move.from[0] === f && move.from[1] === r);
  return stuck ? `that ${PIECE_NAMES[piece.type]} has no legal move` : null;
}

export function parseSAN(san: string, state: GameState): Move | null {
  const trimmed = san.trim();
  if (/\s/.test(trimmed)) return null;
  const suffix = parseSANSuffix(trimmed);
  if (!suffix) return null;

  try {
    const move = new ChessJs(state.fen).move(
      suffix.text + (suffix.check ?? ''),
      { strict: true },
    );
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
