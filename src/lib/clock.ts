// The playback clock: the one current time, held outside React state so a
// tick re-renders only the components that draw the frame. Everything timed
// reads it from here; nothing keeps a second copy.

import { useSyncExternalStore } from 'react';

export type Clock = {
  get(): number;
  set(next: number | ((time: number) => number)): void;
  // Returns the unsubscribe.
  subscribe(listener: () => void): () => void;
};

export function createClock(): Clock {
  let time = 0;
  const listeners = new Set<() => void>();
  return {
    get: () => time,
    set(next) {
      const value = typeof next === 'function' ? next(time) : next;
      if (Object.is(value, time)) return;
      time = value;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// Re-renders the caller on every tick: for the surfaces that draw the frame.
export function useClockTime(clock: Clock): number {
  return useSyncExternalStore(clock.subscribe, clock.get, clock.get);
}

// Re-renders the caller only when `select`'s result changes, so it must return
// a primitive: an event index, a formatted label, a flag.
export function useClockValue<T extends string | number | boolean | null>(
  clock: Clock,
  select: (time: number) => T,
): T {
  const read = () => select(clock.get());
  return useSyncExternalStore(clock.subscribe, read, read);
}
