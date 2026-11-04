export const clamp = (n: number, a: number, b: number): number =>
  Math.min(b, Math.max(a, n));

/** CSS pt → CSS px (96 dpi). */
export const PT_TO_PX = 96 / 72;

/** Tracking slider range (midpoint = 0em letter-spacing). */
export const TRACKING_MAX = 250;
export const TRACKING_MID = 50;

/** Map tracking slider → em (−0.08 … +0.64); TRACKING_MID = 0. */
export function trackingEm(value: number): number {
  const t = clamp(value, 0, TRACKING_MAX);
  if (t <= TRACKING_MID) return -0.08 * (1 - t / TRACKING_MID);
  return 0.16 * ((t - TRACKING_MID) / TRACKING_MID);
}

/** Index of the stop nearest to `x` in a monotonic caret-stop list. */
export function nearestStopIndex(stops: readonly number[], x: number): number {
  if (!stops.length) return 0;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < stops.length; i++) {
    const d = Math.abs((stops[i] ?? 0) - x);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

export function selectionBounds(
  stops: readonly number[],
  start: number,
  end: number
): { x: number; w: number; lo: number; hi: number } | null {
  if (stops.length < 2) return null;
  const lo = clamp(Math.min(start, end), 0, stops.length - 1);
  const hi = clamp(Math.max(start, end), 0, stops.length - 1);
  if (lo === hi) return null;
  const x1 = stops[lo] ?? 0;
  const x2 = stops[hi] ?? x1;
  return { x: Math.min(x1, x2), w: Math.abs(x2 - x1), lo, hi };
}
