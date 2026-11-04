/**
 * Marcovaldo morphology 3.0 — Primavera-style outline foliage.
 *
 * The letter stays a filled outline (counters intact). Growth sprouts
 * real leaves along the perimeter; shape/margin change the foliage.
 * No medial-axis / skeleton path.
 */
import type { BotanicalParams, Contour, Contours, Pt } from '../../types';
import { matchWinding, rng, signedArea, ss } from '../../path/ops';
import {
  clampMargin,
  shapeGroup,
  type LeafMargin,
  type LeafShape
} from './catalog';
import { buildLaminaStamp, rotate2 } from './leaves';

const MODULE_ID = 'leaf-morphology';
const MODULE_VERSION = '3.0.0';

export function moduleStamp(): string {
  return `${MODULE_ID}@${MODULE_VERSION}`;
}

export type MorphologySpec = {
  shape: LeafShape;
  margin: LeafMargin;
};

const hypot = (dx: number, dy: number) => Math.hypot(dx, dy) || 1;

type EdgeSample = {
  x: number;
  y: number;
  tx: number;
  ty: number;
  /** Unit normal pointing toward empty space (outside letter / into counter). */
  nx: number;
  ny: number;
  field: number;
};

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
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < contour.length; i++) {
    cx += contour[i]!.x;
    cy += contour[i]!.y;
  }
  const n = Math.max(1, contour.length);
  return { x: cx / n, y: cy / n };
}

/** Dense samples along a closed contour with tangent + empty-space normal. */
function sampleEdge(
  contour: Contour,
  spacing: number,
  intoEmpty: 1 | -1
): { samples: EdgeSample[]; length: number } {
  const n0 = contour.length;
  if (n0 < 3) return { samples: [], length: 0 };

  const segLen = new Float64Array(n0);
  let total = 0;
  for (let i = 0; i < n0; i++) {
    const a = contour[i]!;
    const b = contour[(i + 1) % n0]!;
    const L = hypot(b.x - a.x, b.y - a.y);
    segLen[i] = L;
    total += L;
  }
  if (total < 1e-6) return { samples: [], length: 0 };

  const count = Math.max(16, Math.round(total / Math.max(spacing * 0.4, 0.4)));
  const step = total / count;
  const pts: Contour = new Array(count);
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

  const c = centroid(contour);
  const samples: EdgeSample[] = [];
  for (let k = 0; k < count; k++) {
    const prev = pts[(k - 1 + count) % count]!;
    const next = pts[(k + 1) % count]!;
    const p = pts[k]!;
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const L = hypot(tx, ty);
    tx /= L;
    ty /= L;
    // Candidate normal perpendicular to tangent.
    let nx = -ty;
    let ny = tx;
    // Face away from contour centroid, then flip so we always grow into empty space.
    if (nx * (c.x - p.x) + ny * (c.y - p.y) > 0) {
      nx = -nx;
      ny = -ny;
    }
    nx *= intoEmpty;
    ny *= intoEmpty;
    samples.push({ x: p.x, y: p.y, tx, ty, nx, ny, field: 0.5 });
  }
  return { samples, length: total };
}

function paintField(samples: EdgeSample[], R: () => number): void {
  const n = samples.length;
  if (n < 3) return;
  const lo = makeNoise1D(R, Math.max(4, Math.round(n / 14)));
  const mid = makeNoise1D(R, Math.max(7, Math.round(n / 7)));
  for (let i = 0; i < n; i++) {
    const t = i / n;
    samples[i]!.field = Math.min(1, Math.max(0, 0.5 + 0.48 * (lo(t) * 0.55 + mid(t * 1.3) * 0.45)));
  }
}

