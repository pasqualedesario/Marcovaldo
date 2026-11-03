import type { BotanicalParams, Contour, Contours, ModuleInfo, Pt } from '../../types';
import { chaikin, rng, ss } from '../../path/ops';
import {
  clampMargin,
  shapeGroup,
  type LeafMargin,
  type LeafShape
} from './catalog';

export const MORPHOLOGY_MODULE: ModuleInfo = {
  id: 'leaf-morphology',
  version: '1.2.0',
  label: 'Leaf morphology'
};

export function moduleStamp(): string {
  return `${MORPHOLOGY_MODULE.id}@${MORPHOLOGY_MODULE.version}`;
}

export type MorphologySpec = {
  shape: LeafShape;
  margin: LeafMargin;
};

type Stamp = {
  x: number;
  y: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  field: number;
};

type LivingRing = {
  pts: Contour;
  tx: Float64Array;
  ty: Float64Array;
  nx: Float64Array;
  ny: Float64Array;
  field: Float64Array;
  tmp: Float64Array;
};

const hypot = (dx: number, dy: number) => Math.hypot(dx, dy) || 1;

function makeNoise1D(R: () => number, cells = 12): (t: number) => number {
  const v = new Float64Array(cells + 1);
  for (let i = 0; i <= cells; i++) v[i] = R() * 2 - 1;
  v[cells] = v[0]!;
  return (t: number) => {
    const x = ((t % 1) + 1) % 1 * cells;
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return v[i]! * (1 - u) + v[i + 1]! * u;
  };
}

function centroid(contour: Contour): Pt {
  let cx = 0, cy = 0;
  for (let i = 0; i < contour.length; i++) {
    cx += contour[i]!.x;
    cy += contour[i]!.y;
  }
  const n = Math.max(1, contour.length);
  return { x: cx / n, y: cy / n };
}

function buildRing(contour: Contour, spacing: number): LivingRing | null {
  const n0 = contour.length;
  if (n0 < 3) return null;

  const segLen = new Float64Array(n0);
  let total = 0;
  for (let i = 0; i < n0; i++) {
    const a = contour[i]!, b = contour[(i + 1) % n0]!;
    const L = hypot(b.x - a.x, b.y - a.y);
    segLen[i] = L;
    total += L;
  }
  if (total < 1e-6) return null;

  const count = Math.max(12, Math.round(total / Math.max(spacing * 0.45, 0.5)));
  const step = total / count;
  const pts: Contour = new Array(count);
  const c = centroid(contour);

  let acc = 0;
  let i = 0;
  for (let k = 0; k < count; k++) {
    const target = k * step;
    while (i < n0 - 1 && acc + segLen[i]! < target) {
      acc += segLen[i]!;
      i++;
    }
    const a = contour[i]!;
    const b = contour[(i + 1) % n0]!;
    const sl = segLen[i] || 1e-6;
    const t = (target - acc) / sl;
    pts[k] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  const tx = new Float64Array(count);
  const ty = new Float64Array(count);
  const nx = new Float64Array(count);
  const ny = new Float64Array(count);
  for (let k = 0; k < count; k++) {
    const prev = pts[(k - 1 + count) % count]!;
    const next = pts[(k + 1) % count]!;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const L = hypot(dx, dy);
    tx[k] = dx / L;
    ty[k] = dy / L;
    let ngx = -ty[k]!;
    let ngy = tx[k]!;
    const p = pts[k]!;
    if (ngx * (c.x - p.x) + ngy * (c.y - p.y) > 0) {
      ngx = -ngx;
      ngy = -ngy;
    }
    nx[k] = ngx;
    ny[k] = ngy;
  }

  return {
    pts, tx, ty, nx, ny,
    field: new Float64Array(count),
    tmp: new Float64Array(count)
  };
}

/** Recompute tangents + outward normals (away from ring centroid). */
function refreshRingFrames(ring: LivingRing): void {
  const pts = ring.pts;
  const count = pts.length;
  const c = centroid(pts);
  for (let k = 0; k < count; k++) {
    const prev = pts[(k - 1 + count) % count]!;
    const next = pts[(k + 1) % count]!;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const L = hypot(dx, dy);
    ring.tx[k] = dx / L;
    ring.ty[k] = dy / L;
    let ngx = -ring.ty[k]!;
    let ngy = ring.tx[k]!;
    const p = pts[k]!;
    if (ngx * (c.x - p.x) + ngy * (c.y - p.y) > 0) {
      ngx = -ngx;
      ngy = -ngy;
    }
    ring.nx[k] = ngx;
    ring.ny[k] = ngy;
  }
}

/**
 * Pull contour samples toward the stroke skeleton (into the ink),
 * away from the outline. Uses inward offset along −normal, clamped
 * by distance-to-centroid so counters stay stable.
 */
function insetRingToSkeleton(ring: LivingRing, maxInset: number, frac = 0.48): void {
  if (maxInset <= 0) return;
  const pts = ring.pts;
  const n = pts.length;
  const c = centroid(pts);
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const dist = hypot(c.x - p.x, c.y - p.y);
    const inset = Math.min(maxInset, dist * frac);
    // Outward normal points away from centroid → −n moves into the ink.
    pts[i] = {
      x: p.x - ring.nx[i]! * inset,
      y: p.y - ring.ny[i]! * inset
    };
  }
  refreshRingFrames(ring);
}

