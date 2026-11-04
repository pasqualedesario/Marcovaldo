/**
 * Safe export charset — basic Latin + IT accents + typographic punctuation.
 * Accents are listed for completeness; FOSS Modern/Serif masters currently omit
 * Latin diacritics, so export skips missing glyphs via font coverage checks.
 */
export const VF_CHARSET =
  ' ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  'abcdefghijklmnopqrstuvwxyz' +
  '0123456789' +
  '.,;:!?\'"-' +
  'àèéìòùÀÈÉÌÒÙ' +
  '‘’“”«»–—…';

export function charsetChars(source = VF_CHARSET): string[] {
  const out: string[] = [];
  const seen = new Set<number>();
  for (const ch of source) {
    const cp = ch.codePointAt(0);
    if (cp == null || seen.has(cp)) continue;
    seen.add(cp);
    out.push(ch);
  }
  return out;
}

export function glyphNameFor(char: string): string {
  if (char === ' ') return 'space';
  const cp = char.codePointAt(0) ?? 0;
  if (cp >= 0x41 && cp <= 0x5a) return char; // A–Z
  if (cp >= 0x61 && cp <= 0x7a) return char; // a–z
  if (cp >= 0x30 && cp <= 0x39) return char; // 0–9
  return `uni${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}
