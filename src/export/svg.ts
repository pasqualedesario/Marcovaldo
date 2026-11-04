import type { Contours } from '../core/types';
import { svgDocumentFromContours, svgDocumentString } from '../preview/svg';
import { downloadText, safeFilename } from '../lib/download';

export function exportSvg(opts: {
  basename: string;
  width: number;
  height: number;
  bg: string;
  fill: string;
  d: string;
  lamina?: Contours;
  meta: Record<string, string>;
}): void {
  const xml =
    opts.lamina && opts.lamina.length
      ? svgDocumentFromContours(
          opts.width,
          opts.height,
          opts.bg,
          opts.fill,
          opts.lamina,
          opts.meta
        )
      : svgDocumentString(
          opts.width,
          opts.height,
          opts.bg,
          opts.fill,
          opts.d,
          opts.meta
        );
  downloadText(`${safeFilename(opts.basename)}.svg`, xml, 'image/svg+xml;charset=utf-8');
}
