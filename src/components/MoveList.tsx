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

import { memo, useEffect, useRef, useState } from 'react';
import type { GameState } from '../lib/chess';
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

type FocusRequest = { kind: 'line'; line: number } | { kind: 'index'; index: number };

const ROVING_SELECTOR = 'button, .pgn-time-input';

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
  snapshots: readonly { chessState: GameState }[];
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
  snapshots,
  reachedEventIndex,
  errorLines,
  onSeek,
  playing,
  labelId,
  onRetime,
  onDelete,
}: MoveListProps) {
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

  const markDot = (i: number, markKind: MarkerKind, e: TimelineEvent, body: string) => {
    const kind = markerKindFor(markKind, e.line, errorLines);
    const dot = (
      <button
        type="button"
        className={`pgn-dot ${stateClass(i)}`}
        data-kind={kind}
        data-evi={i}
        aria-current={i === reachedEventIndex ? 'step' : undefined}
        style={{ color: markerColors[kind] }}
        title={`${fmtTime(e.t, 'auto')} · ${body}${kind === 'err' ? ' · script error' : ''}`}
        aria-label={`Seek to ${fmtTime(e.t, 'auto')}: ${body}${kind === 'err' ? ' (script error)' : ''}`}
        onClick={() => onSeek(e.t)}
      />
    );
    return tok(`m${i}`, dot, e.line, e.t, body, markKind === 'err' ? { chip: false } : undefined);
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
    i: number,
    e: { t: number; line: number; san: string },
    className: 'pgn-mv' | 'pgn-var-mv',
    plainTitle?: string,
    prefix?: React.ReactNode,
  ) => {
    const hasError = errorLines.has(e.line);
    const { text, mark, annotation } = splitSanAnnotation(e.san);
    return (
      <button
        type="button"
        className={`${className} ${stateClass(i)}${hasError ? ' has-error' : ''}`}
        data-evi={i}
        aria-current={i === reachedEventIndex ? 'step' : undefined}
        title={hasError ? 'This line has a script error' : plainTitle}
        aria-label={`Seek to ${fmtTime(e.t, 'auto')}: ${e.san}${hasError ? ' (script error)' : ''}`}
        onClick={() => onSeek(e.t)}
      >
        {prefix}
        {text}
        {annotation && (
          <span
            className="pgn-annot"
            style={i === reachedEventIndex ? undefined : { color: annotationMarkColors[annotation] }}
          >
            {mark}
          </span>
        )}
      </button>
    );
  };

  // One pass over the (time-sorted) event stream, emitting elements as it
  // goes. Mainline moves accumulate into a `.pgn-rows` group; a top-level `br`
  // opens a variation flow that closes at its matching `ml`; annotations
  // attach as dots to the move they follow, or to an orphan marks block when
  // no move precedes them. Only the newest row stays open: its last cell keeps
  // collecting dots (and White's row its Black move) until the next row or
  // block starts. Blocks and rows key by position, tokens by event index
  // (`mv3`, `m4`), so a re-render keeps an open time chip mounted.
  const blocks: React.ReactNode[] = [];
  let rows: React.ReactNode[] = [];
  let row: { num: number; white: React.ReactNode[] | null; black: React.ReactNode[] | null } | null =
    null;
  let marks: React.ReactNode[] = [];
  let flow: React.ReactNode[] | null = null;
  let flowLines: number[] = [];
  let flowHead = 0;
  // Nesting depth inside the open variation: 1 at the top-level `br`, higher
  // for nested `br`s, so the `ml` that returns to 0 is the one that closes
  // the flow block (nested `ml`s render as closing parens instead).
  let flowDepth = 0;
  let flowInterrupted = true;

  // A missing White cell is the PGN "…" placeholder; a missing Black cell is blank.
  const cell = (nodes: React.ReactNode[] | null, empty: string) =>
    nodes ? (
      <span className="pgn-cell">{nodes}</span>
    ) : (
      <span className="pgn-cell pgn-gap">{empty}</span>
    );
  const closeRow = () => {
    if (row) {
      rows.push(
        <div key={rows.length} className="pgn-row">
          <span className="pgn-numcol">{row.num}</span>
          {cell(row.white, '…')}
          {cell(row.black, '')}
        </div>,
      );
      row = null;
    }
  };
  const flushRows = () => {
    closeRow();
    if (rows.length) {
      blocks.push(
        <div key={blocks.length} className="pgn-rows">
          {rows}
        </div>,
      );
      rows = [];
    }
  };
  const flushMarks = () => {
    if (marks.length) {
      blocks.push(
        <div key={blocks.length} className="pgn-marks">
          {marks}
        </div>,
      );
      marks = [];
    }
  };
  const closeFlow = () => {
    if (flow) {
      blocks.push(
        <div key={blocks.length} className="pgn-var" data-evi={flowHead}>
          {flow}
          {deleteX(flowLines, 'whole variation')}
        </div>,
      );
      flow = null;
      flowLines = [];
    }
  };

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (flow) flowLines.push(e.line);
    if ('error' in e) {
      if (flow) {
        flow.push(markDot(i, 'err', e, e.error));
      } else {
        flushRows();
        flushMarks();
        blocks.push(
          <div key={blocks.length} className={`pgn-error ${stateClass(i)}`}>
            <button
              type="button"
              className="pgn-err-seek"
              data-evi={i}
              aria-current={i === reachedEventIndex ? 'step' : undefined}
              onClick={() => onSeek(e.t)}
            >
              <span className="err-line">L{e.line}</span>
              <span>{e.error}</span>
            </button>
            {deleteX([e.line], `line ${e.line}`)}
          </div>,
        );
      }
      continue;
    }
    if (flow && e.kind !== 'move' && e.kind !== 'branch' && e.kind !== 'mainline') {
      flow.push(markDot(i, e.kind, e, eventBody(e)));
      flowInterrupted = true;
      continue;
    }
    switch (e.kind) {
      case 'move': {
        const st = snapshots[i].chessState;
        if (flow) {
          const prefix = (st.turn === 'w' || flowInterrupted) && (
            <span className="pgn-varnum">
              {st.fullmove}
              {st.turn === 'b' ? '…' : '.'}
            </span>
          );
          flow.push(
            tok(
              `v${i}`,
              moveBtn(i, e, 'pgn-var-mv', fmtTime(e.t, 'auto'), prefix),
              e.line,
              e.t,
              e.san,
            ),
          );
          flowInterrupted = false;
        } else {
          flushMarks();
          const nodes = [tok(`mv${i}`, moveBtn(i, e, 'pgn-mv'), e.line, e.t, e.san)];
          // Black completes an open White row; any other Black move opens a
          // "…" row.
          if (st.turn === 'b' && row && !row.black) {
            row.black = nodes;
          } else {
            closeRow();
            row =
              st.turn === 'w'
                ? { num: st.fullmove, white: nodes, black: null }
                : { num: st.fullmove, white: null, black: nodes };
          }
        }
        break;
      }
      case 'highlight':
      case 'arrow':
      case 'clear':
      case 'replay':
      case 'mind':
      case 'reveal': {
        const dot = markDot(i, e.kind, e, eventBody(e));
        const lastCell = row && (row.black ?? row.white);
        (lastCell ?? marks).push(dot);
        break;
      }
      case 'branch': {
        flowDepth++;
        if (flow) {
          // A br's timestamp is ordering-only (no visible effect), so it gets
          // no time chip; the ml side does — it is the visible restore moment.
          flow.push(
            <span key={`o${i}`} className="pgn-paren" data-evi={i}>
              (
            </span>,
          );
        } else {
          flushRows();
          flushMarks();
          flow = [];
          flowLines = [e.line];
          flowHead = i;
        }
        flowInterrupted = true;
        break;
      }
      case 'mainline': {
        if (!flow) {
          // Stray `ml` (already a script error); keep it seekable as a dot.
          marks.push(markDot(i, 'mainline', e, eventBody(e)));
        } else if (--flowDepth === 0) {
          const ret = (
            <button
              type="button"
              className={`pgn-ret ${stateClass(i)}`}
              data-evi={i}
              aria-current={i === reachedEventIndex ? 'step' : undefined}
              title={`${fmtTime(e.t, 'auto')} · back to main line`}
              aria-label={`Seek to ${fmtTime(e.t, 'auto')}: end variation`}
              onClick={() => onSeek(e.t)}
            >
              ↩
            </button>
          );
          flow.push(tok(`r${i}`, ret, e.line, e.t, 'variation end (ml)', { del: false }));
          closeFlow();
        } else {
          const paren = (
            <span className="pgn-paren" data-evi={i}>
              )
            </span>
          );
          flow.push(tok(`c${i}`, paren, e.line, e.t, 'nested variation end', { del: false }));
          flowInterrupted = true;
        }
        break;
      }
      case 'reset':
      case 'start':
      case 'fen': {
        flushRows();
        flushMarks();
        const body = eventBody(e);
        blocks.push(
          <div key={blocks.length} className={`pgn-divider ${stateClass(i)}`}>
            <button
              type="button"
              className="pgn-divider-seek"
              data-evi={i}
              aria-current={i === reachedEventIndex ? 'step' : undefined}
              aria-label={`Seek to ${fmtTime(e.t, 'auto')}: ${body}`}
              onClick={() => onSeek(e.t)}
            >
              <span className="pgn-divider-body">{body}</span>
            </button>
            <TimeChip
              t={e.t}
              line={e.line}
              label={body}
              onRetime={onRetime}
              onRestoreFocus={restoreLineFocus}
            />
            {deleteX([e.line], body)}
          </div>,
        );
        break;
      }
    }
  }
  closeFlow();
  flushRows();
  flushMarks();

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
      {blocks}
    </div>
  );
});
