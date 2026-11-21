// Offline video render: `?render` opens present mode without its transport and
// hands the playback clock to an external frame grabber (scripts/render-video.mjs)
// through `window.gambitRender`. The frame stays script + FEN + time; the grabber
// only chooses the time. The page stays silent: `seek` says whether its frame
// lands a move, by the rule the live click uses, and the grabber mixes the click.

import type { Clock } from './clock';
import { moveSoundKey, shouldPlayMoveSound } from './moveSound';
import type { TimelineEvent } from './timeline';
import { worldFrameAtTime, type WorldBuild } from './world';

export const RENDER_MODE =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('render');

// What a frame derives from besides the time, read fresh on every call.
type RenderSource = { events: TimelineEvent[]; worldBuild: WorldBuild; duration: number };

type RenderHandle = {
  duration(): number;
  // Sets the clock, waits for the frame to paint, and returns whether that
  // frame lands a move.
  seek(time: number): Promise<boolean>;
};

declare global {
  interface Window {
    gambitRender?: RenderHandle;
  }
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export function installRenderHandle(clock: Clock, source: () => RenderSource): () => void {
  const moveKeyAt = (time: number) => {
    const { events, worldBuild } = source();
    return moveSoundKey(worldFrameAtTime(worldBuild, events, time).snapshot.lastMove);
  };
  // The same latch as `useMoveSound`: the frame the render opens on is silent.
  let previous = moveKeyAt(clock.get());
  window.gambitRender = {
    duration: () => source().duration,
    async seek(time) {
      clock.set(time);
      const key = moveKeyAt(time);
      const landed = shouldPlayMoveSound(previous, key, true);
      previous = key;
      // One frame for React's commit and effects, one for the paint; measured
      // in docs/playback.md.
      await nextFrame();
      await nextFrame();
      return landed;
    },
  };
  return () => {
    delete window.gambitRender;
  };
}
