/**
 * GROW axis play: sine loop 0↔100 on the current shape/margin only.
 */

export type GrowthPlayHandle = {
  playing: () => boolean;
  start: () => void;
  stop: () => void;
  toggle: () => void;
};

export function createGrowthPlay(opts: {
  getGrowth: () => number;
  setGrowth: (n: number) => void;
  /** Full cycle duration (0→100→0), ms. Default 10s. */
  periodMs?: number;
  /** Quantize growth (default 2) to cut morph work while playing. */
  step?: number;
  onPlayingChange?: (playing: boolean) => void;
}): GrowthPlayHandle {
  const period = opts.periodMs ?? 10000;
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

  /** Resume sine so current growth maps onto the ascending half. */
  const phaseFromGrowth = (g: number) => {
    const x = Math.max(-1, Math.min(1, g / 50 - 1));
    return Math.asin(x);
  };

  const frame = (now: number) => {
    if (!playing) return;
    const theta = phase0 + ((now - t0) / period) * Math.PI * 2;
    const g = snap((Math.sin(theta) * 0.5 + 0.5) * 100);
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
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      opts.setGrowth(snap(50));
      return;
    }
    playing = true;
    phase0 = phaseFromGrowth(snap(opts.getGrowth()));
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
