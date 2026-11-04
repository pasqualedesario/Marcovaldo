import { BRAND_TEXT, paintMorphMark } from './brand';
import type { AppState } from './state';

export type AboutUi = {
  open: (origin?: HTMLElement | null) => void;
  close: (opts?: { toGenerator?: boolean }) => void;
  isOpen: () => boolean;
  refreshMarks: () => void;
};

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Hard jump to generator top — same as a fresh page load. */
function hardResetToGenerator(workspace: HTMLElement): void {
  const html = document.documentElement;
  const body = document.body;
  const prevHtml = html.style.scrollBehavior;
  const prevBody = body.style.scrollBehavior;
  html.style.scrollBehavior = 'auto';
  body.style.scrollBehavior = 'auto';
  const se = document.scrollingElement;
  if (se) se.scrollTop = 0;
  html.scrollTop = 0;
  body.scrollTop = 0;
  window.scrollTo(0, 0);
  workspace.scrollIntoView({ block: 'start', behavior: 'auto' });
  window.scrollTo(0, 0);
  html.style.scrollBehavior = prevHtml;
  body.style.scrollBehavior = prevBody;
}

/**
 * About sheet — soft solid crossfade (inverted palette).
 * Returning to the generator resets scroll under the sheet first,
 * so the mid-page never flashes before the top view.
 */
export function mountAbout(opts: {
  state: AppState;
  openBtn: HTMLElement;
  sheet: HTMLElement;
  panel: HTMLElement;
  brandBtn: HTMLElement;
  sheetBrand: HTMLElement;
  generatorBtn: HTMLElement;
  workspace: HTMLElement;
  onLang?: () => void;
  langBtn?: HTMLElement | null;
}): AboutUi {
  const {
    state,
    openBtn,
    sheet,
    panel,
    brandBtn,
    sheetBrand,
    generatorBtn,
    workspace,
    onLang,
    langBtn
  } = opts;
  let open = false;
  let busy = false;

  const refreshMarks = () => {
    paintMorphMark(openBtn, state, 'About');
    paintMorphMark(sheetBrand, state, BRAND_TEXT);
  };

  const finishClose = (toGenerator: boolean) => {
    // Ensure top is set before the sheet uncovers (same frame).
    if (toGenerator) hardResetToGenerator(workspace);
    sheet.hidden = true;
    sheet.classList.remove('is-open', 'is-closing');
    panel.classList.remove('is-visible');
    document.body.classList.remove('about-open');
    sheet.setAttribute('aria-hidden', 'true');
    openBtn.setAttribute('aria-expanded', 'false');
    busy = false;
    open = false;
    if (toGenerator) {
      requestAnimationFrame(() => hardResetToGenerator(workspace));
    }
  };

  const close = (optsClose?: { toGenerator?: boolean }) => {
    const toGenerator = !!optsClose?.toGenerator;
    if (!open || busy) {
      if (toGenerator) hardResetToGenerator(workspace);
      return;
    }
    busy = true;

    // Reset under the opaque sheet first — never reveal the old scroll offset.
    if (toGenerator) hardResetToGenerator(workspace);

    sheet.classList.add('is-closing');
    sheet.classList.remove('is-open');
    panel.classList.remove('is-visible');

    const done = () => finishClose(toGenerator);
    if (reducedMotion()) {
      done();
      return;
    }
    sheet.addEventListener('transitionend', done, { once: true });
    window.setTimeout(done, 520);
  };

  const openSheet = () => {
    if (open || busy) return;
    busy = true;
    refreshMarks();
    sheet.hidden = false;
    sheet.setAttribute('aria-hidden', 'false');
    openBtn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('about-open');
    sheet.classList.remove('is-closing');
    panel.classList.remove('is-visible');
    void sheet.offsetWidth;
    sheet.classList.add('is-open');
    panel.classList.add('is-visible');
    open = true;
    busy = false;
    generatorBtn.focus({ preventScroll: true });
  };

  openBtn.addEventListener('click', () => openSheet());
  generatorBtn.addEventListener('click', () => close({ toGenerator: true }));
  sheetBrand.addEventListener('click', () => close({ toGenerator: true }));
  brandBtn.addEventListener('click', () => {
    if (open || busy) close({ toGenerator: true });
    else hardResetToGenerator(workspace);
  });
  langBtn?.addEventListener('click', () => onLang?.());

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open && !busy) {
      e.preventDefault();
      close({ toGenerator: true });
    }
  });

  return {
    open: () => openSheet(),
    close: (o) => close(o),
    isOpen: () => open,
    refreshMarks
  };
}
