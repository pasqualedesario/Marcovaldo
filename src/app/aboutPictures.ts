import { t } from '../i18n';
import {
  ABOUT_PHOTOGRAPHERS_LINE,
  ABOUT_PHOTOS,
  UNSPLASH_LEAF_MACRO_URL
} from '../lib/aboutPhotos';

const SLIDE_MS = 4500;
const SLIDE_FADE_MS = 1000;

export type AboutPicturesUi = {
  start: () => void;
  stop: () => void;
  syncCopy: () => void;
};

/** About full-bleed macros — lazy mount, crossfade, Macro chip toggles blur. */
export function mountAboutPictures(opts: {
  sheet: HTMLElement;
  root: HTMLElement | null;
  toggle: HTMLButtonElement | null;
  credits: HTMLElement | null;
}): AboutPicturesUi {
  const { sheet, root, toggle, credits } = opts;
  let shown = false;
  let mounted = false;
  let slides: HTMLElement[] = [];
  let index = 0;
  let slideTimer: number | null = null;
  let fadeTimer: number | null = null;

  const clearTimers = () => {
    if (slideTimer != null) {
      window.clearInterval(slideTimer);
      slideTimer = null;
    }
    if (fadeTimer != null) {
      window.clearTimeout(fadeTimer);
      fadeTimer = null;
    }
  };

  const syncToggle = () => {
    if (!toggle) return;
    const label = t().macros;
    toggle.textContent = label;
    toggle.setAttribute('aria-pressed', shown ? 'true' : 'false');
    toggle.setAttribute('aria-label', label);
  };

  const syncCredits = () => {
    if (!credits) return;
    const d = t();
    const frag = document.createDocumentFragment();
    frag.append(document.createTextNode(`${d.photosCreditsLead} `));
    const unsplash = document.createElement('a');
    unsplash.className = 'credits-link';
    unsplash.href = UNSPLASH_LEAF_MACRO_URL;
    unsplash.target = '_blank';
    unsplash.rel = 'noopener noreferrer';
    unsplash.textContent = d.photosUnsplash;
    frag.append(unsplash);
    frag.append(document.createTextNode(`. ${d.photosCreditsBy} ${ABOUT_PHOTOGRAPHERS_LINE}.`));
    credits.replaceChildren(frag);
  };

  const syncCopy = () => {
    syncToggle();
    syncCredits();
  };

  const ensureMounted = () => {
    if (mounted || !root) return;
    mounted = true;
    root.replaceChildren();
    slides = ABOUT_PHOTOS.map((photo, i) => {
      const fig = document.createElement('figure');
      fig.className = i === 0 ? 'about-pic is-visible' : 'about-pic';
      const img = document.createElement('img');
      img.className = 'about-pic-img';
      img.src = `about/${photo.file}`;
      img.alt = '';
      img.width = photo.width;
      img.height = photo.height;
      img.decoding = 'async';
      img.loading = i === 0 ? 'eager' : 'lazy';
      if (i === 0) img.fetchPriority = 'high';
      fig.append(img);
      root.append(fig);
      return fig;
    });
    index = 0;
  };

  const advance = () => {
    if (slides.length < 2) return;
    const prev = slides[index]!;
    index = (index + 1) % slides.length;
    const next = slides[index]!;
    next.classList.add('is-visible');
    if (fadeTimer != null) window.clearTimeout(fadeTimer);
    fadeTimer = window.setTimeout(() => {
      fadeTimer = null;
      prev.classList.remove('is-visible');
    }, SLIDE_FADE_MS);
  };

  const start = () => {
    ensureMounted();
    clearTimers();
    if (slides.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    slideTimer = window.setInterval(advance, SLIDE_MS);
  };

  toggle?.addEventListener('click', () => {
    shown = !shown;
    sheet.classList.toggle('pictures-shown', shown);
    syncToggle();
  });
  syncCopy();

  return {
    start,
    stop: clearTimers,
    syncCopy
  };
}
