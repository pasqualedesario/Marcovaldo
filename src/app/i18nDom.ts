import { getLang, t } from '../i18n';
import { $ } from '../lib/dom';
import { TYPEFACES_URL } from '../lib/typefaces';

/** Apply static dictionary strings + aria labels to the document. */
export function applyStaticI18n(): void {
  const d = t();

  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = node.dataset.i18n;
    if (!key || !(key in d)) continue;
    const val = d[key as keyof typeof d];
    if (typeof val === 'string') node.textContent = val;
  }

  const bind = (id: string, label: string) => {
    const el = document.getElementById(id);
    el?.setAttribute('aria-label', label);
    el?.setAttribute('title', label);
  };
  bind('scale', d.scale);
  bind('tracking', d.tracking);
  document.getElementById('face-chips')?.setAttribute('aria-label', d.font);
  document.getElementById('text')?.setAttribute('aria-label', d.textAria);
  document.getElementById('shapes')?.setAttribute('aria-label', d.shapesAria);
  document.getElementById('margins')?.setAttribute('aria-label', d.marginsAria);
  document.getElementById('shapes-toggle')?.setAttribute('aria-label', d.shapesAria);
  document.getElementById('margins-toggle')?.setAttribute('aria-label', d.marginsAria);
  document.querySelector('.specimen-section')?.setAttribute('aria-label', d.specimensAria);

  const growthLabelEl = document.getElementById('growth-label');
  if (growthLabelEl) growthLabelEl.textContent = d.growth;
  document.getElementById('p-growth')?.setAttribute('aria-label', d.growth);
  const growthField = document.querySelector<HTMLLabelElement>('label.field[data-param="growth"]');
  if (growthField) growthField.title = d.growth;

  const playBtn = document.getElementById('growth-play');
  const playPressed = playBtn?.getAttribute('aria-pressed') === 'true';
  playBtn?.setAttribute('aria-label', playPressed ? d.growthPause : d.growthPlay);
  playBtn?.setAttribute('title', playPressed ? d.growthPause : d.growthPlay);

  const otfStatic = document.getElementById('otf-static');
  if (otfStatic && otfStatic.getAttribute('aria-busy') !== 'true') {
    otfStatic.textContent = d.otfStatic;
  }

  for (const a of document.querySelectorAll<HTMLAnchorElement>('.credits-type .credits-link')) {
    a.href = TYPEFACES_URL;
  }

  $('png').textContent = d.png;
  $('svg').textContent = d.svg;
  $('pdf').textContent = d.pdf;
  if ($('otf').getAttribute('aria-busy') !== 'true') $('otf').textContent = d.otf;
  $('download-toggle').textContent = d.download;
  $('download-toggle').setAttribute('aria-label', d.download);
  $('exports')?.setAttribute('aria-label', d.download);
  $('reshuffle').textContent = d.reshuffle;

  const lang = getLang();
  const langSwitch = document.getElementById('lang-switch');
  if (langSwitch) {
    langSwitch.dataset.lang = lang;
    langSwitch.setAttribute('aria-label', d.langAria);
  }
  const langToggle = document.getElementById('lang');
  langToggle?.setAttribute('aria-checked', lang === 'en' ? 'true' : 'false');
  langToggle?.setAttribute('aria-label', d.langAria);
  for (const opt of document.querySelectorAll<HTMLElement>('.lang-opt')) {
    const on = opt.dataset.setLang === lang;
    opt.classList.toggle('is-on', on);
    opt.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  const brand = document.getElementById('brand');
  brand?.setAttribute('aria-label', d.brandHome);
  brand?.setAttribute('title', d.brandHome);
  const aboutBrand = document.getElementById('about-brand');
  aboutBrand?.setAttribute('aria-label', d.brandHome);
  aboutBrand?.setAttribute('title', d.brandHome);
  const aboutOpen = document.getElementById('about-open');
  aboutOpen?.setAttribute('aria-label', d.about);
  aboutOpen?.setAttribute('title', d.about);
  document.getElementById('about-sheet')?.setAttribute('aria-label', d.about);
  const site = document.getElementById('site-link') as HTMLAnchorElement | null;
  if (site) site.href = d.siteUrl;
  const ref = document.getElementById('ref-link') as HTMLAnchorElement | null;
  if (ref) {
    ref.href = d.creditsRefUrl;
    ref.textContent = d.creditsRefLink;
  }
  const github = document.getElementById('github-link') as HTMLAnchorElement | null;
  if (github) {
    github.href = d.creditsGithubUrl;
    github.textContent = d.creditsGithubLink;
  }
}
