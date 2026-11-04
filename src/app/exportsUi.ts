import { exportPdfFromPng } from '../export/pdf';
import { exportSvg } from '../export/svg';
import { downloadBlob } from '../lib/download';
import { $ } from '../lib/dom';
import { t } from '../i18n';
import type { Engine } from './engine';
import type { AppState } from './state';
import { exportBasename, morphSpec, paramsSnapshot } from './state';

export function wireExports(opts: {
  state: AppState;
  engine: Engine;
  /** Fired when the export chip tray opens — close Forma/Margine. */
  onOpen?: () => void;
}): { close: () => void } {
  const { state, engine, onOpen } = opts;
  const statusEl = $('stage-status');
  const toggle = $('download-toggle') as HTMLButtonElement;
  const exportsEl = $('exports');

  const setOpen = (open: boolean) => {
    exportsEl.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  toggle.addEventListener('click', () => {
    const opening = exportsEl.hidden;
    setOpen(opening);
    if (opening) onOpen?.();
  });

  $('png').addEventListener('click', () => {
    void engine.rasterizeBlob().then((blob) => {
      downloadBlob(`${exportBasename(state)}.png`, blob);
    });
  });
  $('svg').addEventListener('click', () => {
    const frame = engine.getFrame();
    exportSvg({
      basename: exportBasename(state),
      width: frame.width,
      height: frame.height,
      bg: state.bg,
      fill: state.color,
      d: frame.pathD,
      lamina: frame.lamina,
      meta: engine.meta()
    });
  });
  $('pdf').addEventListener('click', () => {
    void engine.rasterizeBlob().then(async (blob) => {
      const frame = engine.getFrame();
      await exportPdfFromPng({
        basename: exportBasename(state),
        pngBytes: new Uint8Array(await blob.arrayBuffer()),
        width: frame.width,
        height: frame.height
      });
    });
  });
  // `#otf` downloads the GROW variable TTF (label: VF).
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

  return { close: () => setOpen(false) };
}
