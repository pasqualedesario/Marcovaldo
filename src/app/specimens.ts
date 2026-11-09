import { contoursToSvgD } from '../core/path/ops';
import { buildOpenSpecimen, paintFingerprint, splitTextLines } from '../core/pipeline';
import { applySelOverlay, createSelLayer, SVG_NS } from '../preview/selection';
import { isMobile, MOBILE_MQ } from '../lib/device';
import { createFrameScheduler, yieldToMain } from '../lib/schedule';
import { nearestStopIndex, PT_TO_PX, selectionBounds } from '../lib/math';
import { bindTextEdit } from '../lib/textEdit';
import { COLOR_ACCENT } from '../lib/palette';
import { t } from '../i18n';
import type { AppState } from './state';
import { morphSpec, paramsSnapshot } from './state';

const BLOCK_MAX = 1200;

type LineVisual = {
  wrap: HTMLElement;
  svg: SVGSVGElement;
  fill: SVGPathElement;
  selRect: SVGRectElement;
  selPath: SVGPathElement;
  clipRect: SVGRectElement;
  caret: HTMLElement;
  text: string;
  /** Char offset of this line in the block text (excluding prior newlines counted in start). */
  start: number;
  caretStops: number[];
  band: { y: number; h: number };
  viewW: number;
  viewH: number;
  fingerprint: string;
};

type BlockModel = {
  article: HTMLElement;
  body: HTMLElement;
  input: HTMLTextAreaElement;
  sizePt: number;
  text: string;
  lines: LineVisual[];
  fingerprint: string;
};

