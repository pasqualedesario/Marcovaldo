import * as opentype from 'opentype.js';
import { charsetChars, glyphNameFor, VF_CHARSET } from '../core/charset';
import { moduleStamp, type MorphologySpec } from '../core/modules/morphology';
import { deformGlyph } from '../core/pipeline';
import { prepareOutlineCurves, type CubicSeg } from '../core/path/curves';
import type { BotanicalParams, Contours } from '../core/types';
import type { LoadedFont } from '../font/load';
import { downloadBlob, safeFilename } from '../lib/download';
import { yieldToMain } from '../lib/schedule';
import { sanitizeContours } from './pathSanitize';

function contoursToOtPath(contours: Contours, upm: number): opentype.Path {
  const path = new opentype.Path();
  const unit = upm / 1000;
  const clean = sanitizeContours(contours, 10 * unit * unit);
  const rings = prepareOutlineCurves(clean, {
    simplify: 1.25 * unit,
    fitError: 1.6 * unit,
    minArea: 12 * unit * unit
  });

  for (const segs of rings) {
    if (!segs.length) continue;
    const first = segs[0]!;
    // Reject explosive control points (spider lines in Font Book).
    let bad = false;
    for (const s of segs) {
      for (const p of [s.p0, s.c1, s.c2, s.p1]) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 30000 || Math.abs(p.y) > 30000) {
          bad = true;
          break;
        }
      }
      if (bad) break;
    }
    if (bad) continue;
    path.moveTo(first.p0.x, -first.p0.y);
    for (const s of segs) emitCubic(path, s);
    path.close();
  }
  return path;
}

function emitCubic(path: opentype.Path, s: CubicSeg): void {
  path.curveTo(s.c1.x, -s.c1.y, s.c2.x, -s.c2.y, s.p1.x, -s.p1.y);
}

export type OtfExportProgress = { done: number; total: number; char: string };

export type BuildOtfOpts = {
  fontName: string;
  font: LoadedFont;
  params: BotanicalParams;
  morph: MorphologySpec;
  offset: number;
  /** Style / instance name (e.g. shape-margin or GROW 50). */
  styleName?: string;
  charset?: string;
  onProgress?: (p: OtfExportProgress) => void;
  /** Progress offset when building several masters. */
  progressBase?: number;
  progressTotal?: number;
};

/** Build one static OTF buffer (shape/margin/growth frozen). */
export async function buildOtfBuffer(opts: BuildOtfOpts): Promise<ArrayBuffer> {
  const face = opts.font.face;
  const upm = face.unitsPerEm || 1000;
  const ascender = Math.round(face.ascent || upm * 0.8);
  const descender = Math.round(face.descent || -upm * 0.2);
  const chars = charsetChars(opts.charset ?? VF_CHARSET);
  const total = opts.progressTotal ?? chars.length;
  const base = opts.progressBase ?? 0;

  const glyphs: opentype.Glyph[] = [
    new opentype.Glyph({
      name: '.notdef',
      unicode: 0,
      advanceWidth: Math.round(upm / 2),
      path: new opentype.Path()
    })
  ];

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]!;
    opts.onProgress?.({ done: base + i, total, char });

    const built = deformGlyph(opts.font, char, opts.params, opts.morph, opts.offset);
    let advance = built?.advance ?? Math.round(upm * 0.3);
    const lamina = built?.lamina ?? [];
    const path = lamina.length ? contoursToOtPath(lamina, upm) : new opentype.Path();
    try {
      const bb = path.getBoundingBox();
      if (bb && Number.isFinite(bb.x2)) {
        const pad = Math.round(upm * 0.04);
        advance = Math.max(advance, Math.ceil(bb.x2 - Math.min(0, bb.x1) + pad));
      }
    } catch { /* empty path */ }

    const cp = char.codePointAt(0) ?? 0;
    glyphs.push(
      new opentype.Glyph({
        name: glyphNameFor(char),
        unicode: cp,
        advanceWidth: advance,
        path
      })
    );

    if (i % 4 === 3) await yieldToMain();
  }

  const family = `Marcovaldo ${opts.fontName}`.trim();
  const style =
    opts.styleName ?? `${opts.morph.shape}-${opts.morph.margin}-GROW${opts.params.growth | 0}`;
  const psName = `Marcovaldo-${opts.morph.shape}-GROW${opts.params.growth | 0}`.replace(
    /[^A-Za-z0-9-]/g,
    ''
  );
  const font = new opentype.Font({
    familyName: family,
    styleName: style,
    unitsPerEm: upm,
    ascender,
    descender,
    glyphs
  });

  // opentype.js stores names under unicode/macintosh/windows — never replace `names` wholesale.
  patchOtNames(font, {
    fontFamily: family,
    fontSubfamily: style,
    fullName: `${family} ${style}`,
    postScriptName: psName,
    designer: 'Pasquale de Sario',
    description: `Modified Version of «${opts.fontName}»; ${moduleStamp()}; ${opts.morph.shape}/${opts.morph.margin}; growth ${opts.params.growth | 0}; seed ${opts.offset}; cubic outlines`,
    license: 'MIT License — Copyright (c) 2026 Pasquale de Sario',
    licenseURL: 'https://opensource.org/licenses/MIT'
  });

  return font.toArrayBuffer();
}

type OtNameTable = Record<string, Record<string, Record<string, string>>>;

function patchOtNames(font: opentype.Font, fields: Record<string, string>): void {
  const names = (font as unknown as { names?: OtNameTable }).names;
  if (!names) return;
  for (const platform of Object.keys(names)) {
    const bucket = names[platform];
    if (!bucket) continue;
    for (const [key, value] of Object.entries(fields)) {
      bucket[key] = { en: value };
    }
  }
}

/** Full charset OTF: deformed lamina (monochrome static instance). */
export async function exportOtf(opts: {
  basename: string;
  fontName: string;
  font: LoadedFont;
  params: BotanicalParams;
  morph: MorphologySpec;
  offset: number;
  charset?: string;
  onProgress?: (p: OtfExportProgress) => void;
}): Promise<void> {
  const buffer = await buildOtfBuffer(opts);
  const family = `Marcovaldo ${opts.fontName}`.trim();
  downloadBlob(
    `${safeFilename(opts.basename || family)}.otf`,
    new Blob([new Uint8Array(buffer)], { type: 'font/otf' })
  );
}
