// Roving tabindex over the interactive controls inside a container — the
// WAI-ARIA toolbar/composite pattern shared by the timeline pin row and the
// Moves-view event list. The whole group costs one Tab stop; ←/→ (and
// optionally ↑/↓) walk controls in DOM order, Home/End jump to the extremes,
// and any focus landing inside (mouse click, programmatic) re-anchors the
// stop so Tab-out/Tab-in returns there.
//
// The cursor lives in a ref and tabIndex is written imperatively so an arrow
// press never re-renders the container's subtree (the pin row is memoized
// against the 60Hz clock; the move list re-renders per event boundary).
// Controls must render WITHOUT a tabIndex prop — the hook owns the attribute,
// and a rendered prop would reset it whenever a control remounts.
//
// The single-stop invariant is re-asserted by a childList MutationObserver,
// not render-time deps: control mounts/unmounts the parent never re-renders
// for (e.g. the time chip swapping its button for an input while editing)
// must still leave exactly one tabbable control. Attribute churn (class,
// aria-current) during playback doesn't wake a childList observer.

import { useCallback, useEffect, useMemo, useRef } from 'react';

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

export function useRovingTabIndex<T extends HTMLElement>(
  containerRef: React.RefObject<T | null>,
  selector: string,
  opts?: { verticalArrows?: boolean; keySelector?: string },
) {
  const cursorRef = useRef(0);
  const verticalArrows = opts?.verticalArrows ?? false;
  const keySelector = opts?.keySelector ?? selector;

  const controls = useCallback(
    (): HTMLElement[] =>
      containerRef.current
        ? Array.from(containerRef.current.querySelectorAll<HTMLElement>(selector))
        : [],
    [containerRef, selector],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const sweep = () => {
      const els = controls();
      cursorRef.current = syncRovingTabStops(els, cursorRef.current);
    };
    sweep();
    const observer = new MutationObserver(sweep);
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [containerRef, controls]);

  // The handlers sit on the container, so a target matching the selector is
  // by construction one of the container's own controls: indexOf always hits
  // and the control list is never empty.
  const onFocus = useCallback(
    (e: React.FocusEvent) => {
      if (!(e.target instanceof HTMLElement) || !e.target.matches(selector)) return;
      const els = controls();
      const nextCursor = els.indexOf(e.target);
      if (nextCursor < 0) return;
      const prev = els[cursorRef.current];
      if (prev && prev !== e.target) prev.tabIndex = -1;
      cursorRef.current = nextCursor;
      e.target.tabIndex = 0;
    },
    [controls, selector],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Controls excluded by keySelector (e.g. the time editor's input) keep
      // their own keyboard behavior instead of moving through the toolbar.
      if (!(e.target instanceof HTMLElement) || !e.target.matches(keySelector)) return;
      const horizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
      const vertical = verticalArrows && (e.key === 'ArrowUp' || e.key === 'ArrowDown');
      if (!horizontal && !vertical && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      e.stopPropagation();
      const els = controls();
      const cur = els.indexOf(e.target);
      const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
      const next =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
          ? els.length - 1
          : back
          ? Math.max(0, cur - 1)
          : Math.min(els.length - 1, cur + 1);
      // Focus is the single owner of the tab-stop swap: this focus() fires
      // onFocus above, which moves tabIndex and the cursor.
      els[next].focus();
    },
    [controls, keySelector, verticalArrows],
  );

  return useMemo(
    () => ({ getControls: controls, onFocus, onKeyDown }),
    [controls, onFocus, onKeyDown],
  );
}
