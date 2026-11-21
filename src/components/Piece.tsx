// Chess pieces — Staunty SVG set from Lichess, modified for Gambit: the
// outline strokes are recolored warm (#4b4847 / #312e2b) to sit better
// against the cream squares. Nothing else differs from upstream.
// See public/licenses/LICENSE-pieces.txt.
// Licensed under CC BY-NC-SA 4.0 by sadsnake1; ShareAlike applies.
// Decorative: the Board is the labelled `role="img"`, so pieces take empty alt.

import { memo } from 'react';
import type { PieceType, Side } from '../lib/chess';

type PieceProps = { type: PieceType; side: Side; active: boolean };

// Memoized: Board repaints every animation frame, and props must stay stable
// for steady pieces to skip. Box and shadows live on `.piece` in styles.css.
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
