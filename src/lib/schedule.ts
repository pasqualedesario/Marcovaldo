/** Coalesce work to one callback per animation frame. */
export function createFrameScheduler(task: () => void): () => void {
  let pending = false;
  return () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      task();
    });
  };
}

/** Debounce with rAF trailing edge — resize, specimens, brand refresh. */
export function createDebouncedRaf(task: () => void, delayMs = 48): () => void {
  let timer = 0;
  return () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      requestAnimationFrame(task);
    }, delayMs);
  };
}

/** Yield to the browser so long exports stay responsive. */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
