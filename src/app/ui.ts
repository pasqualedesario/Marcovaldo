import {
  LEAF_SHAPES,
  leafMarginIcon,
  leafShapeIcon,
  marginsFor,
  type LeafMargin,
  type LeafShape
} from '../core/modules/morphology';
import { loadFontFromUrl, type LoadedFont } from '../font/load';
import { isMobile, MOBILE_MQ } from '../lib/device';
import { createDebouncedRaf } from '../lib/schedule';
import { $, $canvas, $input, $svg, $textarea, setRangePct } from '../lib/dom';
import { clamp, TRACKING_MAX } from '../lib/math';
import { setMobilePreview } from '../core/pipeline';
import { bindTextEdit, setCollapsedRange } from '../lib/textEdit';
import {
  DEFAULT_FACE,
  FACE_IDS,
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
  formatSizePt,
  isMorphBaseText,
  reshuffleAll,
  shapeBaseText
} from './state';
import { createEngine, type Engine } from './engine';
import { createGrowthPlay } from './growthPlay';
import { mountSpecimens } from './specimens';
import { paintBrand } from './brand';
import { mountAbout } from './about';
import { mountFaceChips } from './faceChips';
import { mountDownloadPin, mountLangPin } from './stickyPins';
import { applyStaticI18n } from './i18nDom';
import { wireExports } from './exportsUi';
import { mountMotion } from './motion';

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
  textEl: HTMLTextAreaElement;
  onPlayingChange?: (playing: boolean) => void;
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
    textEl,
    onPlayingChange
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
      // Paint immediately — artificial delay made morph feel slower than it is.
      refresh();
      window.setTimeout(() => stage.classList.remove('is-morphing'), 120);
    });
  };

  const appendChipIcon = (
    b: HTMLButtonElement,
    icon: { viewBox: string; paths: readonly string[] }
  ) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', icon.viewBox);
    svg.setAttribute('aria-hidden', 'true');
    for (const d of icon.paths) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.append(path);
    }
    b.append(svg);
  };

  const makeIconChip = (
    id: string,
    label: string,
    pressed: boolean,
    icon: { viewBox: string; paths: readonly string[] },
    onPick: () => void
  ) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip chip-rect chip-icon';
    b.dataset.id = id;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    appendChipIcon(b, icon);
    bindChipClick(b, onPick);
    return b;
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
      el.appendChild(
        makeIconChip(id, label, id === current, leafMarginIcon(id), () => onPick(id))
      );
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
      el.appendChild(
        makeIconChip(id, label, id === current, leafShapeIcon(id), () => onPick(id))
      );
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
    trackingValEl.textContent = String(Math.round(state.tracking));
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
      if (playBtn) {
        playBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
        playBtn.textContent = playing ? '❚❚' : '▶';
        const d = t();
        playBtn.setAttribute('aria-label', playing ? d.growthPause : d.growthPlay);
        playBtn.title = playing ? d.growthPause : d.growthPlay;
      }
      onPlayingChange?.(playing);
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
    state.tracking = clamp(+trackingEl.value, 0, TRACKING_MAX);
    trackingEl.value = String(state.tracking);
    setRangePct(trackingEl, state.tracking);
    trackingValEl.textContent = String(Math.round(state.tracking));
    engine.requestDraw();
  });

  syncGrowth();
  return { rebuildChips, syncSliders, refresh, growthPlay };
}

function wireTextStage(opts: {
  state: AppState;
  engine: Engine;
  textEl: HTMLTextAreaElement;
  caret: HTMLElement;
}): void {
  const { state, engine, textEl, caret } = opts;

  const syncText = () => {
    // Textarea may emit \r\n on some platforms — keep a single \n for layout.
    const next = textEl.value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (next !== textEl.value) {
      const sel = textEl.selectionStart ?? next.length;
      textEl.value = next;
      try {
        textEl.setSelectionRange(sel, sel);
      } catch {
        /* ignore */
      }
    }
    state.text = next;
    engine.requestDraw();
  };

  bindTextEdit(textEl, {
    indexAtPointer: (x, y) => engine.indexAtPointer(x, y),
    onSelection: () => {
      engine.setSelection(textEl.selectionStart ?? 0, textEl.selectionEnd ?? 0);
    },
    onInput: syncText
  });
  textEl.addEventListener('blur', () => {
    caret.hidden = true;
    engine.setSelection(textEl.selectionStart ?? 0, textEl.selectionStart ?? 0);
  });
}

