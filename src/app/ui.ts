import {
  LEAF_SHAPES,
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
  DEFAULT_BG,
  DEFAULT_FG,
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
import { mountFaceSwitch } from './faceSwitch';
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
  document.querySelector('.face-chip')?.setAttribute('aria-label', d.font);
  document.getElementById('text')?.setAttribute('aria-label', d.textAria);
  document.getElementById('shapes')?.setAttribute('aria-label', d.shapesAria);
  document.getElementById('margins')?.setAttribute('aria-label', d.marginsAria);
  document.querySelector('.specimen-section')?.setAttribute('aria-label', d.specimensAria);

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
  paramsEl: HTMLElement;
  shapesEl: HTMLElement;
  marginsEl: HTMLElement;
  scaleEl: HTMLInputElement;
  trackingEl: HTMLInputElement;
  trackingValEl: HTMLElement;
  textEl: HTMLInputElement;
}): MorphUi {
  const {
    state, engine, stage, paramsEl, shapesEl, marginsEl, scaleEl, trackingEl, trackingValEl, textEl
  } = opts;

  const syncTextField = () => {
    textEl.value = state.text;
  };

  const fillChips = <T extends string>(
    el: HTMLElement,
    ids: readonly T[],
    labels: Record<string, string>,
    current: T,
    onPick: (id: T) => void
  ) => {
    el.replaceChildren();
    for (const id of ids) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = labels[id] ?? id;
      b.dataset.id = id;
      b.setAttribute('aria-pressed', id === current ? 'true' : 'false');
      b.addEventListener('click', () => {
        onPick(id);
        stage.classList.add('is-morphing');
        window.setTimeout(() => {
          refresh();
          stage.classList.remove('is-morphing');
        }, 160);
      });
      el.appendChild(b);
    }
  };

  const rebuildChips = () => {
    const d = t();
    fillChips(shapesEl, LEAF_SHAPES, d.shapes, state.shape, (id) => {
      applyShape(state, id, d.shapes[id]);
    });
    fillChips(marginsEl, marginsFor(state.shape), d.margins, state.margin, (id) => {
      applyMargin(state, id as LeafMargin);
    });
  };

  const ensureGrowthParam = () => {
    paramsEl.hidden = false;
    let wrap = paramsEl.querySelector<HTMLLabelElement>('label.field[data-param="growth"]');
    let input = document.getElementById('p-growth') as HTMLInputElement | null;
    let val = document.getElementById('v-growth');

    if (!wrap || !input || !val) {
      paramsEl.replaceChildren();
      wrap = document.createElement('label');
      wrap.className = 'field';
      wrap.dataset.param = 'growth';

      val = document.createElement('span');
      val.className = 'val';
      val.id = 'v-growth';

      input = document.createElement('input');
      input.type = 'range';
      input.className = 'ios';
      input.id = 'p-growth';
      input.min = '0';
      input.max = '100';
      input.addEventListener('input', () => {
        state.growth = +input!.value;
        setRangePct(input!, state.growth);
        val!.textContent = String(state.growth);
        engine.requestDraw();
      });

      wrap.append(document.createTextNode(''), val, input);
      paramsEl.appendChild(wrap);
    }

    const labelText = t().params.growth ?? 'Crescita';
    wrap.childNodes[0]!.textContent = `${labelText} `;
    input.setAttribute('aria-label', labelText);
    input.value = String(state.growth);
    val.textContent = String(state.growth);
    setRangePct(input, state.growth);
  };

  const syncSliders = () => {
    ensureGrowthParam();
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

  ensureGrowthParam();
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
    indexAtClientX: (x) => engine.indexAtX(x),
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
  fontNameEl: HTMLElement;
}): void {
  const { state, engine, fontNameEl } = opts;

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
      fontNameEl.textContent = t().fontMissing;
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

  state.bg = DEFAULT_BG;
  state.color = DEFAULT_FG;
  applyTheme(state);

  const stage = $('stage');
  const textEl = $input('text');
  const caret = $('caret');
  const fontNameEl = $('fontname');
  const paramsEl = $('params');
  const shapesEl = $('shapes');
  const marginsEl = $('margins');
  const scaleEl = $input('scale');
  const trackingEl = $input('tracking');
  const trackingValEl = $('trackingval');
  const sizePtEl = $('sizept');
  const brandEl = $('brand');
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
    status: $('stage-status'),
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
  const setFaceLabel = (id: FaceId) => {
    fontNameEl.textContent = faceDef(id).label;
  };
  const applyFace = async (id: FaceId, redraw = true) => {
    state.face = id;
    setFaceLabel(id);
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
      fontNameEl.textContent = t().fontMissing;
      if (redraw) engine.drawNow();
    }
  };

  mountFaceSwitch({
    chip: $('face-chip'),
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
    paramsEl,
    shapesEl,
    marginsEl,
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
  wireExports({ state, engine, fontNameEl });

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
  setFaceLabel(state.face || DEFAULT_FACE);
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
