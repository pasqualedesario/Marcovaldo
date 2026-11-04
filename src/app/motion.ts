import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { isMobile } from '../lib/device';

gsap.registerPlugin(ScrollTrigger);

export type MotionHandle = {
  refreshScroll: () => void;
  revert: () => void;
};

/** Layout/UI motion — soft settle; no dock transforms (keeps sticky Download fixed). */
export function mountMotion(root: HTMLElement = document.querySelector('.app')!): MotionHandle {
  // Skip intro/scroll choreography on phones — saves main-thread + avoids fighting morph.
  if (isMobile()) {
    return { refreshScroll: () => {}, revert: () => {} };
  }

  const ctx = gsap.context(() => {
    const mm = gsap.matchMedia();

    mm.add('(prefers-reduced-motion: reduce)', () => {
      gsap.set(['.topbar', '.stage', '.dock', '.specimen-block', '.site-credits'], {
        clearProps: 'all'
      });
    });

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      // Opacity-first intro — avoid y/transform on .dock (breaks position:fixed Download).
      const intro = gsap.timeline({
        defaults: { ease: 'power3.out', duration: 0.9 },
        delay: 0.15
      });
      intro
        .from('.topbar', { autoAlpha: 0 }, 0)
        .from('.stage', { autoAlpha: 0 }, 0.12)
        .from('.dock', { autoAlpha: 0 }, 0.22)
        .from('.site-credits', { autoAlpha: 0 }, 0.35);

      intro.eventCallback('onComplete', () => {
        gsap.set(['.topbar', '.stage', '.dock', '.site-credits'], {
          clearProps: 'transform,opacity,visibility'
        });
      });

      ScrollTrigger.batch('.specimen-block', {
        start: 'top 92%',
        once: true,
        onEnter: (batch) => {
          gsap.from(batch, {
            autoAlpha: 0,
            y: 36,
            duration: 0.85,
            ease: 'power3.out',
            stagger: 0.1,
            overwrite: 'auto',
            onComplete: () => {
              gsap.set(batch, { clearProps: 'transform,opacity,visibility' });
            }
          });
        }
      });
    });
  }, root);

  return {
    refreshScroll: () => ScrollTrigger.refresh(),
    revert: () => ctx.revert()
  };
}

/**
 * About sheet motion — rises from below (footer About on mobile + desktop).
 */
export function animateAboutOpen(sheet: HTMLElement, panel: HTMLElement): Promise<void> {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    gsap.set(sheet, { clearProps: 'transform', autoAlpha: 1, yPercent: 0 });
    gsap.set(panel, { clearProps: 'all', autoAlpha: 1 });
    return Promise.resolve();
  }
  const mobile = isMobile();
  gsap.killTweensOf([sheet, panel]);
  gsap.set(sheet, { autoAlpha: 1, yPercent: 100 });
  gsap.set(panel, { autoAlpha: 0, y: mobile ? 36 : 24 });
  return new Promise((resolve) => {
    const tl = gsap.timeline({
      defaults: { ease: mobile ? 'power2.out' : 'power3.out' },
      onComplete: resolve
    });
    tl.to(sheet, { yPercent: 0, duration: mobile ? 0.7 : 0.85 }, 0).to(
      panel,
      { autoAlpha: 1, y: 0, duration: mobile ? 0.55 : 0.7 },
      mobile ? 0.12 : 0.2
    );
  });
}

export function animateAboutClose(sheet: HTMLElement, panel: HTMLElement): Promise<void> {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return Promise.resolve();
  }
  const mobile = isMobile();
  gsap.killTweensOf([sheet, panel]);
  return new Promise((resolve) => {
    const tl = gsap.timeline({
      defaults: { ease: mobile ? 'power2.in' : 'power3.inOut' },
      onComplete: resolve
    });
    tl.to(panel, { autoAlpha: 0, y: mobile ? 28 : 16, duration: mobile ? 0.28 : 0.35 }, 0).to(
      sheet,
      { yPercent: 100, duration: mobile ? 0.55 : 0.7 },
      0.05
    );
  });
}
