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

function blockyRows(secs: number): string[] {
  const out: string[] = Array.from({ length: 5 }, () => '');
  hmsParts(secs).forEach((part, i) => {
    for (const ch of part) {
      const g = blockyDigits[ch] ?? ['   ', '   ', '   ', '   ', '   '];
      for (let r = 0; r < 5; r++) out[r] += g[r] + ' ';
    }
    if (i < 2) {
      for (let r = 0; r < 5; r++) out[r] += blockyDigits[':'][r] + ' ';
    }
  });
  return out;
}

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

function digitalRows(secs: number): string[] {
  const out: string[] = Array.from({ length: 3 }, () => '');
  hmsParts(secs).forEach((part, i) => {
    for (const ch of part) {
      const g = digitalDigits[ch] ?? ['   ', '   ', '   '];
      for (let r = 0; r < 3; r++) out[r] += g[r] + ' ';
    }
    if (i < 2) {
      for (let r = 0; r < 3; r++) out[r] += digitalDigits[':'][r] + ' ';
    }
  });
  return out;
}

// ---------- pixel (5x7 bitmaps rendered as braille, 3 cols x 2 rows) ----------

export const pixelDigits: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '00001', '11110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ':': ['0', '0', '1', '0', '1', '0', '0'],
};

const BRAILLE_BITS = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20, 0x40, 0x80];

function pixToBraille(rows: string[]): string[] {
  const w = rows[0].length;
  const cellCols = Math.ceil(w / 2);
  const top: string[] = [];
  const bottom: string[] = [];
  for (let cell = 0; cell < cellCols; cell++) {
    let mTop = 0;
    let mBot = 0;
    for (let rr = 0; rr < 4; rr++) {
      for (let cc = 0; cc < 2; cc++) {
        const x = cell * 2 + cc;
        if (x < w && rows[rr][x] === '1') mTop |= BRAILLE_BITS[rr * 2 + cc];
      }
    }
    for (let rr = 0; rr < 4; rr++) {
      for (let cc = 0; cc < 2; cc++) {
        const x = cell * 2 + cc;
        const y = 4 + rr;
        if (y < rows.length && x < w && rows[y][x] === '1') mBot |= BRAILLE_BITS[rr * 2 + cc];
      }
    }
    top.push(mTop ? String.fromCodePoint(0x2800 + mTop) : ' ');
    bottom.push(mBot ? String.fromCodePoint(0x2800 + mBot) : ' ');
  }
  return [top.join(''), bottom.join('')];
}

function pixelRows(secs: number): string[] {
  const out: string[] = ['', ''];
  hmsParts(secs).forEach((part, i) => {
    for (const ch of part) {
      const [t, b] = pixToBraille(pixelDigits[ch] ?? ['00000', '00000', '00000', '00000', '00000', '00000', '00000']);
      out[0] += t + ' ';
      out[1] += b + ' ';
    }
    if (i < 2) {
      const [t, b] = pixToBraille(pixelDigits[':']);
      out[0] += t + ' ';
      out[1] += b + ' ';
    }
  });
  return out;
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

export function timerRows(secs: number, font: TimerFont): string[] {
  switch (font) {
    case 'digital':
      return digitalRows(secs);
    case 'pixel':
      return pixelRows(secs);
    case 'blocky':
    case 'gradient':
    default:
      return blockyRows(secs);
  }
}

export function timerFontHeight(font: TimerFont): number {
  switch (font) {
    case 'digital':
      return 3;
    case 'pixel':
      return 2;
    case 'blocky':
    case 'gradient':
    default:
      return 5;
  }
}
