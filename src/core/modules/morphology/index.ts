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
/** Topology-stable: same buds/leaves at every growth; only amplitude changes (VF-safe). */
const MODULE_VERSION = '3.3.0';

export function moduleStamp(): string {
  return `${MODULE_ID}@${MODULE_VERSION}`;
}

/**
 * Growth UI 0…1 → amplitude 0…1.
 * Four thresholds (0 / 25 / 50 / 75 / 100): slow early cover, full burial unchanged at 1.
 * Smooth within each quarter so the slider doesn’t stair-step.
 * Also used to build `avar` so VF user coords track this curve.
 */
export function growthCurve01(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  const xs = [0, 0.25, 0.5, 0.75, 1] as const;
  // Fractions of max amp — keep ys[4] === 1 so growth 100 matches current look.
  const ys = [0, 0.1, 0.26, 0.55, 1] as const;
  let i = 0;
  while (i < xs.length - 2 && x > xs[i + 1]!) i++;
  const x0 = xs[i]!;
  const x1 = xs[i + 1]!;
  const y0 = ys[i]!;
  const y1 = ys[i + 1]!;
  const u = x1 <= x0 ? 1 : (x - x0) / (x1 - x0);
  return y0 + (y1 - y0) * ss(0, 1, u);
}

export type MorphOpts = {
  /** Chaikin polish passes per leaf (preview default 2; export often 0–1). */
  chaikinPasses?: number;
};

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
 * Every bud emits one leaf — no random dropout (topology lock for preview = OTF = VF).
 * Size/lean from index only so masters at GROW 0 and 100 share contour counts.
 */
function growFoliage(
  buds: EdgeSample[],
  opts: {
    amp: number;
    shape: LeafShape;
    margin: LeafMargin;
    wantPositive: boolean;
    R: () => number;
    chaikinPasses: number;
  }
): Contours {
  const { amp, shape, margin, wantPositive, R, chaikinPasses } = opts;
  const out: Contours = [];
  if (!buds.length || amp < 1e-6) return out;

  const group = shapeGroup(shape);
  // Keep visual mass similar across silhouettes (needles were too thin; broad too fat).
  const widthScale =
    group === 'needle' ? 0.72
      : group === 'compound' ? 0.78
        : group === 'broad' || group === 'flabellate' ? 0.84
          : 0.8;
  // Compound leaflets are individually smaller — bump stem length so coverage matches.
  const groupLen = group === 'compound' ? 1.18 : group === 'needle' ? 1.08 : 1;

  for (let i = 0; i < buds.length; i++) {
    const s = buds[i]!;
    const u = (i * 0.6180339887) % 1;
    // Tighter size band so growth reads evenly along the outline.
    const sizeMul = 0.82 + u * 0.36;
    const field = 0.62 + 0.38 * s.field;
    const len = Math.max(amp * 0.22, amp * field * 0.92 * sizeMul) * groupLen;
    const lean = (u - 0.5) * 0.95 + (s.field - 0.5) * 0.35;
    const dir = rotate2(s.nx, s.ny, lean);
    const sink = len * 0.18;
    const ox = s.x - s.nx * sink;
    const oy = s.y - s.ny * sink;
    // Burn R so stamp RNG stays aligned across growth masters.
    const Rr = rng(`leaf|${i}|${(R() * 1e9) | 0}`);
    const leaves = buildLaminaStamp(
      shape,
      margin,
      { x: ox, y: oy },
      len,
      widthScale * (0.88 + u * 0.22),
      dir.x,
      dir.y,
      Rr,
      chaikinPasses
    );
    for (const leaf of leaves) {
      if (leaf.length >= 3) out.push(matchWinding(leaf, wantPositive));
    }
  }
  return out;
}

/**
 * Single morphology for stage, OTF, and VF masters (Primavera contract).
 * Fixed bud sites; only leaf amplitude follows growth (0 = tiny, 1 = full).
 * `seed` must NOT include growth — otherwise masters diverge.
 */
export function applyMorphology(
  contours: Contours,
  params: BotanicalParams,
  fontSize: number,
  seed: string,
  spec: MorphologySpec,
  opts?: MorphOpts
): Contours {
  return morphAtGrowth(
    contours,
    growthCurve01(params.growth * 0.01),
    fontSize,
    seed,
    spec,
    opts
  );
}

function morphAtGrowth(
  contours: Contours,
  grow: number,
  fontSize: number,
  seed: string,
  spec: MorphologySpec,
  opts?: MorphOpts
): Contours {
  const chaikinPasses = opts?.chaikinPasses ?? 2;
  const plain: Contours = [];
  for (const c of contours) {
    if (c.length >= 3) plain.push(c.slice());
  }
  if (!plain.length) return plain;

  const shape = spec.shape;
  const margin = clampMargin(shape, spec.margin);
  // One amplitude + spacing for every shape — growth 100 should bury the letter equally.
  const baseAmp = 0.125;
  const baseSpacing = 0.04;

  // Pack at max density (growth does not add/remove buds); scale leaf length.
  // At grow=1 amp ≈ 0.53×em → leaves ~0.3×em, letterform no longer readable.
  const spacing = fontSize * Math.max(0.016, baseSpacing * 0.82);
  const amp = baseAmp * fontSize * (0.05 + grow * 4.2);

  let wantPositive = true;
  let bestAbs = 0;
  for (const c of plain) {
    const a = signedArea(c);
    if (Math.abs(a) > bestAbs) {
      bestAbs = Math.abs(a);
      wantPositive = a > 0;
    }
  }

  const lamina: Contours = plain.map((c) => c.slice());

  for (let i = 0; i < plain.length; i++) {
    const c = plain[i]!;
    const area = signedArea(c);
    const isHole = (area > 0) !== wantPositive;
    const intoEmpty: 1 | -1 = isHole ? -1 : 1;
    const Rc = rng(`${seed}|e${i}`);
    const { samples, length } = sampleEdge(c, Math.max(0.6, spacing * 0.35), intoEmpty);
    if (!samples.length) continue;
    paintField(samples, Rc);
    const buds = pickBuds(samples, length, spacing * (isHole ? 1.2 : 1), Rc);
    const flora = growFoliage(buds, {
      amp: amp * (isHole ? 0.75 : 1),
      shape,
      margin,
      wantPositive,
      R: Rc,
      chaikinPasses
    });
    for (const leaf of flora) lamina.push(leaf);
  }

  return lamina;
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