function seedField(ring: LivingRing, R: () => number): void {
  const n = ring.pts.length;
  const lo = makeNoise1D(R, Math.max(4, Math.round(n / 16)));
  const mid = makeNoise1D(R, Math.max(7, Math.round(n / 8)));
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const raw = lo(t) * 0.55 + mid(t * 1.4 + 0.2) * 0.45;
    ring.field[i] = Math.min(1, Math.max(0, 0.5 + 0.45 * raw));
  }
}

function diffuseField(ring: LivingRing, iterations: number, rate: number): void {
  const field = ring.field;
  const tmp = ring.tmp;
  const n = field.length;
  if (n < 3 || iterations <= 0) return;
  const a = Math.min(0.45, Math.max(0.05, rate));
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      const l = field[(i - 1 + n) % n]!;
      const c = field[i]!;
      const r = field[(i + 1) % n]!;
      tmp[i] = c + a * (l + r - 2 * c);
    }
    field.set(tmp);
  }
}

function reactField(field: Float64Array, rate: number, threshold = 0.45): void {
  if (rate < 1e-4) return;
  for (let i = 0; i < field.length; i++) {
    const f = field[i]!;
    field[i] = Math.min(1, Math.max(0, f + rate * f * (1 - f) * (f - threshold)));
  }
}

function stampsFromRing(ring: LivingRing, baseSpacing: number): Stamp[] {
  const n = ring.pts.length;
  if (n < 3) return [];

  const segLen = new Float64Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = ring.pts[i]!, b = ring.pts[(i + 1) % n]!;
    const L = hypot(b.x - a.x, b.y - a.y);
    segLen[i] = L;
    total += L;
  }
  if (total < 1e-6) return [];

  const stamps: Stamp[] = [];
  let acc = 0;
  let i = 0;
  let target = baseSpacing * 0.5;

  while (target < total && stamps.length < 4000) {
    while (i < n - 1 && acc + segLen[i]! < target) {
      acc += segLen[i]!;
      i++;
    }
    const a = ring.pts[i]!;
    const b = ring.pts[(i + 1) % n]!;
    const sl = segLen[i] || 1e-6;
    const t = (target - acc) / sl;
    const idx = Math.min(n - 1, Math.max(0, i));
    const field = ring.field[idx] ?? 0.5;
    stamps.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      tx: ring.tx[idx]!,
      ty: ring.ty[idx]!,
      nx: ring.nx[idx]!,
      ny: ring.ny[idx]!,
      field
    });
    target += baseSpacing * Math.max(0.45, 1.45 - 0.85 * field);
  }
  return stamps;
}

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

