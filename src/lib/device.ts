/** Shared mobile breakpoint (keep in sync with styles.css @media max-width:720px). */
export const MOBILE_MQ = '(max-width: 720px)';

export function isMobile(): boolean {
  return window.matchMedia(MOBILE_MQ).matches;
}
