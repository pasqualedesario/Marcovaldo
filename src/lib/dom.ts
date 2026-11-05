export function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el;
}

/**
 * Focus without an orange :focus-visible ring (dialog restore, scripted moves).
 * Ring returns on the next Tab/Arrow key.
 */
export function focusQuiet(el: HTMLElement): void {
  el.classList.add('is-focus-quiet');
  el.focus({ preventScroll: true });
  const clear = () => {
    el.classList.remove('is-focus-quiet');
    el.removeEventListener('blur', clear);
    el.removeEventListener('keydown', clear);
  };
  el.addEventListener('blur', clear);
  el.addEventListener('keydown', clear);
}

/** Show :focus-visible rings only while navigating with the keyboard. */
export function mountFocusModality(): void {
  const root = document.body;
  const arm = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (
      k === 'Tab' ||
      k === 'ArrowUp' ||
      k === 'ArrowDown' ||
      k === 'ArrowLeft' ||
      k === 'ArrowRight' ||
      k === 'Enter' ||
      k === ' '
    ) {
      root.classList.add('kb-focus');
    }
  };
  const disarm = () => root.classList.remove('kb-focus');
  window.addEventListener('keydown', arm, true);
  window.addEventListener('pointerdown', disarm, true);
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
