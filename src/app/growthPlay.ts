/**
 * Axis Play: ping-pong GROW 0↔100 with ease-in-out.
 * Values are quantized so morphology cache can hit during scrubbing.
 */

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export type GrowthPlayHandle = {
  playing: () => boolean;
  start: () => void;
  stop: () => void;
  toggle: () => void;
};

export function createGrowthPlay(opts: {
  getGrowth: () => number;
  setGrowth: (n: number) => void;
  /** Full cycle duration (0→100→0), ms. */
  periodMs?: number;
  /** Snap growth to this step (default 2) for cheaper morph. */
  step?: number;
  onPlayingChange?: (playing: boolean) => void;
}): GrowthPlayHandle {
  const period = opts.periodMs ?? 3200;
  const step = Math.max(1, opts.step ?? 2);
  let raf = 0;
  let playing = false;
  let t0 = 0;
  let phase0 = 0;
  let lastEmitted = -1;

  const snap = (n: number) => {
    const q = Math.round(n / step) * step;
    return Math.max(0, Math.min(100, q));
  };

  const frame = (now: number) => {
    if (!playing) return;
    const phase = (phase0 + (now - t0) / period) % 1;
    const tri = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
    const g = snap(easeInOutQuad(tri) * 100);
    if (g !== lastEmitted) {
      lastEmitted = g;
      opts.setGrowth(g);
    }
    raf = requestAnimationFrame(frame);
  };

  const stop = () => {
    if (!playing) return;
    playing = false;
    cancelAnimationFrame(raf);
    raf = 0;
    lastEmitted = -1;
    opts.onPlayingChange?.(false);
  };

  const start = () => {
    if (playing) return;
    playing = true;
    const g = snap(opts.getGrowth()) / 100;
    phase0 = g * 0.5;
    t0 = performance.now();
    lastEmitted = -1;
    opts.onPlayingChange?.(true);
    raf = requestAnimationFrame(frame);
  };

  return {
    playing: () => playing,
    start,
    stop,
    toggle: () => (playing ? stop() : start())
  };
}
