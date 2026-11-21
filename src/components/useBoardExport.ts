// Board PNG export as one operation at a time. The click copies the frame
// (`snapshotBoard`) before anything is awaited, so the PNG is the board the
// user asked for and nothing else has to stand still while it renders.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BOARD_EXPORT_TIMEOUT_MESSAGE,
  BOARD_EXPORT_TIMEOUT_MS,
  downloadBoardPng,
  loadExporter,
  snapshotBoard,
  withTimeout,
} from '../lib/boardExport';
import type { Clock } from '../lib/clock';

// The failure message exists only in the error state, so the two cannot
// disagree about whether the last export failed.
export type BoardExportState =
  | { status: 'idle' | 'exporting' | 'success' }
  | { status: 'error'; message: string };

export function useBoardExport({
  boardRef,
  clock,
}: {
  boardRef: { readonly current: HTMLDivElement | null };
  clock: Pick<Clock, 'get'>;
}) {
  const [state, setState] = useState<BoardExportState>({ status: 'idle' });
  // The export in flight. Aborting it suppresses a late download; unmount
  // aborts it and clears the ref so its settlement updates no state.
  const operationRef = useRef<AbortController | null>(null);
  const resetRef = useRef<number | null>(null);

  const exportBoard = useCallback(async () => {
    if (operationRef.current) return;
    if (resetRef.current != null) {
      window.clearTimeout(resetRef.current);
      resetRef.current = null;
    }
    const board = boardRef.current;
    if (!board) {
      setState({ status: 'error', message: 'Could not export board PNG: The board is not available.' });
      return;
    }
    const time = clock.get();
    const snapshot = snapshotBoard(board);
    const controller = new AbortController();
    operationRef.current = controller;
    setState({ status: 'exporting' });
    try {
      await withTimeout(
        loadExporter().then((exporter) =>
          downloadBoardPng(snapshot.node, time, { signal: controller.signal, exporter }),
        ),
        BOARD_EXPORT_TIMEOUT_MS,
        BOARD_EXPORT_TIMEOUT_MESSAGE,
        controller.signal,
      );
      if (operationRef.current !== controller) return;
      setState({ status: 'success' });
      resetRef.current = window.setTimeout(() => {
        setState({ status: 'idle' });
        resetRef.current = null;
      }, 1800);
    } catch (error) {
      // A timed-out rasterize can still settle; tell it not to deliver.
      controller.abort();
      if (operationRef.current !== controller) return;
      const detail = error instanceof Error ? error.message : 'Unknown browser error.';
      setState({ status: 'error', message: `Could not export board PNG: ${detail}` });
    } finally {
      snapshot.dispose();
      if (operationRef.current === controller) operationRef.current = null;
    }
  }, [boardRef, clock]);

  useEffect(() => () => {
    operationRef.current?.abort();
    operationRef.current = null;
    if (resetRef.current != null) window.clearTimeout(resetRef.current);
  }, []);

  return { state, exportBoard };
}
