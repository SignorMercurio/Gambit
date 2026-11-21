// Read-only mainline move list for present mode, deliberately not the editor
// MoveList: only numbered mainline moves and the current one. No variations
// (skipped by `branchDepth`), quality marks, times, non-move events, errors,
// edit affordances, or focusable elements. Memoized off the clock.

import { memo, useEffect, useMemo, useRef } from 'react';
import type { StructureSnapshot } from '../lib/world';
import {
  splitSanAnnotation,
  type TimelineEvent,
} from '../lib/timeline';
import { scrollEviIntoView } from '../lib/scrollEventIntoView';

type PresMove = { i: number; text: string };
// A null white cell renders as the PGN "…" placeholder.
type PresRow = { num: number; white: PresMove | null; black: PresMove | null };

// Rows plus a per-event cursor. A setup keeps earlier rows but closes the
// pending row and clears the cursor; rejected events and events inside
// variations (`snapshots[i].branchDepth > 0`) change neither.
export function buildMainline(
  events: TimelineEvent[],
  snapshots: readonly StructureSnapshot[],
  rejectedEventIndexes: ReadonlySet<number>,
): { rows: PresRow[]; cursorByEvent: number[] } {
  const rows: PresRow[] = [];
  const cursorByEvent: number[] = [];
  let row: PresRow | null = null;
  let cursor = -1;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    // `br`/`ml` themselves fall through: they are neither setups nor moves.
    if (!('error' in event) && snapshots[i].branchDepth === 0 && !rejectedEventIndexes.has(i)) {
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
    cursorByEvent.push(cursor);
  }
  return { rows, cursorByEvent };
}

type PresentationMovesProps = {
  events: TimelineEvent[];
  snapshots: readonly StructureSnapshot[];
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
  const { rows, cursorByEvent } = useMemo(
    () => buildMainline(events, snapshots, rejectedEventIndexes),
    [events, snapshots, rejectedEventIndexes],
  );

  // The last shown move at or before the playhead; reachedEventIndex alone
  // would blank the pill on every non-move event and inside variations.
  const cursor = cursorByEvent[reachedEventIndex] ?? -1;

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
