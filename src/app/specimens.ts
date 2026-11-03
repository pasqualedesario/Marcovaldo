import { contoursToSvgD } from '../core/path/ops';
import { buildOpenSpecimen, growthKey, morphKey } from '../core/pipeline';
import { applySelOverlay, createSelLayer, SVG_NS } from '../preview/selection';
import { createFrameScheduler, yieldToMain } from '../lib/schedule';
import { nearestStopIndex, PT_TO_PX, selectionBounds } from '../lib/math';
import { bindTextEdit } from '../lib/textEdit';
import { t } from '../i18n';
import type { AppState } from './state';
import { morphSpec, paramsSnapshot } from './state';

const LINE_MAX = 320;
const MOBILE_MQ = '(max-width: 720px)';

type LineModel = {
  wrap: HTMLElement;
  svg: SVGSVGElement;
  fill: SVGPathElement;
  selRect: SVGRectElement;
  selPath: SVGPathElement;
  clipRect: SVGRectElement;
  input: HTMLInputElement;
  caret: HTMLElement;
  sizePt: number;
  text: string;
  caretStops: number[];
  band: { y: number; h: number };
  viewW: number;
  viewH: number;
  fingerprint: string;
};

function isMobile(): boolean {
  return window.matchMedia(MOBILE_MQ).matches;
}

function lineFingerprint(line: LineModel, state: AppState): string {
  return [
    line.text,
    line.sizePt,
    morphKey(morphSpec(state)),
    state.offset,
    growthKey(state.growth),
    state.font?.name ?? ''
  ].join('|');
}

function createLineSvg(): {
  svg: SVGSVGElement;
  fill: SVGPathElement;
  selRect: SVGRectElement;
  selPath: SVGPathElement;
  clipRect: SVGRectElement;
} {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('specimen-svg');
  svg.setAttribute('overflow', 'visible');
  svg.setAttribute('role', 'img');

  const { defs, selRect, selPath, clipRect } = createSelLayer({
    selClass: 'line-sel',
    selPathClass: 'line-sel-fill',
    clipIdPrefix: 'sel'
  });

  const fill = document.createElementNS(SVG_NS, 'path');
  fill.classList.add('line-fill');
  fill.setAttribute('fill-rule', 'nonzero');

  svg.append(defs, selRect, fill, selPath);
  return { svg, fill, selRect, selPath, clipRect };
}

function paintSelection(line: LineModel, color: string, bg: string): void {
  const focused = document.activeElement === line.input;
  const a = line.input.selectionStart ?? 0;
  const b = line.input.selectionEnd ?? 0;
  const d = line.fill.getAttribute('d') || '';
  const box = focused ? selectionBounds(line.caretStops, a, b) : null;

  applySelOverlay(
    { sel: line.selRect, clipRect: line.clipRect, selPath: line.selPath },
    d,
    box
      ? {
          x: box.x,
          y: line.band.y,
          w: box.w,
          h: line.band.h,
          fill: color,
          ink: bg
        }
      : null
  );

  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (focused && lo === hi && line.caretStops.length && !line.input.readOnly) {
    const svgRect = line.svg.getBoundingClientRect();
    const sx = svgRect.width / (line.viewW || 1);
    const sy = svgRect.height / (line.viewH || 1);
    const cx = line.caretStops[hi] ?? line.caretStops[line.caretStops.length - 1] ?? 0;
    line.caret.style.left = `${cx * sx}px`;
    line.caret.style.top = `${line.band.y * sy}px`;
    line.caret.style.height = `${Math.max(10, line.band.h * sy)}px`;
    line.caret.hidden = false;
  } else {
    line.caret.hidden = true;
  }
}

function syncMobileReadonly(line: LineModel): void {
  const mobile = isMobile();
  line.input.readOnly = mobile;
  line.input.tabIndex = mobile ? -1 : 0;
  line.input.classList.toggle('is-readonly-mobile', mobile);
  if (mobile) line.caret.hidden = true;
}

