// The script language's way in for the argument-free kinds — notably `mind`
// and `reveal`, which otherwise had no on-screen entry point beyond a syntax hint.
//
// It is deliberately an inline disclosure rather than a popover: the side panel
// is a tall column with room to spare, an in-flow panel can't be clipped by an
// ancestor's overflow, and the product register's rule is to exhaust inline
// alternatives before reaching for an overlay.
//
// Insertion goes through the same planLineInsert path as a board gesture, so
// stamping policy, collision stepping, and the paused-playhead landing are the
// gestures' rules verbatim — this is another way to type a line, not a second
// way to edit state.
//
// It owns its open flag and the `/` shortcut. Mounting is the gate: the menu is
// rendered only in the Script tab's Moves view outside present mode, so `/`
// does nothing wherever the result of pressing it couldn't be shown, and
// leaving the view drops the open flag with the component instead of
// reopening on return.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CommandEntry } from '../lib/commands';
import { AUTHORED_ELSEWHERE_COMMANDS, INSERTABLE_COMMANDS } from '../lib/commands';
import { markerColors } from '../lib/tokens';
import { useLatest } from './useLatest';
import { useRovingTabIndex } from './useRovingTabIndex';

// What counts as typing, for every single-key shortcut: `/` here, and the
// transport keys in App (which widen it to every interactive control).
export const TEXT_ENTRY_SELECTOR = 'input, textarea, [contenteditable="true"]';

// The two lists differ in one thing — whether the row is a button — so the face
// itself is shared.
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
  // Where the line will land, already formatted. Shown on the trigger so the
  // playhead's role is visible before the menu is ever opened.
  timeLabel: string;
};

// The four kinds authored on another surface; a module constant because it
// closes over nothing.
const ELSEWHERE_ROWS = AUTHORED_ELSEWHERE_COMMANDS.map((c) => (
  <li key={c.token} className="insert-row insert-row--ref">
    <span className="insert-item insert-item--static">
      <CommandFace command={c} />
    </span>
    <span className="insert-via">{c.via}</span>
  </li>
));

export function InsertMenu({ onInsert, timeLabel }: InsertMenuProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // `/` opens the menu. Its guard is narrower than the transport's: the
  // transport keys must stay off every control (Space would re-trigger a
  // focused button), but `/` is only ever ambiguous inside real text entry,
  // and blocking it on buttons would kill the shortcut exactly when focus is
  // parked on the move list. A PNG export makes `main` `inert`, which
  // stops clicks but not a window listener — so the key checks it too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      if (
        e.target instanceof HTMLElement &&
        e.target.closest(TEXT_ENTRY_SELECTOR)
      ) return;
      if (triggerRef.current?.closest('[inert]')) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Same mechanism as the event list and the pin row: the command rows cost
  // one Tab stop, and Up/Down walk them.
  const roving = useRovingTabIndex('button.insert-item', {
    mirrorTo: panelRef,
    verticalArrows: true,
  });

  // Closing always returns focus to the trigger — a menu that dismisses into
  // nowhere strands the keyboard.
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // This component sits in the default view, so it re-renders on every
  // animation frame of playback. `onInsert` closes over the playhead and so
  // changes identity every frame; held in a ref, the click handler below can be
  // stable, which is what lets the row lists memoize down to zero per-frame
  // work while the panel is open. `close` is a `useCallback` for the same
  // reason.
  const insertRef = useLatest(onInsert);
  const handleInsert = useCallback(
    (body: string) => {
      insertRef.current(body);
      close();
    },
    [close],
  );

  // The time is deliberately absent from the row labels: the trigger carries
  // it ("Insert at 00:12.3"), and per-frame labels would rewrite eight
  // accessible names 60×/s under a screen reader's cursor.
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

  // Opening moves focus into the first command — a menu the keyboard has to
  // go hunting for is not a keyboard path.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>('button.insert-item')?.focus();
  }, [open]);

  // Light dismiss. Pointerdown rather than click so a press that starts
  // outside never lands on the board as a gesture and leaves the menu open.
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
          {/* Clickable commands lead. In parser order the three gesture kinds
              come first, which pushed `mind` and `reveal` — the kinds this menu
              exists to surface — below the panel's scroll fold. */}
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
