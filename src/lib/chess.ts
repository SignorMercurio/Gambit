// Minimal chess engine: tracks board state, resolves SAN, generates pseudo-legal
// moves with self-check filtering. Sufficient for replaying scripted games.

export type Side = 'w' | 'b';
export type PieceType = 'p' | 'r' | 'n' | 'b' | 'q' | 'k';
type Square = { type: PieceType; side: Side } | null;
export type Board = Square[][];
type Castling = { wK: boolean; wQ: boolean; bK: boolean; bQ: boolean };

export type GameState = {
  board: Board;
  turn: Side;
  castling: Castling;
  enPassant: string | null;
  halfmove: number;
  fullmove: number;
};

// A move's numbering snapshot — the side to move and the fullmove counter at
// that event. Shared by the two move lists (editor MoveList + PresentationMoves)
// so the row-numbering type has one definition.
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

type Target = [number, number] | [number, number, 'ep'];
type Delta = readonly [number, number];

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const KNIGHT_STEPS: readonly Delta[] = [
  [1, 2], [2, 1], [-1, 2], [-2, 1],
  [1, -2], [2, -1], [-1, -2], [-2, -1],
];
const BISHOP_DIRECTIONS: readonly Delta[] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK_DIRECTIONS: readonly Delta[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const QUEEN_DIRECTIONS: readonly Delta[] = [...BISHOP_DIRECTIONS, ...ROOK_DIRECTIONS];
const KING_STEPS: readonly Delta[] = [...ROOK_DIRECTIONS, ...BISHOP_DIRECTIONS];
const PROMOTION_TYPES: readonly PieceType[] = ['q', 'r', 'b', 'n'];
const PIECE_SAN_RE = /^([NBRQK])([a-h])?([1-8])?(x)?([a-h][1-8])$/;
const PAWN_CAPTURE_SAN_RE = /^([a-h])x([a-h][1-8])(?:=([NBRQ]))?$/;
const PAWN_MOVE_SAN_RE = /^([a-h][1-8])(?:=([NBRQ]))?$/;
const SAN_SUFFIX_RE = /^([^+#!?\s]+)([+#])?(!!|\?\?|!|\?)?$/;

export type SANSuffix = {
  text: string;
  check: '+' | '#' | null;
  annotation: '!!' | '!' | '?' | '??' | null;
};

// The single accepted SAN-suffix grammar. A check/mate marker, when present,
// precedes one of Gambit's four supported quality marks. Keeping this parser
// separate lets timeline annotation derivation share the same strict boundary
// instead of growing another permissive trailing-character regex.
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

function oppositeSide(side: Side): Side {
  return side === 'w' ? 'b' : 'w';
}

function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array<Square>(8).fill(null));
}

function parseCastling(s: string): Castling {
  if (s === '-') return { wK: false, wQ: false, bK: false, bQ: false };
  if (!/^(?!.*(.).*\1)[KQkq]+$/.test(s)) throw new Error('Invalid FEN: bad castling rights');
  return {
    wK: s.includes('K'),
    wQ: s.includes('Q'),
    bK: s.includes('k'),
    bQ: s.includes('q'),
  };
}

export function stateFromFEN(fen: string): GameState {
  const fields = fen.trim().split(/\s+/);
  if (fields.length !== 6) throw new Error('Invalid FEN: expected 6 fields');

  const [placement, activeColor, castlingText, epText, halfmoveText, fullmoveText] = fields;
  const ranks = placement.split('/');
  if (ranks.length !== 8) throw new Error('Invalid FEN: expected 8 ranks');

  const board = emptyBoard();
  const kings: Record<Side, number> = { w: 0, b: 0 };
  for (let rankIndex = 0; rankIndex < 8; rankIndex++) {
    const rank = ranks[rankIndex];
    const r = 7 - rankIndex;
    let f = 0;
    for (const ch of rank) {
      if (/[1-8]/.test(ch)) {
        f += parseInt(ch, 10);
        continue;
      }
      if (!/[prnbqkPRNBQK]/.test(ch)) throw new Error('Invalid FEN: bad piece placement');
      if (f >= 8) throw new Error('Invalid FEN: rank is too long');
      const piece = {
        type: ch.toLowerCase() as PieceType,
        side: (ch === ch.toUpperCase() ? 'w' : 'b') as Side,
      };
      board[r][f] = piece;
      if (piece.type === 'k') kings[piece.side]++;
      f++;
    }
    if (f !== 8) throw new Error('Invalid FEN: rank is not 8 files');
  }

  if (kings.w !== 1 || kings.b !== 1) {
    throw new Error('Invalid FEN: expected exactly one king per side');
  }

  if (activeColor !== 'w' && activeColor !== 'b') throw new Error('Invalid FEN: active color must be w or b');

  let enPassant: string | null = null;
  if (epText !== '-') {
    if (!/^[a-h][36]$/.test(epText)) throw new Error('Invalid FEN: bad en passant square');
    const ep = sqToIdx(epText);
    const expectedRank = activeColor === 'w' ? 5 : 2;
    const pawnRank = ep.r + (activeColor === 'w' ? -1 : 1);
    const pawnSide: Side = activeColor === 'w' ? 'b' : 'w';
    const pawn = board[pawnRank]?.[ep.f];
    if (
      ep.r !== expectedRank ||
      board[ep.r][ep.f] !== null ||
      !pawn ||
      pawn.type !== 'p' ||
      pawn.side !== pawnSide
    ) {
      throw new Error('Invalid FEN: inconsistent en passant square');
    }
    enPassant = epText;
  }

  const halfmove = Number(halfmoveText);
  const fullmove = Number(fullmoveText);
  if (!Number.isInteger(halfmove) || halfmove < 0) throw new Error('Invalid FEN: bad halfmove clock');
  if (!Number.isInteger(fullmove) || fullmove < 1) throw new Error('Invalid FEN: bad fullmove number');

  return {
    board,
    turn: activeColor,
    castling: parseCastling(castlingText),
    enPassant,
    halfmove,
    fullmove,
  };
}

function cloneBoard(b: Board): Board {
  return b.map((row) => row.map((c) => (c ? { ...c } : null)));
}

function inBounds(f: number, r: number): boolean {
  return f >= 0 && f < 8 && r >= 0 && r < 8;
}

// Generate pseudo-legal destinations for piece at (f,r) on board.
function pieceTargets(board: Board, f: number, r: number, state?: GameState): Target[] {
  const p = board[r][f];
  if (!p) return [];
  const out: Target[] = [];
  const opp = oppositeSide(p.side);

  const slide = (dirs: readonly Delta[]) => {
    for (const [df, dr] of dirs) {
      let nf = f + df;
      let nr = r + dr;
      while (inBounds(nf, nr)) {
        const t = board[nr][nf];
        if (!t) {
          out.push([nf, nr]);
        } else {
          if (t.side === opp) out.push([nf, nr]);
          break;
        }
        nf += df;
        nr += dr;
      }
    }
  };
  const step = (deltas: readonly Delta[]) => {
    for (const [df, dr] of deltas) {
      const nf = f + df;
      const nr = r + dr;
      if (!inBounds(nf, nr)) continue;
      const t = board[nr][nf];
      if (!t || t.side === opp) out.push([nf, nr]);
    }
  };

  if (p.type === 'p') {
    const dir = p.side === 'w' ? 1 : -1;
    const startRank = p.side === 'w' ? 1 : 6;
    const enPassant = state?.enPassant ? sqToIdx(state.enPassant) : null;
    if (inBounds(f, r + dir) && !board[r + dir][f]) {
      out.push([f, r + dir]);
      if (r === startRank && !board[r + 2 * dir][f]) out.push([f, r + 2 * dir]);
    }
    for (const df of [-1, 1]) {
      const nf = f + df;
      const nr = r + dir;
      if (!inBounds(nf, nr)) continue;
      const t = board[nr][nf];
      if (t && t.side === opp) out.push([nf, nr]);
      if (enPassant && !t) {
        const captured = board[r][nf];
        if (
          enPassant.f === nf &&
          enPassant.r === nr &&
          captured?.type === 'p' &&
          captured.side === opp
        ) {
          out.push([nf, nr, 'ep']);
        }
      }
    }
  } else if (p.type === 'n') {
    step(KNIGHT_STEPS);
  } else if (p.type === 'b') {
    slide(BISHOP_DIRECTIONS);
  } else if (p.type === 'r') {
    slide(ROOK_DIRECTIONS);
  } else if (p.type === 'q') {
    slide(QUEEN_DIRECTIONS);
  } else if (p.type === 'k') {
    step(KING_STEPS);
  }
  return out;
}

function findKing(board: Board, side: Side): [number, number] | null {
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && p.type === 'k' && p.side === side) return [f, r];
    }
  return null;
}

