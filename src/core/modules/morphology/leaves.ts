import type { Contour, Contours, Pt } from '../../types';
import { chaikin, ss } from '../../path/ops';
import {
  clampMargin,
  shapeGroup,
  type LeafMargin,
  type LeafShape
} from './catalog';
const hypot = (dx: number, dy: number) => Math.hypot(dx, dy) || 1;

type LeafStamp = { x: number; y: number };

/** Half-width profile along midrib t∈[0,1] before margin. */
function shapeHalfWidth(shape: LeafShape, t: number, side: number, R: () => number): number {
  const g = shapeGroup(shape);
  const tip = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 0.85))), 0.55);

  if (shape === 'acicular') {
    return Math.pow(1 - t, 0.55) * 0.06;
  }
  if (shape === 'linear') {
    return tip * 0.08 * (0.85 + 0.15 * Math.sin(t * Math.PI * 2));
  }
  if (shape === 'lanceolate') {
    const peak = 0.38;
    const u = Math.min(Math.pow(t / peak, 0.7), Math.pow((1 - t) / (1 - peak), 1.1));
    return Math.max(0, u) * 0.18;
  }
  if (shape === 'ovate') {
    const peak = 0.32;
    const u = Math.min(Math.pow(t / peak, 0.65), Math.pow((1 - t) / (1 - peak), 1.05));
    return Math.max(0, u) * 0.26;
  }
  if (shape === 'obovate') {
    const peak = 0.65;
    const u = Math.min(Math.pow(t / peak, 0.9), Math.pow((1 - t) / (1 - peak), 0.7));
    return Math.max(0, u) * 0.26;
  }
  if (shape === 'elliptic') {
    return Math.pow(Math.sin(Math.PI * t), 0.7) * 0.22;
  }
  if (shape === 'orbicular') {
    const u = Math.sin(Math.PI * t);
    return Math.pow(Math.max(0, u), 0.35) * 0.42;
  }
  if (shape === 'reniform') {
    const u = Math.sin(Math.PI * Math.pow(t, 0.7));
    const notch = 1 - 0.35 * Math.exp(-Math.pow((t - 0.08) / 0.1, 2));
    return Math.pow(Math.max(0, u), 0.4) * 0.38 * notch;
  }
  if (shape === 'cordate') {
    const u = Math.sin(Math.PI * Math.pow(t, 0.55));
    const shoulder = 1 + 0.35 * Math.exp(-Math.pow((t - 0.18) / 0.12, 2));
    return Math.pow(Math.max(0, u), 0.45) * 0.3 * shoulder;
  }
  if (shape === 'deltoid') {
    return Math.max(0, (1 - t) * (0.08 + t * 0.4));
  }
  if (shape === 'hastate' || shape === 'sagittate') {
    const u = Math.sin(Math.PI * Math.pow(t, 0.75));
    const barb = 0.55 * Math.exp(-Math.pow((t - 0.12) / 0.08, 2));
    const fold = shape === 'sagittate' ? 1 - 0.2 * ss(0, 0.25, t) : 1;
    return Math.pow(Math.max(0, u), 0.5) * (0.14 + barb) * fold;
  }
  if (shape === 'falcate') {
    const u = Math.sin(Math.PI * t);
    return Math.pow(Math.max(0, u), 0.6) * 0.16 * (1 + side * 0.18);
  }
  if (shape === 'flabellate') {
    const flare = Math.pow(ss(0.02, 0.6, t), 0.55);
    const cleft = 1 - 0.5 * Math.exp(-Math.pow((t - 0.9) / 0.07, 2));
    return flare * 0.42 * Math.max(0.06, cleft);
  }
  if (g === 'lobed') {
    const u = Math.sin(Math.PI * Math.pow(t, 0.85));
    const n = shape === 'palmatifid' ? 3 : shape === 'pinnatisect' ? 5 : 4;
    const lobes = 0.35 + 0.65 * Math.abs(Math.sin(t * Math.PI * n));
    return Math.pow(Math.max(0, u), 0.5) * 0.28 * lobes;
  }
  // Compound leaflets use a small ovate default; layout handled separately.
  const peak = 0.35;
  const u = Math.min(Math.pow(t / peak, 0.7), Math.pow((1 - t) / (1 - peak), 1));
  return Math.max(0, u) * 0.2 * (1 + (R() - 0.5) * 0.05);
}

