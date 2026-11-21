// Scrolls the `data-evi={evi}` element into view within `container` (never
// the page), moving scrollTop the minimum needed. Shared by both move lists;
// gating (playback state, hover-pause) stays with the caller.
export function scrollEviIntoView(container: HTMLElement, evi: number): void {
  const el = container.querySelector<HTMLElement>(`[data-evi="${evi}"]`);
  if (!el) return;
  const cRect = container.getBoundingClientRect();
  const eRect = el.getBoundingClientRect();
  if (eRect.top < cRect.top) {
    container.scrollTop += eRect.top - cRect.top;
  } else if (eRect.bottom > cRect.bottom) {
    container.scrollTop += eRect.bottom - cRect.bottom;
  }
}
