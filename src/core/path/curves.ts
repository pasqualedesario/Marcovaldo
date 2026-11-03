import type { Contour, Contours, Pt } from '../types';
import { signedArea } from './ops';

export type CubicSeg = {
  p0: Pt;
  c1: Pt;
  c2: Pt;
  p1: Pt;
};

const dist2 = (a: Pt, b: Pt) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: Pt, s: number): Pt => ({ x: a.x * s, y: a.y * s });
const len = (a: Pt) => Math.hypot(a.x, a.y);
const norm = (a: Pt): Pt => {
  const L = len(a);
  return L < 1e-9 ? { x: 0, y: 0 } : { x: a.x / L, y: a.y / L };
};

/** Perpendicular distance from point to segment a→b. */
function perpDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Ramer–Douglas–Peucker polyline simplify (open chain). */
function simplifyOpen(pts: Contour, tolerance: number): Contour {
  if (pts.length < 3) return pts.slice();
  const tol2 = tolerance * tolerance;

  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    const a = pts[i0]!;
    const b = pts[i1]!;
    let maxD = 0;
    let maxI = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const d = perpDist(pts[i]!, a, b);
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxI >= 0 && maxD * maxD > tol2) {
      keep[maxI] = 1;
      stack.push([i0, maxI], [maxI, i1]);
    }
  }

  const out: Contour = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]!);
  return out;
}

/** Closed-contour simplify: drop near-duplicate close, RDP, re-close cleanly. */
function simplifyClosed(pts: Contour, tolerance: number): Contour {
  if (pts.length < 4) return pts.slice();
  let src = pts;
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  if (dist2(first, last) < tolerance * tolerance) src = pts.slice(0, -1);
  if (src.length < 3) return pts.slice();

  // Rotate so first point is a high-curvature vertex (better RDP anchors).
  let maxTurn = -1;
  let pivot = 0;
  const n = src.length;
  for (let i = 0; i < n; i++) {
    const a = src[(i + n - 1) % n]!;
    const b = src[i]!;
    const c = src[(i + 1) % n]!;
    const ab = norm(sub(b, a));
    const bc = norm(sub(c, b));
    const turn = 1 - (ab.x * bc.x + ab.y * bc.y);
    if (turn > maxTurn) {
      maxTurn = turn;
      pivot = i;
    }
  }
  const rotated: Contour = [];
  for (let i = 0; i < n; i++) rotated.push(src[(pivot + i) % n]!);
  rotated.push(rotated[0]!);

  const open = simplifyOpen(rotated, tolerance);
  if (open.length < 4) return src.slice();
  const out = open.slice(0, -1);
  return out.length >= 3 ? out : src.slice();
}

function chordParams(pts: Contour): Float64Array {
  const u = new Float64Array(pts.length);
  u[0] = 0;
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += dist(pts[i - 1]!, pts[i]!);
    u[i] = total;
  }
  if (total < 1e-9) {
    for (let i = 0; i < pts.length; i++) u[i] = i / Math.max(1, pts.length - 1);
    return u;
  }
  for (let i = 0; i < pts.length; i++) u[i]! /= total;
  return u;
}

function evalCubic(seg: CubicSeg, t: number): Pt {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return {
    x: uu * u * seg.p0.x + 3 * uu * t * seg.c1.x + 3 * u * tt * seg.c2.x + tt * t * seg.p1.x,
    y: uu * u * seg.p0.y + 3 * uu * t * seg.c1.y + 3 * u * tt * seg.c2.y + tt * t * seg.p1.y
  };
}

