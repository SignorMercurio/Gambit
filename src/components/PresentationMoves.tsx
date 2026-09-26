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
import type { GameState } from '../lib/chess';
import {
  splitSanAnnotation,
  type TimelineEvent,
} from '../lib/timeline';
import { scrollEviIntoView } from '../lib/scrollEventIntoView';

type PresMove = { i: number; text: string };
// A missing white cell is the PGN "…" placeholder — no separate flag needed.
type PresRow = { num: number; white: PresMove | null; black: PresMove | null };

// Derive the visible rows and their per-event cursor together. A setup keeps
// earlier rows as history but closes the pending row and clears the cursor;
// rejected events and events inside variations change neither.
export function buildMainline(
  events: TimelineEvent[],
  snapshots: readonly { chessState: GameState }[],
  rejectedEventIndexes: ReadonlySet<number>,
): { rows: PresRow[]; cursorByEvent: number[] } {
  const rows: PresRow[] = [];
  const cursorByEvent: number[] = [];
  let row: PresRow | null = null;
  let cursor = -1;
  let depth = 0;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!('error' in event)) {
      // Read structure before outcomes: a rejected index must not flatten a branch.
      if (event.kind === 'branch') {
        depth++;
      } else if (event.kind === 'mainline') {
        if (depth > 0) depth--;
      } else if (depth === 0 && !rejectedEventIndexes.has(i)) {
        if (event.kind === 'reset' || event.kind === 'start' || event.kind === 'fen') {
          row = null;
          cursor = -1;
        } else if (event.kind === 'move') {
          const st = snapshots[i].chessState;
          const { text } = splitSanAnnotation(event.san);
          const mv: PresMove = { i, text };
          if (st.turn === 'w') {
            row = { num: st.fullmove, white: mv, black: null };
            rows.push(row);
          } else if (row) {
            row.black = mv;
            row = null;
          } else {
            // Black to move after an initial FEN or reset has no White partner.
            rows.push({ num: st.fullmove, white: null, black: mv });
          }
          cursor = i;
        }
      }
    }
    cursorByEvent.push(cursor);
  }
  return { rows, cursorByEvent };
}

type PresentationMovesProps = {
  events: TimelineEvent[];
  snapshots: readonly { chessState: GameState }[];
  reachedEventIndex: number;
  rejectedEventIndexes: ReadonlySet<number>;
};

export const PresentationMoves = memo(function PresentationMoves({
  events,
  snapshots,
  reachedEventIndex,
  rejectedEventIndexes,
}: PresentationMovesProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  // Depends only on the script, not the playhead: without this the whole list
  // is rebuilt on every move as `reachedEventIndex` advances.
  const { rows, cursorByEvent } = useMemo(
    () => buildMainline(events, snapshots, rejectedEventIndexes),
    [events, snapshots, rejectedEventIndexes],
  );

  // This list renders only mainline moves, so it needs its own cursor: the
  // last move it actually shows at or before the playhead. Keying straight off
  // reachedEventIndex would blank the current-move pill (and no-op the scroll)
  // for every hl, arrow, cl, and the whole of any variation.
  const cursor = cursorByEvent[reachedEventIndex] ?? -1;

  // Keep the current move in view as playback advances (scrolls only this
  // container, never the page — the shared helper both move lists use).
  useEffect(() => scrollEviIntoView(listRef.current!, cursor), [cursor]);

  const moveClass = (m: PresMove | null) => {
    if (!m || m.i > reachedEventIndex) return 'present-mv';
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
