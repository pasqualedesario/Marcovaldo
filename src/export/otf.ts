import * as opentype from 'opentype.js';
import { charsetChars, glyphNameFor, VF_CHARSET } from '../core/charset';
import { moduleStamp, type MorphologySpec } from '../core/modules/morphology';
import { deformGlyph } from '../core/pipeline';
import type { BotanicalParams, Contours } from '../core/types';
import type { LoadedFont } from '../font/load';
import { downloadBlob, safeFilename } from '../lib/download';
import { yieldToMain } from '../lib/schedule';
import { LETTER_PTS, LEAF_PTS, otfMinArea } from './outlineDensity';
import { resampleClosed, sanitizeContours } from './pathSanitize';

/** Faster polish for fonts — stage preview keeps full Chaikin. */
const EXPORT_POLISH = { chaikinPasses: 1 } as const;

function contoursToOtPath(contours: Contours, upm: number, letterCount: number): opentype.Path {
  const path = new opentype.Path();
  const clean = sanitizeContours(contours, otfMinArea(upm));
  const maxCoord = upm * 8;

  for (let i = 0; i < clean.length; i++) {
    const ring = clean[i]!;
    const n = i < letterCount ? LETTER_PTS : LEAF_PTS;
    const pts = resampleClosed(ring, n);
    if (pts.length < 3) continue;
    if (
      pts.some(
        (p) =>
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.y) ||
          Math.abs(p.x) > maxCoord ||
          Math.abs(p.y) > maxCoord
      )
    ) {
      continue;
    }
    const first = pts[0]!;
    path.moveTo(first.x, -first.y);
    for (let k = 1; k < pts.length; k++) {
      const p = pts[k]!;
      path.lineTo(p.x, -p.y);
    }
    path.close();
  }
  return path;
}

type OtfExportProgress = { done: number; total: number; char: string };

type BuildOtfOpts = {
  fontName: string;
  font: LoadedFont;
  params: BotanicalParams;
  morph: MorphologySpec;
  offset: number;
  styleName?: string;
  charset?: string;
  onProgress?: (p: OtfExportProgress) => void;
  progressBase?: number;
  progressTotal?: number;
};

/** Build one static OTF — same morph engine as stage / VF at current growth. */
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

    const built = deformGlyph(opts.font, char, opts.params, opts.morph, opts.offset, EXPORT_POLISH);
    let advance = built?.advance ?? Math.round(upm * 0.3);
    const lamina = built?.lamina ?? [];
    const letterCount = built?.letterCount ?? 0;
    const path = lamina.length ? contoursToOtPath(lamina, upm, letterCount) : new opentype.Path();
    try {
      const bb = path.getBoundingBox();
      if (bb && Number.isFinite(bb.x2)) {
        const pad = Math.round(upm * 0.04);
        advance = Math.max(advance, Math.ceil(bb.x2 - Math.min(0, bb.x1) + pad));
      }
    } catch {
      /* empty path */
    }

    glyphs.push(
      new opentype.Glyph({
        name: glyphNameFor(char),
        unicode: char.codePointAt(0) ?? 0,
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

  patchOtNames(font, {
    fontFamily: family,
    fontSubfamily: style,
    fullName: `${family} ${style}`,
    postScriptName: psName,
    designer: 'Pasquale de Sario',
    description: `Modified Version of «${opts.fontName}»; ${moduleStamp()}; ${opts.morph.shape}/${opts.morph.margin}; growth ${opts.params.growth | 0}; seed ${opts.offset}; polygonal outlines`,
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

/** Full charset OTF: same morph as stage at current growth (static instance). */
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
