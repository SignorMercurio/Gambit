// Offline video render: `?render` opens present mode with its chrome hidden and
// hands the playback clock to an external frame grabber (scripts/render-video.mjs)
// through `window.gambitRender`. The frame stays script + FEN + time; the grabber
// only chooses the time. Move clicks go to a counter instead of the speakers so
// the grabber can mix them at the frame they landed on.

import type { Clock } from './clock';
import { setMoveSoundSink } from './moveSound';

export const RENDER_MODE =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('render');

export type RenderHandle = {
  duration(): number;
  // Sets the clock, waits for the frame to paint, and returns the move clicks
  // that frame produced.
  seek(time: number): Promise<number>;
};

declare global {
  interface Window {
    gambitRender?: RenderHandle;
  }
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export function installRenderHandle(clock: Clock, duration: () => number): () => void {
  let clicks = 0;
  setMoveSoundSink(() => {
    clicks++;
  });
  window.gambitRender = {
    duration,
    async seek(time) {
      clock.set(time);
      // One frame for React's commit and effects, one for the paint.
      await nextFrame();
      await nextFrame();
      const landed = clicks;
      clicks = 0;
      return landed;
    },
  };
  return () => {
    setMoveSoundSink(null);
    delete window.gambitRender;
  };
}