function pickBuds(
  samples: EdgeSample[],
  perimeter: number,
  spacing: number,
  R: () => number
): EdgeSample[] {
  if (!samples.length || perimeter < 1e-6) return [];
  const buds: EdgeSample[] = [];
  let target = spacing * (0.25 + R() * 0.5);
  let acc = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i]!;
    const b = samples[(i + 1) % samples.length]!;
    const L = hypot(b.x - a.x, b.y - a.y);
    while (target <= acc + L && buds.length < 2500) {
      const t = (target - acc) / (L || 1e-6);
      const field = a.field * (1 - t) + b.field * t;
      let tx = a.tx * (1 - t) + b.tx * t;
      let ty = a.ty * (1 - t) + b.ty * t;
      let nx = a.nx * (1 - t) + b.nx * t;
      let ny = a.ny * (1 - t) + b.ny * t;
      const tL = hypot(tx, ty);
      const nL = hypot(nx, ny);
      buds.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        tx: tx / tL,
        ty: ty / tL,
        nx: nx / nL,
        ny: ny / nL,
        field
      });
      target += spacing * (0.65 + R() * 0.7) * (1.15 - 0.35 * field);
    }
    acc += L;
  }
  return buds;
}

/**
 * Graft leaves along glyph edges. Bases sink into the fill (no gap);
 * length/lean/curl vary so the bush reads organic, not stamped.
 */
function growFoliage(
  buds: EdgeSample[],
  opts: {
    amp: number;
    grow: number;
    shape: LeafShape;
    margin: LeafMargin;
    wantPositive: boolean;
    R: () => number;
  }
): Contours {
  const { amp, grow, shape, margin, wantPositive, R } = opts;
  const out: Contours = [];
  if (!buds.length) return out;

  const leanN = makeNoise1D(R, Math.max(5, Math.round(buds.length / 8)));
  const leanN2 = makeNoise1D(R, Math.max(7, Math.round(buds.length / 5)));
  // Sparse buds early → dense bush late (Primavera GROW feel).
  const keep = 0.32 + grow * 0.62;
  const group = shapeGroup(shape);
  const widthScale =
    group === 'needle' ? 0.42
      : group === 'compound' ? 0.68
        : group === 'broad' ? 0.82
          : 0.68;

  for (let i = 0; i < buds.length; i++) {
    const s = buds[i]!;
    if (R() > keep) continue;
    if (s.field < 0.1 && R() < 0.3) continue;

    const phase = i / buds.length;
    const field = 0.5 + 0.55 * s.field;
    // Wide size scatter — short buds next to long runners.
    const sizeRoll = R();
    const sizeMul =
      sizeRoll < 0.18 ? 0.35 + R() * 0.3
        : sizeRoll > 0.82 ? 1.05 + R() * 0.55
          : 0.65 + R() * 0.55;
    const len = amp * field * (0.32 + grow * 1.1) * sizeMul;
    if (len < amp * 0.1) continue;

    // Irregular lean (no left/right parade).
    const lean =
      leanN(phase) * (0.55 + grow * 0.7) +
      leanN2(phase * 1.7) * 0.45 +
      (R() - 0.5) * (0.7 + grow * 0.6);
    const dir = rotate2(s.nx, s.ny, lean);

    // Sink base into the letter so lamina overlaps the fill — no halo gap.
    const sink = len * (0.14 + R() * 0.12);
    const slide = (R() - 0.5) * len * 0.22;
    const ox = s.x - s.nx * sink + s.tx * slide;
    const oy = s.y - s.ny * sink + s.ty * slide;

    const leaves = buildLaminaStamp(
      shape,
      margin,
      { x: ox, y: oy },
      len,
      widthScale * (0.65 + R() * 0.55),
      dir.x,
      dir.y,
      R
    );
    for (const leaf of leaves) {
      if (leaf.length >= 3) out.push(matchWinding(leaf, wantPositive));
    }

    // Occasional twin bud from the same node (clustered, less regular).
    if (R() < 0.12 + grow * 0.18) {
      const lean2 = lean + (R() < 0.5 ? -1 : 1) * (0.4 + R() * 0.9);
      const dir2 = rotate2(s.nx, s.ny, lean2);
      const len2 = len * (0.4 + R() * 0.45);
      const twins = buildLaminaStamp(
        shape,
        margin,
        {
          x: ox + s.tx * (R() - 0.5) * len * 0.15,
          y: oy + s.ty * (R() - 0.5) * len * 0.15
        },
        len2,
        widthScale * (0.55 + R() * 0.4),
        dir2.x,
        dir2.y,
        R
      );
      for (const leaf of twins) {
        if (leaf.length >= 3) out.push(matchWinding(leaf, wantPositive));
      }
    }
  }
  return out;
}

