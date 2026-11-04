import {
  LEAF_SHAPES,
  leafMarginIcon,
  leafShapeIcon,
  marginsFor,
  type LeafMargin,
  type LeafShape
} from '../core/modules/morphology';
import { loadFontFromUrl, type LoadedFont } from '../font/load';
import { exportSvg } from '../export/svg';
import { exportPdfFromPng } from '../export/pdf';
import { downloadBlob } from '../lib/download';
import { createDebouncedRaf } from '../lib/schedule';
import { $, $canvas, $input, $svg, setRangePct } from '../lib/dom';
import { clamp, formatTrackingEm } from '../lib/math';
import { bindTextEdit, setCollapsedRange } from '../lib/textEdit';
import {
  DEFAULT_FACE,
  FACE_IDS,
  TYPEFACES_URL,
  faceAssetUrl,
  faceDef,
  type FaceId
} from '../lib/typefaces';
import { getLang, setLang, t, toggleLang } from '../i18n';
import type { AppState } from './state';
import {
  applyMargin,
  applyShape,
  applyTheme,
  exportBasename,
  formatSizePt,
  isMorphBaseText,
  morphSpec,
  paramsSnapshot,
  reshuffleAll,
  shapeBaseText
} from './state';
import { createEngine, type Engine } from './engine';
import { createGrowthPlay } from './growthPlay';
import { mountSpecimens } from './specimens';
import { paintBrand } from './brand';
import { mountAbout } from './about';
import { mountFaceChips } from './faceChips';
import { mountDownloadPin, mountLangPin } from './otfPin';

function applyStaticI18n(): void {
  const d = t();
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = node.dataset.i18n as keyof typeof d;
    const val = d[key];
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

  const growthLabel = d.params.growth ?? 'Crescita';
  const growthLabelEl = document.getElementById('growth-label');
  if (growthLabelEl) growthLabelEl.textContent = growthLabel;
  document.getElementById('p-growth')?.setAttribute('aria-label', growthLabel);
  const growthField = document.querySelector<HTMLLabelElement>('label.field[data-param="growth"]');
  if (growthField) growthField.title = growthLabel;

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
  $('download-toggle').setAttribute('aria-label', d.downloadAria);
  $('exports')?.setAttribute('aria-label', d.downloadAria);
  $('reshuffle').textContent = d.reshuffle;
  $('lang').textContent = d.langSwitch;

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
  const aboutGen = document.getElementById('about-close');
  aboutGen?.setAttribute('aria-label', d.aboutGenerator);
  aboutGen?.setAttribute('title', d.aboutGenerator);
  const aboutLang = document.getElementById('about-lang');
  if (aboutLang) aboutLang.textContent = d.langSwitch;

  const site = document.getElementById('site-link') as HTMLAnchorElement | null;
  if (site) site.href = d.siteUrl;
  const morph = document.getElementById('morph-link') as HTMLAnchorElement | null;
  if (morph) morph.href = d.creditsMorphUrl;
}

type MorphUi = {
  rebuildChips: () => void;
  syncSliders: () => void;
  refresh: () => void;
  growthPlay: ReturnType<typeof createGrowthPlay>;
};

