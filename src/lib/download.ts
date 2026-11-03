export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.download = filename;
  a.href = url;
  a.click();
  requestAnimationFrame(() => setTimeout(() => URL.revokeObjectURL(url), 1500));
}

export function downloadText(filename: string, text: string, type: string): void {
  downloadBlob(filename, new Blob([text], { type }));
}

export function safeFilename(name: string): string {
  return name.replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '') || 'export';
}
