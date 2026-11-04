import { moduleStamp } from '../core/modules/morphology';
import { buildSpecimen, specimenFontSize } from '../core/pipeline';
import type { CaretMetric, Contours } from '../core/types';
import { renderSvgPreview, updateSvgSelection } from '../preview/svg';
import type { SelOverlay } from '../preview/selection';
import { canvasToPngBlob, renderCanvas } from '../preview/raster';
import { createFrameScheduler } from '../lib/schedule';
import { clamp } from '../lib/math';
import { COLOR_ACCENT } from '../lib/palette';
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
  /** Optional — avoid hardcoding #text focus. */
  isTextFocused?: () => boolean;
};

export type DrawFrame = {
  width: number;
  height: number;
  lamina: Contours;
  pathD: string;
};

export type Engine = {
  requestDraw: () => void;
  drawNow: () => void;
  rasterizeBlob: () => Promise<Blob>;
  meta: () => Record<string, string>;
  setSelection: (start: number, end: number) => void;
  indexAtPointer: (clientX: number, clientY: number) => number;
  getFrame: () => DrawFrame;
};

export function createEngine(state: AppState, dom: EngineDom): Engine {
  let caretMetrics: CaretMetric[] = [];
  let selStart = 0;
  let selEnd = 0;
  let lastPointCount = 0;
  let frame: DrawFrame = { width: 0, height: 0, lamina: [], pathD: '' };

  const textFocused = () =>
    dom.isTextFocused?.() ?? document.activeElement?.id === 'text';

  const placeCaret = (m: CaretMetric) => {
    const { caret } = dom;
    caret.style.left = `${Math.round(m.x)}px`;
    caret.style.top = `${Math.round(m.y)}px`;
    caret.style.height = `${Math.max(12, Math.round(m.h))}px`;
    caret.hidden = !textFocused() || selStart !== selEnd;
  };

  const currentSelection = (): SelOverlay | null => {
    if (selStart === selEnd || caretMetrics.length < 2) return null;
    const lo = clamp(Math.min(selStart, selEnd), 0, caretMetrics.length - 1);
    const hi = clamp(Math.max(selStart, selEnd), 0, caretMetrics.length - 1);
    if (lo === hi) return null;
    const a = caretMetrics[lo]!;
    const b = caretMetrics[hi]!;
    let x1 = a.x;
    let x2 = b.x;
    let y1 = a.y;
    let y2 = a.y + a.h;
    for (let i = lo; i <= hi; i++) {
      const m = caretMetrics[i]!;
      x1 = Math.min(x1, m.x);
      x2 = Math.max(x2, m.x);
      y1 = Math.min(y1, m.y);
      y2 = Math.max(y2, m.y + m.h);
    }
    const w = Math.abs(x2 - x1);
    if (w < 0.5 && Math.abs(y2 - y1) < 0.5) return null;
    return {
      x: Math.min(x1, x2),
      y: y1,
      w: Math.max(w, 1),
      h: Math.max(y2 - y1, a.h),
      fill: COLOR_ACCENT,
      ink: state.bg
    };
  };

  const paintSelectionOnly = () => {
    updateSvgSelection(dom.preview, currentSelection(), frame.pathD);
    const m =
      caretMetrics[selEnd] ??
      caretMetrics[caretMetrics.length - 1] ??
      ({ x: 0, y: 0, h: 24 } satisfies CaretMetric);
    placeCaret(m);
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
    frame = {
      width: W,
      height: H,
      lamina: [],
      pathD: renderSvgPreview(dom.preview, {
        width: W,
        height: H,
        bg: state.bg,
        fill: state.color,
        lamina: [],
        selection: null
      })
    };
    lastPointCount = 0;
    const h = Math.min(W, H) * 0.2;
    caretMetrics = [{ x: W * 0.5, y: H * 0.35, h }];
  };

  const drawNow = () => {
    const rect = dom.stage.getBoundingClientRect();
    const W = Math.max(320, Math.floor(rect.width));
    const H = Math.max(240, Math.floor(rect.height));
    const target = specimenFontSize(state.scale);

    if (!state.font) {
      clearStage(W, H);
      setStatus('missing-font');
      placeCaret(caretMetrics[0]!);
      dom.onFontSize?.(target);
      dom.stats.textContent = '';
      dom.onAfterDraw?.();
      return;
    }

    const text = specimenText(state, t().shapes[state.shape]);
    if (!text) {
      clearStage(W, H);
      setStatus('empty');
      placeCaret({ x: W * 0.5, y: (H - target) * 0.5, h: target });
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

    caretMetrics = result.caretMetrics;
    const n = text.length;
    selStart = clamp(selStart, 0, n);
    selEnd = clamp(selEnd, 0, n);

    frame = {
      width: W,
      height: H,
      lamina: result.lamina,
      pathD: renderSvgPreview(dom.preview, {
        width: W,
        height: H,
        bg: state.bg,
        fill: state.color,
        lamina: result.lamina,
        selection: currentSelection()
      })
    };
    lastPointCount = result.pointCount;
    dom.onFontSize?.(result.fontSize);
    placeCaret(caretMetrics[selEnd] ?? result.caret);

    const shapeLabel = t().shapes[state.shape] ?? state.shape;
    dom.stats.textContent = `${moduleStamp()} · ${shapeLabel} · ${lastPointCount} ${t().points}`;
    dom.onAfterDraw?.();
  };

  const requestDraw = createFrameScheduler(drawNow);

  return {
    requestDraw,
    drawNow,
    getFrame: () => frame,
    setSelection: (start, end) => {
      const n = specimenText(state, t().shapes[state.shape]).length;
      const nextStart = clamp(start, 0, n);
      const nextEnd = clamp(end, 0, n);
      if (nextStart === selStart && nextEnd === selEnd) return;
      selStart = nextStart;
      selEnd = nextEnd;
      if (frame.pathD) paintSelectionOnly();
      else requestDraw();
    },
    indexAtPointer: (clientX, clientY) => {
      if (!caretMetrics.length) return 0;
      const rect = dom.stage.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      // Prefer the line under the pointer, then nearest X on that band.
      let lineY = caretMetrics[0]!.y;
      let bestLineDist = Infinity;
      for (const m of caretMetrics) {
        const mid = m.y + m.h * 0.5;
        const d = Math.abs(y - mid);
        if (y >= m.y && y <= m.y + m.h) {
          lineY = m.y;
          bestLineDist = -1;
          break;
        }
        if (d < bestLineDist) {
          bestLineDist = d;
          lineY = m.y;
        }
      }
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < caretMetrics.length; i++) {
        const m = caretMetrics[i]!;
        if (Math.abs(m.y - lineY) > 0.5) continue;
        const d = Math.abs(m.x - x);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      return best;
    },
    rasterizeBlob: async () => {
      renderCanvas(dom.raster, {
        width: frame.width,
        height: frame.height,
        bg: state.bg,
        fill: state.color,
        lamina: frame.lamina
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