export function mountApp(state: AppState): void {
  setLang(getLang());
  applyTheme(state);
  const mobile = isMobile();
  setMobilePreview(mobile);

  const stage = $('stage');
  const textEl = $textarea('text');
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

  /** While stage GROW plays, chrome + specimens freeze at this growth (stills). */
  let growthHold: number | null = null;
  const paintGrowth = () => growthHold ?? state.growth;

  const about = mountAbout({
    state,
    openBtn: $('about-open'),
    sheet: $('about-sheet'),
    panel: $('about-panel'),
    brandBtn: brandEl,
    sheetBrand: $('about-brand'),
    workspace: $('workspace'),
    getPaintGrowth: paintGrowth
  });

  const specimens = mountSpecimens($('specimens'), state, {
    getPaintGrowth: paintGrowth
  });
  // Specimens are heavier than the stage — debounce a bit so rapid chip picks coalesce.
  const refreshSpecimens = createDebouncedRaf(() => specimens.refresh(), 80);
  const refreshBrand = createDebouncedRaf(() => {
    paintBrand(brandEl, state, paintGrowth());
    about.refreshMarks();
  }, 80);
  const motion = mountMotion();

  const engine = createEngine(state, {
    stage,
    preview: $svg('preview'),
    raster: $canvas('raster'),
    caret,
    stats: $('stats'),
    status: statusEl,
    isTextFocused: () => document.activeElement === textEl,
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
      if (growthHold == null) {
        refreshBrand();
        refreshSpecimens();
      }
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
      // Brand / About follow the active face even while GROW play freezes morphology.
      refreshBrand();
      if (redraw) engine.drawNow();
    } catch {
      state.font = null;
      statusEl.hidden = false;
      statusEl.textContent = t().fontMissing;
      refreshBrand();
      if (redraw) engine.drawNow();
    }
  };

  const faceChips = mountFaceChips({
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
    textEl,
    onPlayingChange: (playing) => {
      if (playing) {
        growthHold = state.growth;
      } else {
        growthHold = null;
      }
      // Freeze stills at hold growth while playing; unlock to live growth on stop.
      refreshBrand();
      refreshSpecimens();
    }
  });

  const focusEnd = () => {
    textEl.focus({ preventScroll: true });
    setCollapsedRange(textEl, textEl.value.length);
    engine.setSelection(textEl.selectionStart ?? 0, textEl.selectionEnd ?? 0);
    caret.hidden = false;
  };

  const applyLang = () => {
    applyStaticI18n();
    about.syncPicturesLabel();
    if (isMorphBaseText(state.text)) {
      state.text = shapeBaseText(state.shape, t().shapes[state.shape]);
      textEl.value = state.text;
    }
    morphUi.rebuildChips();
    morphUi.syncSliders();
    specimens.rebuild();
    motion.refreshScroll();
    engine.requestDraw();
  };

  applyLang();
  wireTextStage({ state, engine, textEl, caret });
  wireExports({ state, engine });

  $('reshuffle').addEventListener('click', () => {
    morphUi.growthPlay.stop();
    reshuffleAll(state, (shape: LeafShape) => t().shapes[shape] ?? shapeBaseText(shape));
    // Often flip Sans/Serif (~70% toggle to the other face).
    if (Math.random() < 0.7) {
      const next = state.face === 'sans' ? 'serif' : 'sans';
      void applyFace(next).then(() => {
        faceChips.sync();
        morphUi.refresh();
      });
      return;
    }
    morphUi.refresh();
  });
  $('lang').addEventListener('click', () => {
    toggleLang();
    applyLang();
  });

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.key !== ' ') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (about.isOpen()) return;
    const el = e.target as HTMLElement | null;
    if (el) {
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return;
    }
    e.preventDefault();
    morphUi.growthPlay.toggle();
  });

  new ResizeObserver(createDebouncedRaf(() => engine.requestDraw())).observe(stage);

  const downloadCluster = $('download-cluster');
  const downloadAnchor = $('download-anchor');
  const downloadLand = $('download-land');
  const topbarLeft = $('topbar-left');
  const topbarCenter = $('topbar-center');
  const topbarRight = $('topbar-right');
  const dockMetrics = $('dock-metrics');
  const creditsCenter = $('credits-center');
  const langLand = $('lang-land');
  const langBtn = $('lang');
  const faceChipsEl = $('face-chips');
  const scaleField = $('scale-field');
  const trackingField = $('tracking-field');
  const aboutOpen = $('about-open');
  let unpinDownload = () => {};
  let unpinLang = () => {};

  const exportsEl = $('exports');
  const downloadToggle = $('download-toggle');

  /**
   * Desktop: face · brand · Scala/Tracking; Download dock + sticky; Lang/About footer.
   * Mobile: Lang · brand · Download (vertical tray); Growth + face/Scala/Tracking; About footer.
   */
  const placeChrome = () => {
    unpinDownload();
    unpinLang();
    unpinDownload = () => {};
    unpinLang = () => {};
    exportsEl.hidden = true;
    downloadToggle.setAttribute('aria-expanded', 'false');
    if (exportsEl.parentElement !== downloadCluster) {
      downloadCluster.insertBefore(exportsEl, downloadToggle);
    }
    if (isMobile()) {
      topbarLeft.append(langBtn);
      topbarCenter.append(brandEl);
      topbarRight.append(downloadCluster);
      dockMetrics.hidden = false;
      dockMetrics.append(faceChipsEl, scaleField, trackingField);
      creditsCenter.append(aboutOpen);
      downloadLand.setAttribute('aria-hidden', 'true');
      return;
    }
    topbarLeft.append(faceChipsEl);
    topbarCenter.append(brandEl);
    topbarRight.append(scaleField, trackingField);
    dockMetrics.hidden = true;
    downloadAnchor.append(downloadCluster);
    langLand.append(langBtn);
    creditsCenter.append(aboutOpen);
    downloadLand.setAttribute('aria-hidden', 'true');
    unpinDownload = mountDownloadPin({
      cluster: downloadCluster,
      toggle: downloadToggle,
      anchor: downloadAnchor,
      land: downloadLand
    });
    unpinLang = mountLangPin(langBtn, langLand);
  };
  placeChrome();
  window.matchMedia(MOBILE_MQ).addEventListener('change', placeChrome);

  morphUi.syncSliders();
  paintBrand(brandEl, state);
  about.refreshMarks();
  focusEnd();

  void applyFace(state.face || DEFAULT_FACE).then(() => {
    paintBrand(brandEl, state, paintGrowth());
    focusEnd();
  });
  // Warm the other face on desktop only — second OTF parse can tip mobile Safari over.
  if (!mobile) {
    for (const id of FACE_IDS) {
      if (id === state.face) continue;
      const def = faceDef(id);
      void loadFontFromUrl(faceAssetUrl(def.file), def.label)
        .then((font) => faceCache.set(id, font))
        .catch(() => undefined);
    }
  }
}
