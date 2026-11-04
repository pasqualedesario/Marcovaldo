/**
 * Three OG-style screenshots with very different morph / chrome presets.
 * Writes to tmp/og-variants/ without touching public/og.png.
 *
 * Run: npx --yes vite-node@3.2.4 scripts/gen-og-variants.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { clampMargin, type LeafMargin, type LeafShape } from '../src/core/modules/morphology/catalog';
import { contoursToSvgD } from '../src/core/path/ops';
import { buildOpenSpecimen } from '../src/core/pipeline';
import { loadFontFromBuffer } from '../src/font/load';
import { PT_TO_PX, TRACKING_MAX, trackingEm } from '../src/lib/math';
import { COLOR_ACCENT, COLOR_DARK, COLOR_LIGHT } from '../src/lib/palette';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'tmp/og-variants');
const FONT_SANS = join(root, 'public/fonts/FOSS-Modern/FOSS-Modern-Bold.otf');
const FONT_SERIF = join(root, 'public/fonts/FOSS-Serif/FOSSSERIF-Regular.otf');

const SCALE = 2;
const OG_W = 1200 * SCALE;
const OG_H = 630 * SCALE;
const s = (n: number) => n * SCALE;
const UI_FONT = `'FOSS Modern', ui-sans-serif, system-ui, sans-serif`;

type Variant = {
  id: string;
  label: string;
  face: 'sans' | 'serif';
  shape: LeafShape;
  margin: LeafMargin;
  growth: number;
  scale: number;
  tracking: number;
  offset: number;
  text: string;
};

/** Three extremes vs current trifoliate / high-growth cream collage. */
const VARIANTS: Variant[] = [
  {
    id: '01-needle-bare',
    label: 'acicular · entire · growth bassa · Serif',
    face: 'serif',
    shape: 'acicular',
    margin: 'entire',
    growth: 18,
    scale: 72,
    tracking: 78,
    offset: 901,
    text: 'Marcovaldo'
  },
  {
    id: '02-fan-bloom',
    label: 'flabellate · undulate · growth piena · Sans',
    face: 'sans',
    shape: 'flabellate',
    margin: 'undulate',
    growth: 97,
    scale: 92,
    tracking: 32,
    offset: 4402,
    text: 'Marcovaldo'
  },
  {
    id: '03-arrow-spiny',
    label: 'sagittate · spiny · growth media · Sans',
    face: 'sans',
    shape: 'sagittate',
    margin: 'spiny',
    growth: 58,
    scale: 84,
    tracking: 50,
    offset: 1777,
    text: 'Marcovaldo'
  }
];

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

function chip(
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  opts: { active?: boolean; fontSize?: number } = {}
): string {
  const fill = opts.active ? COLOR_ACCENT : COLOR_LIGHT;
  const fs = opts.fontSize ?? s(12);
  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>
    <text x="${x + w / 2}" y="${y + h / 2 + s(0.5)}" text-anchor="middle" dominant-baseline="middle"
      font-family="${UI_FONT}" font-weight="700" font-size="${fs}" fill="${COLOR_DARK}">${label}</text>
  </g>`;
}

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
  const midY = y + h / 2 + s(0.5);
  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${COLOR_LIGHT}"/>
    <text x="${x + padX}" y="${midY}" dominant-baseline="middle"
      font-family="${UI_FONT}" font-weight="700" font-size="${fs}" fill="${COLOR_DARK}">${label}</text>
    <text x="${x + padX + labelW + gap}" y="${midY}" dominant-baseline="middle"
      font-family="${UI_FONT}" font-weight="700" font-size="${fs}" fill="${COLOR_DARK}" opacity="0.72">${val}</text>
    <rect x="${trackX}" y="${trackY}" width="${trackW}" height="${trackH}" fill="rgba(23,39,19,0.18)"/>
    <rect x="${trackX}" y="${trackY}" width="${fillW.toFixed(1)}" height="${trackH}" fill="${COLOR_ACCENT}"/>
    <rect x="${thumbX.toFixed(1)}" y="${trackY}" width="${thumbW}" height="${trackH}" fill="${COLOR_DARK}"/>
  </g>`;
}

