import { contoursToSvgD } from '../core/path/ops';
import { buildOpenSpecimen, growthKey, morphKey } from '../core/pipeline';
import { PT_TO_PX } from '../lib/math';
import { SVG_NS } from '../preview/selection';
import type { AppState } from './state';
import { morphSpec, paramsSnapshot } from './state';

const BRAND_TEXT = 'Marcovaldo';
const BRAND_PT = 18;

type BrandNodes = {
  svg: SVGSVGElement;
  path: SVGPathElement;
};

let lastBrandFp = '';

function paintFallback(el: HTMLElement, bg: string): void {
  lastBrandFp = '';
  el.replaceChildren();
  el.textContent = BRAND_TEXT;
  el.style.color = bg;
}

function ensureNodes(el: HTMLElement): BrandNodes {
  let svg = el.querySelector(':scope > .brand-svg') as SVGSVGElement | null;
  let path = svg?.querySelector('path.brand-fill') as SVGPathElement | null;
  if (!svg || !path) {
    el.textContent = '';
    el.style.color = '';
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.classList.add('brand-svg');
    svg.setAttribute('overflow', 'visible');
    path = document.createElementNS(SVG_NS, 'path');
    path.classList.add('brand-fill');
    path.setAttribute('fill-rule', 'nonzero');
    svg.append(path);
    el.replaceChildren(svg);
  }
  return { svg, path };
}

function tintBrand(el: HTMLElement, bg: string): void {
  const path = el.querySelector(':scope > .brand-svg path.brand-fill') as SVGPathElement | null;
  if (path) {
    path.setAttribute('fill', bg);
    return;
  }
  if (el.textContent === BRAND_TEXT) el.style.color = bg;
}

export function paintBrand(el: HTMLElement, state: AppState): void {
  const font = state.uiFont ?? state.font;
  if (!font) {
    paintFallback(el, state.bg);
    return;
  }

  const morph = morphSpec(state);
  const fp = [
    font.name,
    morphKey(morph),
    state.offset,
    BRAND_TEXT,
    BRAND_PT,
    growthKey(state.growth)
  ].join('|');

  if (fp === lastBrandFp && el.querySelector(':scope > .brand-svg')) {
    tintBrand(el, state.bg);
    return;
  }

  const result = buildOpenSpecimen({
    font,
    text: BRAND_TEXT,
    params: paramsSnapshot(state),
    morph,
    offset: state.offset,
    sizePx: BRAND_PT * PT_TO_PX,
    caret: false
  });

  if (!result) {
    paintFallback(el, state.bg);
    return;
  }

  lastBrandFp = fp;
  const { svg, path } = ensureNodes(el);
  svg.setAttribute('viewBox', `0 0 ${result.width} ${result.height}`);
  svg.style.width = `${result.displayWidth}px`;
  svg.style.height = `${result.displayHeight}px`;
  path.setAttribute('fill', state.bg);
  path.setAttribute('d', contoursToSvgD(result.lamina));
}
