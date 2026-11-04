/**
 * Build share/preview assets:
 * - public/og.png (1200×630) — generator-style frame, "Marcovaldo" + random morph
 * - public/favicon.png / apple-touch-icon.png — single morphed "M" in accent orange
 *
 * Run: npm run og
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import {
  LEAF_SHAPES,
  clampMargin,
  marginsFor,
  type LeafMargin,
  type LeafShape
} from '../src/core/modules/morphology/catalog';
import { contoursToSvgD } from '../src/core/path/ops';
import { buildOpenSpecimen } from '../src/core/pipeline';
import { loadFontFromBuffer } from '../src/font/load';
import { PT_TO_PX } from '../src/lib/math';
import { COLOR_ACCENT, COLOR_DARK, COLOR_LIGHT } from '../src/lib/palette';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const OG_W = 1200;
const OG_H = 630;
const ICON = 512;
const FAV = 192;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomMorph(): { shape: LeafShape; margin: LeafMargin; offset: number; growth: number } {
  const shape = pick(LEAF_SHAPES);
  const margin = clampMargin(shape, pick(marginsFor(shape)));
  return {
    shape,
    margin,
    offset: Math.floor(Math.random() * 10_000),
    growth: 55 + Math.floor(Math.random() * 40) // 55–94: visibly grown
  };
}

function writePng(svg: string, outPath: string, width: number, background?: string): void {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    ...(background ? { background } : {})
  });
  writeFileSync(outPath, resvg.render().asPng());
  console.log('wrote', outPath);
}

/** Fit lamina into a box; returns transform + path d. */
function fitPath(
  d: string,
  glyphW: number,
  glyphH: number,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  pad = 0.08
): { transform: string; d: string } {
  const s = Math.min((boxW * (1 - pad * 2)) / Math.max(1, glyphW), (boxH * (1 - pad * 2)) / Math.max(1, glyphH));
  const tx = boxX + (boxW - glyphW * s) / 2;
  const ty = boxY + (boxH - glyphH * s) / 2;
  return {
    transform: `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(6)})`,
    d
  };
}

function chip(
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  opts: { active?: boolean; accent?: boolean } = {}
): string {
  const fill = opts.accent ? COLOR_ACCENT : opts.active ? COLOR_LIGHT : 'transparent';
  const stroke = opts.active || opts.accent ? 'none' : COLOR_LIGHT;
  const ink = opts.accent || opts.active ? COLOR_DARK : COLOR_LIGHT;
  const sw = opts.active || opts.accent ? 0 : 1.5;
  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>
    <text x="${x + w / 2}" y="${y + h / 2 + 1}" text-anchor="middle" dominant-baseline="middle"
      font-family="'FOSS Modern', ui-sans-serif, system-ui, sans-serif" font-weight="700" font-size="13" fill="${ink}">${label}</text>
  </g>`;
}

function field(x: number, y: number, w: number, h: number, label: string, val: string): string {
  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${COLOR_LIGHT}"/>
    <text x="${x + 10}" y="${y + h / 2 + 1}" dominant-baseline="middle"
      font-family="'FOSS Modern', ui-sans-serif, system-ui, sans-serif" font-weight="700" font-size="12" fill="${COLOR_DARK}">${label}</text>
    <text x="${x + w - 10}" y="${y + h / 2 + 1}" text-anchor="end" dominant-baseline="middle"
      font-family="'FOSS Modern', ui-sans-serif, system-ui, sans-serif" font-weight="700" font-size="12" fill="${COLOR_DARK}">${val}</text>
  </g>`;
}

function slider(x: number, y: number, w: number, t01: number): string {
  const kx = x + Math.max(0, Math.min(1, t01)) * w;
  return `
  <g>
    <rect x="${x}" y="${y - 1}" width="${w}" height="2" fill="${COLOR_LIGHT}" opacity="0.35" rx="1"/>
    <circle cx="${kx.toFixed(1)}" cy="${y}" r="7" fill="${COLOR_LIGHT}"/>
  </g>`;
}