function frameSvg(wordD: string, wordW: number, wordH: number, v: Variant): string {
  const pad = s(28);
  const gap = s(8);
  const chipH = s(36);
  const topY = pad;
  const topbarBottom = topY + chipH;
  const dockGap = s(8);
  const dockH = chipH * 2 + dockGap + s(8);
  const stageX = pad;
  const stageY = topbarBottom + s(16);
  const stageW = OG_W - pad * 2;
  const stageH = OG_H - stageY - dockH - pad;
  const fitted = fitPath(wordD, wordW, wordH, stageX, stageY, stageW, stageH, 0.08);

  const dockY1 = OG_H - pad - dockH + s(4);
  const dockY2 = dockY1 + chipH + dockGap;

  const scaleW = s(168);
  const trackW = s(160);
  const scaleX = OG_W - pad - scaleW - gap - trackW;
  const trackX = OG_W - pad - trackW;

  const playW = s(36);
  const dlW = s(100);
  const growthW = s(200);
  const growthX = pad;
  const playX = growthX + growthW + gap;
  const dlX = OG_W - pad - dlW;

  const sansActive = v.face === 'sans';
  const margin = clampMargin(v.shape, v.margin);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${OG_W} ${OG_H}" width="${OG_W}" height="${OG_H}">
<!-- ${v.id} · ${v.shape}/${margin} · growth ${v.growth} · ${v.face} -->
<rect width="100%" height="100%" fill="${COLOR_DARK}"/>

${chip(pad, topY, s(56), chipH, 'Sans', { active: sansActive })}
${chip(pad + s(56) + gap, topY, s(56), chipH, 'Serif', { active: !sansActive })}
<text x="${OG_W / 2}" y="${topY + chipH / 2 + s(0.5)}" text-anchor="middle" dominant-baseline="middle"
  font-family="${UI_FONT}" font-weight="700" font-size="${s(20)}" fill="${COLOR_LIGHT}">Marcovaldo</text>
${field(scaleX, topY, scaleW, chipH, 'Scala', String(v.scale), v.scale / 100, s(36))}
${field(trackX, topY, trackW, chipH, 'Tracking', trackingEm(v.tracking).toFixed(2), v.tracking / TRACKING_MAX, s(58))}

<g transform="${fitted.transform}">
  <path fill="${COLOR_LIGHT}" fill-rule="nonzero" d="${fitted.d}"/>
</g>

${chip(pad, dockY1, s(72), chipH, 'Randomise')}
${chip(pad + s(72) + gap, dockY1, s(64), chipH, 'Forma')}
${chip(pad + s(72) + gap + s(64) + gap, dockY1, s(78), chipH, 'Margine')}

${field(growthX, dockY2, growthW, chipH, 'Crescita', String(v.growth), v.growth / 100, s(52))}
${chip(playX, dockY2, playW, chipH, '▶', { fontSize: s(11) })}
${chip(dlX, dockY2, dlW, chipH, 'Download')}
</svg>
`;
}

function writePng(svg: string, outPath: string): void {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: OG_W },
    font: {
      fontFiles: [FONT_SANS],
      loadSystemFonts: true,
      defaultFontFamily: 'FOSS Modern'
    },
    background: COLOR_DARK
  });
  writeFileSync(outPath, resvg.render().asPng());
  console.log('wrote', outPath);
}

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });

  const sansBuf = readFileSync(FONT_SANS);
  const serifBuf = readFileSync(FONT_SERIF);
  const sans = await loadFontFromBuffer(
    sansBuf.buffer.slice(sansBuf.byteOffset, sansBuf.byteOffset + sansBuf.byteLength),
    'FOSS Modern'
  );
  const serif = await loadFontFromBuffer(
    serifBuf.buffer.slice(serifBuf.byteOffset, serifBuf.byteOffset + serifBuf.byteLength),
    'FOSS Serif'
  );

  for (const v of VARIANTS) {
    const font = v.face === 'serif' ? serif : sans;
    const margin = clampMargin(v.shape, v.margin);
    const word = buildOpenSpecimen({
      font,
      text: v.text,
      params: { growth: v.growth, scale: v.scale, tracking: v.tracking },
      morph: { shape: v.shape, margin },
      offset: v.offset,
      sizePx: 96 * PT_TO_PX * SCALE,
      caret: false
    });
    if (!word?.lamina.length) throw new Error(`render failed: ${v.id}`);

    const svg = frameSvg(contoursToSvgD(word.lamina), word.width, word.height, { ...v, margin });
    const pngPath = join(outDir, `${v.id}.png`);
    const svgPath = join(outDir, `${v.id}.svg`);
    writeFileSync(svgPath, svg, 'utf8');
    writePng(svg, pngPath);
    console.log('·', v.label);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
