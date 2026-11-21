// Narration audio follows the playback clock, never the other way round. The
// object URL is session-only; the bytes are a draft kept in IndexedDB because
// they do not fit localStorage.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearNarration as clearStoredNarration,
  loadNarration,
  saveNarration,
} from '../lib/narrationStore';
import type { Clock } from '../lib/clock';
import { MAX_SAFE_PLAYBACK_SECONDS } from '../lib/playback';

export type NarrationTrack = { url: string; name: string; duration: number };

export function useNarration({
  clock,
  playing,
  speed,
}: {
  clock: Clock;
  playing: boolean;
  speed: number;
}) {
  const [narration, setNarration] = useState<NarrationTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Bumped by import, remove and unmount. A probe or restore commits only if
  // the number it started under is still current, so the latest act wins.
  const requestRef = useRef(0);

  // The one definition of "playable", shared by import and restore.
  const adopt = useCallback(
    (blob: Blob, name: string, source: 'import' | 'restore', request: number) => {
      const url = URL.createObjectURL(blob);
      // Probe off-DOM so a broken file never becomes the live track. A
      // superseded probe still settles, and settling frees its URL.
      const probe = new Audio();
      probe.preload = 'metadata';
      probe.src = url;
      probe.onloadedmetadata = () => {
        // Each probe settles once; a later error must not reach a live track.
        probe.onloadedmetadata = probe.onerror = null;
        if (requestRef.current !== request) {
          URL.revokeObjectURL(url);
          return;
        }
        const audioDuration = Number.isFinite(probe.duration)
          ? Math.min(probe.duration, MAX_SAFE_PLAYBACK_SECONDS)
          : 0;
        setError(null);
        setNarration({ url, name, duration: audioDuration });
        // Stored only once the probe accepts it.
        if (source === 'import') void saveNarration({ blob, name });
      };
      probe.onerror = () => {
        probe.onloadedmetadata = probe.onerror = null;
        URL.revokeObjectURL(url);
        if (requestRef.current !== request) return;
        if (source === 'import') {
          setError(`Could not decode audio file: "${name}"`);
          // No store clear: the previous track is still the live one.
          return;
        }
        // A stored track that no longer decodes is dropped quietly, so it
        // cannot fail every later load.
        void clearStoredNarration();
      };
    },
    [],
  );

  const importFile = useCallback(
    (file: File) => adopt(file, file.name, 'import', ++requestRef.current),
    [adopt],
  );

  // The restore claims no number of its own, so any pick or remove since it
  // started wins; the check reads the ref because a pick counts before its
  // probe commits.
  useEffect(() => {
    const request = requestRef.current;
    void loadNarration().then((stored) => {
      if (!stored || requestRef.current !== request) return;
      adopt(stored.blob, stored.name, 'restore', request);
    });
    return () => {
      requestRef.current++;
    };
  }, [adopt]);

  const clear = useCallback(() => {
    requestRef.current++;
    setError(null);
    setNarration(null);
    void clearStoredNarration();
  }, []);

  // State owns the live URL and revokes it on replace, remove, or unmount.
  useEffect(() => () => {
    if (narration) URL.revokeObjectURL(narration.url);
  }, [narration]);

  // One idempotent application of rate, drift snap (which also covers seeks)
  // and play/pause. Past the track's end the element is paused, never played:
  // `play()` on an ended element restarts it from zero.
  //
  // It subscribes to the clock without re-rendering, and samples it at 0.25s
  // granularity to match the snap tolerance: any larger seek crosses a tick,
  // and playback runs this ~4x/s instead of every frame.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !narration) return;
    let driftTick: number | null = null;
    const follow = () => {
      const time = clock.get();
      const tick = Math.round(time * 4);
      if (tick === driftTick) return;
      driftTick = tick;
      el.playbackRate = speed;
      const target = Math.min(time, narration.duration);
      if (Math.abs(el.currentTime - target) > 0.25) el.currentTime = target;
      if (playing && time < narration.duration) {
        // `ended` too: the element can finish before the clock reaches
        // `narration.duration` (drift, or a VBR length estimate).
        if (el.paused && !el.ended) {
          el.play().catch(() => {
            // Autoplay rejection stays silent; playback always starts from a gesture.
          });
        }
      } else {
        el.pause();
      }
    };
    follow();
    return clock.subscribe(follow);
  }, [clock, narration, playing, speed]);

  return { narration, error, audioRef, importFile, clear };
}
