export function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el;
}

export function $svg(id: string): SVGSVGElement {
  return $(id) as unknown as SVGSVGElement;
}

export function $input(id: string): HTMLInputElement {
  return $(id) as HTMLInputElement;
}

export function $textarea(id: string): HTMLTextAreaElement {
  return $(id) as HTMLTextAreaElement;
}

export function $canvas(id: string): HTMLCanvasElement {
  return $(id) as HTMLCanvasElement;
}

/** Sync an iOS-style range track fill (`--pct`). */
export function setRangePct(el: HTMLInputElement, value = +el.value): void {
  const min = +el.min || 0;
  const max = +el.max || 100;
  el.style.setProperty('--pct', `${((value - min) / (max - min)) * 100}%`);
}
