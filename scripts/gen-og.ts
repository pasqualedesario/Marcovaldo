/**
 * Build share/preview assets:
 * - public/og.png (2400×1260, 2×) — current chrome + "Marcovaldo" morph
 * - public/favicon.png / apple-touch-icon.png — single morphed "M" in accent orange
 *
 * Run: npm run og
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
import { PT_TO_PX, TRACKING_MAX, TRACKING_MID } from '../src/lib/math';
import { COLOR_ACCENT, COLOR_DARK, COLOR_LIGHT } from '../src/lib/palette';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_MODERN = join(root, 'public/fonts/FOSS-Modern/FOSS-Modern-Bold.otf');

/** Logical OG frame; PNG is rendered at 2×. */
const SCALE = 2;
const OG_W = 1200 * SCALE;
const OG_H = 630 * SCALE;
const ICON = 512;
const FAV = 192;

const s = (n: number) => n * SCALE;

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
    font: {
      fontFiles: [FONT_MODERN],
      loadSystemFonts: true,
      defaultFontFamily: 'FOSS Modern'
    },
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
  const scale = Math.min(
    (boxW * (1 - pad * 2)) / Math.max(1, glyphW),
    (boxH * (1 - pad * 2)) / Math.max(1, glyphH)
  );
  const tx = boxX + (boxW - glyphW * scale) / 2;
  const ty = boxY + (boxH - glyphH * scale) / 2;
  return {
    transform: `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(6)})`,
    d
  };
}

const UI_FONT = `'FOSS Modern', ui-sans-serif, system-ui, sans-serif`;

/** Filled cream chip; active = apricot accent + dark ink (matches live UI). */
function chip(
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  opts: { active?: boolean; fontSize?: number } = {}
): string {
  const fill = opts.active ? COLOR_ACCENT : COLOR_LIGHT;
  const ink = COLOR_DARK;
  const fs = opts.fontSize ?? s(12);
  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>
    <text x="${x + w / 2}" y="${y + h / 2 + s(0.5)}" text-anchor="middle" dominant-baseline="middle"
      font-family="${UI_FONT}" font-weight="700" font-size="${fs}" fill="${ink}">${label}</text>
  </g>`;
}

/** Chip-style field shell: label · value · rectangular range (matches live UI). */
function field(
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  val: string,
  t01: number,
  labelW = s(48)
): string {
  const padX = s(8);
  const gap = s(6);
  const fs = s(12);
  const trackH = s(12);
  const thumbW = s(8);
  const valW = s(Math.max(22, String(val).length * 7.5));
  const trackX = x + padX + labelW + gap + valW + gap;
  const trackW = Math.max(s(36), w - (trackX - x) - padX);
  const trackY = y + (h - trackH) / 2;
  const pct = Math.max(0, Math.min(1, t01));
  const fillW = Math.max(thumbW, pct * trackW);
  const thumbX = trackX + Math.min(trackW - thumbW, Math.max(0, pct * trackW - thumbW / 2));
  const trackMuted = 'rgba(23,39,19,0.18)';
  const midY = y + h / 2 + s(0.5);
  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${COLOR_LIGHT}"/>
    <text x="${x + padX}" y="${midY}" dominant-baseline="middle"
      font-family="${UI_FONT}" font-weight="700" font-size="${fs}" fill="${COLOR_DARK}">${label}</text>
    <text x="${x + padX + labelW + gap}" y="${midY}" dominant-baseline="middle"
      font-family="${UI_FONT}" font-weight="700" font-size="${fs}" fill="${COLOR_DARK}" opacity="0.72">${val}</text>
    <rect x="${trackX}" y="${trackY}" width="${trackW}" height="${trackH}" fill="${trackMuted}"/>
    <rect x="${trackX}" y="${trackY}" width="${fillW.toFixed(1)}" height="${trackH}" fill="${COLOR_ACCENT}"/>
    <rect x="${thumbX.toFixed(1)}" y="${trackY}" width="${thumbW}" height="${trackH}" fill="${COLOR_DARK}"/>
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
  console.log(`og size ${OG_W}×${OG_H} (${SCALE}×)`);

  const otf = readFileSync(FONT_MODERN);
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
    sizePx: 96 * PT_TO_PX * SCALE,
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

  // —— OG: current generator chrome (topbar + 2-row dock) ——
  const pad = s(28);
  const gap = s(8);
  const chipH = s(36);
  const topY = pad;
  const topbarBottom = topY + chipH;
  const dockGap = s(8);
  const dockRows = 2;
  const dockH = chipH * dockRows + dockGap + s(8);
  const stageX = pad;
  const stageY = topbarBottom + s(16);
  const stageW = OG_W - pad * 2;
  const stageH = OG_H - stageY - dockH - pad;
  const fitted = fitPath(wordD, word.width, word.height, stageX, stageY, stageW, stageH, 0.08);

  const dockY1 = OG_H - pad - dockH + s(4);
  const dockY2 = dockY1 + chipH + dockGap;

  // Topbar fields
  const scaleW = s(168);
  const trackW = s(160);
  const scaleX = OG_W - pad - scaleW - gap - trackW;
  const trackX = OG_W - pad - trackW;

  // Dock row 2: growth + play + download
  const playW = s(36);
  const dlW = s(100);
  const growthW = s(200);
  const growthX = pad;
  const playX = growthX + growthW + gap;
  const dlX = OG_W - pad - dlW;

  const ogSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${OG_W} ${OG_H}" width="${OG_W}" height="${OG_H}">
<!-- Marcovaldo generator preview · ${morph.shape}/${morph.margin} · offset ${morph.offset} · growth ${morph.growth} · ${SCALE}× -->
<rect width="100%" height="100%" fill="${COLOR_DARK}"/>

<!-- topbar -->
${chip(pad, topY, s(56), chipH, 'Sans', { active: true })}
${chip(pad + s(56) + gap, topY, s(56), chipH, 'Serif')}
<text x="${OG_W / 2}" y="${topY + chipH / 2 + s(0.5)}" text-anchor="middle" dominant-baseline="middle"
  font-family="${UI_FONT}" font-weight="700" font-size="${s(20)}" fill="${COLOR_LIGHT}">Marcovaldo</text>
${field(scaleX, topY, scaleW, chipH, 'Scala', '88', 0.88, s(36))}
${field(trackX, topY, trackW, chipH, 'Tracking', '0.00', TRACKING_MID / TRACKING_MAX, s(58))}

<!-- stage specimen -->
<g transform="${fitted.transform}">
  <path fill="${COLOR_LIGHT}" fill-rule="nonzero" d="${fitted.d}"/>
</g>

<!-- dock row 1: morph -->
${chip(pad, dockY1, s(72), chipH, 'Randomise')}
${chip(pad + s(72) + gap, dockY1, s(64), chipH, 'Forma')}
${chip(pad + s(72) + gap + s(64) + gap, dockY1, s(78), chipH, 'Margine')}

<!-- dock row 2: growth + play + download -->
${field(growthX, dockY2, growthW, chipH, 'Crescita', String(morph.growth), morph.growth / 100, s(52))}
${chip(playX, dockY2, playW, chipH, '▶', { fontSize: s(11) })}
${chip(dlX, dockY2, dlW, chipH, 'Download')}
</svg>
`;

  const tmpDir = join(root, 'tmp');
  mkdirSync(tmpDir, { recursive: true });
  writeFileSync(join(tmpDir, 'og.svg'), ogSvg, 'utf8');
  console.log('wrote', join(tmpDir, 'og.svg'));
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
  // PNG-only favicon — morphed SVG paths are hundreds of KB and unsuitable as icons.
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
