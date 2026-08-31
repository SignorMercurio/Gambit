// Chess pieces — Staunty SVG set from Lichess, modified for Gambit: the
// outline strokes are recolored warm (#4b4847 / #312e2b) to sit better
// against the cream squares. Nothing else differs from upstream.
// See public/licenses/LICENSE-pieces.txt.
// Licensed under CC BY-NC-SA 4.0 by sadsnake1; ShareAlike applies.
// Each piece is decorative inside the Board, which is the labelled
// `role="img"` (see its aria-label); empty alt prevents 32 piece announcements
// from drowning the page.

import { memo, type CSSProperties } from 'react';
import type { PieceType, Side } from '../lib/chess';
import { tokens } from '../lib/tokens';

type PieceProps = { type: PieceType; side: Side; active: boolean };

const PIECE_STYLE: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'block',
  userSelect: 'none',
  filter: tokens.shadowPiece,
  pointerEvents: 'none',
};
const ACTIVE_PIECE_STYLE: CSSProperties = {
  ...PIECE_STYLE,
  filter: tokens.shadowPieceMoving,
};

// Board repaints on every animation frame; only the moving piece's `active`
// flag changes, so steady pieces can reuse the same image subtree and style.
export const Piece = memo(function Piece({ type, side, active }: PieceProps) {
  const code = type + (side === 'w' ? 'l' : 'd');
  return (
    <img
      src={`/pieces/${code}.svg`}
      alt=""
      role="presentation"
      draggable={false}
      style={active ? ACTIVE_PIECE_STYLE : PIECE_STYLE}
    />
  );
});
