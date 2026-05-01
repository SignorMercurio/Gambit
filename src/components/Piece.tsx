// Chess pieces — Staunty SVG set from Lichess.
// Licensed under CC BY-NC-SA 4.0 by sadsnake1.
// Each piece is decorative inside the Board (which is exposed to AT as
// `role="img" aria-label="Chess board"`); empty alt prevents 32 piece
// announcements from drowning the page.

import type { PieceType, Side } from '../lib/chess';
import { tokens } from '../lib/tokens';

export function Piece({ type, side }: { type: PieceType; side: Side }) {
  const code = type + (side === 'w' ? 'l' : 'd');
  return (
    <img
      src={`/pieces/${code}.svg`}
      alt=""
      role="presentation"
      draggable={false}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        userSelect: 'none',
        filter: tokens.shadowPiece,
        pointerEvents: 'none',
      }}
    />
  );
}
