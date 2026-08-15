import { useRef } from 'react';

// Render-mirrored ref: always the latest committed value, for callbacks that
// must read state at call time without taking it as a dep (which would
// re-identify them — and re-subscribe listeners — on every change).
//
// Shared rather than respelled per component. The idiom is three lines, so
// hand-writing it looks cheaper than an import — but the two surfaces that
// need it are the two that re-render on every animation frame of playback,
// which is exactly where a future hardening (moving the assignment into
// `useInsertionEffect` for concurrent-render safety) would have to land in
// both copies or in neither.
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
