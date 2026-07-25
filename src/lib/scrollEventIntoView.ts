// Scroll the element tagged `data-evi={evi}` into view within its own scroll
// container (never the page), nudging scrollTop the minimum needed. Shared by
// the editor MoveList follow and the present-mode PresentationMoves follow so
// the scroll contract keyed on the data-evi attribute can't drift between the
// two lists. Per-site gating (playback state, hover-pause) stays at the caller.
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
