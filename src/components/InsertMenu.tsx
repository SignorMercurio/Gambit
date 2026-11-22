// Insert menu for the argument-free kinds (notably `mind` and `reveal`, which
// have no other on-screen entry point). An inline disclosure, not a popover,
// so no ancestor's overflow can clip it. Insertion goes through the board
// gestures' planLineInsert path, so the same stamping rules apply.
//
// Mounting is the gate for its open flag and the `/` shortcut: it renders only
// in the Moves view outside present mode, so `/` does nothing wherever the menu
// could not show, and leaving the view drops the open flag.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useClockValue, type Clock } from '../lib/clock';
import {
  AUTHORED_ELSEWHERE_COMMANDS,
  INSERTABLE_COMMANDS,
  type CommandEntry,
} from '../lib/commands';
import { fmtTime } from '../lib/timeline';
import { markerColors } from '../lib/tokens';
import { useLatest } from './useLatest';
import { useRovingTabIndex } from './useRovingTabIndex';

// What counts as typing, for every single-key shortcut: `/` here, and the
// transport keys in App (which widen it to every interactive control).
export const TEXT_ENTRY_SELECTOR = 'input, textarea, [contenteditable="true"]';

function CommandFace({ command }: { command: CommandEntry }) {
  return (
    <>
      <span
        className="insert-dot"
        style={{ background: markerColors[command.kind] }}
        aria-hidden="true"
      />
      <span className="insert-token">{command.syntax ?? command.token}</span>
      <span className="insert-hint">{command.hint}</span>
    </>
  );
}

type InsertMenuProps = {
  onInsert: (body: string) => void;
  // Read for the trigger's "Insert at" label.
  clock: Clock;
};

const ELSEWHERE_ROWS = AUTHORED_ELSEWHERE_COMMANDS.map((c) => (
  <li key={c.token} className="insert-row insert-row--ref">
    <span className="insert-item insert-item--static">
      <CommandFace command={c} />
    </span>
    <span className="insert-via">{c.via}</span>
  </li>
));

export function InsertMenu({ onInsert, clock }: InsertMenuProps) {
  // The one clock reading in the editor panel: it changes ten times a second,
  // and only this component follows it.
  const timeLabel = useClockValue(clock, (t) => fmtTime(t, 'always'));
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // `/` is guarded only against text entry, unlike the transport keys:
  // blocking it on buttons would kill it while focus is on the move list.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      if (
        e.target instanceof HTMLElement &&
        e.target.closest(TEXT_ENTRY_SELECTOR)
      ) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const roving = useRovingTabIndex('button.insert-item', {
    mirrorTo: panelRef,
    verticalArrows: true,
  });

  // Closing returns focus to the trigger so the keyboard is never stranded.
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // The time label re-renders this ten times a second during playback. A
  // stable handler (and `close`) lets the row list memoize through that.
  const insertRef = useLatest(onInsert);
  const handleInsert = useCallback(
    (body: string) => {
      insertRef.current(body);
      close();
    },
    [close],
  );

  // Row labels omit the time (the trigger carries it): ticking labels would
  // rewrite accessible names under a screen reader's cursor.
  const insertable = useMemo(
    () =>
      INSERTABLE_COMMANDS.map((c) => (
        <li key={c.token} className="insert-row">
          <button
            type="button"
            role="menuitem"
            className="insert-item"
            aria-label={`Insert ${c.syntax ?? c.token}. ${c.hint}`}
            onClick={() => handleInsert(c.token)}
          >
            <CommandFace command={c} />
          </button>
        </li>
      )),
    [handleInsert],
  );

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>('button.insert-item')?.focus();
  }, [open]);

  // Light dismiss on pointerdown, not click, so a press that starts a board
  // gesture still closes the menu.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div className="insert-dock">
      {open && (
        <div
          ref={roving.ref}
          className="insert-panel"
          role="menu"
          aria-label="Insert a script command at the playhead"
          onFocus={roving.onFocus}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              close();
              return;
            }
            roving.onKeyDown(e);
          }}
        >
          {/* Clickable commands lead, keeping `mind` and `reveal` above the
              scroll fold. */}
          <ul className="insert-list">{insertable}</ul>
          <p className="insert-group-label">Authored on the board, not from a menu</p>
          <ul className="insert-list">{ELSEWHERE_ROWS}</ul>
        </div>
      )}
      <button
        ref={triggerRef}
        type="button"
        className="insert-trigger"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="insert-plus" aria-hidden="true">
          +
        </span>
        <span>Insert at {timeLabel}</span>
        <kbd className="insert-kbd" aria-hidden="true">
          /
        </kbd>
      </button>
    </div>
  );
}