function wireMorphUi(opts: {
  state: AppState;
  engine: Engine;
  stage: HTMLElement;
  shapesEl: HTMLElement;
  marginsEl: HTMLElement;
  shapesToggle: HTMLButtonElement;
  marginsToggle: HTMLButtonElement;
  scaleEl: HTMLInputElement;
  trackingEl: HTMLInputElement;
  trackingValEl: HTMLElement;
  textEl: HTMLInputElement;
}): MorphUi {
  const {
    state,
    engine,
    stage,
    shapesEl,
    marginsEl,
    shapesToggle,
    marginsToggle,
    scaleEl,
    trackingEl,
    trackingValEl,
    textEl
  } = opts;

  let shapesOpen = false;
  let marginsOpen = false;

  const syncTextField = () => {
    textEl.value = state.text;
  };

  const syncPanels = () => {
    shapesEl.hidden = !shapesOpen;
    marginsEl.hidden = !marginsOpen;
    shapesToggle.setAttribute('aria-expanded', shapesOpen ? 'true' : 'false');
    marginsToggle.setAttribute('aria-expanded', marginsOpen ? 'true' : 'false');
  };

  const bindChipClick = (b: HTMLButtonElement, onPick: () => void) => {
    b.addEventListener('click', () => {
      onPick();
      stage.classList.add('is-morphing');
      window.setTimeout(() => {
        refresh();
        stage.classList.remove('is-morphing');
      }, 160);
    });
  };

  const fillMarginChips = (
    el: HTMLElement,
    ids: readonly LeafMargin[],
    labels: Record<string, string>,
    current: LeafMargin,
    onPick: (id: LeafMargin) => void
  ) => {
    el.replaceChildren();
    for (const id of ids) {
      const label = labels[id] ?? id;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip chip-rect chip-icon';
      b.dataset.id = id;
      b.title = label;
      b.setAttribute('aria-label', label);
      b.setAttribute('aria-pressed', id === current ? 'true' : 'false');
      const icon = leafMarginIcon(id);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', icon.viewBox);
      svg.setAttribute('aria-hidden', 'true');
      for (const d of icon.paths) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        svg.append(path);
      }
      b.append(svg);
      bindChipClick(b, () => onPick(id));
      el.appendChild(b);
    }
  };

  const fillShapeChips = (
    el: HTMLElement,
    labels: Record<string, string>,
    current: LeafShape,
    onPick: (id: LeafShape) => void
  ) => {
    el.replaceChildren();
    for (const id of LEAF_SHAPES) {
      const label = labels[id] ?? id;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip chip-rect chip-icon';
      b.dataset.id = id;
      b.title = label;
      b.setAttribute('aria-label', label);
      b.setAttribute('aria-pressed', id === current ? 'true' : 'false');
      const icon = leafShapeIcon(id);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', icon.viewBox);
      svg.setAttribute('aria-hidden', 'true');
      for (const d of icon.paths) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        svg.append(path);
      }
      b.append(svg);
      bindChipClick(b, () => onPick(id));
      el.appendChild(b);
    }
  };

  const rebuildChips = () => {
    const d = t();
    fillShapeChips(shapesEl, d.shapes, state.shape, (id) => {
      applyShape(state, id, d.shapes[id]);
    });
    fillMarginChips(marginsEl, marginsFor(state.shape), d.margins, state.margin, (id) => {
      applyMargin(state, id);
    });
  };

  marginsToggle.addEventListener('click', () => {
    marginsOpen = !marginsOpen;
    syncPanels();
  });
  shapesToggle.addEventListener('click', () => {
    shapesOpen = !shapesOpen;
    syncPanels();
  });
  syncPanels();

  const growthEl = $input('p-growth');
  const growthValEl = $('v-growth');

  const syncGrowth = () => {
    growthEl.value = String(state.growth);
    growthValEl.textContent = String(state.growth);
    setRangePct(growthEl, state.growth);
  };

  const syncSliders = () => {
    syncGrowth();
    scaleEl.value = String(state.scale);
    setRangePct(scaleEl, state.scale);
    trackingEl.value = String(state.tracking);
    setRangePct(trackingEl, state.tracking);
    trackingValEl.textContent = formatTrackingEm(state.tracking);
  };

  const refresh = () => {
    rebuildChips();
    syncSliders();
    syncTextField();
    engine.requestDraw();
  };

  const applyGrowth = (n: number) => {
    const next = clamp(n, 0, 100);
    if (next === state.growth && +growthEl.value === next) {
      setRangePct(growthEl, next);
      return;
    }
    state.growth = next;
    growthEl.value = String(next);
    growthValEl.textContent = String(next);
    setRangePct(growthEl, next);
    engine.requestDraw();
  };

  const playBtn = document.getElementById('growth-play') as HTMLButtonElement | null;
  const growthPlay = createGrowthPlay({
    getGrowth: () => state.growth,
    setGrowth: applyGrowth,
    onPlayingChange: (playing) => {
      if (!playBtn) return;
      playBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
      playBtn.textContent = playing ? '❚❚' : '▶';
      const d = t();
      playBtn.setAttribute('aria-label', playing ? d.growthPause : d.growthPlay);
      playBtn.title = playing ? d.growthPause : d.growthPlay;
      // Specimens catch up when play stops (skipped while animating).
      if (!playing) engine.requestDraw();
    }
  });
  playBtn?.addEventListener('click', () => growthPlay.toggle());

  growthEl.addEventListener('input', () => {
    growthPlay.stop();
    applyGrowth(+growthEl.value);
  });
  scaleEl.addEventListener('input', () => {
    state.scale = +scaleEl.value;
    setRangePct(scaleEl, state.scale);
    engine.requestDraw();
  });
  trackingEl.addEventListener('input', () => {
    state.tracking = +trackingEl.value;
    setRangePct(trackingEl, state.tracking);
    trackingValEl.textContent = formatTrackingEm(state.tracking);
    engine.requestDraw();
  });

  syncGrowth();
  return { rebuildChips, syncSliders, refresh, growthPlay };
}

