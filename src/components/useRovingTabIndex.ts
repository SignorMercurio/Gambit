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

// `mirrorTo` is an *output*, not the handle you attach: the returned `ref`
// callback writes the node into it, for callers that also need it (scrolling
// the list, hit-testing a click against the panel). It sits in `opts` because
// as a leading parameter it read as the container handle — and attaching that
// instead of the returned `ref` typechecks (a MutableRefObject is a valid
// `ref` prop) and silently no-ops, which is exactly the eight-Tab-stop bug
// below. Callers that don't need the node pass nothing.
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

  // Attached as a callback ref rather than read out of `containerRef` in an
  // effect. The effect form had a precondition nobody had written down: its
  // deps are all stable, so it ran exactly once at mount, and a container that
  // mounts *later* was never swept. The pin row and the move list are always
  // mounted so it held there by luck; the insert menu's panel renders only
  // while open, so all eight command rows kept `tabIndex=0` and the group cost
  // eight Tab stops instead of the one this hook exists to provide. A hook that
  // silently no-ops on an unmounted container is the wrong shape — this one
  // observes whatever node it is given, whenever it arrives.
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

  // The handlers sit on the container, so a target matching the selector is
  // by construction one of the container's own controls: indexOf always hits
  // and the control list is never empty.
  const onFocus = useCallback(
    (e: React.FocusEvent) => {
      if (!(e.target instanceof HTMLElement) || !e.target.matches(selector)) return;
      const els = controls();
      const nextCursor = els.indexOf(e.target);
      if (nextCursor < 0) return;
      cursorRef.current = syncRovingTabStops(els, nextCursor);
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
      let next: number;
      if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = els.length - 1;
      else if (back) next = Math.max(0, cur - 1);
      else next = Math.min(els.length - 1, cur + 1);
      // Focus is the single owner of the tab-stop swap: this focus() fires
      // onFocus above, which moves tabIndex and the cursor.
      els[next].focus();
    },
    [controls, keySelector, verticalArrows],
  );

  return useMemo(
    () => ({ ref: attach, getControls: controls, onFocus, onKeyDown }),
    [attach, controls, onFocus, onKeyDown],
  );
}
