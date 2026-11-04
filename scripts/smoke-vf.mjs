/**
 * Build a tiny GROW variable TTF and validate with fontTools.
 * Run: node --experimental-vm-modules scripts/smoke-vf.mjs
 * (or via vite-node)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

// Polyfill rAF for Node
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);

async function main() {
  const { buildGrowVariableTtf } = await import('../src/export/ttfVf.ts');

  // Synthetic glyph: square grows into larger square (4 pts)
  const min = [
    [
      { x: 100, y: 100 },
      { x: 400, y: 100 },
      { x: 400, y: 400 },
      { x: 100, y: 400 }
    ]
  ];
  const max = [
    [
      { x: 50, y: 50 },
      { x: 550, y: 50 },
      { x: 550, y: 550 },
      { x: 50, y: 550 }
    ]
  ];

  const buf = buildGrowVariableTtf({
    familyName: 'Marcovaldo Smoke',
    styleName: 'ovate-entire',
    postScriptName: 'MarcovaldoSmoke-GROW',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs: [
      { name: 'A', unicode: 0x41, advance: 600, min, max },
      { name: 'B', unicode: 0x42, advance: 600, min, max }
    ],
    description: 'smoke'
  });

  const outDir = join(root, 'tmp');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'smoke-grow.ttf');
  writeFileSync(outPath, Buffer.from(buf));
  console.log('wrote', outPath, buf.byteLength, 'bytes');

  execFileSync(
    'fonttools',
    ['ttLib', '-o', join(outDir, 'smoke-grow.ttx'), outPath],
    { stdio: 'inherit' }
  );

  const ttLib = execFileSync(
    'python3',
    [
      '-c',
      `
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
f = TTFont(${JSON.stringify(outPath)})
assert 'fvar' in f and 'gvar' in f and 'avar' in f and 'STAT' in f
ax = f['fvar'].axes[0]
assert ax.axisTag == 'GROW'
assert ax.minValue == 0 and ax.maxValue == 100
assert ax.axisNameID >= 256, ax.axisNameID
cmap = f.getBestCmap()
assert 0x41 in cmap and 0x42 in cmap
for name in ('A', 'B'):
    assert f['glyf'][name].numberOfContours >= 1
# GROW=100 must move points vs default
def pts(font, name='A'):
    g = font['glyf'][name]
    return list(g.coordinates) if g.numberOfContours > 0 else []
base = pts(f)
inst = instancer.instantiateVariableFont(f, {'GROW': 100}, inplace=False)
hi = pts(inst)
assert base != hi, 'GROW=100 identical to default'
# avar should compress mid-axis vs linear
mid = instancer.instantiateVariableFont(TTFont(${JSON.stringify(outPath)}), {'GROW': 50}, inplace=False)
mid_pts = pts(mid)
# at least some motion at 50
assert mid_pts != base
print('fontTools ok tables', sorted(f.keys()))
print('GROW', ax.minValue, '→', ax.maxValue, 'nameID', ax.axisNameID)
`
    ],
    { encoding: 'utf8' }
  );
  console.log(ttLib);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
