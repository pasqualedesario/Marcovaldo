import type { Contours } from '../core/types';
import { contoursToSvgD } from '../core/path/ops';
import {
  applySelOverlay,
  SVG_NS,
  type SelOverlay
} from './selection';

type StageNodes = {
  bg: SVGRectElement;
  sel: SVGRectElement;
  path: SVGPathElement;
  clipRect: SVGRectElement;
  selPath: SVGPathElement;
};

const stageCache = new WeakMap<SVGSVGElement, StageNodes>();

function ensureEl<K extends keyof SVGElementTagNameMap>(
  parent: ParentNode,
  tag: K,
  className: string,
  setup?: (el: SVGElementTagNameMap[K]) => void
): SVGElementTagNameMap[K] {
  let el = parent.querySelector(`:scope > .${className}`) as SVGElementTagNameMap[K] | null;
  if (!el) {
    el = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
    el.classList.add(className);
    setup?.(el);
    parent.appendChild(el);
  }
  return el;
}

function ensureStage(svg: SVGSVGElement): StageNodes {
  const cached = stageCache.get(svg);
  if (cached) return cached;

  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(SVG_NS, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }

  let clip = defs.querySelector('#sel-clip') as SVGClipPathElement | null;
  if (!clip) {
    clip = document.createElementNS(SVG_NS, 'clipPath');
    clip.id = 'sel-clip';
    defs.appendChild(clip);
  }
  let clipRect = clip.querySelector('rect') as SVGRectElement | null;
  if (!clipRect) {
    clipRect = document.createElementNS(SVG_NS, 'rect');
    clip.appendChild(clipRect);
  }

  const nodes: StageNodes = {
    bg: ensureEl(svg, 'rect', 'stage-bg', (r) => {
      r.setAttribute('width', '100%');
      r.setAttribute('height', '100%');
    }),
    sel: ensureEl(svg, 'rect', 'stage-sel'),
    path: ensureEl(svg, 'path', 'stage-fill', (p) => {
      p.setAttribute('fill-rule', 'nonzero');
    }),
    clipRect,
    selPath: ensureEl(svg, 'path', 'stage-sel-fill', (p) => {
      p.setAttribute('fill-rule', 'nonzero');
      p.setAttribute('clip-path', 'url(#sel-clip)');
    })
  };
  stageCache.set(svg, nodes);
  return nodes;
}

/** Full stage paint. Returns lamina path `d` for selection/export basename. */
export function renderSvgPreview(
  svg: SVGSVGElement,
  opts: {
    width: number;
    height: number;
    bg: string;
    fill: string;
    lamina: Contours;
    selection?: SelOverlay | null;
  }
): string {
  const d = contoursToSvgD(opts.lamina);
  svg.setAttribute('viewBox', `0 0 ${opts.width} ${opts.height}`);
  const nodes = ensureStage(svg);
  nodes.bg.setAttribute('fill', opts.bg);
  nodes.path.setAttribute('fill', opts.fill);
  nodes.path.setAttribute('d', d);
  applySelOverlay(nodes, d, opts.selection);
  return d;
}

export function updateSvgSelection(
  svg: SVGSVGElement,
  selection: SelOverlay | null,
  pathD: string
): void {
  applySelOverlay(ensureStage(svg), pathD, selection);
}

export function svgDocumentString(
  width: number,
  height: number,
  bg: string,
  fill: string,
  d: string,
  meta?: Record<string, string>
): string {
  const comments = meta
    ? Object.entries(meta)
        .map(([k, v]) => `<!-- ${k}: ${v.replace(/--/g, '—')} -->`)
        .join('\n')
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="${SVG_NS}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
${comments}
<rect width="100%" height="100%" fill="${bg}"/>
<path fill="${fill}" fill-rule="nonzero" d="${d}"/>
</svg>`;
}
