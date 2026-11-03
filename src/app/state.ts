import type { BotanicalParams, Contours } from '../core/types';
import {
  DEFAULT_MARGIN,
  DEFAULT_SHAPE,
  LEAF_SHAPES,
  clampMargin,
  isLeafShape,
  marginsFor,
  type LeafMargin,
  type LeafShape,
  type MorphologySpec
} from '../core/modules/morphology';
import type { LoadedFont } from '../font/load';
import { clamp, PT_TO_PX } from '../lib/math';
import {
  DEFAULT_BG,
  DEFAULT_FG,
  applyPaletteVars
} from '../lib/palette';
import { DEFAULT_FACE, type FaceId } from '../lib/typefaces';
import { allMorphLabels, t } from '../i18n';

const randInt = (a: number, b: number) => Math.floor(a + Math.random() * (b - a + 1));
const clampPct = (n: number) => clamp(n, 0, 100);

export type AppState = BotanicalParams & {
  /** Specimen / editable text face (sans or serif). */
  font: LoadedFont | null;
  /** UI chrome face — always FOSS Modern. */
  uiFont: LoadedFont | null;
  face: FaceId;
  text: string;
  bg: string;
  color: string;
  offset: number;
  shape: LeafShape;
  margin: LeafMargin;
  width: number;
  height: number;
  lamina: Contours;
  pathD: string;
};

const BASE_TEXTS: ReadonlySet<string> = new Set([
  ...LEAF_SHAPES,
  ...LEAF_SHAPES.map((s) => s.replace(/_/g, ' ')),
  ...allMorphLabels()
]);

export function morphSpec(state: AppState): MorphologySpec {
  return {
    shape: state.shape,
    margin: state.margin
  };
}

export function shapeBaseText(shape: LeafShape, label?: string): string {
  if (label) return label;
  return shape.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isMorphBaseText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  const key = trimmed.toLowerCase().replace(/\s+/g, '_');
  return BASE_TEXTS.has(trimmed) || BASE_TEXTS.has(key) || isLeafShape(key);
}

export function specimenText(state: AppState, label?: string): string {
  const trimmed = state.text.trim();
  if (trimmed) return trimmed;
  return shapeBaseText(state.shape, label);
}

export function createState(): AppState {
  return {
    font: null,
    uiFont: null,
    face: DEFAULT_FACE,
    text: shapeBaseText(DEFAULT_SHAPE, t().shapes[DEFAULT_SHAPE]),
    bg: DEFAULT_BG,
    color: DEFAULT_FG,
    offset: 0,
    shape: DEFAULT_SHAPE,
    margin: DEFAULT_MARGIN,
    width: 0,
    height: 0,
    lamina: [],
    pathD: '',
    growth: 70,
    scale: 88,
    tracking: 50
  };
}

export function paramsSnapshot(state: AppState): BotanicalParams {
  return { growth: state.growth, scale: state.scale, tracking: state.tracking };
}

export function applyShape(state: AppState, id: string, label?: string): boolean {
  if (!isLeafShape(id)) return false;
  if (isMorphBaseText(state.text)) state.text = shapeBaseText(id, label);
  state.shape = id;
  state.margin = clampMargin(id, state.margin);
  return true;
}

export function applyMargin(state: AppState, id: LeafMargin): void {
  state.margin = clampMargin(state.shape, id);
}

export function reshuffleAll(
  state: AppState,
  labelFor?: (shape: LeafShape) => string
): void {
  const shape = LEAF_SHAPES[randInt(0, LEAF_SHAPES.length - 1)]!;
  const margins = marginsFor(shape);
  applyShape(state, shape, labelFor?.(shape));
  state.margin = margins[randInt(0, margins.length - 1)]!;
  state.growth = clampPct(state.growth + randInt(-24, 24));
  state.scale = clampPct(state.scale + randInt(-22, 22));
  state.offset++;
}

export function formatSizePt(px: number): string {
  if (!px || !Number.isFinite(px)) return '—';
  return `${Math.max(1, Math.round(px / PT_TO_PX))} pt`;
}

export function exportBasename(state: AppState): string {
  const font = state.font?.name || 'font';
  return `${font}-${specimenText(state)}`;
}

/** Locked palette triad (bg / fg / accent). */
export function applyTheme(state: AppState): void {
  state.bg = DEFAULT_BG;
  state.color = DEFAULT_FG;
  applyPaletteVars();
}
