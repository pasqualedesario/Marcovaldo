import { createFrameScheduler } from '../lib/schedule';

/** Read a CSS length token from :root (px). */
function rootPad(varName: string, fallback = 16): number {
  const n = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(varName));
  return Number.isFinite(n) ? Math.max(n, 12) : fallback;
}

type PinOpts = {
  btn: HTMLElement;
  land: HTMLElement;
  /** When set, reserve this slot while the button is position:fixed. */
  anchor?: HTMLElement;
  side: 'right' | 'left';
};

/**
 * Sticky chrome for ↓ OTF and language:
 * rests in flow, then pins to the bottom. OTF keeps its toolbar X
 * (measured in-flow next to PNG/SVG/PDF); lang locks to the left pad.
 */
function mountStickyPin(opts: PinOpts): () => void {
  const { btn, land, anchor, side } = opts;
  /** Locked X while pinned — refreshed from in-flow measure when unpinning/resizing. */
  let lockLeft: number | null = null;

  let lockWidth: number | null = null;

  const clearFixed = () => {
    btn.classList.remove('is-fixed');
    btn.style.top = '';
    btn.style.left = '';
    btn.style.right = '';
    btn.style.width = '';
  };

  const restAnchor = () => {
    if (!anchor) return;
    anchor.style.display = 'contents';
    anchor.style.width = '';
    anchor.style.height = '';
  };

  const sync = () => {
    clearFixed();
    restAnchor();
    land.style.width = '';
    land.style.height = '';

    if (window.scrollY <= 4) {
      lockLeft = null;
      lockWidth = null;
      return;
    }

    // In-flow metrics (same band as sibling chips for OTF).
    // Prefer content width over stretched grid cells (mobile width:100%).
    const br = btn.getBoundingClientRect();
    const contentW = Math.ceil(
      Math.max(btn.scrollWidth || 0, (btn as HTMLElement).offsetWidth || 0, 56)
    );
    const w = lockWidth ?? Math.min(Math.max(1, Math.round(br.width || contentW)), contentW + 8);
    const h = Math.max(1, Math.round(br.height || 44));
    const padB = rootPad('--pad-b');
    const stickTop = window.innerHeight - padB - h;
    const landRect = land.getBoundingClientRect();

    if (side === 'right') {
      if (br.top >= stickTop - 1) {
        lockLeft = null;
        lockWidth = null;
        return;
      }

      // Capture toolbar X + intrinsic width once per pin session.
      if (lockLeft == null) lockLeft = Math.round(br.left);
      if (lockWidth == null) {
        // Measure with auto width so grid stretch does not inflate the pin.
        const prev = btn.style.width;
        btn.style.width = 'auto';
        lockWidth = Math.max(56, Math.ceil(btn.getBoundingClientRect().width || contentW));
        btn.style.width = prev;
      }

      land.style.width = `${lockWidth}px`;
      land.style.height = `${h}px`;
      if (anchor) {
        anchor.style.display = 'inline-flex';
        anchor.style.width = `${lockWidth}px`;
        anchor.style.height = `${h}px`;
      }

      btn.classList.add('is-fixed');
      btn.style.top = `${stickTop}px`;
      btn.style.left = `${lockLeft}px`;
      btn.style.width = `${lockWidth}px`;
      return;
    }

    // Language: stay in flow until the land slot crosses the stick line.
    if (landRect.top >= stickTop - 1 && landRect.bottom > 0) {
      lockLeft = null;
      return;
    }

    if (lockLeft == null) lockLeft = rootPad('--pad');

    land.style.width = `${w}px`;
    land.style.height = `${h}px`;
    btn.classList.add('is-fixed');
    btn.style.top = `${stickTop}px`;
    btn.style.left = `${lockLeft}px`;
  };

  const onResize = () => {
    // Force a fresh X/width from layout after viewport changes.
    lockLeft = null;
    lockWidth = null;
    sync();
  };

  const schedule = createFrameScheduler(sync);
  sync();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', onResize);
  const ro = new ResizeObserver(onResize);
  ro.observe(land);
  ro.observe(btn);
  ro.observe(document.documentElement);

  return () => {
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', onResize);
    ro.disconnect();
    clearFixed();
    restAnchor();
    land.style.width = '';
    land.style.height = '';
  };
}

export function mountOtfPin(btn: HTMLElement, anchor: HTMLElement, land: HTMLElement): () => void {
  return mountStickyPin({ btn, land, anchor, side: 'right' });
}

export function mountLangPin(btn: HTMLElement, land: HTMLElement): () => void {
  return mountStickyPin({ btn, land, side: 'left' });
}
