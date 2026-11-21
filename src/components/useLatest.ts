import { useRef } from 'react';

// Render-mirrored ref: the latest rendered value, for callbacks that read
// state at call time without taking it as a dep (which would re-identify them
// and re-subscribe listeners on every change). Shared so a future hardening
// (e.g. assigning in `useInsertionEffect`) lands everywhere at once.
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
