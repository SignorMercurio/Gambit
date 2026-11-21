// Board PNG export. The frame is frozen by copying it, not by stopping the
// app: `snapshotBoard` clones the rendered board synchronously, and everything
// asynchronous works on that copy while playback and editing carry on.

export const BOARD_EXPORT_SIZE = 1440;

// The editor-only in-flight gesture preview: the one layer a snapshot drops.
// Shared with `Board.tsx` so the overlay and the removal cannot drift apart.
export const BOARD_GESTURE_CLASS = 'board-gesture-overlay';

// One ceiling around the whole export, applied by the caller. A promise that
// never settles never runs a `finally`, so this is what makes the retry state
// reachable.
export const BOARD_EXPORT_TIMEOUT_MS = 15000;
export const BOARD_EXPORT_TIMEOUT_MESSAGE = `The browser did not finish rendering the PNG within ${
  BOARD_EXPORT_TIMEOUT_MS / 1000
}s.`;

// Rejects with `message` if `work` has not settled inside `ms`, or with the
// signal's reason if it aborts first. The abandoned work keeps running; the
// caller gates its side effects on the same signal.
export function withTimeout<T>(work: Promise<T>, ms: number, message: string, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const ceiling = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
    abort = () => reject(signal?.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
  return Promise.race([work, ceiling]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
    if (abort) signal?.removeEventListener('abort', abort);
  });
}

export function boardPngFilename(time: number): string {
  const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
  const totalCentiseconds = Math.floor(safeTime * 100);
  const minutes = Math.floor(totalCentiseconds / 6000);
  const seconds = Math.floor(totalCentiseconds / 100) % 60;
  const centiseconds = totalCentiseconds % 100;
  return `gambit-board-${String(minutes).padStart(2, '0')}-${String(seconds).padStart(2, '0')}-${String(centiseconds).padStart(2, '0')}.png`;
}

// A detached-from-React copy of the board as it is drawn right now, minus the
// gesture preview. It is mounted off-screen at the board's own size because
// the rasterizer reads computed styles, which only a connected node has; the
// board's rules are all top-level selectors and `:root` tokens, so they apply
// under `<body>` as they do in place. `dispose` removes it.
export function snapshotBoard(board: HTMLElement): { node: HTMLElement; dispose: () => void } {
  const { width, height } = board.getBoundingClientRect();
  const node = board.cloneNode(true) as HTMLElement;
  for (const preview of node.querySelectorAll(`.${BOARD_GESTURE_CLASS}`)) preview.remove();
  const holder = document.createElement('div');
  holder.inert = true;
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = `position:fixed;left:-99999px;top:0;width:${width}px;height:${height}px;pointer-events:none`;
  holder.append(node);
  document.body.append(holder);
  return { node, dispose: () => holder.remove() };
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
  // Revoke on the next task so WebKit has time to begin reading the URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Loaded on demand so normal playback never pays for the DOM-cloning exporter.
export const loadExporter = () => import('html-to-image');

// Rasterize `board` (a snapshot node) to a 1440×1440 PNG and deliver it. An
// aborted export delivers nothing, however late its rasterize settles.
// `deliver` is a seam: delivery needs a DOM, and the abort contract is tested
// through it.
export async function downloadBoardPng(
  board: HTMLElement,
  time: number,
  {
    signal,
    exporter,
    deliver = downloadBlob,
  }: {
    signal?: AbortSignal;
    exporter: Awaited<ReturnType<typeof loadExporter>>;
    deliver?: (blob: Blob, filename: string) => void;
  },
): Promise<void> {
  if (signal?.aborted) return;
  const blob = await exporter.toBlob(board, {
    canvasWidth: BOARD_EXPORT_SIZE,
    canvasHeight: BOARD_EXPORT_SIZE,
    pixelRatio: 1,
  });
  if (signal?.aborted) return;
  if (!blob) throw new Error('The browser returned an empty PNG.');
  deliver(blob, boardPngFilename(time));
}