async function main(): Promise<void> {
  const morph = randomMorph();
  // Favicon: high GROW + distinctive fan leaf (flabellate / undulate).
  const favMorph = {
    shape: 'flabellate' as LeafShape,
    margin: clampMargin('flabellate', 'undulate'),
    offset: 2406,
    growth: 96
  };
  console.log('og morph', morph);
  console.log('favicon morph', favMorph);

  const otf = readFileSync(join(root, 'public/fonts/FOSS-Modern/FOSS-Modern-Bold.otf'));
  const font = await loadFontFromBuffer(
    otf.buffer.slice(otf.byteOffset, otf.byteOffset + otf.byteLength),
    'FOSS Modern'
  );

  const params = { growth: morph.growth, scale: 88, tracking: 50 };
  const morphSpec = { shape: morph.shape, margin: morph.margin };

  const word = buildOpenSpecimen({
    font,
    text: 'Marcovaldo',
    params,
    morph: morphSpec,
    offset: morph.offset,
    sizePx: 96 * PT_TO_PX,
    caret: false
  });
  if (!word?.lamina.length) throw new Error('og word render failed');

  const letter = buildOpenSpecimen({
    font,
    text: 'M',
    params: { growth: favMorph.growth, scale: 88, tracking: 50 },
    morph: { shape: favMorph.shape, margin: favMorph.margin },
    offset: favMorph.offset,
    sizePx: 168 * PT_TO_PX,
    caret: false
  });
  if (!letter?.lamina.length) throw new Error('favicon M render failed');

  const wordD = contoursToSvgD(word.lamina);
  const letterD = contoursToSvgD(letter.lamina);

  // —— OG: generator screenshot mock ——
  const pad = 28;
  const topH = 48;
  const dockH = 88;
  const stageX = pad;
  const stageY = pad + topH + 12;
  const stageW = OG_W - pad * 2;
  const stageH = OG_H - stageY - dockH - pad;
  const fitted = fitPath(wordD, word.width, word.height, stageX, stageY, stageW, stageH, 0.1);

  const chipH = 36;
  const topY = pad;
  const dockY = OG_H - pad - dockH + 8;

  const ogSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${OG_W} ${OG_H}" width="${OG_W}" height="${OG_H}">
<!-- Marcovaldo generator preview · ${morph.shape}/${morph.margin} · offset ${morph.offset} · growth ${morph.growth} -->
<rect width="100%" height="100%" fill="${COLOR_DARK}"/>

<!-- topbar -->
${chip(pad, topY, 56, chipH, 'Sans', { active: true })}
${chip(pad + 64, topY, 56, chipH, 'Serif', { active: false })}
<text x="${OG_W / 2}" y="${topY + chipH / 2 + 1}" text-anchor="middle" dominant-baseline="middle"
  font-family="'FOSS Modern', ui-sans-serif, system-ui, sans-serif" font-weight="700" font-size="18" fill="${COLOR_LIGHT}">Marcovaldo</text>
${field(OG_W - pad - 280, topY, 130, chipH, 'Scala', '88')}
${field(OG_W - pad - 140, topY, 140, chipH, 'Tracking', '0.00')}

<!-- stage specimen -->
<g transform="${fitted.transform}">
  <path fill="${COLOR_LIGHT}" fill-rule="nonzero" d="${fitted.d}"/>
</g>

<!-- dock -->
${chip(pad, dockY, 72, chipH, 'Random')}
${chip(pad + 80, dockY, 64, chipH, 'Forma')}
${chip(pad + 152, dockY, 78, chipH, 'Margine')}
${field(pad + 248, dockY, 160, chipH, 'Crescita', String(morph.growth))}
${slider(pad + 258, dockY + chipH + 14, 140, morph.growth / 100)}
${chip(OG_W - pad - 100, dockY, 100, chipH, 'Download')}
</svg>
`;

  writeFileSync(join(root, 'public/og.svg'), ogSvg, 'utf8');
  console.log('wrote', join(root, 'public/og.svg'));
  writePng(ogSvg, join(root, 'public/og.png'), OG_W, COLOR_DARK);

  // Favicon / apple-touch: orange M, transparent, room for fan foliage.
  const iconFitClear = fitPath(letterD, letter.width, letter.height, 0, 0, ICON, ICON, 0.06);
  const faviconSvgBody = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ICON} ${ICON}" width="${ICON}" height="${ICON}">
<!-- Marcovaldo favicon M · transparent · ${favMorph.shape}/${favMorph.margin} · GROW ${favMorph.growth} -->
<g transform="${iconFitClear.transform}">
  <path fill="${COLOR_ACCENT}" fill-rule="nonzero" d="${iconFitClear.d}"/>
</g>
</svg>
`;
  writePng(faviconSvgBody, join(root, 'public/apple-touch-icon.png'), ICON);
  writePng(faviconSvgBody, join(root, 'public/favicon.png'), FAV);

  const favSvgFit = fitPath(letterD, letter.width, letter.height, 0, 0, 32, 32, 0.05);
  const favSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<g transform="${favSvgFit.transform}">
  <path fill="${COLOR_ACCENT}" fill-rule="nonzero" d="${favSvgFit.d}"/>
</g>
</svg>
`;
  writeFileSync(join(root, 'public/favicon.svg'), favSvg, 'utf8');
  console.log('wrote', join(root, 'public/favicon.svg'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
