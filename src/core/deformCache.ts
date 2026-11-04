import type { Contours } from './types';

/** LRU deform cache for stage + specimens + brand. */
const MAX = 160;
const map = new Map<string, Contours>();

export function cacheGet(key: string): Contours | undefined {
  const hit = map.get(key);
  if (!hit) return undefined;
  map.delete(key);
  map.set(key, hit);
  return hit;
}

export function cacheSet(key: string, value: Contours): void {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > MAX) {
    const oldest = map.keys().next().value;
    if (oldest == null) break;
    map.delete(oldest);
  }
}