/** Least-squares cubic with fixed endpoints and unit tangents (Schneider). */
function fitCubic(
  pts: Contour,
  u: Float64Array,
  tHat1: Pt,
  tHat2: Pt
): CubicSeg | null {
  const n = pts.length;
  if (n < 2) return null;
  const p0 = pts[0]!;
  const p3 = pts[n - 1]!;

  let c00 = 0, c01 = 0, c11 = 0;
  let x0 = 0, x1 = 0;

  for (let i = 0; i < n; i++) {
    const t = u[i]!;
    const b0 = (1 - t) * (1 - t) * (1 - t);
    const b1 = 3 * (1 - t) * (1 - t) * t;
    const b2 = 3 * (1 - t) * t * t;
    const b3 = t * t * t;
    const a1 = mul(tHat1, b1);
    const a2 = mul(tHat2, b2);
    c00 += a1.x * a1.x + a1.y * a1.y;
    c01 += a1.x * a2.x + a1.y * a2.y;
    c11 += a2.x * a2.x + a2.y * a2.y;

    // point − (B0+B1)·p0 − (B2+B3)·p3
    const tmp = sub(pts[i]!, add(mul(p0, b0 + b1), mul(p3, b2 + b3)));
    x0 += a1.x * tmp.x + a1.y * tmp.y;
    x1 += a2.x * tmp.x + a2.y * tmp.y;
  }

  const det = c00 * c11 - c01 * c01;
  let alpha1 = 0;
  let alpha2 = 0;
  if (Math.abs(det) > 1e-12) {
    alpha1 = (c11 * x0 - c01 * x1) / det;
    alpha2 = (c00 * x1 - c01 * x0) / det;
  }

  const segLen = dist(p0, p3);
  const epsilon = 1e-6 * segLen;
  if (alpha1 < epsilon || alpha2 < epsilon) {
    const d = segLen / 3;
    return {
      p0,
      c1: add(p0, mul(tHat1, d)),
      c2: add(p3, mul(tHat2, d)),
      p1: p3
    };
  }

  return {
    p0,
    c1: add(p0, mul(tHat1, alpha1)),
    c2: add(p3, mul(tHat2, alpha2)),
    p1: p3
  };
}

function maxError(pts: Contour, u: Float64Array, seg: CubicSeg): { err: number; split: number } {
  let maxE = 0;
  let split = Math.floor(pts.length / 2);
  for (let i = 1; i < pts.length - 1; i++) {
    const p = evalCubic(seg, u[i]!);
    const e = dist2(p, pts[i]!);
    if (e > maxE) {
      maxE = e;
      split = i;
    }
  }
  return { err: Math.sqrt(maxE), split };
}

function computeLeftTangent(pts: Contour): Pt {
  return norm(sub(pts[1]!, pts[0]!));
}

function computeRightTangent(pts: Contour): Pt {
  return norm(sub(pts[pts.length - 2]!, pts[pts.length - 1]!));
}

function computeCenterTangent(pts: Contour, i: number): Pt {
  return norm(sub(pts[i - 1]!, pts[i + 1]!));
}

function fitCubicRecursive(
  pts: Contour,
  tHat1: Pt,
  tHat2: Pt,
  error: number,
  depth: number,
  out: CubicSeg[]
): void {
  if (pts.length === 2 || depth > 12) {
    const d = dist(pts[0]!, pts[pts.length - 1]!) / 3;
    out.push({
      p0: pts[0]!,
      c1: add(pts[0]!, mul(tHat1, d)),
      c2: add(pts[pts.length - 1]!, mul(tHat2, d)),
      p1: pts[pts.length - 1]!
    });
    return;
  }

  let u = chordParams(pts);
  let seg = fitCubic(pts, u, tHat1, tHat2);
  if (!seg) return;

  let { err, split } = maxError(pts, u, seg);
  if (err < error) {
    out.push(seg);
    return;
  }

  // One reparameterization pass when close.
  if (err < error * 4 && depth < 8) {
    const u2 = new Float64Array(u.length);
    for (let i = 0; i < pts.length; i++) {
      let t = u[i]!;
      for (let k = 0; k < 4; k++) {
        const p = evalCubic(seg, t);
        const d1 = {
          x:
            3 * (1 - t) * (1 - t) * (seg.c1.x - seg.p0.x) +
            6 * (1 - t) * t * (seg.c2.x - seg.c1.x) +
            3 * t * t * (seg.p1.x - seg.c2.x),
          y:
            3 * (1 - t) * (1 - t) * (seg.c1.y - seg.p0.y) +
            6 * (1 - t) * t * (seg.c2.y - seg.c1.y) +
            3 * t * t * (seg.p1.y - seg.c2.y)
        };
        const d2 = {
          x:
            6 * (1 - t) * (seg.c2.x - 2 * seg.c1.x + seg.p0.x) +
            6 * t * (seg.p1.x - 2 * seg.c2.x + seg.c1.x),
          y:
            6 * (1 - t) * (seg.c2.y - 2 * seg.c1.y + seg.p0.y) +
            6 * t * (seg.p1.y - 2 * seg.c2.y + seg.c1.y)
        };
        const diff = sub(p, pts[i]!);
        const num = diff.x * d1.x + diff.y * d1.y;
        const den = d1.x * d1.x + d1.y * d1.y + diff.x * d2.x + diff.y * d2.y;
        if (Math.abs(den) < 1e-12) break;
        t -= num / den;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
      }
      u2[i] = t;
    }
    for (let i = 1; i < u2.length; i++) {
      if (u2[i]! < u2[i - 1]!) {
        u2[i] = u2[i - 1]!;
      }
    }
    u = u2;
    seg = fitCubic(pts, u, tHat1, tHat2);
    if (seg) {
      ({ err, split } = maxError(pts, u, seg));
      if (err < error) {
        out.push(seg);
        return;
      }
    }
  }

  split = Math.max(1, Math.min(pts.length - 2, split));
  const tCenter = computeCenterTangent(pts, split);
  const left = pts.slice(0, split + 1);
  const right = pts.slice(split);
  fitCubicRecursive(left, tHat1, tCenter, error, depth + 1, out);
  fitCubicRecursive(right, mul(tCenter, -1), tHat2, error, depth + 1, out);
}

