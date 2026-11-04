/**
 * Minimal TrueType variable font writer — one axis (GROW), two masters.
 * Glyphs are polygonal (all on-curve) so masters share topology via resampling.
 */

type Pt = { x: number; y: number };

export type VfGlyph = {
  name: string;
  unicode: number;
  /** Advance at default (min) master. */
  advance: number;
  /** Contours at GROW=0 and GROW=1 — equal ring counts & point counts. */
  min: Pt[][];
  max: Pt[][];
};

export type VfFontInput = {
  familyName: string;
  styleName: string;
  postScriptName: string;
  unitsPerEm: number;
  ascender: number;
  descender: number;
  glyphs: VfGlyph[];
  description?: string;
};

function u16(n: number): number[] {
  return [(n >>> 8) & 0xff, n & 0xff];
}
function i16(n: number): number[] {
  const v = n < 0 ? (0x10000 + (n | 0)) & 0xffff : n & 0xffff;
  return u16(v);
}
function u32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}
function i32(n: number): number[] {
  return u32(n | 0);
}
function fixed16_16(n: number): number[] {
  return i32(Math.round(n * 65536));
}
function f2dot14(n: number): number[] {
  const v = Math.max(-2, Math.min(1.999, n));
  return i16(Math.round(v * 16384));
}
function tag(s: string): number[] {
  const b = [0x20, 0x20, 0x20, 0x20];
  for (let i = 0; i < Math.min(4, s.length); i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
}
function concat(chunks: number[][]): Uint8Array {
  let n = 0;
  for (const c of chunks) n += c.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
function pad4(bytes: number[]): number[] {
  const out = bytes.slice();
  while (out.length % 4) out.push(0);
  return out;
}
function checksum(data: Uint8Array): number {
  let sum = 0;
  const n = data.length;
  for (let i = 0; i + 3 < n; i += 4) {
    sum = (sum + ((data[i]! << 24) | (data[i + 1]! << 16) | (data[i + 2]! << 8) | data[i + 3]!)) >>> 0;
  }
  const rem = n & 3;
  if (rem) {
    let v = 0;
    for (let i = 0; i < rem; i++) v |= data[n - rem + i]! << (24 - i * 8);
    sum = (sum + v) >>> 0;
  }
  return sum >>> 0;
}

function encodeName(str: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    out.push((c >>> 8) & 0xff, c & 0xff);
  }
  return out;
}

type EncodedGlyph = {
  data: number[];
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  advance: number;
  lsb: number;
  endPts: number[];
  pointsMin: Pt[];
  pointsMax: Pt[];
};

function encodeSimpleGlyph(contours: Pt[][]): Omit<EncodedGlyph, 'advance' | 'lsb' | 'pointsMin' | 'pointsMax'> & {
  points: Pt[];
} {
  if (!contours.length) {
    return { data: [], xMin: 0, yMin: 0, xMax: 0, yMax: 0, endPts: [], points: [] };
  }
  const points: Pt[] = [];
  const endPts: number[] = [];
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
  for (const ring of contours) {
    if (ring.length < 3) continue;
    for (const p of ring) {
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      points.push({ x, y });
      if (x < xMin) xMin = x;
      if (y < yMin) yMin = y;
      if (x > xMax) xMax = x;
      if (y > yMax) yMax = y;
    }
    endPts.push(points.length - 1);
  }
  if (!points.length) {
    return { data: [], xMin: 0, yMin: 0, xMax: 0, yMax: 0, endPts: [], points: [] };
  }

  const flags: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  let prevX = 0;
  let prevY = 0;
  for (const p of points) {
    // on-curve
    let f = 1;
    const dx = p.x - prevX;
    const dy = p.y - prevY;
    if (dx === 0) f |= 0x10;
    else if (dx >= -255 && dx <= 255) {
      f |= 0x02;
      if (dx > 0) f |= 0x10;
      xs.push(Math.abs(dx));
    } else {
      xs.push((dx >> 8) & 0xff, dx & 0xff);
    }
    if (dy === 0) f |= 0x20;
    else if (dy >= -255 && dy <= 255) {
      f |= 0x04;
      if (dy > 0) f |= 0x20;
      ys.push(Math.abs(dy));
    } else {
      ys.push((dy >> 8) & 0xff, dy & 0xff);
    }
    flags.push(f);
    prevX = p.x;
    prevY = p.y;
  }

  const data: number[] = [
    ...i16(endPts.length),
    ...i16(xMin),
    ...i16(yMin),
    ...i16(xMax),
    ...i16(yMax),
    ...endPts.flatMap((e) => u16(e)),
    ...u16(0), // instructions
    ...flags,
    ...xs,
    ...ys
  ];
  return { data, xMin, yMin, xMax, yMax, endPts, points };
}

function buildCmap(unicodes: number[]): number[] {
  // Format 4 — BMP only
  const pairs = unicodes
    .map((u, i) => ({ u, gid: i + 1 })) // gid 0 = .notdef
    .filter((p) => p.u > 0 && p.u <= 0xffff)
    .sort((a, b) => a.u - b.u);

  const startCode = pairs.map((p) => p.u);
  const endCode = pairs.map((p) => p.u);
  const idDelta = pairs.map((p) => (p.gid - p.u + 0x10000) % 0x10000);
  const idRangeOffset = pairs.map(() => 0);
  // trailing 0xffff sentinel
  startCode.push(0xffff);
  endCode.push(0xffff);
  idDelta.push(1);
  idRangeOffset.push(0);

  const segCount = startCode.length;
  const searchRange = 2 * Math.pow(2, Math.floor(Math.log2(segCount)));
  const entrySelector = Math.log2(searchRange / 2);
  const rangeShift = 2 * segCount - searchRange;

  const body: number[] = [
    ...u16(segCount * 2),
    ...u16(searchRange),
    ...u16(entrySelector),
    ...u16(rangeShift),
    ...endCode.flatMap(u16),
    ...u16(0), // reserved
    ...startCode.flatMap(u16),
    ...idDelta.flatMap(u16),
    ...idRangeOffset.flatMap(u16)
  ];
  // format(2)+length(2)+language(2)+body
  const length = 6 + body.length;
  return [
    ...u16(0), // version
    ...u16(1), // numTables
    ...u16(3), // platform Microsoft
    ...u16(1), // encoding BMP
    ...u32(12), // offset to subtable
    ...u16(4), // format
    ...u16(length),
    ...u16(0), // language
    ...body
  ];
}

function buildName(names: Record<number, string>): number[] {
  const records: { id: number; bytes: number[] }[] = [];
  for (const [k, v] of Object.entries(names)) {
    records.push({ id: +k, bytes: encodeName(v) });
  }
  records.sort((a, b) => a.id - b.id);
  let storage = 0;
  const nameRecords: number[] = [];
  const stringData: number[] = [];
  for (const r of records) {
    nameRecords.push(
      ...u16(3), // Microsoft
      ...u16(1), // Unicode BMP
      ...u16(0x0409), // en-US
      ...u16(r.id),
      ...u16(r.bytes.length),
      ...u16(storage)
    );
    stringData.push(...r.bytes);
    storage += r.bytes.length;
  }
  const count = records.length;
  const stringOffset = 6 + count * 12;
  return [...u16(0), ...u16(count), ...u16(stringOffset), ...nameRecords, ...stringData];
}

/** Pack a delta stream (X or Y) per OpenType gvar run-length encoding. */
function packDeltaRuns(values: number[]): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < values.length) {
    if (values[i] === 0) {
      let j = i + 1;
      while (j < values.length && values[j] === 0 && j - i < 64) j++;
      out.push((j - i - 1) & 0x3f);
      i = j;
      continue;
    }
    let j = i + 1;
    while (j < values.length && values[j] !== 0 && j - i < 64) j++;
    let asBytes = true;
    for (let k = i; k < j; k++) {
      const v = values[k]!;
      if (v < -128 || v > 127) {
        asBytes = false;
        break;
      }
    }
    const count = j - i;
    if (asBytes) {
      out.push(0x80 | ((count - 1) & 0x3f));
      for (let k = i; k < j; k++) out.push(values[k]! & 0xff);
    } else {
      out.push(0xc0 | ((count - 1) & 0x3f));
      for (let k = i; k < j; k++) out.push(...i16(values[k]!));
    }
    i = j;
  }
  return out;
}

