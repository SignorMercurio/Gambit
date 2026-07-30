// Playback-clock animation primitives shared by renderers and pure visual
// domains. Boundary saturation lives here so every timed layer agrees.

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function easeOutQuart(n: number): number {
  const p = clamp01(n);
  return 1 - Math.pow(1 - p, 4);
}

export function timedProgress(age: number, duration: number): number {
  if (age <= 0) return 0;
  if (age >= duration) return 1;
  const p = age / duration;
  return 1 - Math.pow(1 - p, 4);
}
