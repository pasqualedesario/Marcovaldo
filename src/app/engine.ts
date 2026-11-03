import { moduleStamp } from '../core/modules/morphology';
import { buildSpecimen, specimenFontSize } from '../core/pipeline';
import { renderSvgPreview, updateSvgSelection } from '../preview/svg';
import type { SelOverlay } from '../preview/selection';
import { canvasToPngBlob, renderCanvas } from '../preview/raster';
import { createFrameScheduler } from '../lib/schedule';
import { clamp, nearestStopIndex, selectionBounds } from '../lib/math';
import { t } from '../i18n';
import type { AppState } from './state';
import { morphSpec, paramsSnapshot, specimenText } from './state';

export type EngineDom = {
  stage: HTMLElement;
  preview: SVGSVGElement;
  raster: HTMLCanvasElement;
  caret: HTMLElement;
  stats: HTMLElement;
  status?: HTMLElement;
  onFontSize?: (px: number) => void;
  onAfterDraw?: () => void;
  statusMessage?: (kind: 'empty' | 'missing-font' | 'missing-glyph' | null) => string;
};

export type Engine = {
  requestDraw: () => void;
  drawNow: () => void;
  rasterizeBlob: () => Promise<Blob>;
  meta: () => Record<string, string>;
  setSelection: (start: number, end: number) => void;
  indexAtX: (clientX: number) => number;
};

export function createEngine(state: AppState, dom: EngineDom): Engine {
  let caretStops: number[] = [];
  let caretBand = { y: 0, h: 24 };
  let selStart = 0;
  let selEnd = 0;
  let lastPointCount = 0;

  const placeCaret = (x: number, y: number, h: number) => {
    const { caret } = dom;
    caret.style.left = `${Math.round(x)}px`;
    caret.style.top = `${Math.round(y)}px`;
    caret.style.height = `${Math.max(12, Math.round(h))}px`;
    const focused = document.activeElement?.id === 'text';
    caret.hidden = !focused || selStart !== selEnd;
  };

  const currentSelection = (): SelOverlay | null => {
    const box = selectionBounds(caretStops, selStart, selEnd);
    if (!box) return null;
    return {
      x: box.x,
      y: caretBand.y,
      w: box.w,
      h: caretBand.h,
      fill: state.color,
      ink: state.bg
    };
  };

  const paintSelectionOnly = () => {
    updateSvgSelection(dom.preview, currentSelection(), state.pathD);
    const cx = caretStops[selEnd] ?? caretStops[caretStops.length - 1] ?? 0;
    placeCaret(cx, caretBand.y, caretBand.h);
  };

  const setStatus = (kind: 'empty' | 'missing-font' | 'missing-glyph' | null) => {
    const el = dom.status;
    if (!el) return;
    if (!kind) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = dom.statusMessage?.(kind) ?? kind;
  };

  const clearStage = (W: number, H: number) => {
    state.pathD = renderSvgPreview(dom.preview, {
      width: W,
      height: H,
      bg: state.bg,
      fill: state.color,
      lamina: [],
      selection: null
    });
    state.lamina = [];
    lastPointCount = 0;
    caretStops = [W * 0.5];
    caretBand = { y: H * 0.35, h: Math.min(W, H) * 0.2 };
  };

  const drawNow = () => {
    const rect = dom.stage.getBoundingClientRect();
    const W = Math.max(320, Math.floor(rect.width));
    const H = Math.max(240, Math.floor(rect.height));
    state.width = W;
    state.height = H;
    const target = specimenFontSize(W, H, state.scale);

    if (!state.font) {
      clearStage(W, H);
      setStatus('missing-font');
      placeCaret(W * 0.5, H * 0.35, Math.min(W, H) * 0.2);
      dom.onFontSize?.(target);
      dom.stats.textContent = '';
      dom.onAfterDraw?.();
      return;
    }

    const text = specimenText(state, t().shapes[state.shape]);
    if (!text) {
      clearStage(W, H);
      setStatus('empty');
      placeCaret(W * 0.5, (H - target) * 0.5, target);
      dom.onFontSize?.(target);
      dom.stats.textContent = '';
      dom.onAfterDraw?.();
      return;
    }

    const result = buildSpecimen({
      font: state.font,
      text,
      params: paramsSnapshot(state),
      morph: morphSpec(state),
      offset: state.offset,
      width: W,
      height: H
    });

    if (!result) {
      clearStage(W, H);
      setStatus('missing-glyph');
      dom.onFontSize?.(target);
      dom.stats.textContent = '';
      dom.onAfterDraw?.();
      return;
    }

    setStatus(null);

    caretStops = result.caretStops;
    caretBand = { y: result.caret.y, h: result.caret.h };
    const n = text.length;
    selStart = clamp(selStart, 0, n);
    selEnd = clamp(selEnd, 0, n);

    state.lamina = result.lamina;
    state.pathD = renderSvgPreview(dom.preview, {
      width: W,
      height: H,
      bg: state.bg,
      fill: state.color,
      lamina: result.lamina,
      selection: currentSelection()
    });
    lastPointCount = result.pointCount;
    dom.onFontSize?.(result.fontSize);
    placeCaret(caretStops[selEnd] ?? result.caret.x, result.caret.y, result.caret.h);

    const shapeLabel = t().shapes[state.shape] ?? state.shape;
    dom.stats.textContent = `${moduleStamp()} · ${shapeLabel} · ${lastPointCount} ${t().points}`;
    dom.onAfterDraw?.();
  };

  const requestDraw = createFrameScheduler(drawNow);

  return {
    requestDraw,
    drawNow,
    setSelection: (start, end) => {
      const n = specimenText(state, t().shapes[state.shape]).length;
      const nextStart = clamp(start, 0, n);
      const nextEnd = clamp(end, 0, n);
      if (nextStart === selStart && nextEnd === selEnd) return;
      selStart = nextStart;
      selEnd = nextEnd;
      if (state.pathD) paintSelectionOnly();
      else requestDraw();
    },
    indexAtX: (clientX) => {
      const x = clientX - dom.stage.getBoundingClientRect().left;
      return nearestStopIndex(caretStops, x);
    },
    rasterizeBlob: async () => {
      renderCanvas(dom.raster, {
        width: state.width,
        height: state.height,
        bg: state.bg,
        fill: state.color,
        lamina: state.lamina
      });
      return canvasToPngBlob(dom.raster);
    },
    meta: () => ({
      module: moduleStamp(),
      font: state.font?.name || '',
      shape: state.shape,
      margin: state.margin,
      seed: String(state.offset)
    })
  };
}