/**
 * Growth 0 = intact letter.
 * Growth rises = foliage along outlines (Primavera bush), leaf shape/margin vary the flora.
 * Letter contours are always kept so the form stays recognizable until dense cover.
 */
export function applyMorphology(
  contours: Contours,
  params: BotanicalParams,
  fontSize: number,
  seed: string,
  spec: MorphologySpec
): Contours {
  const g = Math.min(1, Math.max(0, params.growth * 0.01));
  const plain: Contours = [];
  for (const c of contours) {
    if (c.length >= 3) plain.push(c.slice());
  }
  if (g <= 0 || !plain.length) return plain;

  // Slow early ease → letter stays clear; late growth densifies into a bush.
  const grow = ss(0, 1, Math.pow(g, 0.82));
  const shape = spec.shape;
  const margin = clampMargin(shape, spec.margin);
  const group = shapeGroup(shape);

  const baseAmp =
    group === 'needle' ? 0.055
      : group === 'compound' ? 0.09
        : group === 'broad' || shape === 'flabellate' ? 0.085
          : 0.07;
  // Denser buds as growth rises (Primavera “hedgerow” packing).
  const baseSpacing =
    group === 'needle' ? 0.038
      : group === 'compound' ? 0.055
        : 0.048;

  const amp = baseAmp * fontSize * (0.55 + grow * 1.35);
  const spacing = fontSize * Math.max(0.014, baseSpacing * (1.55 - grow * 0.95));

  let wantPositive = true;
  let bestAbs = 0;
  for (const c of plain) {
    const a = signedArea(c);
    if (Math.abs(a) > bestAbs) {
      bestAbs = Math.abs(a);
      wantPositive = a > 0;
    }
  }

  const R = rng(seed);
  // Letter first — counters keep their opposite winding under nonzero fill.
  const lamina: Contours = plain.map((c) => c.slice());

  for (let i = 0; i < plain.length; i++) {
    const c = plain[i]!;
    const area = signedArea(c);
    const isHole = (area > 0) !== wantPositive;
    // Outer edges grow outward; hole edges grow into the counter (bush fills in).
    const intoEmpty: 1 | -1 = isHole ? -1 : 1;
    const Rc = rng(`${seed}|e${i}|${(R() * 1e9) | 0}`);
    const { samples, length } = sampleEdge(c, Math.max(0.6, spacing * 0.35), intoEmpty);
    if (!samples.length) continue;
    paintField(samples, Rc);
    // Holes get slightly sparser buds so counters don't vanish too early.
    const edgeSpacing = spacing * (isHole ? 1.25 - grow * 0.2 : 1);
    const buds = pickBuds(samples, length, edgeSpacing, Rc);
    const flora = growFoliage(buds, {
      amp: amp * (isHole ? 0.75 : 1),
      grow,
      shape,
      margin,
      wantPositive,
      R: Rc
    });
    for (const leaf of flora) lamina.push(leaf);
  }

  return lamina;
}

/**
 * VF-safe morphology: fixed bud sites + leaf topology; only amplitude follows growth.
 * Masters at growth 0 and 1 share contour counts / can be resampled to equal point counts.
 */
