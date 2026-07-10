// Minimal chess engine: tracks board state, resolves SAN, generates pseudo-legal
// moves with self-check filtering. Sufficient for replaying scripted games.

export type Side = 'w' | 'b';
export type PieceType = 'p' | 'r' | 'n' | 'b' | 'q' | 'k';
export type Square = { type: PieceType; side: Side } | null;
export type Board = Square[][];
export type Castling = { wK: boolean; wQ: boolean; bK: boolean; bQ: boolean };

export type GameState = {
  board: Board;
  turn: Side;
  castling: Castling;
  enPassant: string | null;
  halfmove: number;
  fullmove: number;
};

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

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function sqToIdx(sq: string): { f: number; r: number } {
  return { f: sq.charCodeAt(0) - 97, r: parseInt(sq[1], 10) - 1 };
}
export function idxToSq(f: number, r: number): string {
  return FILES[f] + (r + 1);
}

function initialBoard(): Board {
  const b: Board = Array.from({ length: 8 }, () => Array<Square>(8).fill(null));
  const back: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let f = 0; f < 8; f++) {
    b[0][f] = { type: back[f], side: 'w' };
    b[1][f] = { type: 'p', side: 'w' };
    b[6][f] = { type: 'p', side: 'b' };
    b[7][f] = { type: back[f], side: 'b' };
  }
  return b;
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
      board[r][f] = {
        type: ch.toLowerCase() as PieceType,
        side: ch === ch.toUpperCase() ? 'w' : 'b',
      };
      f++;
    }
    if (f !== 8) throw new Error('Invalid FEN: rank is not 8 files');
  }

  if (activeColor !== 'w' && activeColor !== 'b') throw new Error('Invalid FEN: active color must be w or b');
  if (epText !== '-' && !/^[a-h][36]$/.test(epText)) throw new Error('Invalid FEN: bad en passant square');

  const halfmove = Number(halfmoveText);
  const fullmove = Number(fullmoveText);
  if (!Number.isInteger(halfmove) || halfmove < 0) throw new Error('Invalid FEN: bad halfmove clock');
  if (!Number.isInteger(fullmove) || fullmove < 1) throw new Error('Invalid FEN: bad fullmove number');

  return {
    board,
    turn: activeColor,
    castling: parseCastling(castlingText),
    enPassant: epText === '-' ? null : epText,
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
  const opp: Side = p.side === 'w' ? 'b' : 'w';

  const slide = (dirs: [number, number][]) => {
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
  const step = (deltas: [number, number][]) => {
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
      if (state && state.enPassant) {
        const ep = sqToIdx(state.enPassant);
        if (ep.f === nf && ep.r === nr) out.push([nf, nr, 'ep']);
      }
    }
  } else if (p.type === 'n') {
    step([
      [1, 2], [2, 1], [-1, 2], [-2, 1],
      [1, -2], [2, -1], [-1, -2], [-2, -1],
    ]);
  } else if (p.type === 'b') {
    slide([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
  } else if (p.type === 'r') {
    slide([[1, 0], [-1, 0], [0, 1], [0, -1]]);
  } else if (p.type === 'q') {
    slide([
      [1, 1], [1, -1], [-1, 1], [-1, -1],
      [1, 0], [-1, 0], [0, 1], [0, -1],
    ]);
  } else if (p.type === 'k') {
    step([
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ]);
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

export function inCheck(board: Board, side: Side): boolean {
  const k = findKing(board, side);
  if (!k) return false;
  const opp: Side = side === 'w' ? 'b' : 'w';
  return isAttacked(board, k[0], k[1], opp);
}

// The square of the side-to-move's king when it stands in check, else null.
// Derived from the position (not from a `+` in the SAN) so the board effect
// stays deterministic even when the script author omits the check marker.
export function checkedKingSquare(state: GameState): string | null {
  if (!inCheck(state.board, state.turn)) return null;
  const k = findKing(state.board, state.turn);
  return k ? idxToSq(k[0], k[1]) : null;
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
    turn: state.turn === 'w' ? 'b' : 'w',
    castling: cr,
    enPassant,
    halfmove: p.type === 'p' || mv.capture ? 0 : state.halfmove + 1,
    fullmove: state.turn === 'b' ? state.fullmove + 1 : state.fullmove,
  };
}

export function legalMoves(state: GameState): Move[] {
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
        const isCap = !!target || flag === 'ep';
        const baseMv: Move = {
          from: [f, r],
          to: [tf, tr],
          piece: p.type,
          capture: isCap,
          enPassant: flag === 'ep',
        };
        if (p.type === 'p' && (tr === 0 || tr === 7)) {
          for (const promo of ['q', 'r', 'b', 'n'] as PieceType[]) {
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
  const opp: Side = state.turn === 'w' ? 'b' : 'w';
  const k = findKing(board, state.turn);
  const castleK = state.turn === 'w' ? state.castling.wK : state.castling.bK;
  const castleQ = state.turn === 'w' ? state.castling.wQ : state.castling.bQ;
  if (k && k[0] === 4 && k[1] === homeRank && !inCheck(board, state.turn)) {
    if (
      castleK &&
      !board[homeRank][5] &&
      !board[homeRank][6] &&
      board[homeRank][7] &&
      board[homeRank][7]!.type === 'r' &&
      board[homeRank][7]!.side === state.turn &&
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
      board[homeRank][0] &&
      board[homeRank][0]!.type === 'r' &&
      board[homeRank][0]!.side === state.turn &&
      !isAttacked(board, 2, homeRank, opp) &&
      !isAttacked(board, 3, homeRank, opp)
    ) {
      moves.push({ from: [4, homeRank], to: [2, homeRank], piece: 'k', castle: 'Q', capture: false });
    }
  }
  return moves;
}

export function parseSAN(san: string, state: GameState): Move | null {
  const raw = san.replace(/[+#!?]+$/g, '').replace(/\s/g, '');
  const moves = legalMoves(state);

  if (/^O-O-O$/i.test(raw) || raw === '0-0-0') {
    return moves.find((m) => m.castle === 'Q') || null;
  }
  if (/^O-O$/i.test(raw) || raw === '0-0') {
    return moves.find((m) => m.castle === 'K') || null;
  }

  const re = /^([NBRQK])?([a-h])?([1-8])?(x)?([a-h][1-8])(=?([NBRQ]))?$/;
  const m = raw.match(re);
  if (!m) return null;
  const pieceLetter = m[1];
  const fromFile = m[2];
  const fromRank = m[3];
  const wantsCapture = !!m[4];
  const to = m[5];
  const promo = m[7] ? (m[7].toLowerCase() as PieceType) : null;
  const pieceType: PieceType = pieceLetter ? (pieceLetter.toLowerCase() as PieceType) : 'p';
  if (pieceType === 'p' && wantsCapture && !fromFile) return null;
  const toIdx = sqToIdx(to);

  const candidates = moves.filter((mv) => {
    if (mv.castle) return false;
    if (mv.piece !== pieceType) return false;
    if (mv.to[0] !== toIdx.f || mv.to[1] !== toIdx.r) return false;
    if (fromFile && mv.from[0] !== fromFile.charCodeAt(0) - 97) return false;
    if (fromRank && mv.from[1] !== parseInt(fromRank, 10) - 1) return false;
    // SAN spec: `x` is present iff the move captures. Reject mismatches so
    // `Nxe4` won't bind a quiet move (and `Ne4` won't bind a capture).
    if (wantsCapture !== mv.capture) return false;
    if (promo && mv.promotion !== promo) return false;
    if (!promo && mv.promotion && pieceType === 'p') {
      if (mv.promotion !== 'q') return false;
    }
    return true;
  });

  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) return null;
  return candidates[0];
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
  const next = applyMove(state, mv);
  if (inCheck(next.board, next.turn)) {
    san += legalMoves(next).length === 0 ? '#' : '+';
  }
  return san;
}

export function initialState(): GameState {
  return {
    board: initialBoard(),
    turn: 'w',
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null,
    halfmove: 0,
    fullmove: 1,
  };
}
