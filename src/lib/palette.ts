import tokens from './palette.json';

/** Fixed triad — UI ink pair + accent for hover / focus. */
export const COLOR_DARK = tokens.dark.toLowerCase();
export const COLOR_LIGHT = tokens.light.toLowerCase();
export const COLOR_ACCENT = tokens.accent.toLowerCase();

export const DEFAULT_BG = COLOR_DARK;
export const DEFAULT_FG = COLOR_LIGHT;

/** Push locked palette into CSS custom properties. */
export function applyPaletteVars(root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--color-dark', COLOR_DARK);
  root.style.setProperty('--color-light', COLOR_LIGHT);
  root.style.setProperty('--color-accent', COLOR_ACCENT);
  root.style.setProperty('--bg', COLOR_DARK);
  root.style.setProperty('--fg', COLOR_LIGHT);
  root.style.setProperty('--accent', COLOR_ACCENT);
}