function applyMargin(
  w: number,
  t: number,
  margin: LeafMargin,
  R: () => number
): number {
  if (margin === 'entire' || w <= 1e-6) return w;
  const band = ss(0.06, 0.16, t) * (1 - ss(0.86, 0.98, t));
  if (margin === 'ciliate') {
    const hair = Math.pow(Math.max(0, Math.sin(t * Math.PI * 28 + R())), 4);
    return w * (1 + 0.12 * hair * band);
  }
  if (margin === 'crenate') {
    return w * (1 + 0.22 * Math.sin(t * Math.PI * 8) * band);
  }
  if (margin === 'sinuate' || margin === 'undulate') {
    const amp = margin === 'sinuate' ? 0.32 : 0.16;
    return w * (1 + amp * Math.sin(t * Math.PI * 5.5) * band);
  }
  if (margin === 'dentate') {
    const tooth = Math.pow(Math.max(0, Math.sin(t * Math.PI * 9)), 1.4);
    return w * (1 + 0.32 * tooth * band);
  }
  if (margin === 'serrate') {
    const saw = Math.pow(Math.max(0, Math.sin(t * Math.PI * 9 + 0.4)), 1.2);
    return w * (1 + 0.3 * saw * band);
  }
  if (margin === 'spiny') {
    const n = 6 + Math.round(R() * 2);
    const spine = Math.pow(Math.max(0, Math.sin(t * Math.PI * n)), 2.2);
    return w * (1 + 0.55 * spine * band);
  }
  return w;
}


/** Soften polygon edges into irregular organic curves. */
function organicContour(pts: Contour, R: () => number, passes = 2): Contour {
  if (pts.length < 3) return pts;
  let cur = pts;
  const n = cur.length;
  const jittered: Contour = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = cur[i]!;
    const q = cur[(i + 1) % n]!;
    const r = cur[(i + n - 1) % n]!;
    let tx = q.x - r.x;
    let ty = q.y - r.y;
    const L = hypot(tx, ty);
    tx /= L;
    ty /= L;
    // Stronger edge wander — living silhouette, not a bead.
    const amp = 0.02 + R() * 0.055;
    const s = (R() - 0.5) * 2 * amp;
    jittered[i] = { x: p.x - ty * s * L * 0.22, y: p.y + tx * s * L * 0.22 };
  }
  cur = jittered;
  for (let i = 0; i < passes; i++) cur = chaikin(cur, 1);
  return cur;
}

function unitLeaf(
  shape: LeafShape,
  margin: LeafMargin,
  steps: number,
  R: () => number,
  asym = 0
): Contour {
  const pts: Contour = [];
  // Negative y = base pad that sinks into the letter so the graft has no gap.
  const y0 = -0.1 - R() * 0.06;
  for (let s = 0; s <= steps; s++) {
    const u = s / steps;
    const t = y0 + (1 - y0) * u;
    const tProf = Math.max(0, Math.min(1, t));
    let w = shapeHalfWidth(shape, tProf, -1, R);
    w = applyMargin(w, tProf, margin, R);
    w *= 1 - asym * (0.1 + R() * 0.12);
    w *= 0.82 + R() * 0.32;
    // Petiole narrows as it sinks into the letter.
    if (t < 0) w *= 0.2 + 0.8 * (1 - t / y0);
    pts.push({ x: -w, y: t });
  }
  for (let s = steps - 1; s >= 1; s--) {
    const u = s / steps;
    const t = y0 + (1 - y0) * u;
    const tProf = Math.max(0, Math.min(1, t));
    let w = shapeHalfWidth(shape, tProf, 1, R);
    w = applyMargin(w, tProf, margin, R);
    w *= 1 + asym * (0.1 + R() * 0.12);
    w *= 0.82 + R() * 0.32;
    if (t < 0) w *= 0.2 + 0.8 * (1 - t / y0);
    pts.push({ x: w, y: t });
  }
  return pts;
}

/** Place a unit leaf with a curved midrib (organic bend, not a straight stick). */
function transformUnit(
  unit: Contour,
  ox: number,
  oy: number,
  len: number,
  widthScale: number,
  gx: number,
  gy: number,
  curl = 0,
  swell = 1
): Contour {
  const out: Contour = new Array(unit.length);
  for (let i = 0; i < unit.length; i++) {
    const p = unit[i]!;
    const t = Math.max(0, p.y);
    // Quadratic curl along the midrib + slight tip swell.
    const bent = rotate2(gx, gy, curl * t * t);
    const sx = -bent.y;
    const sy = bent.x;
    const lx = p.x * len * widthScale * swell;
    const ly = p.y * len;
    out[i] = { x: ox + sx * lx + bent.x * ly, y: oy + sy * lx + bent.y * ly };
  }
  return out;
}

export function rotate2(gx: number, gy: number, ang: number): Pt {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  return { x: gx * ca - gy * sa, y: gx * sa + gy * ca };
}

