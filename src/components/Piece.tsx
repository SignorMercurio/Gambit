// Chess pieces — Staunty SVG set from Lichess, modified for Gambit: the
// outline strokes are recolored warm (#4b4847 / #312e2b) to sit better
// against the cream squares. Nothing else differs from upstream.
// See public/licenses/LICENSE-pieces.txt.
// Licensed under CC BY-NC-SA 4.0 by sadsnake1; ShareAlike applies.
// Each piece is decorative inside the Board, which is the labelled
// `role="img"` (see its aria-label); empty alt prevents 32 piece announcements
// from drowning the page.

import { memo } from 'react';
import type { PieceType, Side } from '../lib/chess';

type PieceProps = { type: PieceType; side: Side; active: boolean };

// Board repaints on every animation frame; only the moving piece's `active`
// flag changes, so steady pieces can reuse the same image subtree. Box and
// shadows live on `.piece` in styles.css.
export const Piece = memo(function Piece({ type, side, active }: PieceProps) {
  const code = type + (side === 'w' ? 'l' : 'd');
  return (
    <img
      src={`/pieces/${code}.svg`}
      alt=""
      role="presentation"
      draggable={false}
      className={active ? 'piece is-moving' : 'piece'}
    />
  );
});