function absoluteIndex(lines: readonly string[], li: number, local: number): number {
  let cursor = 0;
  for (let i = 0; i < li; i++) cursor += (lines[i]?.length ?? 0) + 1;
  return cursor + local;
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

function lineFingerprint(
  line: LineVisual,
  block: BlockModel,
  state: AppState,
  growth: number
): string {
  return paintFingerprint({
    fontName: state.font?.name ?? '',
    morph: morphSpec(state),
    offset: state.offset,
    growth,
    text: line.text,
    size: block.sizePt
  });
}

function paintLineSelection(
  line: LineVisual,
  block: BlockModel,
  bg: string
): void {
  const focused = document.activeElement === block.input;
  const a = block.input.selectionStart ?? 0;
  const b = block.input.selectionEnd ?? 0;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const lineLo = line.start;
  const lineHi = line.start + line.text.length;
  const d = line.fill.getAttribute('d') || '';

  const overlapLo = Math.max(lo, lineLo);
  const overlapHi = Math.min(hi, lineHi);
  const box =
    focused && overlapHi > overlapLo
      ? selectionBounds(line.caretStops, overlapLo - lineLo, overlapHi - lineLo)
      : null;

  applySelOverlay(
    { sel: line.selRect, clipRect: line.clipRect, selPath: line.selPath },
    d,
    box
      ? {
          x: box.x,
          y: line.band.y,
          w: box.w,
          h: line.band.h,
          fill: COLOR_ACCENT,
          ink: bg
        }
      : null
  );

  const caretAt = focused && lo === hi && hi >= lineLo && hi <= lineHi && !block.input.readOnly;
  if (caretAt && line.caretStops.length) {
    const svgRect = line.svg.getBoundingClientRect();
    const sx = svgRect.width / (line.viewW || 1);
    const sy = svgRect.height / (line.viewH || 1);
    const local = hi - lineLo;
    const cx = line.caretStops[local] ?? line.caretStops[line.caretStops.length - 1] ?? 0;
    line.caret.style.left = `${cx * sx}px`;
    line.caret.style.top = `${line.band.y * sy}px`;
    line.caret.style.height = `${Math.max(10, line.band.h * sy)}px`;
    line.caret.hidden = false;
  } else {
    line.caret.hidden = true;
  }
}

function paintBlockSelection(block: BlockModel, state: AppState): void {
  for (const line of block.lines) paintLineSelection(line, block, state.bg);
}

function syncMobileReadonly(block: BlockModel): void {
  const mobile = isMobile();
  block.input.readOnly = mobile;
  block.input.tabIndex = mobile ? -1 : 0;
  block.input.classList.toggle('is-readonly-mobile', mobile);
  if (mobile) for (const line of block.lines) line.caret.hidden = true;
}

function paintLineVisual(
  line: LineVisual,
  block: BlockModel,
  state: AppState,
  growth: number,
  force = false
): void {
  if (!state.font) return;
  const fp = lineFingerprint(line, block, state, growth);
  if (!force && fp === line.fingerprint) {
    paintLineSelection(line, block, state.bg);
    return;
  }

  const result = buildOpenSpecimen({
    font: state.font,
    text: line.text,
    params: { ...paramsSnapshot(state), growth },
    morph: morphSpec(state),
    offset: state.offset,
    sizePx: block.sizePt * PT_TO_PX
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
  if (isMobile()) line.wrap.style.height = '';
  else line.wrap.style.height = `${result.displayHeight}px`;
  line.fill.setAttribute('d', d);
  line.fill.setAttribute('fill', state.color);
  paintLineSelection(line, block, state.bg);
}

function rebuildBlockLines(block: BlockModel): void {
  const parts = splitTextLines(block.text);
  block.body.replaceChildren();
  block.lines = [];

  let start = 0;
  parts.forEach((text, li) => {
    const wrap = document.createElement('div');
    wrap.className = 'specimen-line';
    const { svg, fill, selRect, selPath, clipRect } = createLineSvg();
    const caret = document.createElement('div');
    caret.className = 'specimen-line-caret';
    caret.hidden = true;
    wrap.append(svg, caret);
    block.body.appendChild(wrap);

    const line: LineVisual = {
      wrap,
      svg,
      fill,
      selRect,
      selPath,
      clipRect,
      caret,
      text,
      start,
      caretStops: [],
      band: { y: 0, h: 12 },
      viewW: 1,
      viewH: 1,
      fingerprint: ''
    };
    block.lines.push(line);
    start += text.length + (li < parts.length - 1 ? 1 : 0);
  });

  // Invisible textarea covers the whole block for continuous selection.
  block.body.appendChild(block.input);
}

function indexAtBlockPointer(block: BlockModel, clientX: number, clientY: number): number {
  if (!block.lines.length) return 0;
  const parts = splitTextLines(block.text);
  let best = block.lines[0]!;
  let bestDist = Infinity;
  for (const line of block.lines) {
    const r = line.svg.getBoundingClientRect();
    if (!r.height) continue;
    const mid = r.top + r.height / 2;
    const dist = Math.abs(clientY - mid);
    if (clientY >= r.top && clientY <= r.bottom) {
      best = line;
      bestDist = -1;
      break;
    }
    if (dist < bestDist) {
      bestDist = dist;
      best = line;
    }
  }
  const rect = best.svg.getBoundingClientRect();
  if (!rect.width) return best.start;
  const x = ((clientX - rect.left) / rect.width) * best.viewW;
  const local = nearestStopIndex(best.caretStops, x);
  const li = block.lines.indexOf(best);
  return absoluteIndex(parts, Math.max(0, li), local);
}

/**
 * Live specimen gallery (desktop).
 * On mobile the section is hidden — morphing every Calvino line OOM/crash Safari.
 * `getPaintGrowth` freezes GROW while the stage plays so blocks stay stills.
 */
export function mountSpecimens(
  root: HTMLElement,
  state: AppState,
  opts?: { getPaintGrowth?: () => number }
): { refresh: () => void; rebuild: () => void } {
  const section = root.closest('.specimen-section') as HTMLElement | null;
  if (isMobile()) {
    if (section) section.hidden = true;
    root.replaceChildren();
    return { refresh: () => {}, rebuild: () => {} };
  }
  if (section) section.hidden = false;

  const blocks: BlockModel[] = [];
  let paintToken = 0;
  const paintGrowth = () => opts?.getPaintGrowth?.() ?? state.growth;

  const rebuild = () => {
    paintToken++;
    root.replaceChildren();
    blocks.length = 0;

    for (const spec of t().specimens) {
      const article = document.createElement('article');
      article.className = 'specimen-block';

      const chip = document.createElement('span');
      chip.className = 'specimen-chip';
      chip.textContent = `${spec.sizePt} pt`;

      const body = document.createElement('div');
      body.className = 'specimen-lines';

      const input = document.createElement('textarea');
      input.className = 'specimen-block-input';
      input.maxLength = BLOCK_MAX;
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.rows = Math.max(1, splitTextLines(spec.text).length);
      input.value = spec.text;
      input.setAttribute('aria-label', `${spec.sizePt} pt`);
      input.wrap = 'off';

      article.append(chip, body);

      const block: BlockModel = {
        article,
        body,
        input,
        sizePt: spec.sizePt,
        text: spec.text,
        lines: [],
        fingerprint: ''
      };

      rebuildBlockLines(block);

      bindTextEdit(input, {
        indexAtPointer: (x, y) => {
          if (input.readOnly) return 0;
          return indexAtBlockPointer(block, x, y);
        },
        onSelection: () => paintBlockSelection(block, state),
        onInput: () => {
          if (input.readOnly) return;
          let next = input.value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
          if (next !== input.value) {
            const sel = input.selectionStart ?? next.length;
            input.value = next;
            try {
              input.setSelectionRange(sel, sel);
            } catch {
              /* ignore */
            }
          }
          const partsBefore = splitTextLines(block.text);
          const partsAfter = splitTextLines(next);
          block.text = next;
          if (partsBefore.length !== partsAfter.length) {
            const sel = input.selectionStart ?? 0;
            rebuildBlockLines(block);
            syncMobileReadonly(block);
            void paintBlock(block, state, true);
            try {
              input.setSelectionRange(sel, sel);
            } catch {
              /* ignore */
            }
          } else {
            let start = 0;
            for (let i = 0; i < block.lines.length; i++) {
              const line = block.lines[i]!;
              line.text = partsAfter[i] ?? '';
              line.start = start;
              line.fingerprint = '';
              start += line.text.length + (i < partsAfter.length - 1 ? 1 : 0);
            }
            void paintBlock(block, state, true);
          }
        }
      });

      input.addEventListener('blur', () => paintBlockSelection(block, state));

      blocks.push(block);
      root.appendChild(article);
    }

    void paintBatched();
  };

  const paintBlock = async (block: BlockModel, st: AppState, force = false) => {
    const growth = paintGrowth();
    syncMobileReadonly(block);
    for (let i = 0; i < block.lines.length; i++) {
      paintLineVisual(block.lines[i]!, block, st, growth, force);
      // Yield often on long body blocks so the stage stays interactive.
      if ((i & 1) === 1) await yieldToMain();
    }
  };

  const blockVisible = (block: BlockModel) => {
    const r = block.article.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    return r.bottom > -80 && r.top < vh + 80;
  };

  const paintBatched = async () => {
    const token = ++paintToken;
    // Visible blocks first — below-fold Calvino paragraphs can catch up after.
    const ordered = [...blocks].sort((a, b) => {
      const av = blockVisible(a) ? 0 : 1;
      const bv = blockVisible(b) ? 0 : 1;
      return av - bv;
    });
    for (const block of ordered) {
      if (token !== paintToken) return;
      await paintBlock(block, state);
    }
  };

  window.matchMedia(MOBILE_MQ).addEventListener('change', () => {
    for (const block of blocks) syncMobileReadonly(block);
  });

  const refresh = createFrameScheduler(() => {
    void paintBatched();
  });
  rebuild();
  return { refresh, rebuild };
}
