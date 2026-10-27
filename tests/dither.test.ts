import { describe, expect, test } from 'bun:test';
import {
  DITHER_BACKGROUNDS,
  DITHER_CHARS,
  backgroundDescription,
  backgroundLabel,
  bayerThreshold,
  ditherPixel,
  ditherText,
  fbm,
  hash21,
  isDitherBackground,
  noise2,
  clearStrength,
  renderDither,
  smoothstep,
} from '../src/dither.js';

describe('dither preferences', () => {
  test('lists the backgrounds with labels and descriptions', () => {
    expect(DITHER_BACKGROUNDS).toEqual(['none', 'ripple', 'plasma', 'clouds', 'waves']);
    expect(backgroundLabel('ripple')).toBe('ripple');
    for (const background of DITHER_BACKGROUNDS) expect(backgroundDescription(background).length).toBeGreaterThan(0);
    expect(isDitherBackground('plasma')).toBe(true);
    expect(isDitherBackground('glitter')).toBe(false);
    expect(isDitherBackground(undefined)).toBe(false);
  });
});

describe('noise helpers', () => {
  test('hash and noise are deterministic and stay in range', () => {
    expect(hash21(3, 7)).toBe(hash21(3, 7));
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37 - 20;
      const y = i * 0.91 + 4;
      for (const value of [hash21(x, y), noise2(x, y), fbm(x, y)]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  test('value noise is continuous', () => {
    expect(Math.abs(noise2(1.5, 2.5) - noise2(1.5001, 2.5))).toBeLessThan(0.01);
  });

  test('smoothstep clamps and eases', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
  });
});

describe('ordered dither', () => {
  test('bayer thresholds are a permutation of an 8x8 grid', () => {
    const seen = new Set<number>();
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const value = bayerThreshold(x, y);
        expect(value).toBeGreaterThan(0);
        expect(value).toBeLessThan(1);
        seen.add(Math.round(value * 64 - 0.5));
      }
    }
    expect(seen.size).toBe(64);
    expect(bayerThreshold(8, 8)).toBe(bayerThreshold(0, 0));
  });

  test('tone controls the share of ink pixels', () => {
    const coverage = (tone: number) => {
      let on = 0;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (ditherPixel(tone, x, y)) on++;
      return on / 64;
    };
    expect(coverage(0)).toBe(0);
    expect(coverage(1)).toBe(1);
    expect(coverage(0.5)).toBe(0.5);
    expect(coverage(0.25)).toBe(0.25);
  });
});

describe('renderDither', () => {
  const size = { cols: 60, rows: 20 };

  test('none draws nothing', () => {
    const codes = renderDither({ background: 'none', ...size, time: 5 });
    expect(codes.length).toBe(size.cols * size.rows);
    expect(codes.every((code) => code === 0)).toBe(true);
  });

  test('empty screens render without error', () => {
    expect(renderDither({ background: 'ripple', cols: 0, rows: 10, time: 0 }).length).toBe(0);
    expect(renderDither({ background: 'ripple', cols: 10, rows: 0, time: 0 }).length).toBe(0);
  });

  for (const background of DITHER_BACKGROUNDS.filter((value) => value !== 'none')) {
    test(`${background} is deterministic, mixes ink and paper, and animates`, () => {
      const first = renderDither({ background, ...size, time: 3 });
      const again = renderDither({ background, ...size, time: 3 });
      const later = renderDither({ background, ...size, time: 7.5 });
      expect([...first]).toEqual([...again]);
      expect([...first]).not.toEqual([...later]);
      const ink = first.filter((code) => code !== 0).length;
      expect(ink).toBeGreaterThan(size.cols * size.rows * 0.02);
      expect(ink).toBeLessThan(size.cols * size.rows * 0.9);
      expect(first.every((code) => code >= 0 && code <= 3)).toBe(true);
    });
  }

  test('calm keeps the centre quieter than the edges', () => {
    const cols = 80;
    const rows = 24;
    const density = (calm: number) => {
      const codes = renderDither({ background: 'plasma', cols, rows, time: 2, calm });
      let centre = 0;
      let edge = 0;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const code = codes[y * cols + x]!;
          const weight = (code & 1) + (code >> 1);
          const inCentre = Math.abs(x - cols / 2) < cols * 0.2 && Math.abs(y - rows / 2) < rows * 0.2;
          if (inCentre) centre += weight;
          else edge += weight;
        }
      }
      return { centre: centre / (cols * 0.4 * rows * 0.4 * 2), edge: edge / ((cols * rows - cols * 0.4 * rows * 0.4) * 2) };
    };
    const calm = density(1);
    expect(calm.centre).toBeLessThan(calm.edge);
    expect(calm.centre).toBeLessThan(0.05);
  });

  test('a clear rectangle stays empty and fades in around its edges', () => {
    const rect = { x: 20, y: 6, width: 20, height: 8 };
    const codes = renderDither({ background: 'plasma', ...size, time: 2, calm: 0, clear: rect });
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let x = rect.x; x < rect.x + rect.width; x++) expect(codes[y * size.cols + x]).toBe(0);
    }
    const without = renderDither({ background: 'plasma', ...size, time: 2, calm: 0 });
    expect(without.some((code, index) => code !== 0 && codes[index] === 0)).toBe(true);
    expect(codes.slice(0, size.cols).some((code) => code !== 0)).toBe(true);
  });

  test('clearStrength is 0 inside, 1 far away, and monotonic outward', () => {
    const rect = { x: 10, y: 5, width: 10, height: 4 };
    expect(clearStrength(rect, 12, 6)).toBe(0);
    expect(clearStrength(rect, 40, 20)).toBe(1);
    const near = clearStrength(rect, 21, 6);
    const mid = clearStrength(rect, 24, 6);
    expect(near).toBeGreaterThanOrEqual(0);
    expect(mid).toBeGreaterThan(near);
    expect(mid).toBeLessThan(1);
  });

  test('reuses the output buffer when the size matches', () => {
    const out = new Uint8Array(size.cols * size.rows);
    const result = renderDither({ background: 'clouds', ...size, time: 1, out });
    expect(result).toBe(out);
    const other = renderDither({ background: 'clouds', cols: 5, rows: 5, time: 1, out });
    expect(other).not.toBe(out);
    expect(other.length).toBe(25);
  });

  test('ditherText maps codes to half-block characters', () => {
    expect(DITHER_CHARS).toEqual([' ', '▀', '▄', '█']);
    expect(ditherText(new Uint8Array([0, 1, 2, 3, 3, 2]), 3)).toEqual([' ▀▄', '██▄']);
  });
});
