/**
 * Parity: OTF at growth G ≈ VF instantiated at GROW=G for glyph "A"
 * (same morph engine; polygonal resample).
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);

async function main() {
  const { loadFontFromBuffer } = await import('../src/font/load.ts');
  const { buildGrowthVf } = await import('../src/export/vf.ts');
  const { buildOtfBuffer } = await import('../src/export/otf.ts');
  const { deformGlyph } = await import('../src/core/pipeline.ts');
  const { DEFAULT_SHAPE, DEFAULT_MARGIN } = await import('../src/core/modules/morphology/catalog.ts');

  const typefaces = JSON.parse(readFileSync(join(root, 'src/lib/typefaces.json'), 'utf8'));
  const serif = typefaces.faces.serif;
  const bytes = readFileSync(join(root, 'public', serif.file));
  const font = await loadFontFromBuffer(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    serif.label
  );

  const morph = { shape: DEFAULT_SHAPE, margin: DEFAULT_MARGIN };
  const offset = 42;
  const growth = 70;
  const charset = 'A';

  const stage = deformGlyph(font, 'A', { growth, scale: 50, tracking: 50 }, morph, offset);
  if (!stage?.lamina?.length) throw new Error('stage deform failed');

  const otfBuf = await buildOtfBuffer({
    fontName: font.name,
    font,
    params: { growth, scale: 50, tracking: 50 },
    morph,
    offset,
    charset
  });

  const { buffer: vfBuf } = await buildGrowthVf({
    basename: 'parity',
    fontName: font.name,
    font,
    morph,
    offset,
    charset
  });

  const outDir = join(root, 'tmp');
  mkdirSync(outDir, { recursive: true });
  const otfPath = join(outDir, 'parity-G70.otf');
  const vfPath = join(outDir, 'parity-GROW.ttf');
  writeFileSync(otfPath, Buffer.from(otfBuf));
  writeFileSync(vfPath, Buffer.from(vfBuf));

  const report = execFileSync(
    'python3',
    [
      '-c',
      `
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
import math

otf = TTFont(${JSON.stringify(otfPath)})
vf = TTFont(${JSON.stringify(vfPath)})
assert len(vf.getTableData('OS/2')) == 96
assert 'STAT' in vf and 'fvar' in vf

inst = instancer.instantiateVariableFont(vf, {'GROW': ${growth}}, inplace=False)
# Compare contour counts for A
def ncont(font, name='A'):
    g = font['glyf'][name] if 'glyf' in font else None
    if g is not None:
        return g.numberOfContours
    # CFF OTF via opentype.js still often wraps as TT? opentype.js writes CFF-less TrueType-flavored?
    # opentype.js Font.toArrayBuffer produces OTF with CFF or glyf depending — check tables
    if 'CFF ' in font or 'CFF2' in font:
        return 'cff'
    return None

# opentype.js typically embeds glyf in "otf" download as SFNT with CFF — check
from fontTools.pens.recordingPen import RecordingPen
gs = otf.getGlyphSet()
pen = RecordingPen()
gs['A'].draw(pen)
otf_paths = sum(1 for op, _ in pen.value if op == 'moveTo')
vf_n = inst['glyf']['A'].numberOfContours
stage_n = ${stage.lamina.length}
print('contours stage', stage_n, 'OTF', otf_paths, 'VF@${growth}', vf_n)
assert stage_n == otf_paths == vf_n, (stage_n, otf_paths, vf_n)
print('parity ok')
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
