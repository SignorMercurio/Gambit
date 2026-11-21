// Roving tabindex (WAI-ARIA composite) over the controls inside a container:
// one Tab stop; ←/→ (optionally ↑/↓) walk DOM order, Home/End jump, and any
// focus inside re-anchors the stop.
//
// The cursor lives in a ref and tabIndex is written imperatively, so an arrow
// press never re-renders the subtree. Controls must render WITHOUT a tabIndex
// prop: the hook owns the attribute, and a rendered prop resets it on remount.
//
// A childList MutationObserver re-asserts the single stop, because controls
// can mount or unmount without the parent re-rendering.

import { useCallback, useMemo, useRef } from 'react';

export function syncRovingTabStops<T extends { tabIndex: number }>(
  controls: T[],
  cursor: number,
): number {
  if (controls.length === 0) return 0;
  const current = Math.min(Math.max(0, cursor), controls.length - 1);
  controls.forEach((control, i) => {
    const tabIndex = i === current ? 0 : -1;
    if (control.tabIndex !== tabIndex) control.tabIndex = tabIndex;
  });
  return current;
}

// `mirrorTo` receives the node the returned `ref` attaches. Attach `ref`, never
// `mirrorTo`: a MutableRefObject typechecks as a `ref` prop and silently no-ops.
export function useRovingTabIndex<T extends HTMLElement>(
  selector: string,
  opts?: {
    verticalArrows?: boolean;
    keySelector?: string;
    mirrorTo?: React.MutableRefObject<T | null>;
  },
) {
  const cursorRef = useRef(0);
  const ownRef = useRef<T | null>(null);
  const containerRef = opts?.mirrorTo ?? ownRef;
  const verticalArrows = opts?.verticalArrows ?? false;
  const keySelector = opts?.keySelector ?? selector;

  const controls = useCallback(
    (): HTMLElement[] =>
      containerRef.current
        ? Array.from(containerRef.current.querySelectorAll<HTMLElement>(selector))
        : [],
    [containerRef, selector],
  );

  // A callback ref, not a mount effect, so a container that mounts later (the
  // insert menu's panel) is still swept.
  const observerRef = useRef<MutationObserver | null>(null);
  const attach = useCallback(
    (node: T | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      containerRef.current = node;
      if (!node) return;
      const sweep = () => {
        cursorRef.current = syncRovingTabStops(controls(), cursorRef.current);
      };
      sweep();
      const observer = new MutationObserver(sweep);
      observer.observe(node, { childList: true, subtree: true });
      observerRef.current = observer;
    },
    [containerRef, controls],
  );

  // Handlers sit on the container, so a matching target is always one of its
  // controls: indexOf always hits and the list is never empty.
  const onFocus = useCallback(
    (e: React.FocusEvent) => {
      if (!(e.target instanceof HTMLElement) || !e.target.matches(selector)) return;
      const els = controls();
      const nextCursor = els.indexOf(e.target);
      cursorRef.current = syncRovingTabStops(els, nextCursor);
    },
    [controls, selector],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Controls outside keySelector keep their own keyboard behavior.
      if (!(e.target instanceof HTMLElement) || !e.target.matches(keySelector)) return;
      const horizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
      const vertical = verticalArrows && (e.key === 'ArrowUp' || e.key === 'ArrowDown');
      if (!horizontal && !vertical && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      e.stopPropagation();
      const els = controls();
      const cur = els.indexOf(e.target);
      const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
      let next: number;
      if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = els.length - 1;
      else if (back) next = Math.max(0, cur - 1);
      else next = Math.min(els.length - 1, cur + 1);
      // onFocus alone moves tabIndex and the cursor; this only focuses.
      els[next].focus();
    },
    [controls, keySelector, verticalArrows],
  );

  return useMemo(
    () => ({ ref: attach, getControls: controls, onFocus, onKeyDown }),
    [attach, controls, onFocus, onKeyDown],
  );
}
