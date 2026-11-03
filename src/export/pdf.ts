import { downloadBlob, safeFilename } from '../lib/download';

/** Lazy-loads pdf-lib only when exporting. Accepts PNG bytes (preferred) or data URL. */
export async function exportPdfFromPng(opts: {
  basename: string;
  pngBytes?: ArrayBuffer | Uint8Array;
  /** @deprecated Prefer pngBytes — kept for callers that still hold a data URL. */
  pngDataUrl?: string;
  width: number;
  height: number;
}): Promise<void> {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const pngBytes =
    opts.pngBytes ??
    (opts.pngDataUrl
      ? await fetch(opts.pngDataUrl).then((r) => r.arrayBuffer())
      : null);
  if (!pngBytes) throw new Error('Missing PNG for PDF export');
  const png = await pdf.embedPng(pngBytes);
  const page = pdf.addPage([opts.width, opts.height]);
  page.drawImage(png, { x: 0, y: 0, width: opts.width, height: opts.height });
  const bytes = await pdf.save();
  downloadBlob(
    `${safeFilename(opts.basename)}.pdf`,
    new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
  );
}
