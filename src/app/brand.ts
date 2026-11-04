import { contoursToSvgD } from '../core/path/ops';
import { buildOpenSpecimen, growthKey, morphKey } from '../core/pipeline';
import { PT_TO_PX } from '../lib/math';
import { SVG_NS } from '../preview/selection';
import type { AppState } from './state';
import { morphSpec, paramsSnapshot } from './state';

export const BRAND_TEXT = 'Marcovaldo';
const MARK_PT = 18;

type MarkNodes = {
  svg: SVGSVGElement;
  path: SVGPathElement;
};

const lastFp = new WeakMap<HTMLElement, string>();

function paintFallback(el: HTMLElement, text: string): void {
  lastFp.delete(el);
  el.replaceChildren();
  el.textContent = text;
  el.style.removeProperty('color');
}

function ensureNodes(el: HTMLElement): MarkNodes {
  let svg = el.querySelector(':scope > .brand-svg') as SVGSVGElement | null;
  let path = svg?.querySelector('path.brand-fill') as SVGPathElement | null;
  if (!svg || !path) {
    el.textContent = '';
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.classList.add('brand-svg');
    svg.setAttribute('overflow', 'visible');
    svg.setAttribute('aria-hidden', 'true');
    path = document.createElementNS(SVG_NS, 'path');
    path.classList.add('brand-fill');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('fill-rule', 'nonzero');
    svg.append(path);
    el.replaceChildren(svg);
  }
  return { svg, path };
}

/** Morph wordmark — color from CSS (hover → accent). */
export function paintMorphMark(
  el: HTMLElement,
  state: AppState,
  text: string,
  sizePt = MARK_PT
): void {
  el.style.removeProperty('color');
  const font = state.uiFont ?? state.font;
  if (!font) {
    paintFallback(el, text);
    return;
  }

  const morph = morphSpec(state);
  const fp = [
    font.name,
    morphKey(morph),
    state.offset,
    text,
    sizePt,
    growthKey(state.growth)
  ].join('|');

  if (fp === lastFp.get(el) && el.querySelector(':scope > .brand-svg')) return;

  const result = buildOpenSpecimen({
    font,
    text,
    params: paramsSnapshot(state),
    morph,
    offset: state.offset,
    sizePx: sizePt * PT_TO_PX,
    caret: false
  });

  if (!result) {
    paintFallback(el, text);
    return;
  }

  lastFp.set(el, fp);
  const { svg, path } = ensureNodes(el);
  svg.setAttribute('viewBox', `0 0 ${result.width} ${result.height}`);
  svg.style.width = `${result.displayWidth}px`;
  svg.style.height = `${result.displayHeight}px`;
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('d', contoursToSvgD(result.lamina));
}

export function paintBrand(el: HTMLElement, state: AppState): void {
  paintMorphMark(el, state, BRAND_TEXT);
}