function unitLeaf(
  shape: LeafShape,
  margin: LeafMargin,
  steps: number,
  R: () => number,
  asym = 0
): Contour {
  const pts: Contour = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    let w = shapeHalfWidth(shape, t, -1, R);
    w = applyMargin(w, t, margin, R);
    w *= 1 - asym * 0.08;
    pts.push({ x: -w, y: t });
  }
  for (let s = steps - 1; s >= 1; s--) {
    const t = s / steps;
    let w = shapeHalfWidth(shape, t, 1, R);
    w = applyMargin(w, t, margin, R);
    w *= 1 + asym * 0.08;
    pts.push({ x: w, y: t });
  }
  return pts;
}

function transformUnit(
  unit: Contour,
  ox: number,
  oy: number,
  len: number,
  widthScale: number,
  gx: number,
  gy: number
): Contour {
  const sx = -gy;
  const sy = gx;
  const out: Contour = new Array(unit.length);
  for (let i = 0; i < unit.length; i++) {
    const p = unit[i]!;
    const lx = p.x * len * widthScale;
    const ly = p.y * len;
    out[i] = { x: ox + sx * lx + gx * ly, y: oy + sy * lx + gy * ly };
  }
  return out;
}

function rotate2(gx: number, gy: number, ang: number): Pt {
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
  if (shape === 'odd_pinnate') {
    const pairs = 3;
    const out: { x: number; y: number; ang: number; s: number }[] = [];
    for (let i = 0; i < pairs; i++) {
      const y = 0.15 + i * 0.22;
      out.push({ x: 0, y, ang: -0.85, s: 0.45 });
      out.push({ x: 0, y, ang: 0.85, s: 0.45 });
    }
    out.push({ x: 0, y: 0.88, ang: 0, s: 0.5 });
    return out;
  }
  if (shape === 'bipinnate') {
    const out: { x: number; y: number; ang: number; s: number }[] = [];
    const arms = 3;
    for (let a = 0; a < arms; a++) {
      const y = 0.2 + a * 0.25;
      const side = a % 2 === 0 ? -1 : 1;
      out.push({ x: 0, y, ang: side * 0.9, s: 0.35 });
      out.push({ x: 0, y: y + 0.06, ang: side * 0.55, s: 0.28 });
    }
    out.push({ x: 0, y: 0.9, ang: 0, s: 0.32 });
    return out;
  }
  return [{ x: 0, y: 0, ang: 0, s: 1 }];
}

function buildLaminaStamp(
  shape: LeafShape,
  margin: LeafMargin,
  stamp: Stamp,
  len: number,
  widthScale: number,
  gx: number,
  gy: number,
  R: () => number
): Contours {
  const asym = R() * 2 - 1;
  const group = shapeGroup(shape);
  const steps = group === 'needle' ? 10 : group === 'compound' ? 12 : 16;

  if (group !== 'compound') {
    let leaf = unitLeaf(shape, margin, steps, R, asym);
    leaf = transformUnit(leaf, stamp.x, stamp.y, len, widthScale, gx, gy);
    return [chaikin(leaf, 1)];
  }

  const leafletShape: LeafShape = 'ovate';
  const layout = leafletLayout(shape);
  const out: Contours = [];
  for (const L of layout) {
    const dir = rotate2(gx, gy, L.ang + (R() - 0.5) * 0.12);
    const ox = stamp.x + (-gy) * L.x * len + gx * L.y * len;
    const oy = stamp.y + gx * L.x * len + gy * L.y * len;
    let leaflet = unitLeaf(leafletShape, margin, steps, R, asym * 0.5);
    leaflet = transformUnit(leaflet, ox, oy, len * L.s, widthScale * 0.9, dir.x, dir.y);
    out.push(chaikin(leaflet, 1));
  }
  return out;
}

