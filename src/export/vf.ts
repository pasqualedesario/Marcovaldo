import { glyphNameFor, VF_CHARSET } from '../core/charset';
import {
  applyMorphologyStable,
  moduleStamp,
  type MorphologySpec
} from '../core/modules/morphology';
import { flattenPath } from '../core/path/ops';
import type { Contour, Contours } from '../core/types';
import { textToPath, type LoadedFont } from '../font/load';
import { downloadBlob, safeFilename } from '../lib/download';
import { yieldToMain } from '../lib/schedule';
import { resampleClosed, sanitizeContours } from './pathSanitize';
import { buildGrowVariableTtf, type VfGlyph } from './ttfVf';

export { VF_CHARSET };

const LETTER_PTS = 48;
const LEAF_PTS = 20;
const FLATTEN = 8;

export type VfExportProgress = { done: number; total: number; char: string };

function charsetList(font: LoadedFont, source: string): string[] {
  const out: string[] = [];
  const seen = new Set<number>();
  for (const ch of source) {
    const cp = ch.codePointAt(0);
    if (cp == null || seen.has(cp)) continue;
    seen.add(cp);
    if (ch === ' ') {
      out.push(ch);
      continue;
    }
    const layout = textToPath(font.face, ch, font.face.unitsPerEm || 1000);
    if (!layout.commands.length) continue;
    out.push(ch);
  }
  return out;
}

function alignMastersWithLetterCount(
  minC: Contours,
  maxC: Contours,
  letterCount: number
): { min: Contour[]; max: Contour[] } {
  const n = Math.min(minC.length, maxC.length);
  const min: Contour[] = [];
  const max: Contour[] = [];
  for (let i = 0; i < n; i++) {
    const pts = i < letterCount ? LETTER_PTS : LEAF_PTS;
    const a = resampleClosed(minC[i]!, pts);
    const b = resampleClosed(maxC[i]!, pts);
    // Same start corner → stable gvar deltas (avoid rotating phase).
    const a0 = syncStart(a, b);
    min.push(a0);
    max.push(b);
  }
  return { min, max };
}

/** Rotate ring `a` so a[0] is nearest to b[0]. */
function syncStart(a: Contour, b: Contour): Contour {
  if (a.length < 3 || a.length !== b.length) return a;
  const target = b[0]!;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!;
    const d = (p.x - target.x) ** 2 + (p.y - target.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best === 0) return a;
  return a.slice(best).concat(a.slice(0, best));
}

function morphPair(
  font: LoadedFont,
  char: string,
  morph: MorphologySpec,
  offset: number
): { advance: number; letterCount: number; min: Contours; max: Contours } | null {
  const upm = font.face.unitsPerEm || 1000;
  const layout = textToPath(font.face, char, upm);
  const advance = Math.max(1, Math.round(layout.advanceUnits || upm * 0.3));
  if (char === ' ') return { advance, letterCount: 0, min: [], max: [] };
  if (!layout.commands.length) return null;

  const flat = flattenPath(layout, FLATTEN);
  if (!flat.length) return null;
  const letterCount = flat.length;
  const seed = `${moduleStamp()}|vf|${morph.shape}|${morph.margin}|${font.name}|${offset}|${char}`;

  const minRaw = applyMorphologyStable(flat, 0, upm, seed, morph);
  const maxRaw = applyMorphologyStable(flat, 1, upm, seed, morph);
  // Area filter disabled: tiny leaves at GROW=0 must stay so masters share topology.
  const min = sanitizeContours(minRaw, 0);
  const max = sanitizeContours(maxRaw, 0);
  if (!min.length || !max.length || min.length !== max.length) {
    const plain = sanitizeContours(flat, 0);
    const copy = plain.map((c) => c.map((p) => ({ ...p })));
    return { advance, letterCount: plain.length, min: plain, max: copy };
  }
  return { advance, letterCount, min, max };
}

export type GrowthVfBuildOpts = {
  basename: string;
  fontName: string;
  font: LoadedFont;
  morph: MorphologySpec;
  offset: number;
  charset?: string;
  onProgress?: (p: VfExportProgress) => void;
};

/** Build single GROW variable TrueType (.ttf) bytes — shape/margin fixed, growth 0→100. */
export async function buildGrowthVf(opts: GrowthVfBuildOpts): Promise<{
  filename: string;
  buffer: ArrayBuffer;
}> {
  const chars = charsetList(opts.font, opts.charset ?? VF_CHARSET);
  const total = chars.length;
  const upm = opts.font.face.unitsPerEm || 1000;
  const ascender = Math.round(opts.font.face.ascent || upm * 0.8);
  const descender = Math.round(opts.font.face.descent || -upm * 0.2);
  const vfGlyphs: VfGlyph[] = [];

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]!;
    opts.onProgress?.({ done: i, total, char });

    const pair = morphPair(opts.font, char, opts.morph, opts.offset);
    if (!pair) continue;

    const aligned = alignMastersWithLetterCount(pair.min, pair.max, pair.letterCount);
    const flip = (rings: Contour[]): Contour[] =>
      rings.map((ring) => ring.map((p) => ({ x: p.x, y: -p.y })));

    vfGlyphs.push({
      name: glyphNameFor(char),
      unicode: char.codePointAt(0) ?? 0,
      advance: pair.advance,
      min: flip(aligned.min),
      max: flip(aligned.max)
    });

    if (i % 3 === 2) await yieldToMain();
  }

  opts.onProgress?.({ done: total, total, char: '' });

  const family = `Marcovaldo ${opts.fontName}`.trim();
  const style = `${opts.morph.shape}-${opts.morph.margin}`;
  const ps = `Marcovaldo-${opts.morph.shape}-GROW`.replace(/[^A-Za-z0-9-]/g, '');
  const buffer = buildGrowVariableTtf({
    familyName: family,
    styleName: style,
    postScriptName: ps,
    unitsPerEm: upm,
    ascender,
    descender,
    glyphs: vfGlyphs,
    description: `Modified Version of «${opts.fontName}»; ${moduleStamp()}; ${opts.morph.shape}/${opts.morph.margin}; GROW 0–100; seed ${opts.offset}`
  });

  const stem = safeFilename(
    `${opts.basename || 'Marcovaldo'}-${opts.morph.shape}-${opts.morph.margin}-GROW`
  );
  return { filename: `${stem}.ttf`, buffer };
}

/** Download a single GROW variable TrueType (.ttf). */
export async function exportGrowthVf(opts: GrowthVfBuildOpts): Promise<void> {
  const { filename, buffer } = await buildGrowthVf(opts);
  downloadBlob(filename, new Blob([new Uint8Array(buffer)], { type: 'font/ttf' }));
}