function paintLine(line: LineModel, state: AppState, force = false): void {
  if (!state.font) return;
  syncMobileReadonly(line);
  const fp = lineFingerprint(line, state);
  if (!force && fp === line.fingerprint) {
    paintSelection(line, state.color, state.bg);
    return;
  }

  const result = buildOpenSpecimen({
    font: state.font,
    text: line.text,
    params: paramsSnapshot(state),
    morph: morphSpec(state),
    offset: state.offset,
    sizePx: line.sizePt * PT_TO_PX
  });
  if (!result) return;

  const d = contoursToSvgD(result.lamina);
  line.fingerprint = fp;
  line.viewW = result.width;
  line.viewH = result.height;
  line.caretStops = result.caretStops;
  line.band = result.caret;
  line.svg.setAttribute('viewBox', `0 0 ${result.width} ${result.height}`);
  line.svg.setAttribute('aria-label', line.text || '—');
  line.svg.style.width = `${result.displayWidth}px`;
  line.svg.style.height = `${result.displayHeight}px`;
  line.wrap.style.width = `${result.displayWidth}px`;
  // Let CSS control height on mobile (avoids double-leading from fixed wrap boxes).
  if (isMobile()) line.wrap.style.height = '';
  else line.wrap.style.height = `${result.displayHeight}px`;
  line.fill.setAttribute('d', d);
  line.fill.setAttribute('fill', state.color);
  paintSelection(line, state.color, state.bg);
}

export function mountSpecimens(
  root: HTMLElement,
  state: AppState
): { refresh: () => void; rebuild: () => void } {
  const lines: LineModel[] = [];
  let paintToken = 0;

  const syncSelection = (line: LineModel) => {
    paintSelection(line, state.color, state.bg);
  };

  const rebuild = () => {
    paintToken++;
    root.replaceChildren();
    lines.length = 0;

    for (const block of t().specimens) {
      const article = document.createElement('article');
      article.className = 'specimen-block';

      const chip = document.createElement('span');
      chip.className = 'specimen-chip';
      chip.textContent = `${block.sizePt} pt`;

      const body = document.createElement('div');
      body.className = 'specimen-lines';
      article.append(chip, body);

      block.lines.forEach((text, li) => {
        const wrap = document.createElement('div');
        wrap.className = 'specimen-line';
        const { svg, fill, selRect, selPath, clipRect } = createLineSvg();

        const caret = document.createElement('div');
        caret.className = 'specimen-line-caret';
        caret.hidden = true;

        const input = document.createElement('input');
        input.className = 'specimen-line-input';
        input.type = 'text';
        input.maxLength = LINE_MAX;
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.value = text;
        input.setAttribute('aria-label', `${block.sizePt} pt, line ${li + 1}`);

        wrap.append(svg, caret, input);
        body.appendChild(wrap);

        const line: LineModel = {
          wrap,
          svg,
          fill,
          selRect,
          selPath,
          clipRect,
          input,
          caret,
          sizePt: block.sizePt,
          text,
          caretStops: [],
          band: { y: 0, h: 12 },
          viewW: 1,
          viewH: 1,
          fingerprint: ''
        };

        bindTextEdit(input, {
          indexAtClientX: (clientX) => {
            if (input.readOnly) return 0;
            const rect = line.svg.getBoundingClientRect();
            if (!rect.width) return 0;
            const x = ((clientX - rect.left) / rect.width) * line.viewW;
            return nearestStopIndex(line.caretStops, x);
          },
          onSelection: () => syncSelection(line),
          onInput: () => {
            if (input.readOnly) return;
            line.text = input.value;
            line.fingerprint = '';
            paintLine(line, state, true);
          }
        });
        input.addEventListener('blur', () => {
          line.caret.hidden = true;
          paintSelection(line, state.color, state.bg);
        });

        lines.push(line);
      });

      root.appendChild(article);
    }

    void paintBatched();
  };

  const paintBatched = async () => {
    const token = ++paintToken;
    for (let i = 0; i < lines.length; i++) {
      if (token !== paintToken) return;
      paintLine(lines[i]!, state);
      if ((i & 1) === 1) await yieldToMain();
    }
  };

  window.matchMedia(MOBILE_MQ).addEventListener('change', () => {
    for (const line of lines) syncMobileReadonly(line);
  });

  const refresh = createFrameScheduler(() => {
    void paintBatched();
  });
  rebuild();
  return { refresh, rebuild };
}
