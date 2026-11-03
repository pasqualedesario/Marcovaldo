import {
  LEAF_SHAPES,
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
import { formatTrackingEm } from '../lib/math';
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
import { mountSpecimens } from './specimens';
import { paintBrand } from './brand';
import { mountFaceChips } from './faceChips';
import { mountLangPin, mountOtfPin } from './otfPin';

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

  for (const a of document.querySelectorAll<HTMLAnchorElement>('.credits-type .credits-link')) {
    a.href = TYPEFACES_URL;
  }

  $('png').textContent = d.png;
  $('svg').textContent = d.svg;
  $('pdf').textContent = d.pdf;
  $('otf').textContent = d.otf;
  $('reshuffle').textContent = d.reshuffle;
  $('lang').textContent = d.langSwitch;

  const site = document.getElementById('site-link') as HTMLAnchorElement | null;
  if (site) site.href = d.siteUrl;
  const morph = document.getElementById('morph-link') as HTMLAnchorElement | null;
  if (morph) morph.href = d.creditsMorphUrl;
}

type MorphUi = {
  rebuildChips: () => void;
  syncSliders: () => void;
  refresh: () => void;
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

  type MorphPanel = 'margins' | 'shapes' | null;
  let openPanel: MorphPanel = null;

  const syncTextField = () => {
    textEl.value = state.text;
  };

  const dockEl = document.getElementById('dock');

  const setPanel = (panel: MorphPanel) => {
    openPanel = panel;
    const marginsOpen = panel === 'margins';
    const shapesOpen = panel === 'shapes';
    marginsEl.hidden = !marginsOpen;
    shapesEl.hidden = !shapesOpen;
    marginsToggle.setAttribute('aria-expanded', marginsOpen ? 'true' : 'false');
    shapesToggle.setAttribute('aria-expanded', shapesOpen ? 'true' : 'false');
    dockEl?.classList.toggle('is-expanded', panel !== null);
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
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = labels[id] ?? id;
      b.dataset.id = id;
      b.setAttribute('aria-pressed', id === current ? 'true' : 'false');
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
      b.className = 'chip chip-leaf';
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
    setPanel(openPanel === 'margins' ? null : 'margins');
  });
  shapesToggle.addEventListener('click', () => {
    setPanel(openPanel === 'shapes' ? null : 'shapes');
  });
  setPanel(null);

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

  growthEl.addEventListener('input', () => {
    state.growth = +growthEl.value;
    setRangePct(growthEl, state.growth);
    growthValEl.textContent = String(state.growth);
    engine.requestDraw();
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
  return { rebuildChips, syncSliders, refresh };
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
    btn.textContent = t().otfBusy;
    void import('../export/otf')
      .then(({ exportOtf }) =>
        exportOtf({
          basename: `${exportBasename(state)}-${state.shape}`,
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
      .catch(() => {
        btn.textContent = t().glyphMissing;
      })
      .finally(() => {
        document.body.classList.remove('is-busy');
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

  const specimens = mountSpecimens($('specimens'), state);
  const refreshSpecimens = createDebouncedRaf(() => specimens.refresh(), 140);
  const refreshBrand = createDebouncedRaf(() => paintBrand(brandEl, state), 80);

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
      refreshSpecimens();
      refreshBrand();
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

  applyLang();
  wireTextStage({ state, engine, textEl, caret });
  wireExports({ state, engine });

  $('reshuffle').addEventListener('click', () => {
    reshuffleAll(state, (shape: LeafShape) => t().shapes[shape] ?? shapeBaseText(shape));
    morphUi.refresh();
  });
  $('lang').addEventListener('click', () => {
    toggleLang();
    applyLang();
  });

  new ResizeObserver(createDebouncedRaf(() => engine.requestDraw())).observe(stage);
  mountOtfPin($('otf'), $('otf-anchor'), $('otf-land'));
  mountLangPin($('lang'), $('lang-land'));

  morphUi.syncSliders();
  paintBrand(brandEl, state);
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
