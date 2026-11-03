/** Smoke: fixed palette triad + typeface assets without a browser. */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const palette = JSON.parse(readFileSync(join(root, 'src/lib/palette.json'), 'utf8'));
const typefaces = JSON.parse(readFileSync(join(root, 'src/lib/typefaces.json'), 'utf8'));

const { dark, light, accent } = palette;
const EXPECTED = {
  dark: '#172713',
  light: '#f5f5b8',
  accent: '#ff7340'
};

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function luminance({ r, g, b }) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

for (const [key, want] of Object.entries(EXPECTED)) {
  const got = String(palette[key] ?? '').toLowerCase();
  if (got !== want) {
    console.error(`palette.${key} expected ${want}, got`, palette[key]);
    process.exit(1);
  }
}

const bg = hexToRgb(dark);
const fg = hexToRgb(light);
const ac = hexToRgb(accent);
if (!bg || !fg || !ac) {
  console.error('invalid palette hex', { dark, light, accent });
  process.exit(1);
}
if (luminance(bg) >= luminance(fg)) {
  console.error('expected dark < light luminance', { dark, light });
  process.exit(1);
}

const faces = Object.values(typefaces.faces ?? {});
if (faces.length < 2) {
  console.error('expected sans + serif faces', typefaces);
  process.exit(1);
}
for (const face of faces) {
  for (const key of ['file', 'woff2']) {
    const rel = face[key];
    const abs = join(root, 'public', rel);
    if (!existsSync(abs)) {
      console.error('missing typeface asset', rel);
      process.exit(1);
    }
  }
}

console.log('smoke ok — palette', dark, light, accent);
console.log(
  'smoke ok — typefaces',
  faces.map((f) => f.label).join(' + ')
);
