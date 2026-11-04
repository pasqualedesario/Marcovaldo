import type { Contour, Contours, Pt } from '../core/types';
import { signedArea } from '../core/path/ops';

const MAX_COORD = 32_000;

function finitePt(p: Pt): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < MAX_COORD && Math.abs(p.y) < MAX_COORD;
}

/** Drop degenerate / explosive rings that become spider-lines in font apps. */
export function sanitizeContours(contours: Contours, minArea: number): Contours {
  const out: Contours = [];
  for (const raw of contours) {
    if (!raw || raw.length < 3) continue;
    const pts: Contour = [];
    for (const p of raw) {
      if (!finitePt(p)) continue;
      const prev = pts[pts.length - 1];
      if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < 1e-4) continue;
      pts.push({ x: p.x, y: p.y });
    }
    if (pts.length < 3) continue;
    const a = Math.abs(signedArea(pts));
    if (a < minArea) continue;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const w = maxX - minX;
    const h = maxY - minY;
    // Reject one-pixel spikes / infinite thin needles.
    if (w > MAX_COORD * 0.5 || h > MAX_COORD * 0.5) continue;
    if (a < minArea * 0.25 && (w < 1e-3 || h < 1e-3)) continue;

    out.push(pts);
  }
  return out;
}

/** Arc-length resample a closed contour to exactly `n` points (for VF masters). */
export function resampleClosed(contour: Contour, n: number): Contour {
  if (n < 3) return contour.slice();
  if (contour.length < 3) {
    const out: Contour = [];
    for (let i = 0; i < n; i++) out.push({ x: 0, y: 0 });
    return out;
  }
  const src = contour.slice();
  const first = src[0]!;
  const last = src[src.length - 1]!;
  if (Math.hypot(first.x - last.x, first.y - last.y) > 1e-6) src.push({ x: first.x, y: first.y });

  const segLen: number[] = [0];
  let total = 0;
  for (let i = 1; i < src.length; i++) {
    total += Math.hypot(src[i]!.x - src[i - 1]!.x, src[i]!.y - src[i - 1]!.y);
    segLen.push(total);
  }
  if (total < 1e-9) {
    const out: Contour = [];
    for (let i = 0; i < n; i++) out.push({ x: first.x, y: first.y });
    return out;
  }

  const out: Contour = [];
  for (let i = 0; i < n; i++) {
    const target = (i / n) * total;
    let j = 1;
    while (j < segLen.length && segLen[j]! < target) j++;
    const a = src[j - 1]!;
    const b = src[j]!;
    const l0 = segLen[j - 1]!;
    const l1 = segLen[j]!;
    const t = l1 - l0 < 1e-12 ? 0 : (target - l0) / (l1 - l0);
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}
