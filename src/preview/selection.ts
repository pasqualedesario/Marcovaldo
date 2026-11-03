export const SVG_NS = 'http://www.w3.org/2000/svg';

export type SelOverlayNodes = {
  sel: SVGRectElement;
  clipRect: SVGRectElement;
  selPath: SVGPathElement;
};

export type SelOverlay = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Selection highlight fill. */
  fill: string;
  /** Selected glyph fill. */
  ink: string;
};

/** Show/hide selection rect + clipped ink path over an existing glyph `d`. */
export function applySelOverlay(
  nodes: SelOverlayNodes,
  d: string,
  selection: SelOverlay | null | undefined
): void {
  const active = selection && selection.w > 0.5;
  if (!active || !selection) {
    nodes.sel.setAttribute('display', 'none');
    nodes.selPath.setAttribute('display', 'none');
    nodes.clipRect.setAttribute('width', '0');
    nodes.clipRect.setAttribute('height', '0');
    return;
  }
  const { x, y, w, h, fill, ink } = selection;
  for (const el of [nodes.sel, nodes.clipRect]) {
    el.setAttribute('x', String(x));
    el.setAttribute('y', String(y));
    el.setAttribute('width', String(w));
    el.setAttribute('height', String(h));
  }
  nodes.sel.setAttribute('fill', fill);
  nodes.sel.removeAttribute('display');
  nodes.selPath.setAttribute('d', d);
  nodes.selPath.setAttribute('fill', ink);
  nodes.selPath.removeAttribute('display');
}

let clipSeq = 0;

/** Build defs/clip + selection rect/path for a specimen (or similar) SVG. */
export function createSelLayer(opts: {
  selClass: string;
  selPathClass: string;
  clipIdPrefix?: string;
}): {
  defs: SVGDefsElement;
  clipId: string;
  clipRect: SVGRectElement;
  selRect: SVGRectElement;
  selPath: SVGPathElement;
} {
  const clipId = `${opts.clipIdPrefix ?? 'sel'}-${++clipSeq}`;
  const defs = document.createElementNS(SVG_NS, 'defs');
  const clip = document.createElementNS(SVG_NS, 'clipPath');
  clip.id = clipId;
  const clipRect = document.createElementNS(SVG_NS, 'rect');
  clip.appendChild(clipRect);
  defs.appendChild(clip);

  const selRect = document.createElementNS(SVG_NS, 'rect');
  selRect.classList.add(opts.selClass);
  selRect.setAttribute('display', 'none');

  const selPath = document.createElementNS(SVG_NS, 'path');
  selPath.classList.add(opts.selPathClass);
  selPath.setAttribute('fill-rule', 'nonzero');
  selPath.setAttribute('clip-path', `url(#${clipId})`);
  selPath.setAttribute('display', 'none');

  return { defs, clipId, clipRect, selRect, selPath };
}
