// The Script tab's Moves view: renders the outline from `buildMoveOutline`
// (lichess-style rows, variation flows, kind-colored seek dots) as a
// structured editor with a time chip and delete × per event. Edits are
// reported as script-text transforms, never applied to board state. Every
// element mapped to an event carries data-evi={event index} so follow-scroll
// and the current-move highlight find it regardless of nesting.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  eventBody,
  fmtDeci,
  fmtTime,
  parseTime,
  splitSanAnnotation,
  type ErrorEvent,
  type ParsedEvent,
  type TimelineEvent,
} from '../lib/timeline';
import {
  buildMoveOutline,
  type FlowItem,
  type OutlineBlock,
  type OutlineCell,
} from '../lib/moveOutline';
import type { StructureSnapshot } from '../lib/world';
import {
  annotationMarkColors,
  markerColors,
  markerForms,
  markerKindFor,
  type MarkerKind,
} from '../lib/tokens';
import { scrollEviIntoView } from '../lib/scrollEventIntoView';
import { useRovingTabIndex } from './useRovingTabIndex';

type MoveEvent = Extract<ParsedEvent, { kind: 'move' }>;
type FocusRequest = { kind: 'line'; line: number } | { kind: 'index'; index: number };

const ROVING_SELECTOR = 'button, .pgn-time-input';

// Click-to-edit timestamp chip: commits on Enter/blur, cancels on Escape.
// ↑/↓ nudge without committing, since a commit re-parses the script and would
// unmount the input. Chip math stays on the integer decisecond grid: float
// ±0.1 steps stick or skip a tenth, and a floored prefill would make a no-edit
// blur rewrite an off-grid line. Memoized; its props are scalars and stable
// callbacks.
const TimeChip = memo(function TimeChip({
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
  // A rejected commit flashes the chip; the class clears on animationend.
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
});

type MoveListProps = {
  events: TimelineEvent[];
  snapshots: readonly StructureSnapshot[];
  reachedEventIndex: number;
  // Lines with a script error; their cells get inline error styling.
  errorLines: ReadonlySet<number>;
  onSeek: (t: number) => void;
  playing: boolean;
  labelId: string;
  onRetime: (line: number, t: number) => number | null;
  onDelete: (lines: number[]) => void;
};

// Takes the reached event, never the time, so playback re-renders the list
// only when the playhead crosses an event. Events are time-sorted, so
// `i <= reachedEventIndex` is exactly "fired".
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
  const outline = useMemo(() => buildMoveOutline(events, snapshots), [events, snapshots]);
  const listRef = useRef<HTMLDivElement | null>(null);

  // One Tab stop for every control in the list; the hook's observer survives
  // the chip's button/input swap.
  const roving = useRovingTabIndex(ROVING_SELECTOR, {
    mirrorTo: listRef,
    verticalArrows: true,
    // Chip inputs join the tab stop but keep ↑/↓ for nudging.
    keySelector: 'button',
  });

  // Focus restores after commit: a retime follows the line to where it moved;
  // a delete takes the surviving control at the same index.
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

  // Follow the playhead only while playing, scrolling only the list, and not
  // while a mouse is over it. Declared after the focus restore so it scrolls
  // last.
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
  const restoreLineFocus = useCallback(
    (line: number) => setFocusRequest({ kind: 'line', line }),
    [],
  );

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

  // Element + time chip + delete ×. br/ml sides pass del: false so the pair
  // stays intact (the block's own × deletes it). Error marks pass chip: false:
  // a line without a valid `[t]` cannot be retimed.
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
        data-form={markerForms[kind]}
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

  // The quality mark takes `annotationMarkColors` inline, except on the
  // current row: no mark color reaches legible contrast on its pill, so it
  // inherits the row ink, like `.pgn-varnum`.
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

  // Blocks and rows key by position, tokens by event index (`mv3`, `m4`), so a
  // re-render keeps an open time chip mounted.
  const mark = (i: number) => {
    const e = events[i];
    return 'error' in e ? markDot(i, 'err', e, e.error) : markDot(i, e.kind, e, eventBody(e));
  };
  const cell = (c: OutlineCell | null, empty: string) => {
    if (!c) return <span className="pgn-cell pgn-gap">{empty}</span>;
    const e = events[c.move] as MoveEvent;
    return (
      <span className="pgn-cell">
        {tok(`mv${c.move}`, moveBtn(c.move, e, 'pgn-mv'), e.line, e.t, e.san)}
        {c.marks.map(mark)}
      </span>
    );
  };
  const flowItem = (item: FlowItem) => {
    const i = item.i;
    const e = events[i];
    switch (item.type) {
      case 'mark':
        return mark(i);
      case 'move': {
        const mv = e as MoveEvent;
        const prefix = item.number && <span className="pgn-varnum">{item.number}</span>;
        return tok(
          `v${i}`,
          moveBtn(i, mv, 'pgn-var-mv', fmtTime(mv.t, 'auto'), prefix),
          mv.line,
          mv.t,
          mv.san,
        );
      }
      case 'open':
        // A br's time is ordering-only, so it gets no chip; the ml's is the
        // visible restore moment.
        return (
          <span key={`o${i}`} className="pgn-paren" data-evi={i}>
            (
          </span>
        );
      case 'close':
        return tok(
          `c${i}`,
          <span className="pgn-paren" data-evi={i}>
            )
          </span>,
          e.line,
          e.t,
          'nested variation end',
          { del: false },
        );
      case 'return':
        return tok(
          `r${i}`,
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
          </button>,
          e.line,
          e.t,
          'variation end (ml)',
          { del: false },
        );
    }
  };
  const block = (b: OutlineBlock, key: number) => {
    switch (b.type) {
      case 'rows':
        return (
          <div key={key} className="pgn-rows">
            {b.rows.map((r, ri) => (
              <div key={ri} className="pgn-row">
                <span className="pgn-numcol">{r.num}</span>
                {cell(r.white, '…')}
                {cell(r.black, '')}
              </div>
            ))}
          </div>
        );
      case 'marks':
        return (
          <div key={key} className="pgn-marks">
            {b.marks.map(mark)}
          </div>
        );
      case 'variation':
        return (
          <div key={key} className="pgn-var" data-evi={b.head}>
            {b.items.map(flowItem)}
            {deleteX(b.lines, 'whole variation')}
          </div>
        );
      case 'error': {
        const e = events[b.i] as ErrorEvent;
        return (
          <div key={key} className={`pgn-error ${stateClass(b.i)}`}>
            <button
              type="button"
              className="pgn-err-seek"
              data-evi={b.i}
              aria-current={b.i === reachedEventIndex ? 'step' : undefined}
              onClick={() => onSeek(e.t)}
            >
              <span className="err-line">L{e.line}</span>
              <span>{e.error}</span>
            </button>
            {deleteX([e.line], `line ${e.line}`)}
          </div>
        );
      }
      case 'divider': {
        const e = events[b.i] as ParsedEvent;
        const body = eventBody(e);
        return (
          <div key={key} className={`pgn-divider ${stateClass(b.i)}`}>
            <button
              type="button"
              className="pgn-divider-seek"
              data-evi={b.i}
              aria-current={b.i === reachedEventIndex ? 'step' : undefined}
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
          </div>
        );
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
      {outline.map(block)}
    </div>
  );
});
