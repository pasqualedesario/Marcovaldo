/** Leaf morphology catalog — shape + margin (no venation). */

export const LEAF_SHAPES = [
  'acicular',
  'linear',
  'lanceolate',
  'elliptic',
  'ovate',
  'obovate',
  'orbicular',
  'reniform',
  'cordate',
  'deltoid',
  'hastate',
  'sagittate',
  'falcate',
  'flabellate',
  'lobed',
  'pinnatisect',
  'palmatifid',
  'trifoliate',
  'palmate'
] as const;

export type LeafShape = (typeof LEAF_SHAPES)[number];

export const LEAF_MARGINS = [
  'entire',
  'ciliate',
  'crenate',
  'dentate',
  'serrate',
  'sinuate',
  'undulate',
  'spiny'
] as const;

export type LeafMargin = (typeof LEAF_MARGINS)[number];

export type ShapeGroup =
  | 'needle'
  | 'lance'
  | 'broad'
  | 'angular'
  | 'falcate'
  | 'flabellate'
  | 'lobed'
  | 'compound';

const SHAPE_GROUP: Readonly<Record<LeafShape, ShapeGroup>> = {
  acicular: 'needle',
  linear: 'needle',
  lanceolate: 'lance',
  elliptic: 'lance',
  ovate: 'lance',
  obovate: 'lance',
  orbicular: 'broad',
  reniform: 'broad',
  cordate: 'broad',
  deltoid: 'angular',
  hastate: 'angular',
  sagittate: 'angular',
  falcate: 'falcate',
  flabellate: 'flabellate',
  lobed: 'lobed',
  pinnatisect: 'lobed',
  palmatifid: 'lobed',
  trifoliate: 'compound',
  palmate: 'compound'
};

const MARGINS_BY_GROUP: Readonly<Record<ShapeGroup, readonly LeafMargin[]>> = {
  needle: ['entire', 'ciliate'],
  lance: ['entire', 'ciliate', 'crenate', 'dentate', 'serrate', 'sinuate', 'undulate', 'spiny'],
  broad: ['entire', 'ciliate', 'crenate', 'dentate', 'serrate', 'sinuate', 'undulate'],
  angular: ['entire', 'ciliate', 'dentate', 'serrate', 'undulate', 'spiny'],
  falcate: ['entire', 'ciliate', 'serrate'],
  flabellate: ['entire', 'undulate', 'crenate', 'sinuate'],
  lobed: ['entire', 'crenate', 'sinuate', 'undulate'],
  compound: ['entire', 'serrate', 'crenate', 'ciliate', 'dentate']
};

const MARGIN_SHAPE_DENY: Partial<Record<LeafShape, ReadonlySet<LeafMargin>>> = {
  orbicular: new Set(['spiny']),
  flabellate: new Set(['spiny']),
  lobed: new Set(['spiny']),
  pinnatisect: new Set(['spiny']),
  palmatifid: new Set(['spiny']),
  trifoliate: new Set(['spiny']),
  palmate: new Set(['spiny'])
};

export function shapeGroup(shape: LeafShape): ShapeGroup {
  return SHAPE_GROUP[shape];
}

export function isLeafShape(id: string | null | undefined): id is LeafShape {
  return !!id && (LEAF_SHAPES as readonly string[]).includes(id);
}

export function marginsFor(shape: LeafShape): readonly LeafMargin[] {
  const base = MARGINS_BY_GROUP[SHAPE_GROUP[shape]];
  const deny = MARGIN_SHAPE_DENY[shape];
  if (!deny) return base;
  return base.filter((m) => !deny.has(m));
}

export function clampMargin(shape: LeafShape, margin: LeafMargin): LeafMargin {
  const allowed = marginsFor(shape);
  return allowed.includes(margin) ? margin : (allowed[0] ?? 'entire');
}

export const DEFAULT_SHAPE: LeafShape = 'ovate';
export const DEFAULT_MARGIN: LeafMargin = 'entire';
