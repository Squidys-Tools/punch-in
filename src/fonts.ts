// ---------- timer fonts ----------
//
// To customize a font, edit the glyph rows below. Every glyph is a fixed
// grid of characters:
//   - a block char like '█' marks a filled cell
//   - a space ' ' marks an empty cell
// All glyphs in one font must share the same number of rows. Digits are 3
// chars wide in 'blocky' and 'digital'; 'pixel' stores 5x7 bitmaps ('1' = on).
//
// Examples of tweaks:
//   - swap '█' for '▓' or '▀' to change the texture of the whole blocky font
//   - edit a single digit, e.g. blockyDigits['7'][0] = '███' to widen the top
//   - change the gradient ramp in defaultGradient (from/to are RGB 0-255)
//
// To add a new font: add a digit map, a case in timerRows() and a case in
// timerFontHeight(), then add its name to FONTS.

export type TimerFont = 'blocky' | 'digital' | 'pixel' | 'gradient';

export const FONTS: TimerFont[] = ['blocky', 'digital', 'pixel', 'gradient'];

// ---------- timer colors (pastels, flat fill — no gradient) ----------

export type TimerColor = 'gray' | 'pink' | 'peach' | 'lemon' | 'mint' | 'sky' | 'lilac';

export const TIMER_COLORS: TimerColor[] = ['gray', 'pink', 'peach', 'lemon', 'mint', 'sky', 'lilac'];

export const TIMER_COLOR_HEX: Record<Exclude<TimerColor, 'gray'>, string> = {
  pink: '#FFB3C6',
  peach: '#FFD1A9',
  lemon: '#FDFD96',
  mint: '#B5EAD7',
  sky: '#A7C7E7',
  lilac: '#C3B1E1',
};

export const ACCENT_COLOR_HEX: Record<TimerColor, string> = {
  gray: '#00FFFF',
  ...TIMER_COLOR_HEX,
};

export function accentColor(color: TimerColor): string {
  return ACCENT_COLOR_HEX[color];
}

function hmsParts(secs: number): string[] {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return [String(h).padStart(2, '0'), String(m).padStart(2, '0'), String(s).padStart(2, '0')];
}

// ---------- blocky (5 rows x 3 cols) ----------

export const blockyDigits: Record<string, string[]> = {
  '0': ['███', '█ █', '█ █', '█ █', '███'],
  '1': [' █ ', '██ ', ' █ ', ' █ ', '███'],
  '2': ['███', '  █', '███', '█  ', '███'],
  '3': ['███', '  █', '███', '  █', '███'],
  '4': ['█ █', '█ █', '███', '  █', '  █'],
  '5': ['███', '█  ', '███', '  █', '███'],
  '6': ['███', '█  ', '███', '█ █', '███'],
  '7': ['███', '  █', '  █', '  █', '  █'],
  '8': ['███', '█ █', '███', '█ █', '███'],
  '9': ['███', '█ █', '███', '  █', '███'],
  ':': ['   ', ' █ ', '   ', ' █ ', '   '],
};

// ---------- digital (3 rows x 3 cols, seven-segment) ----------

export const digitalDigits: Record<string, string[]> = {
  '0': [' _ ', '| |', '|_|'],
  '1': ['   ', '  |', '  |'],
  '2': [' _ ', ' _|', '|_ '],
  '3': [' _ ', ' _|', ' _|'],
  '4': ['   ', '|_|', '  |'],
  '5': [' _ ', '|_ ', ' _|'],
  '6': [' _ ', '|_ ', '|_|'],
  '7': [' _ ', '  |', '  |'],
  '8': [' _ ', '|_|', '|_|'],
  '9': [' _ ', '|_|', ' _|'],
  ':': ['   ', ' . ', ' . '],
};

// ---------- pixel (8x12 bitmaps rendered as braille, 4 cols x 3 rows) ----------

export const pixelDigits: Record<string, string[]> = {
  '0': [
    '00111100', '01000010', '10000001', '10000001', '10000001', '10000001',
    '10000001', '10000001', '10000001', '10000001', '01000010', '00111100',
  ],
  '1': [
    '00110000', '01110000', '00010000', '00010000', '00010000', '00010000',
    '00010000', '00010000', '00010000', '00010000', '00110000', '01111000',
  ],
  '2': [
    '00111100', '01000010', '00000010', '00000010', '00000100', '00001000',
    '00010000', '00100000', '01000000', '10000000', '10000000', '11111111',
  ],
  '3': [
    '00111100', '01000010', '00000010', '00000010', '00111100', '00000010',
    '00000010', '00000010', '00000010', '01000010', '00111100', '00000000',
  ],
  '4': [
    '00011000', '00111000', '01101000', '11001000', '10001000', '10001000',
    '11111111', '00001000', '00001000', '00001000', '00001000', '00001000',
  ],
  '5': [
    '11111111', '10000000', '10000000', '11111110', '00000010', '00000010',
    '00000010', '00000010', '00000010', '01000010', '00111100', '00000000',
  ],
  '6': [
    '00111100', '01000010', '10000000', '10000000', '11111110', '10000010',
    '10000010', '10000010', '10000010', '10000010', '01000010', '00111100',
  ],
  '7': [
    '11111111', '00000010', '00000010', '00000100', '00000100', '00001000',
    '00001000', '00010000', '00010000', '00100000', '00100000', '01000000',
  ],
  '8': [
    '00111100', '01000010', '10000001', '10000001', '00111100', '01000010',
    '10000001', '10000001', '10000001', '10000001', '01000010', '00111100',
  ],
  '9': [
    '00111100', '01000010', '10000001', '10000001', '01111110', '00000010',
    '00000010', '00000010', '00000010', '01000010', '00111100', '00000000',
  ],
  ':': [
    '00', '00', '01', '01', '00', '00', '00', '01', '01', '00', '00', '00',
  ],
};

