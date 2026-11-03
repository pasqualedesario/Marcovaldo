/**
 * Build public/og.svg + og.png (1200×630) and apple-touch-icon.png (512×512).
 * Run: npm run og
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { contoursToSvgD } from '../src/core/path/ops';
import { buildOpenSpecimen } from '../src/core/pipeline';
import { loadFontFromBuffer } from '../src/font/load';
import { PT_TO_PX } from '../src/lib/math';
import { COLOR_DARK, COLOR_LIGHT } from '../src/lib/palette';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEXT = 'Marcovaldo';
/** Stable “random” look for the committed preview asset. */
const OFFSET = 7;
const SIZE_PT = 96;

function frameSvg(
  width: number,
  height: number,
  d: string,
  glyphW: number,
  glyphH: number,
  pad: number
): string {
  const s = Math.min((width * (1 - pad * 2)) / glyphW, (height * (1 - pad * 2)) / glyphH);
  const tx = (width - glyphW * s) / 2;
  const ty = (height - glyphH * s) / 2;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
<!-- Marcovaldo preview · offset ${OFFSET} · ovate/serrate -->
<rect width="100%" height="100%" fill="${COLOR_DARK}"/>
<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(6)})">
<path fill="${COLOR_LIGHT}" fill-rule="nonzero" d="${d}"/>
</g>
</svg>
`;
}

function writePng(svg: string, outPath: string, width: number): void {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    background: COLOR_DARK
  });
  writeFileSync(outPath, resvg.render().asPng());
  console.log('wrote', outPath);
}

async function main(): Promise<void> {
  const otf = readFileSync(join(root, 'public/fonts/FOSS-Modern/FOSS-Modern-Bold.otf'));
  const font = await loadFontFromBuffer(
    otf.buffer.slice(otf.byteOffset, otf.byteOffset + otf.byteLength),
    'FOSS Modern'
  );

  const result = buildOpenSpecimen({
    font,
    text: TEXT,
    params: { growth: 78, scale: 88, tracking: 50 },
    morph: { shape: 'ovate', margin: 'serrate' },
    offset: OFFSET,
    sizePx: SIZE_PT * PT_TO_PX,
    caret: false
  });
  if (!result?.lamina.length) throw new Error('og render failed');

  const d = contoursToSvgD(result.lamina);
  const ogSvg = frameSvg(1200, 630, d, result.width, result.height, 0.14);
  const iconSvg = frameSvg(512, 512, d, result.width, result.height, 0.12);

  const ogSvgPath = join(root, 'public/og.svg');
  writeFileSync(ogSvgPath, ogSvg, 'utf8');
  console.log('wrote', ogSvgPath);

  writePng(ogSvg, join(root, 'public/og.png'), 1200);
  writePng(iconSvg, join(root, 'public/apple-touch-icon.png'), 512);
  writePng(iconSvg, join(root, 'public/favicon.png'), 192);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
