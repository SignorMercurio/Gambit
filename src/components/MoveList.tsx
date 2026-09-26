// PGN-style move list: mainline moves in numbered white/black rows,
// variations as inset flow blocks, non-move events as kind-colored seek
// dots — the lichess analysis-panel convention rendered in Gambit's chrome.
// Every element that maps to a script event carries data-evi={event index}
// so the follow-scroll and the current-move highlight can find it regardless
// of nesting.
//
// The list is the Script tab's Moves view — a structured editor over the
// script text: every event grows a click-to-edit time chip (mm:ss.t, ↑/↓
// nudges 0.1s) and a delete ×; variation blocks delete as a whole (br
// through ml). Edits are reported as script-text transforms, never applied
// to board state directly.

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { MoveState, Side } from '../lib/chess';
import {
  eventBody,
  fmtDeci,
  fmtTime,
  parseTime,
  splitSanAnnotation,
  type TimelineEvent,
} from '../lib/timeline';
import {
  annotationMarkColors,
  markerColors,
  markerKindFor,
  type MarkerKind,
} from '../lib/tokens';
import { scrollEviIntoView } from '../lib/scrollEventIntoView';
import { useRovingTabIndex } from './useRovingTabIndex';

type Mark = { i: number; kind: MarkerKind; t: number; line: number; body: string };
type Cell = {
  i: number;
  t: number;
  line: number;
  san: string;
  marks: Mark[];
};
type Row = { num: number; white: Cell | null; black: Cell | null };
type FocusRequest = { kind: 'line'; line: number } | { kind: 'index'; index: number };

const ROVING_SELECTOR = 'button, .pgn-time-input';

type FlowNode =
  | {
      type: 'mv';
      i: number;
      t: number;
      line: number;
      num: number;
      side: Side;
      san: string;
      showNum: boolean;
    }
  | { type: 'mark'; mark: Mark }
  | { type: 'open'; i: number }
  | { type: 'close'; i: number; t: number; line: number }
  | { type: 'ret'; i: number; t: number; line: number };

type Block =
  | { type: 'rows'; rows: Row[] }
  | { type: 'var'; i: number; nodes: FlowNode[]; lines: number[] }
  | { type: 'divider'; i: number; t: number; line: number; body: string }
  | { type: 'error'; i: number; t: number; line: number; text: string }
  | { type: 'marks'; marks: Mark[] };

