export const BOARD_EXPORT_SIZE = 1440;

// The editor-only in-flight gesture preview: the one layer the export drops.
// Declared here rather than spelled in `Board.tsx` and again in the filter
// below, because the two are a matched pair with nothing else tying them —
// renaming the class on the overlay alone typechecks, passes, and quietly
// starts baking the drag preview into every exported PNG.
export const BOARD_GESTURE_CLASS = 'board-gesture-overlay';

// Every step of an export can stall without settling, and a promise that never
// settles never runs the caller's `finally` either. That is not hypothetical:
// an export observed here sat past 18s, leaving playback paused and the button
// disabled for the rest of the session with no message. A ceiling converts an
// unbounded hang into the 'error' state the UI already offers a retry from.
//
// The ceiling is applied once, by the caller, around the whole operation.
// Guarding only the rasterize would leave the earlier awaits unbounded while
// making the code look protected — and the hang observed here was in fact in
// `App`'s frame wait, above this function entirely.
export const BOARD_EXPORT_TIMEOUT_MS = 15000;

// Templated off the ceiling rather than restating it: the test uses the
// constant on both sides, so it could never have caught the two drifting, and
// a raised ceiling would leave the user-facing error confidently wrong.
export const BOARD_EXPORT_TIMEOUT_MESSAGE = `The browser did not finish rendering the PNG within ${
  BOARD_EXPORT_TIMEOUT_MS / 1000
}s.`;

// Rejects with `message` if `work` has not settled inside `ms`. The abandoned
// work may still be running — nothing here can cancel a rasterize already in
// flight — but the UI stops waiting on it, which is the part that matters.
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

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
  // The click has synchronously captured the URL. Revoke on the next task so
  // WebKit still has time to begin reading it for the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Loaded only on demand: normal playback should not pay for the DOM-cloning
// exporter, and the pure filename helper remains safe in the SSR harness.
// Exposed separately so the caller can start the fetch while it waits for the
// board to settle — the module load depends on nothing the wait produces, and
// serializing them put a cold chunk fetch inside the user-visible pause.
export const loadExporter = () => import('html-to-image');

export async function downloadBoardPng(
  board: HTMLElement,
  time: number,
  {
    signal,
    exporter,
    // A seam, defaulted to the real thing. Delivery needs a DOM, so the
    // abandoned-export contract below is otherwise only assertable by grepping
    // this file's source — which passes an `if (aborted) console.warn()` and
    // fails a rename of `blob`. `exporter` has no default on purpose: every
    // caller starts the load before its own settle wait, and a default here
    // would advertise a serialized path nothing takes.
    deliver = downloadBlob,
  }: {
    signal?: AbortSignal;
    exporter: ReturnType<typeof loadExporter>;
    deliver?: (blob: Blob, filename: string) => void;
  },
): Promise<void> {
  if (signal?.aborted) return;
  const { toBlob } = await exporter;
  if (signal?.aborted) return;
  const blob = await toBlob(board, {
    cacheBust: true,
    canvasWidth: BOARD_EXPORT_SIZE,
    canvasHeight: BOARD_EXPORT_SIZE,
    filter: (node) => !node.classList?.contains(BOARD_GESTURE_CLASS),
    pixelRatio: 1,
  });
  // Nothing can cancel a rasterize already in flight, so a timed-out export
  // keeps working in the background and may still settle. Dropping it here is
  // the difference between "the export failed" and a file appearing in the
  // user's downloads a minute after they were told it failed — and the time it
  // was stamped with is no longer the time on the board.
  if (signal?.aborted) return;
  if (!blob) throw new Error('The browser returned an empty PNG.');
  deliver(blob, boardPngFilename(time));
}