function wireTextStage(opts: {
  state: AppState;
  engine: Engine;
  textEl: HTMLInputElement;
  caret: HTMLElement;
}): void {
  const { state, engine, textEl, caret } = opts;

  bindTextEdit(textEl, {
    indexAtPointer: (x) => engine.indexAtX(x),
    onSelection: () => {
      engine.setSelection(textEl.selectionStart ?? 0, textEl.selectionEnd ?? 0);
    },
    onInput: () => {
      state.text = textEl.value;
      engine.requestDraw();
    }
  });
  textEl.addEventListener('blur', () => {
    caret.hidden = true;
    engine.setSelection(textEl.selectionStart ?? 0, textEl.selectionStart ?? 0);
  });
}

function wireExports(opts: {
  state: AppState;
  engine: Engine;
}): void {
  const { state, engine } = opts;
  const statusEl = $('stage-status');
  const toggle = $('download-toggle') as HTMLButtonElement;
  const exportsEl = $('exports');

  const setOpen = (open: boolean) => {
    exportsEl.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  toggle.addEventListener('click', () => {
    setOpen(exportsEl.hidden);
  });

  $('png').addEventListener('click', () => {
    void engine.rasterizeBlob().then((blob) => {
      downloadBlob(`${exportBasename(state)}.png`, blob);
    });
  });
  $('svg').addEventListener('click', () => {
    exportSvg({
      basename: exportBasename(state),
      width: state.width,
      height: state.height,
      bg: state.bg,
      fill: state.color,
      d: state.pathD,
      lamina: state.lamina,
      meta: engine.meta()
    });
  });
  $('pdf').addEventListener('click', () => {
    void engine.rasterizeBlob().then(async (blob) => {
      await exportPdfFromPng({
        basename: exportBasename(state),
        pngBytes: new Uint8Array(await blob.arrayBuffer()),
        width: state.width,
        height: state.height
      });
    });
  });
  $('otf').addEventListener('click', () => {
    if (!state.font) {
      statusEl.hidden = false;
      statusEl.textContent = t().fontMissing;
      return;
    }
    const btn = $('otf');
    const label = t().otf;
    document.body.classList.add('is-busy');
    btn.setAttribute('aria-busy', 'true');
    btn.textContent = t().otfBusy;
    void import('../export/vf')
      .then(({ exportGrowthVf }) =>
        exportGrowthVf({
          basename: exportBasename(state),
          fontName: state.font!.name,
          font: state.font!,
          morph: morphSpec(state),
          offset: state.offset,
          onProgress: ({ done, total }) => {
            btn.textContent = `${done}/${total}`;
          }
        })
      )
      .catch((err) => {
        console.error('VF export failed', err);
        btn.textContent = t().glyphMissing;
      })
      .finally(() => {
        document.body.classList.remove('is-busy');
        btn.removeAttribute('aria-busy');
        btn.textContent = label;
      });
  });

  // Gauntlet-style static instance at current GROW
  $('otf-static').addEventListener('click', () => {
    if (!state.font) {
      statusEl.hidden = false;
      statusEl.textContent = t().fontMissing;
      return;
    }
    const btn = $('otf-static');
    const label = t().otfStatic;
    document.body.classList.add('is-busy');
    btn.setAttribute('aria-busy', 'true');
    btn.textContent = t().otfStaticBusy;
    void import('../export/otf')
      .then(({ exportOtf }) =>
        exportOtf({
          basename: `${exportBasename(state)}-GROW${state.growth | 0}`,
          fontName: state.font!.name,
          font: state.font!,
          params: paramsSnapshot(state),
          morph: morphSpec(state),
          offset: state.offset,
          onProgress: ({ done, total }) => {
            btn.textContent = `${done}/${total}`;
          }
        })
      )
      .catch((err) => {
        console.error('OTF export failed', err);
        btn.textContent = t().glyphMissing;
      })
      .finally(() => {
        document.body.classList.remove('is-busy');
        btn.removeAttribute('aria-busy');
        btn.textContent = label;
      });
  });
}

export function mountApp(state: AppState): void {
  setLang(getLang());
  applyTheme(state);

  const stage = $('stage');
  const textEl = $input('text');
  const caret = $('caret');
  const shapesEl = $('shapes');
  const marginsEl = $('margins');
  const scaleEl = $input('scale');
  const trackingEl = $input('tracking');
  const trackingValEl = $('trackingval');
  const sizePtEl = $('sizept');
  const brandEl = $('brand');
  const statusEl = $('stage-status');
  textEl.value = state.text;

  const applyLangRef = { current: () => {} };
  const about = mountAbout({
    state,
    openBtn: $('about-open'),
    sheet: $('about-sheet'),
    panel: $('about-panel'),
    brandBtn: brandEl,
    sheetBrand: $('about-brand'),
    generatorBtn: $('about-close'),
    workspace: $('workspace'),
    langBtn: document.getElementById('about-lang'),
    onLang: () => applyLangRef.current()
  });

  const specimens = mountSpecimens($('specimens'), state);
  const refreshSpecimens = createDebouncedRaf(() => specimens.refresh(), 140);
  const refreshBrand = createDebouncedRaf(() => {
    paintBrand(brandEl, state);
    about.refreshMarks();
  }, 80);

  /** Set after morph UI mounts — skip heavy specimen redraw while GROW plays. */
  const growthPlayRef: { current: ReturnType<typeof createGrowthPlay> | null } = { current: null };

  const engine = createEngine(state, {
    stage,
    preview: $svg('preview'),
    raster: $canvas('raster'),
    caret,
    stats: $('stats'),
    status: statusEl,
    statusMessage: (kind) => {
      if (kind === 'missing-font') return t().fontMissing;
      if (kind === 'missing-glyph') return t().glyphMissing;
      if (kind === 'empty') return t().typeHint;
      return '';
    },
    onFontSize: (px) => {
      sizePtEl.textContent = formatSizePt(px);
      sizePtEl.title = px ? `${Math.round(px)} px` : '';
    },
    onAfterDraw: () => {
      const playing = growthPlayRef.current?.playing() ?? false;
      refreshBrand();
      if (!playing) refreshSpecimens();
    }
  });

  const faceCache = new Map<FaceId, LoadedFont>();
  const applyFace = async (id: FaceId, redraw = true) => {
    state.face = id;
    try {
      let font = faceCache.get(id);
      if (!font) {
        const def = faceDef(id);
        font = await loadFontFromUrl(faceAssetUrl(def.file), def.label);
        faceCache.set(id, font);
      }
      state.font = font;
      // UI chrome (brand) stays on FOSS Modern.
      state.uiFont = faceCache.get('sans') ?? (id === 'sans' ? font : state.uiFont);
      if (redraw) engine.drawNow();
    } catch {
      state.font = null;
      statusEl.hidden = false;
      statusEl.textContent = t().fontMissing;
      if (redraw) engine.drawNow();
    }
  };

  mountFaceChips({
    buttons: FACE_IDS.map((id) => $(`face-${id}`) as HTMLButtonElement),
    getFace: () => state.face,
    onChange: (face) => {
      void applyFace(face);
    }
  });

  const morphUi = wireMorphUi({
    state,
    engine,
    stage,
    shapesEl,
    marginsEl,
    shapesToggle: $('shapes-toggle') as HTMLButtonElement,
    marginsToggle: $('margins-toggle') as HTMLButtonElement,
    scaleEl,
    trackingEl,
    trackingValEl,
    textEl
  });
  growthPlayRef.current = morphUi.growthPlay;

  const focusEnd = () => {
    textEl.focus({ preventScroll: true });
    setCollapsedRange(textEl, textEl.value.length);
    engine.setSelection(textEl.selectionStart ?? 0, textEl.selectionEnd ?? 0);
    caret.hidden = false;
  };

  const applyLang = () => {
    applyStaticI18n();
    if (isMorphBaseText(state.text)) {
      state.text = shapeBaseText(state.shape, t().shapes[state.shape]);
      textEl.value = state.text;
    }
    morphUi.rebuildChips();
    morphUi.syncSliders();
    specimens.rebuild();
    engine.requestDraw();
  };
  applyLangRef.current = () => {
    toggleLang();
    applyLang();
  };

  applyLang();
  wireTextStage({ state, engine, textEl, caret });
  wireExports({ state, engine });

  $('reshuffle').addEventListener('click', () => {
    morphUi.growthPlay.stop();
    reshuffleAll(state, (shape: LeafShape) => t().shapes[shape] ?? shapeBaseText(shape));
    morphUi.refresh();
  });
  $('lang').addEventListener('click', () => applyLangRef.current());

  new ResizeObserver(createDebouncedRaf(() => engine.requestDraw())).observe(stage);
  mountDownloadPin({
    cluster: $('download-cluster'),
    toggle: $('download-toggle'),
    anchor: $('download-anchor'),
    land: $('download-land')
  });
  mountLangPin($('lang'), $('lang-land'));

  morphUi.syncSliders();
  paintBrand(brandEl, state);
  about.refreshMarks();
  focusEnd();

  void applyFace(state.face || DEFAULT_FACE).then(() => focusEnd());
  // Warm the other face; keep sans as uiFont.
  for (const id of FACE_IDS) {
    if (id === state.face) continue;
    const def = faceDef(id);
    void loadFontFromUrl(faceAssetUrl(def.file), def.label)
      .then((font) => {
        faceCache.set(id, font);
        if (id === 'sans') state.uiFont = font;
      })
      .catch(() => undefined);
  }
}