// Walk the (time-sorted) event stream into render blocks. Mainline moves
// accumulate into rows; a top-level `br` opens a variation flow that closes
// at its matching `ml`; annotations attach as dots to the move they follow,
// or to an orphan marks block when no move precedes them.
function buildBlocks(events: TimelineEvent[], states: MoveState[]): Block[] {
  const blocks: Block[] = [];
  let rowAcc: Row[] = [];
  let markAcc: Mark[] = [];
  let row: Row | null = null;
  let lastCell: Cell | null = null;
  let varNodes: FlowNode[] | null = null;
  let varLines: number[] = [];
  let varHeadI = 0;
  // Nesting depth inside the open variation: 1 at the top-level `br`, higher
  // for nested `br`s, so the `ml` that returns to 0 is the one that closes
  // the flow block (nested `ml`s render as closing parens instead).
  let varDepth = 0;
  let flowInterrupted = true;

  const flushRows = () => {
    if (rowAcc.length) {
      blocks.push({ type: 'rows', rows: rowAcc });
      rowAcc = [];
    }
    row = null;
    lastCell = null;
  };
  const flushMarks = () => {
    if (markAcc.length) {
      blocks.push({ type: 'marks', marks: markAcc });
      markAcc = [];
    }
  };
  const closeVar = () => {
    if (varNodes) {
      blocks.push({ type: 'var', i: varHeadI, nodes: varNodes, lines: varLines });
      varNodes = null;
      varLines = [];
    }
  };

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (varNodes) varLines.push(e.line);
    if ('error' in e) {
      const mark: Mark = { i, kind: 'err', t: e.t, line: e.line, body: e.error };
      if (varNodes) {
        varNodes.push({ type: 'mark', mark });
      } else {
        flushRows();
        flushMarks();
        blocks.push({ type: 'error', i, t: e.t, line: e.line, text: e.error });
      }
      continue;
    }
    if (varNodes && e.kind !== 'move' && e.kind !== 'branch' && e.kind !== 'mainline') {
      varNodes.push({
        type: 'mark',
        mark: { i, kind: e.kind, t: e.t, line: e.line, body: eventBody(e) },
      });
      flowInterrupted = true;
      continue;
    }
    switch (e.kind) {
      case 'move': {
        const st = states[i];
        if (varNodes) {
          varNodes.push({
            type: 'mv',
            i,
            t: e.t,
            line: e.line,
            num: st.fullmove,
            side: st.turn,
            san: e.san,
            showNum: st.turn === 'w' || flowInterrupted,
          });
          flowInterrupted = false;
        } else {
          flushMarks();
          const cell: Cell = {
            i,
            t: e.t,
            line: e.line,
            san: e.san,
            marks: [],
          };
          if (st.turn === 'w') {
            row = { num: st.fullmove, white: cell, black: null };
            rowAcc.push(row);
          } else if (row) {
            row.black = cell;
            // The row is complete — a later Black move opens a "…" row instead.
            row = null;
          } else {
            rowAcc.push({ num: st.fullmove, white: null, black: cell });
          }
          lastCell = cell;
        }
        break;
      }
      case 'highlight':
      case 'arrow':
      case 'clear':
      case 'replay':
      case 'mind':
      case 'reveal': {
        const mark: Mark = { i, kind: e.kind, t: e.t, line: e.line, body: eventBody(e) };
        if (lastCell) lastCell.marks.push(mark);
        else markAcc.push(mark);
        break;
      }
      case 'branch': {
        varDepth++;
        if (varNodes) {
          varNodes.push({ type: 'open', i });
        } else {
          flushRows();
          flushMarks();
          varNodes = [];
          varLines = [e.line];
          varHeadI = i;
        }
        flowInterrupted = true;
        break;
      }
      case 'mainline': {
        if (!varNodes) {
          // Stray `ml` (already a script error); keep it seekable as a dot.
          markAcc.push({ i, kind: 'mainline', t: e.t, line: e.line, body: eventBody(e) });
        } else if (--varDepth === 0) {
          varNodes.push({ type: 'ret', i, t: e.t, line: e.line });
          closeVar();
        } else {
          varNodes.push({ type: 'close', i, t: e.t, line: e.line });
          flowInterrupted = true;
        }
        break;
      }
      case 'reset':
      case 'start':
      case 'fen':
        flushRows();
        flushMarks();
        blocks.push({ type: 'divider', i, t: e.t, line: e.line, body: eventBody(e) });
        break;
    }
  }
  closeVar();
  flushRows();
  flushMarks();
  return blocks;
}

// Click-to-edit timestamp chip. The input commits on Enter/blur, cancels on
// Escape, and ↑/↓ nudge by 0.1s without committing — a commit re-parses the
// script, so live-nudging would unmount the input mid-edit. All chip math
// runs on the integer decisecond grid: raw ±0.1 float steps stick or skip a
// tenth (0.7 + 0.1 floors back to 0.7), and a floor-based prefill on an
// off-grid authored time would make a no-edit blur rewrite the line.
function TimeChip({
  t,
  line,
  label,
  onRetime,
  onRestoreFocus,
}: {
  t: number;
  line: number;
  label: string;
  onRetime: (line: number, t: number) => number | null;
  onRestoreFocus: (line: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  // A rejected commit flashes the chip vermillion instead of reverting
  // silently; the class clears itself on animationend.
  const [rejected, setRejected] = useState(false);
  const cancelled = useRef(false);
  const restoreFocus = useRef(false);
  const deci = Math.max(0, Math.round(t * 10));

  if (!editing) {
    return (
      <button
        type="button"
        className={`pgn-time-edit${rejected ? ' chip-rejected' : ''}`}
        data-script-line={line}
        title={`Edit time of ${label}`}
        aria-label={`Edit time of ${label}, currently ${fmtDeci(deci, 'always')}`}
        onAnimationEnd={() => setRejected(false)}
        onClick={() => {
          cancelled.current = false;
          setRejected(false);
          setVal(fmtDeci(deci, 'always'));
          setEditing(true);
        }}
      >
        {fmtDeci(deci, 'auto')}
      </button>
    );
  }
  return (
    <input
      className="pgn-time-input"
      value={val}
      autoFocus
      spellCheck={false}
      aria-label={`Time of ${label}`}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          restoreFocus.current = true;
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          cancelled.current = true;
          restoreFocus.current = true;
          e.currentTarget.blur();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const cur = parseTime(e.currentTarget.value.trim());
          if (Number.isFinite(cur)) {
            const step = e.key === 'ArrowUp' ? 1 : -1;
            setVal(fmtDeci(Math.max(0, Math.round(cur * 10) + step), 'always'));
          }
        }
      }}
      onBlur={() => {
        setEditing(false);
        let focusLine = line;
        if (!cancelled.current) {
          const trimmed = val.trim();
          if (trimmed !== '') {
            const parsed = parseTime(trimmed);
            if (!Number.isFinite(parsed) || parsed < 0) {
              // Unparseable input never rewrites the line, but it must not
              // vanish without a trace either.
              setRejected(true);
            } else if (Math.round(parsed * 10) !== deci) {
              focusLine = onRetime(line, parsed) ?? line;
            }
          }
        }
        if (restoreFocus.current) {
          restoreFocus.current = false;
          onRestoreFocus(focusLine);
        }
      }}
    />
  );
}

