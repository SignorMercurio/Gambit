// In-flight board gestures capture their commit callbacks at pointer-down.
// Playback may keep advancing while the pointer is held, so resolving through
// the latest React props at pointer-up would apply the preview against a
// different position and playhead.

export type BoardGesture =
  | {
      kind: 'move';
      from: string;
      over: string | null;
      targets: ReadonlySet<string>;
      commit?: (from: string, to: string) => void;
    }
  | {
      kind: 'annotate';
      from: string;
      over: string | null;
      commitArrow?: (from: string, to: string) => void;
      commitHighlight?: (sq: string) => void;
    };

export function beginMoveGesture(
  from: string,
  targets: ReadonlySet<string>,
  commit?: (from: string, to: string) => void,
): BoardGesture {
  return { kind: 'move', from, over: from, targets, commit };
}

export function beginAnnotationGesture(
  from: string,
  commitArrow?: (from: string, to: string) => void,
  commitHighlight?: (sq: string) => void,
): BoardGesture {
  return { kind: 'annotate', from, over: from, commitArrow, commitHighlight };
}

// Callers only re-target on an actual square change, so this always produces a
// fresh gesture; the captured commit callbacks ride along untouched.
export function updateGestureTarget(gesture: BoardGesture, over: string | null): BoardGesture {
  return { ...gesture, over };
}

export function finishBoardGesture(gesture: BoardGesture, over: string | null): void {
  if (gesture.kind === 'move') {
    if (over && over !== gesture.from && gesture.targets.has(over)) {
      gesture.commit?.(gesture.from, over);
    }
    return;
  }
  if (over === gesture.from) gesture.commitHighlight?.(gesture.from);
  else if (over) gesture.commitArrow?.(gesture.from, over);
}
