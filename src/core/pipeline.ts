import type { BotanicalParams, Contours, FitResult } from './types';
import { boundsOf, countPoints, flattenPath, transformContours } from './path/ops';
import {
  applyMorphology,
  moduleStamp,
  type MorphologySpec,
  type MorphOpts
} from './modules/morphology';
import { textToPath, type LoadedFont, type TextLayout } from '../font/load';
import { cacheGet, cacheSet } from './deformCache';
import { PT_TO_PX, trackingEm } from '../lib/math';
import { FLATTEN as FLATTEN_STEPS } from '../export/outlineDensity';

export type SpecimenInput = {
  font: LoadedFont;
  text: string;
  params: BotanicalParams;
  morph: MorphologySpec;
  offset: number;
  width: number;
  height: number;
};

const MIN_SIZE_PT = 5;
/** Absolute ceiling — may overflow the stage (clipped by viewport). */
const MAX_SIZE_PT = 500;
const SPECIMEN_LEADING = 1.1;
/**
 * Open-specimen supersample target (CSS px). Cap quality — uncapped
 * OPEN_QUALITY/size made 8pt lines morph at ~9× and dominated gallery cost.
 */
const OPEN_QUALITY_PX = 48;
const OPEN_QUALITY_MAX = 1.5;
/** Stage polish (desktop). Gallery open-specimens use OPEN_CHAIKIN. */
const PREVIEW_CHAIKIN = 2;
const OPEN_CHAIKIN = 1;
/** Lowered on mobile via `setMobilePreview(true)`. */
let stageChaikin = PREVIEW_CHAIKIN;

/** Call once at boot — lighter stage morph on phones. */
export function setMobilePreview(mobile: boolean): void {
  stageChaikin = mobile ? OPEN_CHAIKIN : PREVIEW_CHAIKIN;
}

export function specimenFontSize(scale: number): number {
  const minPx = MIN_SIZE_PT * PT_TO_PX;
  const maxPx = MAX_SIZE_PT * PT_TO_PX;
  const t = Math.min(100, Math.max(0, scale)) / 100;
  return minPx + (maxPx - minPx) * t;
}

/** Quantize growth for cache / paint fingerprints. */
function growthKey(growth: number): string {
  return String(growth | 0);
}

function morphKey(morph: MorphologySpec): string {
  return `${morph.shape}|${morph.margin}`;
}

/** Shared fingerprint for brand + specimen paint caches. */
export function paintFingerprint(parts: {
  fontName: string;
  morph: MorphologySpec;
  offset: number;
  growth: number;
  text: string;
  size: number | string;
  extra?: string;
}): string {
  return [
    parts.fontName,
    morphKey(parts.morph),
    parts.offset,
    growthKey(parts.growth),
    parts.text,
    parts.size,
    parts.extra ?? ''
  ].join('|');
}

/**
 * Deform any string at `fontSize` (canvas Y-down). Shared by stage + OTF charset.
 * Cache key uses growth + layout advance (tracking) — scale is already in fontSize.
 */
function deformText(
  font: LoadedFont,
  text: string,
  params: BotanicalParams,
  morph: MorphologySpec,
  offset: number,
  fontSize: number,
  layout?: TextLayout,
  morphOpts?: MorphOpts,
  flatPre?: Contours
): Contours | null {
  const raw = layout ?? textToPath(font.face, text, fontSize);
  if (!raw.commands.length) return null;

  // Morph RNG seed must omit growth — buds/topology stay fixed; amp follows params.growth.
  const morphSeed = [
    moduleStamp(),
    morphKey(morph),
    font.name,
    offset,
    text,
    fontSize.toFixed(2),
    raw.advanceUnits.toFixed(2)
  ].join('|');
  const polish = morphOpts?.chaikinPasses ?? PREVIEW_CHAIKIN;
  const cacheSeed = `${morphSeed}|g${growthKey(params.growth)}|c${polish}`;
  const cached = cacheGet(cacheSeed);
  if (cached) return cached;

  const flat = flatPre ?? flattenPath(raw, FLATTEN_STEPS);
  if (!flat.length) return null;
  const deformed = applyMorphology(flat, params, fontSize, morphSeed, morph, {
    ...morphOpts,
    chaikinPasses: polish
  });
  cacheSet(cacheSeed, deformed);
  return deformed;
}

export function deformGlyph(
  font: LoadedFont,
  char: string,
  params: BotanicalParams,
  morph: MorphologySpec,
  offset: number,
  morphOpts?: MorphOpts
): { lamina: Contours; advance: number; letterCount: number } | null {
  const upm = font.face.unitsPerEm || 1000;
  const layout = textToPath(font.face, char, upm);
  const advance = Math.max(1, Math.round(layout.advanceUnits || upm * 0.3));
  if (char === ' ' || !layout.commands.length) return { lamina: [], advance, letterCount: 0 };

  const flat = flattenPath(layout, FLATTEN_STEPS);
  const letterCount = flat.length;
  const lamina = deformText(font, char, params, morph, offset, upm, layout, morphOpts, flat);
  if (!lamina?.length) return { lamina: [], advance, letterCount };
  return { lamina, advance, letterCount };
}

