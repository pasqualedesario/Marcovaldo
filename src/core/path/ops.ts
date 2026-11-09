import type { Bounds, Contour, Contours, PathData } from '../types';
import { clamp } from '../../lib/math';

const clamp01 = (t: number) => clamp(t, 0, 1);

export const ss = (a: number, b: number, t: number) => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};

/** Mulberry-ish string hash → deterministic PRNG in [0,1). */
export function rng(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function signedArea(pts: Contour): number {
  let a = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % n]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a * 0.5;
}

/** Align contour winding so flora cannot punch holes under nonzero fill. */
export function matchWinding(contour: Contour, positive: boolean): Contour {
  if (contour.length < 3) return contour;
  const a = signedArea(contour);
  if (a === 0) return contour;
  if ((a > 0) === positive) return contour;
  return contour.slice().reverse();
}

export function boundsOf(contours: Contours): Bounds {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (let ci = 0; ci < contours.length; ci++) {
    const c = contours[ci]!;
    for (let i = 0; i < c.length; i++) {
      const p = c[i]!;
      if (p.x < x1) x1 = p.x;
      if (p.y < y1) y1 = p.y;
      if (p.x > x2) x2 = p.x;
      if (p.y > y2) y2 = p.y;
    }
  }
  if (!Number.isFinite(x1)) return { x1: 0, y1: 0, x2: 1, y2: 1 };
  return { x1, y1, x2, y2 };
}

export function countPoints(contours: Contours): number {
  let n = 0;
  for (let i = 0; i < contours.length; i++) n += contours[i]!.length;
  return n;
}

/** Affine: x' = x * s + tx, y' = y * s + ty */
export function transformContours(contours: Contours, s: number, tx: number, ty: number): Contours {
  const out: Contours = new Array(contours.length);
  for (let ci = 0; ci < contours.length; ci++) {
    const c = contours[ci]!;
    const next: Contour = new Array(c.length);
    for (let i = 0; i < c.length; i++) {
      const p = c[i]!;
      next[i] = { x: p.x * s + tx, y: p.y * s + ty };
    }
    out[ci] = next;
  }
  return out;
}

/** Flatten curves to polylines. `minDist` drops near-duplicate points (px). */
export function flattenPath(path: PathData, steps = 8, minDist = 0.15): Contours {
  const contours: Contours = [];
  let cur: Contour | null = null;
  let cx = 0, cy = 0, sx = 0, sy = 0;
  const minD2 = minDist * minDist;

  const push = (x: number, y: number) => {
    if (!cur) return;
    const last = cur[cur.length - 1];
    if (last && (last.x - x) * (last.x - x) + (last.y - y) * (last.y - y) < minD2) return;
    cur.push({ x, y });
  };

  const cmds = path.commands;
  for (let i = 0; i < cmds.length; i++) {
    const cmd = cmds[i]!;
    switch (cmd.type) {
      case 'M': {
        if (cur && cur.length > 1) contours.push(cur);
        cur = [];
        cx = sx = cmd.x;
        cy = sy = cmd.y;
        push(cx, cy);
        break;
      }
      case 'L':
        cx = cmd.x;
        cy = cmd.y;
        push(cx, cy);
        break;
      case 'Q': {
        const x0 = cx, y0 = cy;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps, u = 1 - t;
          push(
            u * u * x0 + 2 * u * t * cmd.x1 + t * t * cmd.x,
            u * u * y0 + 2 * u * t * cmd.y1 + t * t * cmd.y
          );
        }
        cx = cmd.x;
        cy = cmd.y;
        break;
      }
      case 'C': {
        const x0 = cx, y0 = cy;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps, u = 1 - t;
          push(
            u * u * u * x0 + 3 * u * u * t * cmd.x1 + 3 * u * t * t * cmd.x2 + t * t * t * cmd.x,
            u * u * u * y0 + 3 * u * u * t * cmd.y1 + 3 * u * t * t * cmd.y2 + t * t * t * cmd.y
          );
        }
        cx = cmd.x;
        cy = cmd.y;
        break;
      }
      case 'Z':
        push(sx, sy);
        if (cur && cur.length > 1) contours.push(cur);
        cur = null;
        cx = sx;
        cy = sy;
        break;
    }
  }
  if (cur && cur.length > 1) contours.push(cur);
  return contours;
}

export function chaikin(pts: Contour, iterations: number): Contour {
  let cur = pts;
  for (let n = 0; n < iterations; n++) {
    if (cur.length < 3) break;
    const len = cur.length;
    const next: Contour = new Array(len * 2);
    for (let i = 0; i < len; i++) {
      const a = cur[i]!, b = cur[(i + 1) % len]!;
      next[i * 2] = { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 };
      next[i * 2 + 1] = { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 };
    }
    cur = next;
  }
  return cur;
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();

/** Shared contour walk for SVG `d` strings and Path2D. */
function walkContours(
  contours: Contours,
  move: (x: number, y: number) => void,
  line: (x: number, y: number) => void,
  close: () => void
): void {
  for (let ci = 0; ci < contours.length; ci++) {
    const c = contours[ci]!;
    if (c.length < 3) continue;
    const p0 = c[0]!;
    move(p0.x, p0.y);
    for (let i = 1; i < c.length; i++) {
      const p = c[i]!;
      line(p.x, p.y);
    }
    close();
  }
}

export function contoursToSvgD(contours: Contours): string {
  const parts: string[] = [];
  walkContours(
    contours,
    (x, y) => {
      parts.push(`M${fmt(x)} ${fmt(y)}`);
    },
    (x, y) => {
      parts.push(`L${fmt(x)} ${fmt(y)}`);
    },
    () => {
      parts.push('Z');
    }
  );
  return parts.join('');
}

export function contoursToPath2D(contours: Contours): Path2D {
  const path = new Path2D();
  walkContours(
    contours,
    (x, y) => path.moveTo(x, y),
    (x, y) => path.lineTo(x, y),
    () => path.closePath()
  );
  return path;
}
