export type TimerFont = 'blocky' | 'digital' | 'pixel' | 'gradient';

export const FONTS: TimerFont[] = ['blocky', 'digital', 'pixel', 'gradient'];

const BLOCKY: Record<string, string[]> = {
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

const DIGITAL: Record<string, string[]> = {
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

const PIXEL: Record<string, string[]> = {
  '0': ['█████', '█   █', '█   █', '█   █', '█████'],
  '1': ['  █  ', ' ██  ', '  █  ', '  █  ', '█████'],
  '2': ['█████', '    █', '█████', '█    ', '█████'],
  '3': ['█████', '    █', '█████', '    █', '█████'],
  '4': ['█   █', '█   █', '█████', '    █', '    █'],
  '5': ['█████', '█    ', '█████', '    █', '█████'],
  '6': ['█████', '█    ', '█████', '█   █', '█████'],
  '7': ['█████', '    █', '    █', '    █', '    █'],
  '8': ['█████', '█   █', '█████', '█   █', '█████'],
  '9': ['█████', '█   █', '█████', '    █', '█████'],
  ':': ['     ', '  █  ', '     ', '  █  ', '     '],
};

function parts(secs: number): string[] {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return [String(h).padStart(2, '0'), String(m).padStart(2, '0'), String(s).padStart(2, '0')];
}

function rowsFor(secs: number, glyphs: Record<string, string[]>): string[] {
  const height = glyphs['0'].length;
  const output = Array.from({ length: height }, () => '');
  parts(secs).forEach((part, partIndex) => {
    for (const char of part) {
      const glyph = glyphs[char] ?? Array.from({ length: height }, () => ' ');
      for (let row = 0; row < height; row++) output[row] += `${glyph[row]} `;
    }
    if (partIndex < 2) {
      const glyph = glyphs[':'];
      for (let row = 0; row < height; row++) output[row] += `${glyph[row]} `;
    }
  });
  return output;
}

export function timerRows(secs: number, font: TimerFont): string[] {
  switch (font) {
    case 'digital':
      return rowsFor(secs, DIGITAL);
    case 'pixel':
      return rowsFor(secs, PIXEL);
    case 'blocky':
    case 'gradient':
      return rowsFor(secs, BLOCKY);
  }
}

export function timerFontHeight(font: TimerFont): number {
  return font === 'digital' ? 3 : 5;
}

export function gradientColor(frac: number): { r: number; g: number; b: number } {
  const mix = (from: number, to: number) => Math.round(from + (to - from) * frac);
  return { r: mix(0, 0), g: mix(255, 255), b: mix(80, 255) };
}
