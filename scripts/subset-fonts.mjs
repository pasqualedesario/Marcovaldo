/** Subset FOSS masters (fonts-src/) → Latin web + OTF packs in public/fonts/. */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Basic Latin + Latin-1 + typographic punctuation used in UI/credits. */
const UNICODES = [
  'U+0020-007E',
  'U+00A0-00FF',
  'U+0152',
  'U+0153',
  'U+0160',
  'U+0161',
  'U+0178',
  'U+017D',
  'U+017E',
  'U+2009',
  'U+2013',
  'U+2014',
  'U+2018-201D',
  'U+2022',
  'U+2026',
  'U+20AC'
].join(',');

const FACES = [
  {
    src: 'fonts-src/FOSS-Modern/FOSS-Modern-Bold.otf',
    out: 'public/fonts/FOSS-Modern/FOSS-Modern-Bold'
  },
  {
    src: 'fonts-src/FOSS-Serif/FOSSSERIF-Regular.otf',
    out: 'public/fonts/FOSS-Serif/FOSSSERIF-Regular'
  }
];

const common = [
  `--unicodes=${UNICODES}`,
  '--layout-features=kern,liga,clig,calt,locl',
  '--name-IDs=*',
  '--name-languages=*',
  '--glyph-names',
  '--symbol-cmap',
  '--legacy-cmap',
  '--notdef-glyph',
  '--notdef-outline',
  '--recommended-glyphs',
  '--recalc-bounds',
  '--recalc-average-width'
];

function run(args) {
  const r = spawnSync('pyftsubset', args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || 'pyftsubset failed — install fonttools');
    process.exit(r.status || 1);
  }
}

for (const face of FACES) {
  const src = join(root, face.src);
  const base = join(root, face.out);
  run([...common, '--flavor=woff2', '--with-zopfli', `--output-file=${base}.woff2`, src]);
  run([...common, `--output-file=${base}.otf`, src]);
  console.log('subset ok', face.out);
}
