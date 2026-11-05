/** Leaf macro photos for About — Unsplash License. */
export type AboutPhoto = {
  file: string;
  width: number;
  height: number;
};

export const UNSPLASH_LEAF_MACRO_URL =
  'https://unsplash.com/it/s/foto/leaf-macro?license=free';

export const ABOUT_PHOTOS: readonly AboutPhoto[] = [
  { file: 'alan-emery-SzwX89Orf9A.webp', width: 2560, height: 1670 },
  { file: 'andrew-lvov-Z79lRkb9Zp4.webp', width: 2560, height: 1707 },
  { file: 'brunxs-H9sYrq4jJ7Y.webp', width: 2560, height: 1707 },
  { file: 'david-clode-5APTa3rtEe8.webp', width: 2560, height: 1709 },
  { file: 'david-clode-Zos3GiCLaiA.webp', width: 2560, height: 1707 },
  { file: 'ef-taylor-xELql3V38x8.webp', width: 2560, height: 1707 },
  { file: 'emanuel-haas-qFqn_GFHdUE.webp', width: 2560, height: 1707 },
  { file: 'frames-for-your-heart-kkeGIHq0yTY.webp', width: 2560, height: 1920 },
  { file: 'greg-rosenke-mUmBlfZIYNA.webp', width: 2560, height: 1707 },
  { file: 'hasan-almasi-asmoVnBo3-0.webp', width: 2560, height: 2048 },
  { file: 'jonathan-borba-jtYL9o36l-4.webp', width: 2560, height: 1706 },
  { file: 'kiaan-GOsyv42P0C0.webp', width: 2560, height: 1920 },
  { file: 'omid-armin-ApYDy4ur8JQ.webp', width: 2560, height: 1574 },
  { file: 'oscar-mcglone-0JHDjPoISpE.webp', width: 2560, height: 1920 },
  { file: 'sebastian-schuster-FVok0nCiCwQ.webp', width: 2560, height: 1920 },
  { file: 'soubhagya-satpathy-HdLQEIMW3ZI.webp', width: 2560, height: 2236 },
  { file: 'valentin-salja-Z3oT1r3Pq0Y.webp', width: 2560, height: 1706 }
];

/** Unique photographers, credit order. */
export const ABOUT_PHOTOGRAPHERS = [
  'Alan Emery',
  'Andrew Lvov',
  'Brunxs',
  'David Clode',
  'E.F. Taylor',
  'Emanuel Haas',
  'Frames For Your Heart',
  'Greg Rosenke',
  'Hasan Almasi',
  'Jonathan Borba',
  'Kiaan',
  'Omid Armin',
  'Oscar McGlone',
  'Sebastian Schuster',
  'Soubhagya Satpathy',
  'Valentin Salja'
] as const;

export const ABOUT_PHOTOGRAPHERS_LINE = ABOUT_PHOTOGRAPHERS.join(', ');