function isAttacked(board: Board, f: number, r: number, bySide: Side): boolean {
  for (let rr = 0; rr < 8; rr++)
    for (let ff = 0; ff < 8; ff++) {
      const p = board[rr][ff];
      if (!p || p.side !== bySide) continue;
      if (p.type === 'p') {
        const dir = p.side === 'w' ? 1 : -1;
        if (rr + dir === r && (ff + 1 === f || ff - 1 === f)) return true;
        continue;
      }
      const tgts = pieceTargets(board, ff, rr);
      if (tgts.some(([tf, tr]) => tf === f && tr === r)) return true;
    }
  return false;
}

function inCheck(board: Board, side: Side): boolean {
  return findCheckedKing(board, side) !== null;
}

function findCheckedKing(board: Board, side: Side): [number, number] | null {
  const king = findKing(board, side);
  if (!king || !isAttacked(board, king[0], king[1], oppositeSide(side))) return null;
  return king;
}

// The square of the side-to-move's king when it stands in check, else null.
// Derived from the position (not from a `+` in the SAN) so the board effect
// stays deterministic even when the script author omits the check marker.
export function checkedKingSquare(state: GameState): string | null {
  const king = findCheckedKing(state.board, state.turn);
  return king ? idxToSq(king[0], king[1]) : null;
}