/** Build a single-axis GROW variable TrueType font. */
export function buildGrowVariableTtf(input: VfFontInput): ArrayBuffer {
  const upm = input.unitsPerEm;
  const glyphs = input.glyphs;

  const encoded: EncodedGlyph[] = [];
  // .notdef
  encoded.push({
    data: [],
    xMin: 0,
    yMin: 0,
    xMax: 0,
    yMax: 0,
    advance: Math.round(upm / 2),
    lsb: 0,
    endPts: [],
    pointsMin: [],
    pointsMax: []
  });

  for (const g of glyphs) {
    const minEnc = encodeSimpleGlyph(g.min);
    const maxEnc = encodeSimpleGlyph(g.max);
    // Prefer min topology; if max differs in count, force min-only (static)
    let pointsMax = maxEnc.points;
    if (pointsMax.length !== minEnc.points.length) {
      pointsMax = minEnc.points.map((p) => ({ ...p }));
    }
    const pad = Math.round(upm * 0.04);
    const xMin = Math.min(minEnc.xMin, maxEnc.xMin);
    const xMax = Math.max(minEnc.xMax, maxEnc.xMax);
    const advance = Math.max(g.advance, Math.ceil(xMax - Math.min(0, xMin) + pad));
    const lsb = Math.min(0, xMin);
    encoded.push({
      data: minEnc.data,
      xMin: minEnc.xMin,
      yMin: minEnc.yMin,
      xMax: minEnc.xMax,
      yMax: minEnc.yMax,
      advance,
      lsb,
      endPts: minEnc.endPts,
      pointsMin: minEnc.points,
      pointsMax
    });
  }

  // glyf + loca
  const glyfChunks: number[][] = [];
  const loca: number[] = [0];
  let glyfLen = 0;
  for (const g of encoded) {
    const padded = pad4(g.data);
    glyfChunks.push(padded);
    glyfLen += padded.length;
    loca.push(glyfLen);
  }
  const glyf = concat(glyfChunks);
  const locaBytes = loca.flatMap((o) => u32(o));

  // hmtx
  const hmtx: number[] = [];
  for (const g of encoded) {
    hmtx.push(...u16(g.advance), ...i16(g.lsb));
  }

  // head (54 bytes; checksum adjustment later)
  const now = Math.floor(Date.now() / 1000) + 2082844800; // Mac epoch
  const longDate = (t: number): number[] => [...u32(Math.floor(t / 0x100000000)), ...u32(t >>> 0)];
  const xMins = encoded.map((g) => g.xMin);
  const yMins = encoded.map((g) => g.yMin);
  const xMaxs = encoded.map((g) => g.xMax);
  const yMaxs = encoded.map((g) => g.yMax);
  const head = [
    ...fixed16_16(1), // version
    ...fixed16_16(1), // fontRevision
    ...u32(0), // checksumAdjustment
    ...u32(0x5f0f3cf5),
    ...u16(0b0000000000001011), // flags
    ...u16(upm),
    ...longDate(now),
    ...longDate(now),
    ...i16(Math.min(0, ...xMins)),
    ...i16(Math.min(0, ...yMins)),
    ...i16(Math.max(upm, ...xMaxs)),
    ...i16(Math.max(upm, ...yMaxs)),
    ...u16(0), // macStyle
    ...u16(8), // lowestRecPPEM
    ...i16(2), // fontDirectionHint
    ...i16(1), // indexToLocFormat long
    ...i16(0) // glyphDataFormat
  ];

  // hhea (36 bytes)
  const hhea = [
    ...fixed16_16(1), // version
    ...i16(input.ascender),
    ...i16(input.descender),
    ...i16(0), // lineGap
    ...u16(Math.max(...encoded.map((g) => g.advance))),
    ...i16(Math.min(...encoded.map((g) => g.lsb))),
    ...i16(Math.max(...encoded.map((g) => g.advance - g.lsb - (g.xMax - g.xMin)))),
    ...i16(0),
    ...i16(0),
    ...i16(0),
    ...i16(0),
    ...i16(0),
    ...i16(0),
    ...i16(0),
    ...i16(0),
    ...i16(0),
    ...u16(encoded.length)
  ];

  // maxp 1.0 = 32 bytes (version + numGlyphs + 13 uint16)
  const maxp = [
    ...u32(0x00010000),
    ...u16(encoded.length),
    ...u16(Math.max(1, ...encoded.map((g) => g.pointsMin.length))),
    ...u16(Math.max(1, ...encoded.map((g) => g.endPts.length))),
    ...u16(0), // maxCompositePoints
    ...u16(0), // maxCompositeContours
    ...u16(2), // maxZones
    ...u16(0), // maxTwilightPoints
    ...u16(0), // maxStorage
    ...u16(0), // maxFunctionDefs
    ...u16(0), // maxInstructionDefs
    ...u16(0), // maxStackElements
    ...u16(0), // maxSizeOfInstructions
    ...u16(0), // maxComponentElements
    ...u16(0) // maxComponentDepth
  ];

  function u8s(s: string): number[] {
    return [s.charCodeAt(0) || 0, s.charCodeAt(1) || 0, s.charCodeAt(2) || 0, s.charCodeAt(3) || 0];
  }

  // OS/2 version 3 = 96 bytes
  const os2 = [
    ...u16(3), // version
    ...i16(Math.round(upm * 0.8)), // xAvgCharWidth
    ...u16(400), // usWeightClass
    ...u16(5), // usWidthClass
    ...u16(0), // fsType
    ...i16(0),
    ...i16(0),
    ...i16(0),
    ...i16(0), // subscript
    ...i16(0),
    ...i16(0),
    ...i16(0),
    ...i16(0), // superscript
    ...i16(0),
    ...i16(0),
    ...i16(0),
    ...i16(0), // strikeout
    ...i16(0), // sFamilyClass
    ...u8s('Marc'), // panose (10 bytes) — pad below
    0,
    0,
    0,
    0,
    0,
    0,
    ...u32(0), // ulUnicodeRange1-4
    ...u32(0),
    ...u32(0),
    ...u32(0),
    ...u8s('Marc'), // achVendID
    ...u16(0x40), // fsSelection REGULAR
    ...u16(0x20), // usFirstCharIndex
    ...u16(0x7e), // usLastCharIndex
    ...i16(input.ascender), // sTypoAscender
    ...i16(input.descender), // sTypoDescender
    ...i16(0), // sTypoLineGap
    ...u16(input.ascender), // usWinAscent
    ...u16(Math.abs(input.descender)), // usWinDescent
    ...u32(0), // ulCodePageRange1
    ...u32(0), // ulCodePageRange2
    ...i16(0), // sxHeight
    ...i16(0), // sCapHeight
    ...u16(0), // usDefaultChar
    ...u16(0x20), // usBreakChar
    ...u16(1) // usMaxContext
  ];

  const post = [
    ...fixed16_16(3),
    ...fixed16_16(0),
    ...i16(0),
    ...i16(0),
    ...u32(0),
    ...u32(0),
    ...u32(0),
    ...u32(0),
    ...u32(0)
  ];

  const unicodes = glyphs.map((g) => g.unicode);
  const cmap = buildCmap(unicodes);

  const name = buildName({
    1: input.familyName,
    2: input.styleName,
    3: `${input.familyName} ${input.styleName}`,
    4: `${input.familyName} ${input.styleName}`,
    6: input.postScriptName,
    0: 'Copyright (c) 2026 Pasquale de Sario',
    10: input.description || 'Marcovaldo GROW variable font',
    13: 'MIT License',
    14: 'https://opensource.org/licenses/MIT',
    16: input.familyName,
    17: input.styleName,
    25: 'GROW'
  });

  // fvar — one axis GROW 0..100, default 0
  // VariationAxisRecord: tag, min, default, max, flags, axisNameID
  const axisNameId = 25;
  const fvar = [
    ...u16(1),
    ...u16(0),
    ...u16(16), // axesArrayOffset
    ...u16(2), // reserved
    ...u16(1), // axisCount
    ...u16(20), // axisSize
    ...u16(0), // instanceCount
    ...u16(0), // instanceSize
    ...tag('GROW'),
    ...fixed16_16(0),
    ...fixed16_16(0),
    ...fixed16_16(100),
    ...u16(0), // flags
    ...u16(axisNameId)
  ];

  // gvar — Apple/fontTools layout (offsetToSharedTuples is Offset32 → 20-byte header)
  const gvarHeaderSize = 20;
  const axisCount = 1;
  const sharedTupleCount = 1;
  const sharedTuples = f2dot14(1); // peak +1.0
  const glyphCount = encoded.length;
  const longOffsets = 1; // Offset32 for per-glyph data offsets

  const glyphVarDataOffsets: number[] = [];
  const glyphVarData: number[] = [];
  let gvOff = 0;
  for (const g of encoded) {
    glyphVarDataOffsets.push(gvOff);
    if (!g.pointsMin.length) continue;

    const n = g.pointsMin.length;
    const dx: number[] = [];
    const dy: number[] = [];
    for (let i = 0; i < n; i++) {
      dx.push(Math.round(g.pointsMax[i]!.x - g.pointsMin[i]!.x));
      dy.push(Math.round(g.pointsMax[i]!.y - g.pointsMin[i]!.y));
    }
    for (let p = 0; p < 4; p++) {
      dx.push(0);
      dy.push(0);
    }

    const deltaBlob = [...packDeltaRuns(dx), ...packDeltaRuns(dy)];
    const tupleHeader = [...u16(deltaBlob.length), ...u16(0)]; // shared tuple 0
    const dataOffset = 4 + tupleHeader.length;
    const gvd = [...u16(1), ...u16(dataOffset), ...tupleHeader, ...deltaBlob];
    glyphVarData.push(...gvd);
    gvOff += gvd.length;
  }
  glyphVarDataOffsets.push(gvOff);

  // Layout: header | offset array | shared tuples | glyph var data
  const offsetSize = 4;
  const offsetArrayBytes = (glyphCount + 1) * offsetSize;
  const offsetToSharedTuples = gvarHeaderSize + offsetArrayBytes;
  const offsetToData = offsetToSharedTuples + sharedTupleCount * axisCount * 2;
  const gvar = [
    ...u16(1), // version
    ...u16(0), // reserved
    ...u16(axisCount),
    ...u16(sharedTupleCount),
    ...u32(offsetToSharedTuples),
    ...u16(glyphCount),
    ...u16(longOffsets),
    ...u32(offsetToData),
    ...glyphVarDataOffsets.flatMap((o) => u32(o)),
    ...sharedTuples,
    ...glyphVarData
  ];

  type Table = { tag: string; bytes: Uint8Array };
  const tables: Table[] = [
    { tag: 'cmap', bytes: new Uint8Array(cmap) },
    { tag: 'fvar', bytes: new Uint8Array(fvar) },
    { tag: 'glyf', bytes: glyf },
    { tag: 'gvar', bytes: new Uint8Array(gvar) },
    { tag: 'head', bytes: new Uint8Array(head) },
    { tag: 'hhea', bytes: new Uint8Array(hhea) },
    { tag: 'hmtx', bytes: new Uint8Array(hmtx) },
    { tag: 'loca', bytes: new Uint8Array(locaBytes) },
    { tag: 'maxp', bytes: new Uint8Array(maxp) },
    { tag: 'name', bytes: new Uint8Array(name) },
    { tag: 'OS/2', bytes: new Uint8Array(os2) },
    { tag: 'post', bytes: new Uint8Array(post) }
  ].sort((a, b) => (a.tag < b.tag ? -1 : 1));

  const numTables = tables.length;
  const searchRange = Math.pow(2, Math.floor(Math.log2(numTables))) * 16;
  const entrySelector = Math.log2(searchRange / 16);
  const rangeShift = numTables * 16 - searchRange;

  // Offsets 4-byte aligned; directory length = raw size; checksum includes pad.
  let offset = 12 + numTables * 16;
  const records: number[] = [];
  const placed: { bytes: Uint8Array; offset: number }[] = [];
  for (const t of tables) {
    while (offset % 4) offset++;
    const paddedLen = (t.bytes.length + 3) & ~3;
    const padded = new Uint8Array(paddedLen);
    padded.set(t.bytes);
    const cs = checksum(padded);
    records.push(...tag(t.tag), ...u32(cs), ...u32(offset), ...u32(t.bytes.length));
    placed.push({ bytes: padded, offset });
    offset += paddedLen;
  }

  const offsetTable = [
    ...u32(0x00010000),
    ...u16(numTables),
    ...u16(searchRange),
    ...u16(entrySelector),
    ...u16(rangeShift),
    ...records
  ];

  const file = new Uint8Array(offset);
  file.set(offsetTable, 0);
  for (const p of placed) file.set(p.bytes, p.offset);

  // head checksumAdjustment
  const total = checksum(file);
  const adjust = (0xb1b0afba - total) >>> 0;
  let headOff = 0;
  for (let i = 0; i < tables.length; i++) {
    if (tables[i]!.tag === 'head') {
      headOff = placed[i]!.offset;
      break;
    }
  }
  file[headOff + 8] = (adjust >>> 24) & 0xff;
  file[headOff + 9] = (adjust >>> 16) & 0xff;
  file[headOff + 10] = (adjust >>> 8) & 0xff;
  file[headOff + 11] = adjust & 0xff;

  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
}
