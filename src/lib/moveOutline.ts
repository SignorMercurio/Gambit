// The Moves view's structure, derived once from the event stream: numbered
// mainline rows, variation flows, and the blocks between them. Pure data —
// every number below is an index into `events` — so `MoveList` only renders,
// and the layout rules are testable without a DOM.

import type { TimelineEvent } from './timeline';
import type { StructureSnapshot } from './world';

// A mainline move and the annotation events that follow it.
export type OutlineCell = { move: number; marks: number[] };
// A null White cell is the PGN "…" placeholder; a null Black cell is blank.
type OutlineRow = { num: number; white: OutlineCell | null; black: OutlineCell | null };

export type FlowItem =
  // Any non-move event inside a variation, parse errors included.
  | { type: 'mark'; i: number }
  // `number` is the "3." / "3…" prefix, shown on White moves and whenever
  // something interrupted the run of moves.
  | { type: 'move'; i: number; number: string | null }
  // A nested `br` / its `ml`.
  | { type: 'open'; i: number }
  | { type: 'close'; i: number }
  // The `ml` that ends the block.
  | { type: 'return'; i: number };

export type OutlineBlock =
  | { type: 'rows'; rows: OutlineRow[] }
  // Annotations with no mainline move to attach to, and stray `ml`s.
  | { type: 'marks'; marks: number[] }
  // `head` is the opening `br`; `lines` are the script lines a whole-variation
  // delete removes.
  | { type: 'variation'; head: number; lines: number[]; items: FlowItem[] }
  | { type: 'error'; i: number }
  // `rs` / `st` / `fen` on the main line.
  | { type: 'divider'; i: number };

export function buildMoveOutline(
  events: readonly TimelineEvent[],
  snapshots: readonly StructureSnapshot[],
): OutlineBlock[] {
  const blocks: OutlineBlock[] = [];
  let rows: OutlineRow[] = [];
  // Only the newest row stays open: its last cell keeps collecting marks (and
  // White's row its Black move) until the next row or block starts.
  let row: OutlineRow | null = null;
  let marks: number[] = [];
  let flow: Extract<OutlineBlock, { type: 'variation' }> | null = null;
  let flowInterrupted = true;

  const closeRow = () => {
    if (row) rows.push(row);
    row = null;
  };
  const flushRows = () => {
    closeRow();
    if (rows.length) blocks.push({ type: 'rows', rows });
    rows = [];
  };
  const flushMarks = () => {
    if (marks.length) blocks.push({ type: 'marks', marks });
    marks = [];
  };
  const closeFlow = () => {
    if (flow) blocks.push(flow);
    flow = null;
  };

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (flow) flow.lines.push(e.line);
    if ('error' in e) {
      if (flow) {
        flow.items.push({ type: 'mark', i });
      } else {
        flushRows();
        flushMarks();
        blocks.push({ type: 'error', i });
      }
      continue;
    }
    if (flow && e.kind !== 'move' && e.kind !== 'branch' && e.kind !== 'mainline') {
      flow.items.push({ type: 'mark', i });
      flowInterrupted = true;
      continue;
    }
    switch (e.kind) {
      case 'move': {
        const st = snapshots[i].chessState;
        if (flow) {
          const number =
            st.turn === 'w' || flowInterrupted
              ? `${st.fullmove}${st.turn === 'b' ? '…' : '.'}`
              : null;
          flow.items.push({ type: 'move', i, number });
          flowInterrupted = false;
        } else {
          flushMarks();
          const cell: OutlineCell = { move: i, marks: [] };
          // Black completes an open White row; any other Black move opens a
          // "…" row.
          if (st.turn === 'b' && row && !row.black) {
            row.black = cell;
          } else {
            closeRow();
            row =
              st.turn === 'w'
                ? { num: st.fullmove, white: cell, black: null }
                : { num: st.fullmove, white: null, black: cell };
          }
        }
        break;
      }
      case 'highlight':
      case 'arrow':
      case 'clear':
      case 'replay':
      case 'mind':
      case 'reveal':
      case 'ask': {
        const lastCell: OutlineCell | null = row && (row.black ?? row.white);
        (lastCell?.marks ?? marks).push(i);
        break;
      }
      case 'branch':
        if (flow) {
          flow.items.push({ type: 'open', i });
        } else {
          flushRows();
          flushMarks();
          flow = { type: 'variation', head: i, lines: [e.line], items: [] };
        }
        flowInterrupted = true;
        break;
      case 'mainline':
        if (!flow) {
          // Stray `ml` (already a script error); it stays seekable as a mark.
          marks.push(i);
        } else if (snapshots[i].branchDepth === 1) {
          flow.items.push({ type: 'return', i });
          closeFlow();
        } else {
          flow.items.push({ type: 'close', i });
          flowInterrupted = true;
        }
        break;
      case 'reset':
      case 'start':
      case 'fen':
        flushRows();
        flushMarks();
        blocks.push({ type: 'divider', i });
        break;
    }
  }
  closeFlow();
  flushRows();
  flushMarks();
  return blocks;
}