function leafletLayout(shape: LeafShape): { x: number; y: number; ang: number; s: number }[] {
  if (shape === 'trifoliate') {
    return [
      { x: 0, y: 0.15, ang: -0.55, s: 0.72 },
      { x: 0, y: 0.05, ang: 0, s: 0.85 },
      { x: 0, y: 0.15, ang: 0.55, s: 0.72 }
    ];
  }
  if (shape === 'palmate') {
    const n = 5;
    const out = [];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      out.push({ x: 0, y: 0.08, ang: -0.85 + u * 1.7, s: 0.55 + (1 - Math.abs(u - 0.5)) * 0.3 });
    }
    return out;
  }
  return [{ x: 0, y: 0, ang: 0, s: 1 }];
}


export function buildLaminaStamp(
  shape: LeafShape,
  margin: LeafMargin,
  stamp: LeafStamp,
  len: number,
  widthScale: number,
  gx: number,
  gy: number,
  R: () => number,
  chaikinPasses = 2
): Contours {
  const asym = R() * 2 - 1;
  const group = shapeGroup(shape);
  const steps = group === 'needle' ? 10 : group === 'compound' ? 12 : 16;

  const curl = (R() - 0.5) * 1.1;
  const swell = 0.88 + R() * 0.28;
  const polish = (c: Contour) =>
    chaikinPasses > 0 ? organicContour(c, R, chaikinPasses) : c;

  if (group !== 'compound') {
    let leaf = unitLeaf(shape, margin, steps, R, asym);
    leaf = transformUnit(leaf, stamp.x, stamp.y, len, widthScale, gx, gy, curl, swell);
    return [polish(leaf)];
  }

  const leafletShape: LeafShape = 'ovate';
  const layout = leafletLayout(shape);
  const out: Contours = [];
  for (const L of layout) {
    const dir = rotate2(gx, gy, L.ang + (R() - 0.5) * 0.28);
    const ox = stamp.x + (-gy) * L.x * len + gx * L.y * len;
    const oy = stamp.y + gx * L.x * len + gy * L.y * len;
    let leaflet = unitLeaf(leafletShape, margin, steps, R, asym * 0.5);
    leaflet = transformUnit(
      leaflet,
      ox,
      oy,
      len * L.s,
      widthScale * (0.8 + R() * 0.25),
      dir.x,
      dir.y,
      curl + (R() - 0.5) * 0.6,
      swell
    );
    out.push(polish(leaflet));
  }
  return out;
}


function contoursToIcon(contours: Contours, pad = 0.08): { paths: string[]; viewBox: string } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const paths: string[] = [];
  for (const c of contours) {
    const parts: string[] = [];
    for (let i = 0; i < c.length; i++) {
      const p = c[i]!;
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
      parts.push(`${i === 0 ? 'M' : 'L'}${p.x.toFixed(4)} ${p.y.toFixed(4)}`);
    }
    parts.push('Z');
    paths.push(parts.join(''));
  }
  const w = Math.max(0.08, maxX - minX) + pad * 2;
  const h = Math.max(0.08, maxY - minY) + pad * 2;
  return {
    paths,
    viewBox: `${(minX - pad).toFixed(4)} ${(minY - pad).toFixed(4)} ${w.toFixed(4)} ${h.toFixed(4)}`
  };
}

function quietRng(seed0: number): () => number {
  let seed = seed0 >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

/** Deterministic unit-leaf SVG paths for shape chips (viewBox-ready). */
export function leafShapeIcon(shape: LeafShape): { paths: string[]; viewBox: string } {
  const margin = clampMargin(shape, 'entire');
  const quiet = quietRng(shape.length * 17 + 91);
  const group = shapeGroup(shape);
  const steps = group === 'needle' ? 14 : group === 'compound' ? 16 : 18;
  const contours: Contours = [];

  if (group === 'compound') {
    const layout = leafletLayout(shape);
    for (const L of layout) {
      const dir = rotate2(0, 1, L.ang);
      let leaflet = unitLeaf('ovate', margin, steps, quiet, 0);
      leaflet = transformUnit(leaflet, L.x, L.y, L.s, 0.9, dir.x, dir.y);
      contours.push(organicContour(leaflet, quiet, 2));
    }
  } else {
    contours.push(organicContour(unitLeaf(shape, margin, steps, quiet, 0), quiet, 2));
  }
  return contoursToIcon(contours);
}

/** Ovate leaf with the given margin — for margin chips. */
export function leafMarginIcon(margin: LeafMargin): { paths: string[]; viewBox: string } {
  const quiet = quietRng(margin.length * 31 + 53);
  const leaf = organicContour(unitLeaf('ovate', margin, 20, quiet, 0), quiet, 2);
  return contoursToIcon([leaf], 0.1);
}