function stampFlora(
  stamps: Stamp[],
  opts: {
    amp: number;
    grow: number;
    shape: LeafShape;
    margin: LeafMargin;
    R: () => number;
  }
): Contours {
  const { amp, grow, shape, margin, R } = opts;
  const lamina: Contours = [];
  if (!stamps.length) return lamina;

  const leanN = makeNoise1D(R, Math.max(5, Math.round(stamps.length / 10)));
  let alt = R() < 0.5 ? 1 : -1;

  for (let i = 0; i < stamps.length; i++) {
    const s = stamps[i]!;
    const phase = i / stamps.length;
    const field = 0.5 + 0.55 * s.field;
    const organic = 0.75 + 0.5 * R();
    const pulse = 1 - 0.25 * (0.5 + 0.5 * Math.sin(i * 0.73 + grow));
    if (s.field < 0.12 + (1 - grow) * 0.08 && R() < 0.2) {
      alt *= -1;
      continue;
    }
    const len = amp * field * organic * pulse;
    if (len < amp * 0.06) {
      alt *= -1;
      continue;
    }

    // From the skeleton, lean mostly along the stroke with a soft outward tip.
    let gx = s.tx * 0.55 + s.nx * 0.45;
    let gy = s.ty * 0.55 + s.ny * 0.45;
    const gl = hypot(gx, gy);
    gx /= gl;
    gy /= gl;

    const lean = (0.25 + grow * 0.35) * (0.6 + R() * 0.9) * alt + leanN(phase) * 0.35;
    const dir = rotate2(gx, gy, lean);
    const widthScale = 0.75 + R() * 0.45;

    const leaves = buildLaminaStamp(shape, margin, s, len, widthScale, dir.x, dir.y, R);
    for (const leaf of leaves) lamina.push(leaf);
    alt *= -1;
  }
  return lamina;
}

/**
 * Flora stamps along the glyph skeleton (inset from contours).
 * Growth drives size, density, and organic jitter.
 */
export function applyMorphology(
  contours: Contours,
  params: BotanicalParams,
  fontSize: number,
  seed: string,
  spec: MorphologySpec
): Contours {
  const g = Math.min(1, Math.max(0, params.growth * 0.01));
  if (g <= 0) return contours.map((c) => c.slice());

  const grow = ss(0, 1, Math.pow(g, 0.85));
  const shape = spec.shape;
  const margin = clampMargin(shape, spec.margin);

  const group = shapeGroup(shape);
  const baseAmp =
    group === 'needle' ? 0.14
      : group === 'compound' ? 0.2
        : group === 'broad' || shape === 'flabellate' ? 0.17
          : 0.16;
  const baseSpacing =
    group === 'compound' ? 0.085
      : group === 'needle' ? 0.04
        : 0.06;

  const spacing = fontSize * Math.max(0.016, baseSpacing * (1.7 - grow * 0.55));
  const amp = baseAmp * fontSize * (0.28 + grow * 1.05);
  const skeletonInset = Math.max(spacing * 0.85, amp * (0.38 + grow * 0.22));

  const R = rng(seed);
  const lamina: Contours = [];

  for (let i = 0; i < contours.length; i++) {
    const c = contours[i]!;
    if (c.length < 3) continue;
    const Rc = rng(`${seed}|c${i}|${(R() * 1e9) | 0}`);
    const ring = buildRing(c, Math.max(0.8, spacing * 0.35));
    if (!ring) continue;
    insetRingToSkeleton(ring, skeletonInset, 0.5);
    seedField(ring, Rc);
    diffuseField(ring, 2 + Math.round(grow * 4), 0.28);
    reactField(ring.field, 0.04 * grow);
    if (grow > 0.4) diffuseField(ring, 2, 0.18);

    const stamps = stampsFromRing(ring, spacing);
    const leaves = stampFlora(stamps, { amp, grow, shape, margin, R: Rc });
    for (const leaf of leaves) lamina.push(leaf);
  }

  return lamina.length ? lamina : contours.map((c) => c.slice());
}

export {
  LEAF_SHAPES,
  LEAF_MARGINS,
  DEFAULT_SHAPE,
  DEFAULT_MARGIN,
  marginsFor,
  clampMargin,
  isLeafShape,
  shapeGroup
} from './catalog';
export type { LeafShape, LeafMargin, ShapeGroup } from './catalog';
