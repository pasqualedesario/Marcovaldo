import * as opentype from 'opentype.js';
import { charsetChars, glyphNameFor, OTF_CHARSET } from '../core/charset';
import { moduleStamp, type MorphologySpec } from '../core/modules/morphology';
import { deformGlyph } from '../core/pipeline';
import { prepareOutlineCurves, type CubicSeg } from '../core/path/curves';
import type { BotanicalParams, Contours } from '../core/types';
import type { LoadedFont } from '../font/load';
import { downloadBlob, safeFilename } from '../lib/download';
import { yieldToMain } from '../lib/schedule';

function contoursToOtPath(contours: Contours, upm: number): opentype.Path {
  const path = new opentype.Path();
  const unit = upm / 1000;
  const rings = prepareOutlineCurves(contours, {
    simplify: 1.1 * unit,
    fitError: 1.4 * unit,
    minArea: 10 * unit * unit
  });

  for (const segs of rings) {
    if (!segs.length) continue;
    const first = segs[0]!;
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
  const face = opts.font.face;
  const upm = face.unitsPerEm || 1000;
  const ascender = Math.round(face.ascent || upm * 0.8);
  const descender = Math.round(face.descent || -upm * 0.2);
  const chars = charsetChars(opts.charset ?? OTF_CHARSET);
  const total = chars.length;

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
    opts.onProgress?.({ done: i, total, char });

    const built = deformGlyph(opts.font, char, opts.params, opts.morph, opts.offset);
    const advance = built?.advance ?? Math.round(upm * 0.3);
    const lamina = built?.lamina ?? [];
    const path = lamina.length ? contoursToOtPath(lamina, upm) : new opentype.Path();

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

  opts.onProgress?.({ done: total, total, char: '' });

  const family = `Marcovaldo ${opts.fontName}`.trim();
  const style = `${opts.morph.shape}-${opts.morph.margin}`;
  const font = new opentype.Font({
    familyName: family,
    styleName: style,
    unitsPerEm: upm,
    ascender,
    descender,
    glyphs
  });

  try {
    (font as unknown as { names: Record<string, Record<string, string>> }).names = {
      fontFamily: { en: family },
      fontSubfamily: { en: style },
      fullName: { en: `${family} ${style}` },
      postScriptName: { en: `Marcovaldo-${opts.morph.shape}` },
      designer: { en: 'Pasquale de Sario' },
      description: {
        en: `Modified Version of «${opts.fontName}»; ${moduleStamp()}; ${opts.morph.shape}/${opts.morph.margin}; seed ${opts.offset}; cubic outlines`
      },
      license: { en: 'MIT License — Copyright (c) 2026 Pasquale de Sario' },
      licenseURL: { en: 'https://opensource.org/licenses/MIT' }
    };
  } catch { /* opentype version differences */ }

  const buffer = font.toArrayBuffer();
  downloadBlob(
    `${safeFilename(opts.basename || family)}.otf`,
    new Blob([new Uint8Array(buffer)], { type: 'font/otf' })
  );
}
