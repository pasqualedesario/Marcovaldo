import type { Contours } from '../core/types';
import { contoursToPath2D } from '../core/path/ops';

/** Offscreen/hidden canvas used only for PNG/PDF rasterization. */
export function renderCanvas(
  canvas: HTMLCanvasElement,
  opts: {
    width: number;
    height: number;
    bg: string;
    fill: string;
    lamina: Contours;
  }
): CanvasRenderingContext2D | null {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.floor(opts.width * dpr);
  const h = Math.floor(opts.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = opts.bg;
  ctx.fillRect(0, 0, opts.width, opts.height);
  if (opts.lamina.length) {
    ctx.fillStyle = opts.fill;
    ctx.fill(contoursToPath2D(opts.lamina), 'nonzero');
  }
  return ctx;
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG encode failed'))),
      'image/png'
    );
  });
}