/** Fit a closed polyline to cubic Bezier segments. */
function fitClosedContour(pts: Contour, error: number): CubicSeg[] {
  if (pts.length < 3) return [];
  let ring = pts.slice();
  const f = ring[0]!;
  const l = ring[ring.length - 1]!;
  if (dist2(f, l) > 1e-6) ring.push(f);
  else ring = pts.slice();

  if (ring.length < 4) return [];

  // Open chain without duplicate close for fitting; force close after.
  const open = ring.slice(0, -1);
  if (open.length < 3) return [];

  // Split into one open fit around the ring by treating as open with matching tangents.
  const chain = open.concat([open[0]!]);
  const t1 = computeLeftTangent(chain);
  const t2 = computeRightTangent(chain);
  const segs: CubicSeg[] = [];
  fitCubicRecursive(chain, t1, t2, error, 0, segs);
  return segs;
}

function pointInPoly(p: Pt, poly: Contour): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    const intersect =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y + 1e-12) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

function centroid(c: Contour): Pt {
  let x = 0;
  let y = 0;
  for (const p of c) {
    x += p.x;
    y += p.y;
  }
  const n = Math.max(1, c.length);
  return { x: x / n, y: y / n };
}

/**
 * Drop dust contours and near-duplicate / fully-overlapped same-winding lobes.
 * Keeps holes (opposite winding inside a parent).
 */
function cleanupOverlaps(contours: Contours, minArea = 8): Contours {
  const enriched = contours
    .map((c) => {
      let pts = c;
      if (pts.length >= 2 && dist2(pts[0]!, pts[pts.length - 1]!) < 0.25) {
        pts = pts.slice(0, -1);
      }
      const area = signedArea(pts);
      return { pts, area, abs: Math.abs(area) };
    })
    .filter((e) => e.pts.length >= 3 && e.abs >= minArea)
    .sort((a, b) => b.abs - a.abs);

  const kept: typeof enriched = [];
  for (const cand of enriched) {
    let drop = false;
    for (const parent of kept) {
      const sameWind = cand.area * parent.area > 0;
      const center = centroid(cand.pts);
      if (!pointInPoly(center, parent.pts)) continue;
      if (sameWind) {
        // Nested same-winding ≈ redundant overlap from lobe bloom.
        if (cand.abs / parent.abs < 0.92) {
          drop = true;
          break;
        }
      }
      // Opposite winding: hole — keep.
    }
    if (!drop) kept.push(cand);
  }
  return kept.map((e) => e.pts);
}

export type OutlineOpts = {
  /** RDP tolerance in contour units (font UPM for OTF). */
  simplify?: number;
  /** Max cubic fit error. */
  fitError?: number;
  /** Minimum absolute contour area to keep. */
  minArea?: number;
};

/**
 * Simplify → overlap cleanup → cubic Bezier fit for font-quality outlines.
 */
export function prepareOutlineCurves(
  contours: Contours,
  opts: OutlineOpts = {}
): CubicSeg[][] {
  const simplifyTol = opts.simplify ?? 1.25;
  const fitError = opts.fitError ?? 1.5;
  const minArea = opts.minArea ?? 12;

  const simplified = contours.map((c) => simplifyClosed(c, simplifyTol));
  const cleaned = cleanupOverlaps(simplified, minArea);
  return cleaned.map((c) => fitClosedContour(c, fitError)).filter((s) => s.length > 0);
}

