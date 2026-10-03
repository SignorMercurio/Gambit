// Narration audio rides the playback clock. The object URL is session-only —
// it dies with the page — but the bytes behind it are a draft like the script
// and the subtitles, kept in IndexedDB because they do not fit localStorage.
// The clock stays the single source of truth: the <audio> element follows it,
// never the other way round.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearNarration as clearStoredNarration,
  loadNarration,
  saveNarration,
} from '../lib/narrationStore';
import { MAX_SAFE_PLAYBACK_SECONDS } from '../lib/playback';

export type NarrationTrack = { url: string; name: string; duration: number };

export function useNarration({
  time,
  playing,
  speed,
  lockRef,
  waitForUnlock,
}: {
  time: number;
  playing: boolean;
  speed: number;
  // The board-export lock: deliberate acts stand still while it is held, and
  // a probe that settles mid-export waits for it before committing.
  lockRef: { readonly current: unknown };
  waitForUnlock: () => Promise<void>;
}) {
  const [narration, setNarration] = useState<NarrationTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Bumped by every deliberate act on the track — importing or removing — and
  // by unmount. A probe or restore carries the number it started under and
  // commits only if it is still current, so the latest act wins, a remove
  // beats any probe in flight, and the restore never overrules a pick.
  const requestRef = useRef(0);

  // Shared by the file picker and the restore-on-load below: a separate restore
  // path would be a second definition of "playable".
  const adopt = useCallback(
    (blob: Blob, name: string, source: 'import' | 'restore', request: number) => {
      const url = URL.createObjectURL(blob);
      // Probe metadata off-DOM so a broken file never becomes the live track.
      // Only the latest request may commit: a slow earlier probe must not
      // overwrite a newer file or resurrect audio after Remove. A superseded
      // probe still settles, and settling is where it frees its URL.
      const probe = new Audio();
      probe.preload = 'metadata';
      probe.src = url;
      probe.onloadedmetadata = async () => {
        // Each probe settles once; a later error must not reach a live track.
        probe.onloadedmetadata = probe.onerror = null;
        await waitForUnlock();
        if (requestRef.current !== request) {
          URL.revokeObjectURL(url);
          return;
        }
        const audioDuration = Number.isFinite(probe.duration)
          ? Math.min(probe.duration, MAX_SAFE_PLAYBACK_SECONDS)
          : 0;
        setError(null);
        setNarration({ url, name, duration: audioDuration });
        // Stored only once the probe has accepted it: the draft is a track the
        // app knows it can play, not whatever the picker last handed over.
        if (source === 'import') void saveNarration({ blob, name });
      };
      probe.onerror = () => {
        probe.onloadedmetadata = probe.onerror = null;
        URL.revokeObjectURL(url);
        if (requestRef.current !== request) return;
        if (source === 'import') {
          setError(`Could not decode audio file: "${name}"`);
          // No `clearStoredNarration` here on purpose: a rejected import never
          // reached the store, and the previous track is still the live one.
          return;
        }
        // A stored track that no longer decodes — a codec the browser dropped,
        // or bytes that did not survive. Drop it rather than failing this load
        // and every later one, and stay quiet: the author did nothing to be
        // told about, and the panel already shows no track.
        void clearStoredNarration();
      };
    },
    [waitForUnlock],
  );

  const importFile = useCallback(
    (file: File) => {
      if (lockRef.current) return;
      adopt(file, file.name, 'import', ++requestRef.current);
    },
    [adopt, lockRef],
  );

  // Restoring is async, and an author who picks a file before it lands must not
  // have last session's track land on top. The ref, not `narration` state: a
  // pick is a decision the moment it is made, well before the probe commits it.
  // The restore claims no number of its own, so any act since it started wins.
  // Cleanup (unmount) bumps the counter, superseding the restore and every
  // probe still in flight.
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
    if (lockRef.current) return;
    requestRef.current++;
    setError(null);
    setNarration(null);
    void clearStoredNarration();
  }, [lockRef]);

  // State owns the live URL: replacing or removing a track cleans up the
  // previous one, and unmounting cleans up the current one.
  useEffect(() => () => {
    if (narration) URL.revokeObjectURL(narration.url);
  }, [narration]);

  // One idempotent application: rate, a drift snap that also covers seeks, and
  // play/pause — re-applied when the <audio> element remounts on narration
  // change. Past the track's end the element is paused, never played: `play()`
  // on an ended element would restart it from zero. A seek back into the track
  // snaps first, which clears `ended`, so the resume below still happens.
  //
  // 0.25s tick granularity matches the snap tolerance: any seek larger than the
  // tolerance crosses a tick boundary, while steady playback runs this ~4x/s
  // instead of every animation frame. `time` is deliberately left out of the
  // effect's deps and sampled through driftTick.
  const driftTick = narration ? Math.round(time * 4) : 0;
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !narration) return;
    el.playbackRate = speed;
    const target = Math.min(time, narration.duration);
    if (Math.abs(el.currentTime - target) > 0.25) el.currentTime = target;
    if (playing && time < narration.duration) {
      // `ended` too: the element can finish a few ticks before the clock
      // reaches `narration.duration` (audio clock drift, or a VBR length
      // estimate), and this runs every tick, not only on a state change.
      if (el.paused && !el.ended) {
        el.play().catch(() => {
          // Autoplay rejection: playback starts from a user gesture in every
          // Gambit flow, but if a browser still refuses, stay silent.
        });
      }
    } else {
      el.pause();
    }
  }, [driftTick, narration, playing, speed]);

  return { narration, error, audioRef, importFile, clear };
}