export function applyMorphologyStable(
  contours: Contours,
  growth01: number,
  fontSize: number,
  seed: string,
  spec: MorphologySpec
): Contours {
  const grow = Math.min(1, Math.max(0, growth01));
  const plain: Contours = [];
  for (const c of contours) {
    if (c.length >= 3) plain.push(c.slice());
  }
  if (!plain.length) return plain;

  const shape = spec.shape;
  const margin = clampMargin(shape, spec.margin);
  const group = shapeGroup(shape);
  const baseAmp =
    group === 'needle' ? 0.055
      : group === 'compound' ? 0.09
        : group === 'broad' || shape === 'flabellate' ? 0.085
          : 0.07;
  const baseSpacing =
    group === 'needle' ? 0.038
      : group === 'compound' ? 0.055
        : 0.048;

  // Pack at max density; scale leaf length by growth (tiny at 0, full at 1).
  const spacing = fontSize * Math.max(0.014, baseSpacing * 0.6);
  const amp = baseAmp * fontSize * (0.06 + grow * 1.84);

  let wantPositive = true;
  let bestAbs = 0;
  for (const c of plain) {
    const a = signedArea(c);
    if (Math.abs(a) > bestAbs) {
      bestAbs = Math.abs(a);
      wantPositive = a > 0;
    }
  }

  const R = rng(seed);
  const lamina: Contours = plain.map((c) => c.slice());

  for (let i = 0; i < plain.length; i++) {
    const c = plain[i]!;
    const area = signedArea(c);
    const isHole = (area > 0) !== wantPositive;
    const intoEmpty: 1 | -1 = isHole ? -1 : 1;
    const Rc = rng(`${seed}|vf|e${i}`);
    const { samples, length } = sampleEdge(c, Math.max(0.6, spacing * 0.35), intoEmpty);
    if (!samples.length) continue;
    paintField(samples, Rc);
    const buds = pickBuds(samples, length, spacing * (isHole ? 1.2 : 1), Rc);
    const flora = growFoliageStable(buds, {
      amp: amp * (isHole ? 0.75 : 1),
      shape,
      margin,
      wantPositive,
      R: Rc
    });
    for (const leaf of flora) lamina.push(leaf);
  }

  return lamina;
}

/** Every bud emits one leaf — no random dropout (VF topology lock). */
function growFoliageStable(
  buds: EdgeSample[],
  opts: {
    amp: number;
    shape: LeafShape;
    margin: LeafMargin;
    wantPositive: boolean;
    R: () => number;
  }
): Contours {
  const { amp, shape, margin, wantPositive, R } = opts;
  const out: Contours = [];
  if (!buds.length || amp < 1e-6) return out;

  const group = shapeGroup(shape);
  const widthScale =
    group === 'needle' ? 0.42
      : group === 'compound' ? 0.68
        : group === 'broad' ? 0.82
          : 0.68;

  for (let i = 0; i < buds.length; i++) {
    const s = buds[i]!;
    // Deterministic size from index — same for every growth master.
    const u = (i * 0.6180339887) % 1;
    const sizeMul = 0.55 + u * 0.7;
    const field = 0.45 + 0.55 * s.field;
    const len = Math.max(amp * 0.12, amp * field * 0.85 * sizeMul);
    const lean = (u - 0.5) * 1.1 + (s.field - 0.5) * 0.4;
    const dir = rotate2(s.nx, s.ny, lean);
    const sink = len * 0.18;
    const ox = s.x - s.nx * sink;
    const oy = s.y - s.ny * sink;
    // Burn R draws so stamp RNG stays aligned across masters.
    const Rr = rng(`vf-leaf|${i}|${(R() * 1e9) | 0}`);
    const leaves = buildLaminaStamp(
      shape,
      margin,
      { x: ox, y: oy },
      len,
      widthScale * (0.75 + u * 0.35),
      dir.x,
      dir.y,
      Rr
    );
    for (const leaf of leaves) {
      if (leaf.length >= 3) out.push(matchWinding(leaf, wantPositive));
    }
  }
  return out;
}

export { leafShapeIcon, leafMarginIcon } from './leaves';
export {
  LEAF_SHAPES,
  DEFAULT_SHAPE,
  DEFAULT_MARGIN,
  marginsFor,
  clampMargin,
  isLeafShape
} from './catalog';
export type { LeafShape, LeafMargin } from './catalog';