type MoveListProps = {
  events: TimelineEvent[];
  states: MoveState[];
  reachedEventIndex: number;
  // Lines the snapshot builder rejected (illegal SAN, bad FEN, resource cap): their move
  // cells get inline error styling so the errors band isn't the only flag.
  errorLines: ReadonlySet<number>;
  onSeek: (t: number) => void;
  playing: boolean;
  labelId: string;
  onRetime: (line: number, t: number) => number | null;
  onDelete: (lines: number[]) => void;
};

// memo matters here: the parent re-renders every animation frame during
// playback, and every prop except reachedEventIndex is referentially stable
// while the clock runs. Past/current state derives from reachedEventIndex —
// events are time-sorted, so `i <= reachedEventIndex` is exactly "fired".
export const MoveList = memo(function MoveList({
  events,
  states,
  reachedEventIndex,
  errorLines,
  onSeek,
  playing,
  labelId,
  onRetime,
  onDelete,
}: MoveListProps) {
  const blocks = useMemo(() => buildBlocks(events, states), [events, states]);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Roving tabindex over every control in the list (same mechanism as the
  // timeline pins): a script's worth of moves, chips, and deletes must cost
  // keyboard users one Tab stop, not three per event. The hook's observer
  // keeps the invariant across the time chip's child-local button↔input
  // swaps, and the chip input's keys stay its own (the hook only handles
  // keys from buttons).
  const roving = useRovingTabIndex(ROVING_SELECTOR, {
    mirrorTo: listRef,
    verticalArrows: true,
    // Time inputs participate in the single-stop sweep, but keep their own
    // ArrowUp/ArrowDown editing behavior instead of navigating the toolbar.
    keySelector: 'button',
  });

  // Editing can relocate a script line, while deleting unmounts the focused
  // control entirely. Restore at list level after React commits the new DOM:
  // a retime follows the transform's resulting script line; a delete selects
  // the nearest surviving control at the same DOM index.
  useEffect(() => {
    if (!focusRequest) return;
    const container = listRef.current!;
    let target: HTMLElement | null | undefined;
    if (focusRequest.kind === 'line') {
      target = container.querySelector<HTMLElement>(
        `[data-script-line="${focusRequest.line}"]`,
      );
    } else {
      const controls = roving.getControls();
      target = controls[Math.min(focusRequest.index, controls.length - 1)];
    }
    (target ?? container).focus();
    setFocusRequest(null);
  }, [focusRequest, roving]);

  // Follow the playhead only while playback runs, scrolling only the list
  // container (never the page), so paused editing never fights the scroll; a
  // mouse pointer over the list pauses the follow so click targets stay put.
  // Declared after the focus-restore effect: focus() scrolls too, and the
  // follow must land last.
  const followPausedRef = useRef(false);
  useEffect(() => {
    if (!playing || followPausedRef.current) return;
    const list = listRef.current!;
    if (reachedEventIndex < 0) {
      list.scrollTop = 0;
      return;
    }
    scrollEviIntoView(list, reachedEventIndex);
  }, [reachedEventIndex, playing]);

  const stateClass = (i: number) => {
    if (i === reachedEventIndex) return 'past current';
    return i < reachedEventIndex ? 'past' : '';
  };
  const restoreLineFocus = (line: number) =>
    setFocusRequest({ kind: 'line', line });

  const deleteX = (lines: number[], label: string) => (
    <button
      type="button"
      className="pgn-x"
      title={`Delete ${label}`}
      aria-label={`Delete ${label}`}
      onClick={(e) => {
        const controls = roving.getControls();
        setFocusRequest({
          kind: 'index',
          index: Math.max(0, controls.indexOf(e.currentTarget)),
        });
        onDelete(lines);
      }}
    >
      ×
    </button>
  );

  // Editable wrapper: element + its time chip + its delete ×. br/ml pair
  // sides pass del: false — no per-line delete, so the pairing stays intact
  // (the whole variation deletes via the block's own ×). Error marks pass
  // chip: false — mainline error rows offer no chip either, and retiming a
  // line without a valid `[t]` header would be a silent no-op.
  const tok = (
    key: string,
    inner: React.ReactNode,
    line: number,
    t: number,
    label: string,
    opts?: { chip?: boolean; del?: boolean },
  ) => (
    <span key={key} className="pgn-tok">
      {inner}
      {(opts?.chip ?? true) && (
        <TimeChip
          t={t}
          line={line}
          label={label}
          onRetime={onRetime}
          onRestoreFocus={restoreLineFocus}
        />
      )}
      {(opts?.del ?? true) && deleteX([line], label)}
    </span>
  );

  const markDot = (m: Mark) => {
    const kind = markerKindFor(m.kind, m.line, errorLines);
    const dot = (
      <button
        type="button"
        className={`pgn-dot ${stateClass(m.i)}`}
        data-kind={kind}
        data-evi={m.i}
        aria-current={m.i === reachedEventIndex ? 'step' : undefined}
        style={{ color: markerColors[kind] }}
        title={`${fmtTime(m.t, 'auto')} · ${m.body}${kind === 'err' ? ' · script error' : ''}`}
        aria-label={`Seek to ${fmtTime(m.t, 'auto')}: ${m.body}${kind === 'err' ? ' (script error)' : ''}`}
        onClick={() => onSeek(m.t)}
      />
    );
    return tok(`m${m.i}`, dot, m.line, m.t, m.body, m.kind === 'err' ? { chip: false } : undefined);
  };

  // The quality mark keeps its color from `annotationMarkColors` directly,
  // the way the seek dot above takes `markerColors[kind]` — a per-kind class
  // plus a custom property is one more place the same four hexes have to agree.
  //
  // On the current row it takes none. That pill is studio-steel-blue, where
  // every mark color measures 1.20–1.72:1 and no lightening rescues them;
  // inheriting the row's chalk is the same move `.pgn-varnum` already makes.
  // Nothing is lost — the mark's own `!!`/`??` still reads, and the board
  // badge is showing the color full size at that exact moment.
  const moveBtn = (
    m: { i: number; t: number; line: number; san: string },
    className: 'pgn-mv' | 'pgn-var-mv',
    plainTitle?: string,
    prefix?: React.ReactNode,
  ) => {
    const hasError = errorLines.has(m.line);
    const { text, mark, annotation } = splitSanAnnotation(m.san);
    return (
      <button
        type="button"
        className={`${className} ${stateClass(m.i)}${hasError ? ' has-error' : ''}`}
        data-evi={m.i}
        aria-current={m.i === reachedEventIndex ? 'step' : undefined}
        title={hasError ? 'This line has a script error' : plainTitle}
        aria-label={`Seek to ${fmtTime(m.t, 'auto')}: ${m.san}${hasError ? ' (script error)' : ''}`}
        onClick={() => onSeek(m.t)}
      >
        {prefix}
        {text}
        {annotation && (
          <span
            className="pgn-annot"
            style={
              m.i === reachedEventIndex ? undefined : { color: annotationMarkColors[annotation] }
            }
          >
            {mark}
          </span>
        )}
      </button>
    );
  };

  // A missing White cell is the PGN "…" placeholder; a missing Black cell is blank.
  const cell = (c: Cell | null, empty: string) =>
    c ? (
      <span className="pgn-cell">
        {tok(`mv${c.i}`, moveBtn(c, 'pgn-mv'), c.line, c.t, c.san)}
        {c.marks.map(markDot)}
      </span>
    ) : (
      <span className="pgn-cell pgn-gap">{empty}</span>
    );

  const flowNode = (n: FlowNode) => {
    switch (n.type) {
      case 'mv':
        return tok(
          `v${n.i}`,
          moveBtn(
            n,
            'pgn-var-mv',
            fmtTime(n.t, 'auto'),
            n.showNum && (
              <span className="pgn-varnum">
                {n.num}
                {n.side === 'b' ? '…' : '.'}
              </span>
            ),
          ),
          n.line,
          n.t,
          n.san,
        );
      case 'mark':
        return markDot(n.mark);
      case 'open':
        // A br's timestamp is ordering-only (no visible effect), so it gets
        // no time chip; the ml side does — it is the visible restore moment.
        return (
          <span key={`o${n.i}`} className="pgn-paren" data-evi={n.i}>
            (
          </span>
        );
      case 'close': {
        const paren = (
          <span className="pgn-paren" data-evi={n.i}>
            )
          </span>
        );
        return tok(`c${n.i}`, paren, n.line, n.t, 'nested variation end', { del: false });
      }
      case 'ret': {
        const btn = (
          <button
            type="button"
            className={`pgn-ret ${stateClass(n.i)}`}
            data-evi={n.i}
            aria-current={n.i === reachedEventIndex ? 'step' : undefined}
            title={`${fmtTime(n.t, 'auto')} · back to main line`}
            aria-label={`Seek to ${fmtTime(n.t, 'auto')}: end variation`}
            onClick={() => onSeek(n.t)}
          >
            ↩
          </button>
        );
        return tok(`r${n.i}`, btn, n.line, n.t, 'variation end (ml)', { del: false });
      }
    }
  };

  return (
    <div
      ref={roving.ref}
      className="event-list"
      role="toolbar"
      tabIndex={-1}
      aria-labelledby={labelId}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') followPausedRef.current = true;
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') followPausedRef.current = false;
      }}
      onFocus={roving.onFocus}
      onKeyDown={roving.onKeyDown}
    >
      {events.length === 0 && (
        <p className="pgn-empty">
          Empty script. Drag pieces on the board to record moves, right-drag for arrows,
          right-click for highlights — or switch to Text.
        </p>
      )}
      {blocks.map((b, bi) => {
        switch (b.type) {
          case 'rows':
            return (
              <div key={bi} className="pgn-rows">
                {b.rows.map((r, ri) => (
                  <div key={ri} className="pgn-row">
                    <span className="pgn-numcol">{r.num}</span>
                    {cell(r.white, '…')}
                    {cell(r.black, '')}
                  </div>
                ))}
              </div>
            );
          case 'var':
            return (
              <div key={bi} className="pgn-var" data-evi={b.i}>
                {b.nodes.map(flowNode)}
                {deleteX(b.lines, 'whole variation')}
              </div>
            );
          case 'divider':
            return (
              <div key={bi} className={`pgn-divider ${stateClass(b.i)}`}>
                <button
                  type="button"
                  className="pgn-divider-seek"
                  data-evi={b.i}
                  aria-current={b.i === reachedEventIndex ? 'step' : undefined}
                  aria-label={`Seek to ${fmtTime(b.t, 'auto')}: ${b.body}`}
                  onClick={() => onSeek(b.t)}
                >
                  <span className="pgn-divider-body">{b.body}</span>
                </button>
                <TimeChip
                  t={b.t}
                  line={b.line}
                  label={b.body}
                  onRetime={onRetime}
                  onRestoreFocus={restoreLineFocus}
                />
                {deleteX([b.line], b.body)}
              </div>
            );
          case 'error':
            return (
              <div key={bi} className={`pgn-error ${stateClass(b.i)}`}>
                <button
                  type="button"
                  className="pgn-err-seek"
                  data-evi={b.i}
                  aria-current={b.i === reachedEventIndex ? 'step' : undefined}
                  onClick={() => onSeek(b.t)}
                >
                  <span className="err-line">L{b.line}</span>
                  <span>{b.text}</span>
                </button>
                {deleteX([b.line], `line ${b.line}`)}
              </div>
            );
          case 'marks':
            return (
              <div key={bi} className="pgn-marks">
                {b.marks.map(markDot)}
              </div>
            );
        }
      })}
    </div>
  );
});
