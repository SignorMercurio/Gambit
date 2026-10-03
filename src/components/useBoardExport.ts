// Board PNG export as one operation with one lock. While an export runs, the
// lock (`lockRef.current`) is non-null: every surface that could change the
// committed board — the clock, edits, imports, gestures — checks it and stands
// still, so the frame being rasterized is the frame the user asked for.
// Imports that finish mid-capture await `waitIdle` and then re-check their own
// identity, rather than committing into a frozen board.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BOARD_EXPORT_TIMEOUT_MESSAGE,
  BOARD_EXPORT_TIMEOUT_MS,
  downloadBoardPng,
  loadExporter,
  withTimeout,
} from '../lib/boardExport';

// The failure message exists only in the error state, so the two cannot
// disagree about whether the last export failed.
export type BoardExportState =
  | { status: 'idle' | 'exporting' | 'success' }
  | { status: 'error'; message: string };
type BoardExportOperation = {
  controller: AbortController;
  done: Promise<void>;
  release: () => void;
};

// A hidden tab may never paint. Whichever boundary wins must cancel both
// the queued frame and the fallback timer, including when App unmounts.
function waitForBoardPaint(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    let frame = 0;
    const finish = () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = window.setTimeout(finish, 200);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
    else frame = requestAnimationFrame(() => { frame = requestAnimationFrame(finish); });
  });
}

export function useBoardExport({
  boardRef,
  timeRef,
  playingRef,
  setPlaying,
}: {
  boardRef: { readonly current: HTMLDivElement | null };
  // Read after the awaits, when a closed-over value would be stale.
  timeRef: { readonly current: number };
  playingRef: { readonly current: boolean };
  setPlaying: (playing: boolean) => void;
}) {
  const [state, setState] = useState<BoardExportState>({ status: 'idle' });
  const lockRef = useRef<BoardExportOperation | null>(null);
  const resetRef = useRef<number | null>(null);

  // Wait for the single operation in flight, if any; callers re-check
  // whatever identity they carry once it settles.
  const waitIdle = useCallback(async () => {
    while (lockRef.current) await lockRef.current.done;
  }, []);

  const exportBoard = useCallback(async () => {
    if (lockRef.current) return;
    const resumePlayback = playingRef.current;
    let release!: () => void;
    const done = new Promise<void>((resolve) => { release = resolve; });
    const operation: BoardExportOperation = { controller: new AbortController(), done, release };
    lockRef.current = operation;
    if (resetRef.current != null) {
      window.clearTimeout(resetRef.current);
      resetRef.current = null;
    }
    setState({ status: 'exporting' });
    setPlaying(false);
    try {
      // One ceiling over the whole operation, not just the rasterize: the frame
      // wait, the dynamic import, and the rasterize can each stall, and an
      // await that never settles never runs the `finally`.
      await withTimeout(
        (async () => {
          // Load and settle concurrently, with both rejections observed from
          // the start. The lock keeps the committed board fixed while cloning.
          const [exporter] = await Promise.all([
            loadExporter(),
            waitForBoardPaint(operation.controller.signal),
          ]);
          const board = boardRef.current;
          if (!board) throw new Error('The board is not available.');
          await downloadBoardPng(board, timeRef.current, {
            signal: operation.controller.signal,
            exporter,
          });
        })(),
        BOARD_EXPORT_TIMEOUT_MS,
        BOARD_EXPORT_TIMEOUT_MESSAGE,
        operation.controller.signal,
      );
      if (lockRef.current !== operation) return;
      setState({ status: 'success' });
      resetRef.current = window.setTimeout(() => {
        setState({ status: 'idle' });
        resetRef.current = null;
      }, 1800);
    } catch (error) {
      // The rasterize we gave up on can still be running. Tell it not to
      // deliver a file the user has already been told they aren't getting.
      operation.controller.abort();
      if (lockRef.current !== operation) return;
      const detail = error instanceof Error ? error.message : 'Unknown browser error.';
      setState({ status: 'error', message: `Could not export board PNG: ${detail}` });
    } finally {
      if (lockRef.current === operation) {
        lockRef.current = null;
        setPlaying(resumePlayback);
      }
      operation.release();
    }
  }, [boardRef, timeRef, playingRef, setPlaying]);

  useEffect(() => () => {
    const operation = lockRef.current;
    lockRef.current = null;
    operation?.controller.abort();
    operation?.release();
    if (resetRef.current != null) window.clearTimeout(resetRef.current);
  }, []);

  return { state, lockRef, waitIdle, exportBoard };
}
