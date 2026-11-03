/** Pointer + keyboard selection wiring for invisible glyph text inputs. */

export type TextEditHooks = {
  indexAtClientX: (clientX: number) => number;
  onSelection: () => void;
  onInput?: () => void;
};

function scrollEdge(input: HTMLInputElement, clientX: number): void {
  const scroller = input.closest('.specimen-lines, .stage');
  if (!(scroller instanceof HTMLElement)) return;
  const r = scroller.getBoundingClientRect();
  const edge = 36;
  if (clientX > r.right - edge) scroller.scrollLeft += 28;
  else if (clientX < r.left + edge) scroller.scrollLeft -= 28;
}

export function bindTextEdit(input: HTMLInputElement, hooks: TextEditHooks): void {
  const sync = () => hooks.onSelection();
  let dragAnchor = -1;
  let dragging = false;

  const onMove = (e: PointerEvent) => {
    if (!dragging || dragAnchor < 0) return;
    e.preventDefault();
    scrollEdge(input, e.clientX);
    const i = hooks.indexAtClientX(e.clientX);
    try {
      input.setSelectionRange(Math.min(dragAnchor, i), Math.max(dragAnchor, i));
    } catch {
      /* ignore */
    }
    sync();
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    dragAnchor = -1;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    sync();
  };

  input.addEventListener('input', () => {
    hooks.onInput?.();
    sync();
  });
  for (const ev of ['select', 'keyup', 'click', 'focus'] as const) {
    input.addEventListener(ev, sync);
  }

  input.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || input.readOnly) return;
    e.preventDefault();
    input.focus({ preventScroll: true });
    const i = hooks.indexAtClientX(e.clientX);
    dragAnchor = i;
    dragging = true;
    try {
      input.setSelectionRange(i, i);
    } catch {
      /* ignore */
    }
    sync();
    // Document-level drag: more reliable than setPointerCapture on opacity:0 inputs,
    // and keeps selection continuous when the pointer crosses sibling line boxes.
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  });

  input.addEventListener('dblclick', (e) => {
    e.preventDefault();
    if (input.readOnly) return;
    input.focus({ preventScroll: true });
    try {
      input.select();
    } catch {
      /* ignore */
    }
    sync();
  });
}

export function setCollapsedRange(input: HTMLInputElement, index: number): void {
  const i = Math.max(0, Math.min(index, input.value.length));
  try {
    input.setSelectionRange(i, i);
  } catch {
    /* ignore */
  }
}
