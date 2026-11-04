/** Full GROW VF export against FOSS Serif — validates with fontTools. */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);

async function main() {
  const { loadFontFromBuffer } = await import('../src/font/load.ts');
  const { buildGrowthVf } = await import('../src/export/vf.ts');
  const { DEFAULT_SHAPE, DEFAULT_MARGIN } = await import('../src/core/modules/morphology/catalog.ts');

  const typefaces = JSON.parse(readFileSync(join(root, 'src/lib/typefaces.json'), 'utf8'));
  const serif = typefaces.faces.serif;
  const bytes = readFileSync(join(root, 'public', serif.file));
  const font = await loadFontFromBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), serif.label);

  const { filename, buffer } = await buildGrowthVf({
    basename: 'smoke-marcovaldo',
    fontName: font.name,
    font,
    params: { growth: 50, scale: 50, tracking: 50 },
    morph: { shape: DEFAULT_SHAPE, margin: DEFAULT_MARGIN },
    offset: 42,
    charset: ' ABCMNOabcjwx01289.,',
    onProgress: ({ done, total, char }) => {
      if (done % 5 === 0) console.log(`  ${done}/${total} ${char}`);
    }
  });

  if (!filename.endsWith('.ttf')) throw new Error(`expected .ttf got ${filename}`);

  const outDir = join(root, 'tmp');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, filename);
  writeFileSync(outPath, Buffer.from(buffer));
  console.log('wrote', outPath, buffer.byteLength);

  const report = execFileSync(
    'python3',
    [
      '-c',
      `
from fontTools.ttLib import TTFont
from fontTools.varLib import mutator
f = TTFont(${JSON.stringify(outPath)})
assert 'fvar' in f and 'gvar' in f
ax = f['fvar'].axes[0]
assert ax.axisTag == 'GROW', ax.axisTag
cmap = f.getBestCmap()
need = [ord(c) for c in 'ABCMNOabcjwx01289']
missing = [chr(c) for c in need if c not in cmap]
assert not missing, missing
inst = mutator.instantiateVariableFont(f, {'GROW': 100})
glyf = inst['glyf']
for name in inst.getGlyphOrder():
    g = glyf[name]
    if getattr(g, 'numberOfContours', 0) < 1: continue
    g.recalcBounds(glyf)
    assert abs(g.xMin) < 30000 and abs(g.xMax) < 30000, (name, g.xMin, g.xMax)
    assert abs(g.yMin) < 30000 and abs(g.yMax) < 30000, (name, g.yMin, g.yMax)
print('full ok glyphs', len(cmap), 'axis GROW', ax.minValue, ax.defaultValue, ax.maxValue)
`
    ],
    { encoding: 'utf8' }
  );
  console.log(report);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
