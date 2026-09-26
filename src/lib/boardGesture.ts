// In-flight board gestures capture their commit callbacks at pointer-down.
// Playback may keep advancing while the pointer is held, so resolving through
// the latest React props at pointer-up would apply the preview against a
// different position and playhead. A gesture also remembers which pointer and
// button started it: other pointers (a stray touch mid-drag) and chorded
// buttons must not retarget, commit, or cancel it.

// The initiating button as its `e.buttons` bit, so handlers can tell whether
// that button is still held mid-gesture.
export function buttonBit(button: number): number {
  if (button === 2) return 2;
  if (button === 0) return 1;
  return 0;
}

type GestureOwner = { pointerId: number; buttonBit: number };

export type BoardGesture = GestureOwner & { from: string; over: string | null } & (
    | {
        kind: 'move';
        targets: ReadonlySet<string>;
        commit: (from: string, to: string) => void;
      }
    | {
        kind: 'annotate';
        commitArrow: (from: string, to: string) => void;
        commitHighlight: (sq: string) => void;
      }
  );

export function beginMoveGesture(
  owner: GestureOwner,
  from: string,
  targets: ReadonlySet<string>,
  commit: (from: string, to: string) => void,
): BoardGesture {
  return { ...owner, kind: 'move', from, over: from, targets, commit };
}

export function beginAnnotationGesture(
  owner: GestureOwner,
  from: string,
  commitArrow: (from: string, to: string) => void,
  commitHighlight: (sq: string) => void,
): BoardGesture {
  return { ...owner, kind: 'annotate', from, over: from, commitArrow, commitHighlight };
}

export function finishBoardGesture(gesture: BoardGesture, over: string | null): void {
  if (gesture.kind === 'move') {
    if (over && over !== gesture.from && gesture.targets.has(over)) {
      gesture.commit(gesture.from, over);
    }
    return;
  }
  if (over === gesture.from) gesture.commitHighlight(gesture.from);
  else if (over) gesture.commitArrow(gesture.from, over);
}
