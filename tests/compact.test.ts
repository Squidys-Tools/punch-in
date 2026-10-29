import { describe, expect, test } from 'bun:test';
import { FONTS, type TimerFont } from '../src/fonts.js';
import { type RingStyle } from '../src/ring.js';
import { compactLevel, isCompactViewport, type CompactLevel } from '../src/views.js';

describe('compactLevel', () => {
  const level = (rows: number, font: TimerFont, ring: RingStyle): CompactLevel =>
    compactLevel(rows, font, ring);

  test('every font drops the ring first as the terminal squishes', () => {
    for (const font of FONTS) {
      expect(level(19, font, 'wide')).toBe(0);
      expect(level(18, font, 'wide')).toBe(1);
      expect(level(11, font, 'wide')).toBe(1);
      expect(level(10, font, 'wide')).toBe(2);
      expect(level(8, font, 'wide')).toBe(4);
    }
  });

  test('no ring never overflows', () => {
    for (const font of FONTS) {
      expect(level(13, font, 'none')).toBe(0);
      expect(level(11, font, 'none')).toBe(1);
      expect(level(10, font, 'none')).toBe(2);
      expect(level(9, font, 'none')).toBe(3);
      expect(level(8, font, 'none')).toBe(4);
    }
  });

  test('wrapped header and footer reserve more rows', () => {
    expect(compactLevel(19, 'blocky', 'wide')).toBe(0);
    expect(compactLevel(19, 'blocky', 'wide', 6)).toBe(1);
    expect(compactLevel(19, 'blocky', 'wide', 13)).toBe(2);
    expect(compactLevel(19, 'blocky', 'wide', 14)).toBe(3);
    expect(compactLevel(10, 'blocky', 'wide', 6)).toBe(4);
  });
});

describe('responsive timer layout', () => {
  test('compacts only when the terminal cannot comfortably hold the ring', () => {
    expect(isCompactViewport(30, 100)).toBe(false);
    expect(isCompactViewport(18, 100)).toBe(true);
    expect(isCompactViewport(30, 59)).toBe(true);
  });
});
