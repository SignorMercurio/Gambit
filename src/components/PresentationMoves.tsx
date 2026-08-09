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
import {
  splitSanAnnotation,
  type ParsedEvent,
  type TimelineEvent,
} from '../lib/timeline';
import { scrollEviIntoView } from '../lib/scrollEventIntoView';

type PresMove = { i: number; text: string };
// A missing white cell is the PGN "…" placeholder — no separate flag needed.
type PresRow = { num: number; white: PresMove | null; black: PresMove | null };
const NO_REJECTED_EVENTS: ReadonlySet<number> = new Set();

// Interpret variation structure and runtime outcomes once for every
// presentation projection. The callback runs for every visited index; null
// means the event was structural, erroneous, rejected, or inside a variation.
function walkAppliedMainline(
  events: TimelineEvent[],
  rejectedEventIndexes: ReadonlySet<number>,
  end: number,
  visit: (event: ParsedEvent | null, index: number) => void,
) {
  let depth = 0;
  const last = Math.min(end, events.length - 1);
  for (let i = 0; i <= last; i++) {
    const event = events[i];
    let applied: ParsedEvent | null = null;
    if (!('error' in event)) {
      // Structure stays authoritative even if a caller accidentally includes
      // its index in the rejected set: filtering must never flatten a branch.
      if (event.kind === 'branch') {
        depth++;
      } else if (event.kind === 'mainline') {
        if (depth > 0) depth--;
      } else if (depth === 0 && !rejectedEventIndexes.has(i)) {
        applied = event;
      }
    }
    visit(applied, i);
  }
}

function advanceMainlineCursor(
  cursor: number,
  event: ParsedEvent | null,
  index: number,
): number {
  if (event?.kind === 'reset' || event?.kind === 'start' || event?.kind === 'fen') {
    return -1;
  }
  return event?.kind === 'move' ? index : cursor;
}

// Walk events into numbered mainline rows, skipping anything inside a
// variation (br raises depth, ml lowers it) and every non-move event. The
// numbering comes from moveStates, which already accounts for resets/FENs.
export function buildMainline(
  events: TimelineEvent[],
  states: MoveState[],
  rejectedEventIndexes: ReadonlySet<number> = NO_REJECTED_EVENTS,
): PresRow[] {
  const rows: PresRow[] = [];
  let row: PresRow | null = null;
  walkAppliedMainline(events, rejectedEventIndexes, events.length - 1, (e, i) => {
    if (!e) return;
    // A reset/start/fen restarts the numbering, so it has to close the pending
    // row: otherwise a post-reset Black move pairs into the pre-reset White
    // move's row whenever the two fullmove counters coincide — which they
    // routinely do, most FENs being fullmove 1.
    if (e.kind === 'reset' || e.kind === 'start' || e.kind === 'fen') {
      row = null;
      return;
    }
    if (e.kind !== 'move') return;
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
  });
  return rows;
}

function buildMainlineCursorIndex(
  events: TimelineEvent[],
  rejectedEventIndexes: ReadonlySet<number>,
): number[] {
  const cursors = Array<number>(events.length).fill(-1);
  let cursor = -1;
  walkAppliedMainline(events, rejectedEventIndexes, events.length - 1, (event, index) => {
    cursor = advanceMainlineCursor(cursor, event, index);
    cursors[index] = cursor;
  });
  return cursors;
}

// Find the applied mainline move represented by the board at the playhead.
// A setup event leaves earlier rows as history but clears the current pill;
// rejected FENs and setup events inside a variation do neither.
export function findMainlineCursor(
  events: TimelineEvent[],
  reachedEventIndex: number,
  rejectedEventIndexes: ReadonlySet<number> = NO_REJECTED_EVENTS,
): number {
  const end = Math.min(reachedEventIndex, events.length - 1);
  let cursor = -1;
  walkAppliedMainline(events, rejectedEventIndexes, end, (event, index) => {
    cursor = advanceMainlineCursor(cursor, event, index);
  });
  return cursor;
}

type PresentationMovesProps = {
  events: TimelineEvent[];
  states: MoveState[];
  reachedEventIndex: number;
  rejectedEventIndexes: ReadonlySet<number>;
};

export const PresentationMoves = memo(function PresentationMoves({
  events,
  states,
  reachedEventIndex,
  rejectedEventIndexes,
}: PresentationMovesProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  // Depends only on the script, not the playhead: without this the whole list
  // is rebuilt on every move as `reachedEventIndex` advances.
  const { rows, cursorByEvent } = useMemo(
    () => ({
      rows: buildMainline(events, states, rejectedEventIndexes),
      cursorByEvent: buildMainlineCursorIndex(events, rejectedEventIndexes),
    }),
    [events, states, rejectedEventIndexes],
  );

  // This list renders only mainline moves, so it needs its own cursor: the
  // last move it actually shows at or before the playhead. Keying straight off
  // reachedEventIndex would blank the current-move pill (and no-op the scroll)
  // for every hl, arrow, cl, and the whole of any variation.
  const cursorIndex = Math.min(reachedEventIndex, cursorByEvent.length - 1);
  const cursor = cursorIndex < 0 ? -1 : cursorByEvent[cursorIndex];

  // Keep the current move in view as playback advances (scrolls only this
  // container, never the page — the shared helper both move lists use).
  useEffect(() => {
    const list = listRef.current;
    if (!list || cursor < 0) return;
    scrollEviIntoView(list, cursor);
  }, [cursor]);

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