const PIECE_NAMES: Record<PieceType, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

// Why a left-drag from `from` cannot start. The board rejects such a press
// silently, and "nothing happened" is indistinguishable from a broken app —
// especially on the two cases that look identical to a piece the author
// expected to move: it is the other side's turn, or the piece is pinned or
// boxed in. Returns null when no explanation is warranted: an empty square
// never offered a drag in the first place (the cursor already says so), and
// clicking empty board space is too ordinary to annotate.
//
// The last branch re-derives legality rather than trusting the caller's empty
// target set. Asserting "no legal move" on the strength of someone else's
// check is how a confident sentence ends up describing a piece that could in
// fact move, and this text exists precisely to be believed. Re-deriving is
// free here because `legalMoves` memoizes on the immutable GameState — an
// independent derivation, just not a repeated one.
export function explainNoMoves(state: GameState, from: string): string | null {
  const { f, r } = sqToIdx(from);
  const piece = state.board[r]?.[f];
  if (!piece) return null;
  if (piece.side !== state.turn) return `it's ${state.turn === 'w' ? 'White' : 'Black'} to move`;
  const stuck = !legalMoves(state).some((m) => m.from[0] === f && m.from[1] === r);
  return stuck ? `that ${PIECE_NAMES[piece.type]} has no legal move` : null;
}



export function applyMove(state: GameState, mv: Move): GameState {
  const board = cloneBoard(state.board);
  const [ff, fr] = mv.from;
  const [tf, tr] = mv.to;
  const p = board[fr][ff]!;
  board[fr][ff] = null;

  if (mv.castle) {
    if (mv.castle === 'K') {
      const rook = board[tr][7];
      board[tr][7] = null;
      board[tr][5] = rook;
    } else {
      const rook = board[tr][0];
      board[tr][0] = null;
      board[tr][3] = rook;
    }
    board[tr][tf] = p;
  } else if (mv.enPassant) {
    board[tr][tf] = p;
    board[fr][tf] = null;
  } else {
    board[tr][tf] = mv.promotion ? { type: mv.promotion, side: p.side } : p;
  }

  const cr: Castling = { ...state.castling };
  if (p.type === 'k') {
    if (p.side === 'w') {
      cr.wK = false;
      cr.wQ = false;
    } else {
      cr.bK = false;
      cr.bQ = false;
    }
  }
  if (p.type === 'r') {
    if (p.side === 'w' && fr === 0 && ff === 0) cr.wQ = false;
    if (p.side === 'w' && fr === 0 && ff === 7) cr.wK = false;
    if (p.side === 'b' && fr === 7 && ff === 0) cr.bQ = false;
    if (p.side === 'b' && fr === 7 && ff === 7) cr.bK = false;
  }
  if (mv.capture) {
    if (tf === 0 && tr === 0) cr.wQ = false;
    if (tf === 7 && tr === 0) cr.wK = false;
    if (tf === 0 && tr === 7) cr.bQ = false;
    if (tf === 7 && tr === 7) cr.bK = false;
  }

  let enPassant: string | null = null;
  if (p.type === 'p' && Math.abs(tr - fr) === 2) {
    enPassant = idxToSq(ff, (fr + tr) / 2);
  }

  return {
    board,
    turn: oppositeSide(state.turn),
    castling: cr,
    enPassant,
    halfmove: p.type === 'p' || mv.capture ? 0 : state.halfmove + 1,
    fullmove: state.turn === 'b' ? state.fullmove + 1 : state.fullmove,
  };
}

