import { downloadBlob, safeFilename } from '../lib/download';

/** Lazy-loads pdf-lib only when exporting. */
export async function exportPdfFromPng(opts: {
  basename: string;
  pngBytes: ArrayBuffer | Uint8Array;
  width: number;
  height: number;
}): Promise<void> {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const png = await pdf.embedPng(opts.pngBytes);
  const page = pdf.addPage([opts.width, opts.height]);
  page.drawImage(png, { x: 0, y: 0, width: opts.width, height: opts.height });
  const bytes = await pdf.save();
  downloadBlob(
    `${safeFilename(opts.basename)}.pdf`,
    new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
  );
}
