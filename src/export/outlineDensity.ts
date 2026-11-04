/** Shared polygonal density for OTF + VF export. */
export const LETTER_PTS = 36;
export const LEAF_PTS = 16;
export const FLATTEN = 8;

/** Min contour area for OTF sanitize (UPM-scaled). VF keeps 0 to lock topology at GROW=0. */
export function otfMinArea(upm: number): number {
  const unit = upm / 1000;
  return 8 * unit * unit;
}
