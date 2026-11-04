import { createFrameScheduler } from '../lib/schedule';

/** Read a CSS length token from :root (px). */
function rootPad(varName: string, fallback = 16): number {
  const n = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(varName));
  return Number.isFinite(n) ? Math.max(n, 12) : fallback;
}

type PinOpts = {
  btn: HTMLElement;
  land: HTMLElement;
  side: 'left';
};

/**
 * Sticky language chip — left pad lock, intrinsic width only.
 * Never unfixes mid-scroll (avoids jump).
 */
function mountStickyPin(opts: PinOpts): () => void {
  const { btn, land } = opts;
  let lockLeft: number | null = null;
  let lockW: number | null = null;
  let pinned = false;

  const clearFixed = () => {
    pinned = false;
    btn.classList.remove('is-fixed');
    btn.style.top = '';
    btn.style.left = '';
    btn.style.width = '';
    land.style.width = '';
    land.style.height = '';
  };

  const measureW = (): number => {
    const prev = btn.style.width;
    btn.style.width = 'auto';
    const w = Math.max(56, Math.ceil(btn.getBoundingClientRect().width || btn.scrollWidth || 56));
    btn.style.width = prev;
    return w;
  };

  const sync = () => {
    const padB = rootPad('--pad-b');
    const h = Math.max(1, Math.round(btn.getBoundingClientRect().height || 44));
    const stickTop = window.innerHeight - padB - h;

    if (window.scrollY <= 4) {
      lockLeft = null;
      lockW = null;
      if (pinned) clearFixed();
      return;
    }

    if (pinned) {
      btn.style.top = `${stickTop}px`;
      return;
    }

    const landRect = land.getBoundingClientRect();
    if (landRect.top >= stickTop - 1 && landRect.bottom > 0) return;

    lockLeft = rootPad('--pad');
    lockW = measureW();
    land.style.width = `${lockW}px`;
    land.style.height = `${h}px`;
    btn.classList.add('is-fixed');
    btn.style.top = `${stickTop}px`;
    btn.style.left = `${lockLeft}px`;
    btn.style.width = `${lockW}px`;
    pinned = true;
  };

  const onResize = () => {
    lockLeft = null;
    lockW = null;
    if (pinned) clearFixed();
    sync();
  };

  const schedule = createFrameScheduler(sync);
  sync();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', onResize);

  return () => {
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', onResize);
    clearFixed();
  };
}

/**
 * Pin Download cluster bottom-right.
 * Locks right edge once; expand-left must not move the chip while scrolling.
 */
export function mountDownloadPin(opts: {
  cluster: HTMLElement;
  toggle: HTMLElement;
  anchor: HTMLElement;
  land: HTMLElement;
}): () => void {
  const { cluster, toggle, anchor, land } = opts;
  let lockRight: number | null = null;
  let lockToggleW: number | null = null;
  let pinned = false;

  const measureToggleW = (): number => {
    const prev = toggle.style.width;
    toggle.style.width = 'auto';
    const w = Math.max(56, Math.ceil(toggle.getBoundingClientRect().width || toggle.scrollWidth || 56));
    toggle.style.width = prev;
    return w;
  };

  const clearFixed = () => {
    pinned = false;
    cluster.classList.remove('is-fixed');
    cluster.style.top = '';
    cluster.style.right = '';
    cluster.style.left = '';
    cluster.style.width = '';
    toggle.style.width = '';
    anchor.style.display = '';
    anchor.style.width = '';
    anchor.style.height = '';
    land.style.width = '';
    land.style.height = '';
  };

  const applyFixed = (stickTop: number, h: number) => {
    land.style.width = `${lockToggleW}px`;
    land.style.height = `${h}px`;
    anchor.style.display = 'inline-flex';
    anchor.style.width = `${lockToggleW}px`;
    anchor.style.height = `${h}px`;
    cluster.classList.add('is-fixed');
    cluster.style.top = `${stickTop}px`;
    cluster.style.right = `${lockRight}px`;
    toggle.style.width = `${lockToggleW}px`;
    pinned = true;
  };

  const sync = () => {
    const padB = rootPad('--pad-b');
    const h = Math.max(1, Math.round(toggle.offsetHeight || 44));
    const stickTop = window.innerHeight - padB - h;

    if (window.scrollY <= 4) {
      lockRight = null;
      lockToggleW = null;
      if (pinned) clearFixed();
      return;
    }

    // Already pinned: only refresh vertical stick line — never remeasure X.
    if (pinned) {
      cluster.style.top = `${stickTop}px`;
      return;
    }

    const br = toggle.getBoundingClientRect();
    if (br.top >= stickTop - 1) return;

    lockToggleW = measureToggleW();
    // Same inset as page pad — stable across scroll; expand grows left only.
    lockRight = rootPad('--pad');
    applyFixed(stickTop, h);
  };

  const onResize = () => {
    lockRight = null;
    lockToggleW = null;
    if (pinned) clearFixed();
    sync();
  };

  const schedule = createFrameScheduler(sync);
  sync();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', onResize);
  // Do not observe cluster — expand would reset the pin and make it jump.

  return () => {
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', onResize);
    clearFixed();
  };
}

export function mountLangPin(btn: HTMLElement, land: HTMLElement): () => void {
  return mountStickyPin({ btn, land, side: 'left' });
}