const BRAILLE_BITS = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20, 0x40, 0x80];

function pixToBraille(rows: string[]): string[] {
  const w = rows[0].length;
  const cellCols = Math.ceil(w / 2);
  const outputRows: string[][] = Array.from({ length: Math.ceil(rows.length / 4) }, () => []);
  for (let cell = 0; cell < cellCols; cell++) {
    const masks = outputRows.map(() => 0);
    for (let y = 0; y < rows.length; y++) {
      const outputRow = Math.floor(y / 4);
      const rr = y % 4;
      for (let cc = 0; cc < 2; cc++) {
        const x = cell * 2 + cc;
        if (x < w && rows[y]?.[x] === '1') masks[outputRow]! |= BRAILLE_BITS[rr * 2 + cc];
      }
    }
    masks.forEach((mask, index) => {
      outputRows[index]!.push(mask ? String.fromCodePoint(0x2800 + mask) : ' ');
    });
  }
  return outputRows.map((row) => row.join(''));
}

// ---------- gradient (blocky glyphs, hue sweep) ----------

export interface GradientConfig {
  from: [number, number, number]; // RGB 0-255, left edge
  to: [number, number, number]; // RGB 0-255, right edge
}

export const defaultGradient: GradientConfig = { from: [0, 255, 0], to: [0, 255, 255] };

export function gradientColor(
  frac: number,
  cfg: GradientConfig = defaultGradient,
): { r: number; g: number; b: number } {
  const mix = (a: number, b: number) => Math.round(a + (b - a) * frac);
  return { r: mix(cfg.from[0], cfg.to[0]), g: mix(cfg.from[1], cfg.to[1]), b: mix(cfg.from[2], cfg.to[2]) };
}

// ---------- public ----------

export interface TimerBlock {
  kind: 'digit' | 'colon';
  /** 0-5 for digits (HHMMSS), 6-7 for colons (after HH, after MM) */
  place: number;
  value: string;
  rows: string[];
}

export function timerBlocks(secs: number, font: TimerFont): TimerBlock[] {
  const [hh, mm, ss] = hmsParts(secs);
  const specs: { kind: 'digit' | 'colon'; place: number; value: string }[] = [
    { kind: 'digit', place: 0, value: hh[0]! },
    { kind: 'digit', place: 1, value: hh[1]! },
    { kind: 'colon', place: 6, value: ':' },
    { kind: 'digit', place: 2, value: mm[0]! },
    { kind: 'digit', place: 3, value: mm[1]! },
    { kind: 'colon', place: 7, value: ':' },
    { kind: 'digit', place: 4, value: ss[0]! },
    { kind: 'digit', place: 5, value: ss[1]! },
  ];
  return specs.map((spec) => ({
    ...spec,
    rows: glyphRows(spec.value, font),
  }));
}

export function glyphRows(ch: string, font: TimerFont): string[] {
  switch (font) {
    case 'digital':
      return digitalDigits[ch] ?? digitalDigits['0']!;
    case 'pixel':
      return pixToBraille(pixelDigits[ch] ?? pixelDigits['0']!);
    case 'blocky':
    case 'gradient':
    default:
      return blockyDigits[ch] ?? blockyDigits['0']!;
  }
}

function blankRows(template: string[]): string[] {
  const width = template[0]?.length ?? 1;
  return template.map(() => ' '.repeat(width));
}

export function blankBlock(block: TimerBlock): TimerBlock {
  return { ...block, rows: blankRows(block.rows) };
}

export function replaceBlock(block: TimerBlock, value: string, font: TimerFont): TimerBlock {
  return { ...block, value, rows: glyphRows(value, font) };
}

export function assembleRows(blocks: TimerBlock[]): string[] {
  const height = blocks[0]?.rows.length ?? 0;
  const rows: string[] = Array.from({ length: height }, () => '');
  for (const block of blocks) {
    for (let r = 0; r < height; r++) rows[r] += (block.rows[r] ?? '') + ' ';
  }
  return rows;
}

export function timerRows(secs: number, font: TimerFont): string[] {
  return assembleRows(timerBlocks(secs, font));
}

export function timerFontHeight(font: TimerFont): number {
  switch (font) {
    case 'digital':
      return 3;
    case 'pixel':
      return 3;
    case 'blocky':
    case 'gradient':
    default:
      return 5;
  }
}
