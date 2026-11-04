import { t } from '../i18n';
import { BRAND_TEXT, paintMorphMark } from './brand';
import { animateAboutClose, animateAboutOpen } from './motion';
import type { AppState } from './state';

export type AboutUi = {
  open: (origin?: HTMLElement | null) => void;
  close: (opts?: { toGenerator?: boolean }) => void;
  isOpen: () => boolean;
  refreshMarks: () => void;
};

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

function focusables(root: HTMLElement): HTMLElement[] {
  return [
    ...root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ].filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
}

/** About sheet — slides up from below. Close via Escape, wordmark, or topbar brand. */
export function mountAbout(opts: {
  state: AppState;
  openBtn: HTMLElement;
  sheet: HTMLElement;
  panel: HTMLElement;
  brandBtn: HTMLElement;
  sheetBrand: HTMLElement;
  workspace: HTMLElement;
  getPaintGrowth?: () => number;
}): AboutUi {
  const { state, openBtn, sheet, panel, brandBtn, sheetBrand, workspace, getPaintGrowth } = opts;
  let open = false;
  let busy = false;
  let lastFocus: HTMLElement | null = null;
  const app = document.querySelector('.app') as HTMLElement | null;

  const heroPt = () =>
    Math.round(Math.min(92, Math.max(44, Math.min(window.innerWidth, window.innerHeight) * 0.11)));

  const refreshMarks = () => {
    const growth = getPaintGrowth?.() ?? state.growth;
    paintMorphMark(openBtn, state, t().about, 18, growth);
    paintMorphMark(sheetBrand, state, BRAND_TEXT, heroPt(), growth);
  };

  const finishClose = (toGenerator: boolean) => {
    if (toGenerator) hardResetToGenerator(workspace);
    sheet.hidden = true;
    sheet.classList.remove('is-open', 'is-closing');
    document.documentElement.classList.remove('about-open');
    document.body.classList.remove('about-open');
    sheet.setAttribute('aria-hidden', 'true');
    openBtn.setAttribute('aria-expanded', 'false');
    if (app) app.inert = false;
    busy = false;
    open = false;
    const restore = lastFocus && document.contains(lastFocus) ? lastFocus : openBtn;
    restore.focus({ preventScroll: true });
    lastFocus = null;
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

    if (toGenerator) hardResetToGenerator(workspace);

    sheet.classList.add('is-closing');
    sheet.classList.remove('is-open');

    void animateAboutClose(sheet, panel).then(() => finishClose(toGenerator));
  };

  const openSheet = () => {
    if (open || busy) return;
    busy = true;
    lastFocus = (document.activeElement as HTMLElement | null) ?? openBtn;
    refreshMarks();
    sheet.hidden = false;
    sheet.setAttribute('aria-hidden', 'false');
    openBtn.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('about-open');
    document.body.classList.add('about-open');
    if (app) app.inert = true;
    sheet.classList.remove('is-closing');
    sheet.classList.add('is-open');
    open = true;
    void animateAboutOpen(sheet, panel).then(() => {
      busy = false;
      sheetBrand.focus({ preventScroll: true });
    });
  };

  openBtn.addEventListener('click', () => openSheet());
  sheetBrand.addEventListener('click', () => close({ toGenerator: true }));
  brandBtn.addEventListener('click', () => {
    if (open || busy) close({ toGenerator: true });
    else hardResetToGenerator(workspace);
  });
  window.addEventListener('resize', () => {
    if (open) refreshMarks();
  });

  window.addEventListener('keydown', (e) => {
    if (!open || busy) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close({ toGenerator: true });
      return;
    }
    if (e.key !== 'Tab') return;
    const nodes = focusables(panel);
    if (!nodes.length) return;
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && (active === first || !panel.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  });

  return {
    open: () => openSheet(),
    close: (o) => close(o),
    isOpen: () => open,
    refreshMarks
  };
}