// Memoized on the snapshot itself. Board snapshots are immutable and shared by
// reference across frames, so the whole list is generated once per position
// however many times anything asks — the resting cursor asks per hovered
// square, `legalTargets` asks per gesture start, `explainNoMoves` asks again
// when that start is refused, and `parseSAN` asks once per scripted move on
// every rebuild (i.e. on every keystroke in the Text view).
//
// Inside the primitive rather than beside it. A `legalMovesFor` wrapper left
// `legalMoves` reachable and uncached, so the four callers inside this file
// kept regenerating — and nothing at a call site distinguished the two, which
// is exactly the condition that produced the bug the memo was added for. The
// return is `readonly` because it is now shared: a caller that sorted it in
// place would poison every later reader of that position.
const LEGAL_MOVES_CACHE = new WeakMap<GameState, readonly Move[]>();

export function legalMoves(state: GameState): readonly Move[] {
  const cached = LEGAL_MOVES_CACHE.get(state);
  if (cached) return cached;
  const generated = generateLegalMoves(state);
  LEGAL_MOVES_CACHE.set(state, generated);
  return generated;
}

function generateLegalMoves(state: GameState): readonly Move[] {
  const moves: Move[] = [];
  const board = state.board;
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p || p.side !== state.turn) continue;
      const tgts = pieceTargets(board, f, r, state);
      for (const t of tgts) {
        const tf = t[0];
        const tr = t[1];
        const flag = t[2];
        const target = board[tr][tf];
        // Check detection still needs attacks *onto* a king square, so the
        // pseudo-target generator includes kings. The legal-move boundary is
        // where king capture must be excluded.
        if (target?.type === 'k') continue;
        const isCap = !!target || flag === 'ep';
        const baseMv: Move = {
          from: [f, r],
          to: [tf, tr],
          piece: p.type,
          capture: isCap,
          enPassant: flag === 'ep',
        };
        if (p.type === 'p' && (tr === 0 || tr === 7)) {
          for (const promo of PROMOTION_TYPES) {
            const mv: Move = { ...baseMv, promotion: promo };
            const next = applyMove(state, mv);
            if (!inCheck(next.board, p.side)) moves.push(mv);
          }
        } else {
          const next = applyMove(state, baseMv);
          if (!inCheck(next.board, p.side)) moves.push(baseMv);
        }
      }
    }
  // castling
  const homeRank = state.turn === 'w' ? 0 : 7;
  const opp = oppositeSide(state.turn);
  const k = findKing(board, state.turn);
  const castleK = state.turn === 'w' ? state.castling.wK : state.castling.bK;
  const castleQ = state.turn === 'w' ? state.castling.wQ : state.castling.bQ;
  const kingRook = board[homeRank][7];
  const queenRook = board[homeRank][0];
  if (k && k[0] === 4 && k[1] === homeRank && !inCheck(board, state.turn)) {
    if (
      castleK &&
      !board[homeRank][5] &&
      !board[homeRank][6] &&
      kingRook?.type === 'r' &&
      kingRook.side === state.turn &&
      !isAttacked(board, 5, homeRank, opp) &&
      !isAttacked(board, 6, homeRank, opp)
    ) {
      moves.push({ from: [4, homeRank], to: [6, homeRank], piece: 'k', castle: 'K', capture: false });
    }
    if (
      castleQ &&
      !board[homeRank][1] &&
      !board[homeRank][2] &&
      !board[homeRank][3] &&
      queenRook?.type === 'r' &&
      queenRook.side === state.turn &&
      !isAttacked(board, 2, homeRank, opp) &&
      !isAttacked(board, 3, homeRank, opp)
    ) {
      moves.push({ from: [4, homeRank], to: [2, homeRank], piece: 'k', castle: 'Q', capture: false });
    }
  }
  return moves;
}

