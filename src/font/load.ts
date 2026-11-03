import type { Font as FontkitFont } from 'fontkit';
import type { PathCmd, PathData } from '../core/types';

export type LoadedFont = {
  readonly name: string;
  readonly face: FontkitFont;
};

/** Path commands plus layout metrics from a single fontkit run. */
export type TextLayout = PathData & {
  /** Caret X stops 0…text.length in fontSize (canvas) space. */
  readonly caretStops: readonly number[];
  /** Total advance width in font units (unscaled). */
  readonly advanceUnits: number;
};

function displayName(font: FontkitFont): string {
  const raw = font.familyName || font.fullName || font.postscriptName || 'Font';
  return String(raw).replace(/\s+VF$/i, '').trim() || 'Font';
}

function firstFace(opened: FontkitFont | { fonts: FontkitFont[] }): FontkitFont {
  return 'fonts' in opened && opened.fonts?.length ? opened.fonts[0]! : (opened as FontkitFont);
}

export async function loadFontFromBuffer(buf: ArrayBuffer, nameHint?: string): Promise<LoadedFont> {
  const fontkit = await import('fontkit');
  const bytes = new Uint8Array(buf);
  const opened = fontkit.create(bytes as unknown as Buffer);
  const face = firstFace(opened as FontkitFont | { fonts: FontkitFont[] });
  return { name: nameHint || displayName(face), face };
}

export async function loadFontFromUrl(url: string, nameHint?: string): Promise<LoadedFont> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font non trovato (${res.status})`);
  return loadFontFromBuffer(await res.arrayBuffer(), nameHint);
}

/**
 * Layout with fontkit → path commands + caret stops in canvas Y-down space.
 * `letterSpacingEm` adds uniform tracking between glyphs (CSS letter-spacing).
 */
export function textToPath(
  font: FontkitFont,
  text: string,
  fontSize: number,
  letterSpacingEm = 0
): TextLayout {
  const scale = fontSize / font.unitsPerEm;
  const trackingUnits = letterSpacingEm * font.unitsPerEm;
  const run = font.layout(text);
  const commands: PathCmd[] = [];
  const stops: number[] = [0];
  let pen = 0;
  let chars = 0;

  for (let i = 0; i < run.glyphs.length; i++) {
    const glyph = run.glyphs[i]!;
    const pos = run.positions[i]!;
    const ox = pen + (pos.xOffset || 0);
    const oy = pos.yOffset || 0;
    const xAdvance = pos.xAdvance || glyph.advanceWidth || 0;
    const gap = i < run.glyphs.length - 1 ? trackingUnits : 0;

    for (const { command, args } of glyph.path.commands) {
      switch (command) {
        case 'moveTo':
          commands.push({ type: 'M', x: (ox + args[0]!) * scale, y: -(oy + args[1]!) * scale });
          break;
        case 'lineTo':
          commands.push({ type: 'L', x: (ox + args[0]!) * scale, y: -(oy + args[1]!) * scale });
          break;
        case 'quadraticCurveTo':
          commands.push({
            type: 'Q',
            x1: (ox + args[0]!) * scale, y1: -(oy + args[1]!) * scale,
            x: (ox + args[2]!) * scale, y: -(oy + args[3]!) * scale
          });
          break;
        case 'bezierCurveTo':
          commands.push({
            type: 'C',
            x1: (ox + args[0]!) * scale, y1: -(oy + args[1]!) * scale,
            x2: (ox + args[2]!) * scale, y2: -(oy + args[3]!) * scale,
            x: (ox + args[4]!) * scale, y: -(oy + args[5]!) * scale
          });
          break;
        case 'closePath':
          commands.push({ type: 'Z' });
          break;
      }
    }

    const step = (xAdvance + gap) * scale;
    const n = Math.max(1, glyph.codePoints?.length ?? 1);
    for (let k = 0; k < n; k++) {
      chars++;
      stops[chars] = (stops[chars - 1] ?? 0) + step / n;
    }
    pen += xAdvance + gap;
  }

  while (stops.length < text.length + 1) stops.push(pen * scale);
  if (stops.length > text.length + 1) stops.length = text.length + 1;

  return { commands, caretStops: stops, advanceUnits: pen };
}