function mapStops(raw: readonly number[], x0: number, width: number): number[] {
  const total = Math.max(1e-6, raw[raw.length - 1] ?? 1);
  return raw.map((x) => x0 + (x / total) * width);
}

/** Reuse glyph layout across growth-only frames (play scrub). */
let stageLayoutKey = '';
let stageLayout: TextLayout | null = null;

/** Stage preview: deform once, then affine-fit. */
export function buildSpecimen(input: SpecimenInput): FitResult | null {
  const { font, text, params, morph, offset, width: W, height: H } = input;
  if (!text) return null;

  const fontSize = specimenFontSize(params.scale);
  const layoutKey = `${font.name}|${text}|${fontSize.toFixed(2)}|${params.tracking}|${params.scale}`;
  let layout: TextLayout;
  if (layoutKey === stageLayoutKey && stageLayout) {
    layout = stageLayout;
  } else {
    layout = textToPath(font.face, text, fontSize, trackingEm(params.tracking));
    stageLayoutKey = layoutKey;
    stageLayout = layout;
  }

  const deformed = deformText(font, text, params, morph, offset, fontSize, layout, {
    chaikinPasses: stageChaikin
  });
  if (!deformed?.length) return null;

  const b = boundsOf(deformed);
  const bw = Math.max(1, b.x2 - b.x1);
  const bh = Math.max(1, b.y2 - b.y1);
  const pad = Math.min(W, H) * 0.08;
  const s = Math.min((W - pad * 2) / bw, (H - pad * 2) / bh, 1);
  const tx = (W - bw * s) * 0.5 - b.x1 * s;
  const ty = (H - bh * s) * 0.5 - b.y1 * s;
  const fitted = transformContours(deformed, s, tx, ty);
  const gap = Math.max(6, fontSize * s * 0.045);
  const caretStops = mapStops(layout.caretStops, b.x1 * s + tx, bw * s);

  return {
    lamina: fitted,
    fontSize: fontSize * s,
    caret: {
      x: caretStops[text.length] ?? (b.x1 * s + tx + bw * s + gap),
      y: b.y1 * s + ty,
      h: bh * s
    },
    caretStops,
    pointCount: countPoints(fitted)
  };
}

function lineBox(face: LoadedFont['face'], fontSize: number): { height: number; baseline: number } {
  const upm = face.unitsPerEm || 1000;
  const ascent = (face.ascent / upm) * fontSize;
  const descent = (Math.abs(face.descent) / upm) * fontSize;
  const height = fontSize * SPECIMEN_LEADING;
  return { height, baseline: (height - ascent - descent) / 2 + ascent };
}

export type OpenSpecimen = {
  lamina: Contours;
  width: number;
  height: number;
  displayWidth: number;
  displayHeight: number;
  caret: { y: number; h: number };
  caretStops: number[];
};

export function buildOpenSpecimen(input: {
  font: LoadedFont;
  text: string;
  params: BotanicalParams;
  morph: MorphologySpec;
  offset: number;
  sizePx: number;
  caret?: boolean;
}): OpenSpecimen | null {
  const { font, text, params, morph, offset, sizePx } = input;
  const wantCaret = input.caret !== false;
  if (sizePx <= 0) return null;

  const quality = Math.min(OPEN_QUALITY_MAX, Math.max(1, OPEN_QUALITY_PX / sizePx));
  const fontSize = sizePx * quality;
  const { height: lineH, baseline } = lineBox(font.face, fontSize);
  const padX = fontSize * 0.08;

  if (!text) {
    const height = Math.max(1, Math.ceil(lineH));
    const width = Math.max(1, Math.ceil(fontSize * 0.35 + padX * 2));
    return {
      lamina: [],
      width,
      height,
      displayWidth: width / quality,
      displayHeight: height / quality,
      caret: { y: 0, h: height },
      caretStops: wantCaret ? [padX] : []
    };
  }

  const layout = textToPath(font.face, text, fontSize);
  const deformed = deformText(font, text, params, morph, offset, fontSize, layout, {
    chaikinPasses: OPEN_CHAIKIN
  });
  if (!deformed?.length) return null;

  const b = boundsOf(deformed);
  const bw = Math.max(1, b.x2 - b.x1);
  const padY = fontSize * 0.08;
  // Keep metrics baseline, then grow the line box so morphology stays inside.
  const y1 = b.y1 + baseline;
  const y2 = b.y2 + baseline;
  const top = Math.min(0, y1 - padY);
  const bottom = Math.max(lineH, y2 + padY);
  const height = Math.max(1, Math.ceil(bottom - top));
  const width = Math.max(1, Math.ceil(bw + padX * 2));
  const fitted = transformContours(deformed, 1, padX - b.x1, baseline - top);
  return {
    lamina: fitted,
    width,
    height,
    displayWidth: width / quality,
    displayHeight: height / quality,
    caret: { y: -top, h: lineH },
    caretStops: wantCaret ? mapStops(layout.caretStops, padX, bw) : []
  };
}