export function parseSAN(san: string, state: GameState): Move | null {
  const trimmed = san.trim();
  if (/\s/.test(trimmed)) return null;
  const suffix = parseSANSuffix(trimmed);
  if (!suffix) return null;
  const raw = suffix.text;
  const castle = /^O-O-O$/i.test(raw) || raw === '0-0-0'
    ? 'Q'
    : /^O-O$/i.test(raw) || raw === '0-0'
      ? 'K'
      : null;
  if (castle) {
    const candidate = legalMoves(state).find((move) => move.castle === castle);
    return candidate && checkSuffixMatches(state, candidate, suffix.check) ? candidate : null;
  }

  const pieceMatch = raw.match(PIECE_SAN_RE);
  const pawnCaptureMatch = pieceMatch ? null : raw.match(PAWN_CAPTURE_SAN_RE);
  const pawnMoveMatch = pieceMatch || pawnCaptureMatch ? null : raw.match(PAWN_MOVE_SAN_RE);

  const pieceType: PieceType = pieceMatch
    ? (pieceMatch[1].toLowerCase() as PieceType)
    : 'p';
  const fromFile = pieceMatch?.[2] ?? pawnCaptureMatch?.[1];
  const fromRank = pieceMatch?.[3];
  const wantsCapture = pieceMatch ? !!pieceMatch[4] : !!pawnCaptureMatch;
  // Every accepted form names a destination, so "no destination" means no
  // form matched — reject before generating a single move.
  const to = pieceMatch?.[5] ?? pawnCaptureMatch?.[2] ?? pawnMoveMatch?.[1];
  if (!to) return null;
  const promotionMark = pawnCaptureMatch?.[3] ?? pawnMoveMatch?.[2];
  const promo = promotionMark ? (promotionMark.toLowerCase() as PieceType) : null;
  const toIdx = sqToIdx(to);

  const moves = legalMoves(state);

  const candidates = moves.filter((mv) => {
    if (mv.castle) return false;
    if (mv.piece !== pieceType) return false;
    if (mv.to[0] !== toIdx.f || mv.to[1] !== toIdx.r) return false;
    if (fromFile && mv.from[0] !== fromFile.charCodeAt(0) - 97) return false;
    if (fromRank && mv.from[1] !== parseInt(fromRank, 10) - 1) return false;
    // SAN spec: `x` is present iff the move captures. Reject mismatches so
    // `Nxe4` won't bind a quiet move (and `Ne4` won't bind a capture).
    if (wantsCapture !== mv.capture) return false;
    if ((mv.promotion ?? null) !== promo) return false;
    return true;
  });

  if (candidates.length !== 1) return null;
  const candidate = candidates[0];
  return checkSuffixMatches(state, candidate, suffix.check) ? candidate : null;
}

function checkSuffixMatches(
  state: GameState,
  move: Move,
  declared: SANSuffix['check'],
): boolean {
  if (!declared) return true;
  return checkMarkerForMove(state, move) === declared;
}

function checkMarkerForMove(state: GameState, move: Move): '+' | '#' | null {
  const next = applyMove(state, move);
  if (!inCheck(next.board, next.turn)) return null;
  return legalMoves(next).length === 0 ? '#' : '+';
}

// Serialize a legal move to SAN in the given position — the inverse of
// `parseSAN`, emitting the minimal disambiguation the spec requires so a
// generated script line reads like a hand-written one.
export function sanForMove(state: GameState, mv: Move): string {
  let san: string;
  if (mv.castle) {
    san = mv.castle === 'K' ? 'O-O' : 'O-O-O';
  } else if (mv.piece === 'p') {
    san = (mv.capture ? FILES[mv.from[0]] + 'x' : '') + idxToSq(mv.to[0], mv.to[1]);
    if (mv.promotion) san += '=' + mv.promotion.toUpperCase();
  } else {
    // Among same-type legal moves to the same square: file if unique,
    // else rank, else both.
    const rivals = legalMoves(state).filter(
      (m) =>
        !m.castle &&
        m.piece === mv.piece &&
        m.to[0] === mv.to[0] &&
        m.to[1] === mv.to[1] &&
        (m.from[0] !== mv.from[0] || m.from[1] !== mv.from[1]),
    );
    let from = '';
    if (rivals.length > 0) {
      const fileClash = rivals.some((m) => m.from[0] === mv.from[0]);
      const rankClash = rivals.some((m) => m.from[1] === mv.from[1]);
      if (!fileClash) from = FILES[mv.from[0]];
      else if (!rankClash) from = String(mv.from[1] + 1);
      else from = idxToSq(mv.from[0], mv.from[1]);
    }
    san = mv.piece.toUpperCase() + from + (mv.capture ? 'x' : '') + idxToSq(mv.to[0], mv.to[1]);
  }
  return san + (checkMarkerForMove(state, mv) ?? '');
}

export function initialState(): GameState {
  return stateFromFEN(STARTING_FEN);
}
