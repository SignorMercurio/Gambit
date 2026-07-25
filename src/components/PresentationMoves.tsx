// Read-only mainline move list for present mode. Deliberately NOT the editor
// MoveList: a presentation surface shows only what an audience should read —
// numbered mainline moves and the current position. Everything the editor
// carries is intentionally absent, not conditionally suppressed:
//   - no variations (br/ml flows are skipped by depth)
//   - no move-quality annotations (!!, !, ?, ?? are stripped from the SAN)
//   - no timestamps / time chips
//   - no seek dots for hl/arrow/clear, no reset dividers, no errors
//   - no edit affordances (delete ×, retime) and nothing focusable
// The board stays the single source of truth; this is a passive readout keyed
// off reachedEventIndex, memoized so the 60Hz clock doesn't re-render it.

import { memo, useEffect, useMemo, useRef } from 'react';
import type { MoveState } from '../lib/chess';
import { splitSanAnnotation, type TimelineEvent } from '../lib/timeline';
import { scrollEviIntoView } from '../lib/scrollEventIntoView';

type PresMove = { i: number; text: string };
// A missing white cell is the PGN "…" placeholder — no separate flag needed.
type PresRow = { num: number; white: PresMove | null; black: PresMove | null };

// Walk events into numbered mainline rows, skipping anything inside a
// variation (br raises depth, ml lowers it) and every non-move event. The
// numbering comes from moveStates, which already accounts for resets/FENs.
export function buildMainline(events: TimelineEvent[], states: MoveState[]): PresRow[] {
  const rows: PresRow[] = [];
  let row: PresRow | null = null;
  let depth = 0;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if ('error' in e) continue;
    if (e.kind === 'branch') {
      depth++;
      continue;
    }
    if (e.kind === 'mainline') {
      if (depth > 0) depth--;
      continue;
    }
    if (depth > 0) continue;
    // A reset/start/fen restarts the numbering, so it has to close the pending
    // row: otherwise a post-reset Black move pairs into the pre-reset White
    // move's row whenever the two fullmove counters coincide — which they
    // routinely do, most FENs being fullmove 1.
    if (e.kind === 'reset' || e.kind === 'start' || e.kind === 'fen') {
      row = null;
      continue;
    }
    if (e.kind !== 'move') continue;
    const st = states[i];
    const { text } = splitSanAnnotation(e.san);
    const mv: PresMove = { i, text };
    if (st.turn === 'w') {
      row = { num: st.fullmove, white: mv, black: null };
      rows.push(row);
    } else if (row) {
      // Pairs with the White move above it: an open row always has an empty
      // black cell, and a reset has already cleared `row`.
      row.black = mv;
      row = null;
    } else {
      // Black to move with no matching white (script opened on Black, or a
      // reset landed here): render the PGN "…" placeholder in the white cell.
      rows.push({ num: st.fullmove, white: null, black: mv });
    }
  }
  return rows;
}

type PresentationMovesProps = {
  events: TimelineEvent[];
  states: MoveState[];
  reachedEventIndex: number;
};

export const PresentationMoves = memo(function PresentationMoves({
  events,
  states,
  reachedEventIndex,
}: PresentationMovesProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  // Depends only on the script, not the playhead: without this the whole list
  // is rebuilt on every move as `reachedEventIndex` advances.
  const rows = useMemo(() => buildMainline(events, states), [events, states]);

  // This list renders only mainline moves, so it needs its own cursor: the
  // last move it actually shows at or before the playhead. Keying straight off
  // reachedEventIndex would blank the current-move pill (and no-op the scroll)
  // for every hl, arrow, cl, and the whole of any variation.
  const cursor = useMemo(() => {
    let last = -1;
    for (const r of rows) {
      for (const m of [r.white, r.black]) {
        if (m && m.i <= reachedEventIndex) last = m.i;
      }
    }
    return last;
  }, [rows, reachedEventIndex]);

  // Keep the current move in view as playback advances (scrolls only this
  // container, never the page — the shared helper both move lists use).
  useEffect(() => {
    const list = listRef.current;
    if (!list || cursor < 0) return;
    scrollEviIntoView(list, cursor);
  }, [cursor]);

  const moveClass = (m: PresMove | null) => {
    if (!m || m.i > cursor) return 'present-mv';
    return m.i === cursor ? 'present-mv current' : 'present-mv past';
  };

  return (
    <aside className="present-moves" aria-label="Moves">
      <div className="present-moves-scroll" ref={listRef}>
        {rows.map((r, ri) => (
          <div key={ri} className="present-row">
            <span className="present-num">{r.num}.</span>
            <span className={moveClass(r.white)} data-evi={r.white?.i}>
              {r.white ? r.white.text : '…'}
            </span>
            <span className={moveClass(r.black)} data-evi={r.black?.i}>
              {r.black ? r.black.text : ''}
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
});
