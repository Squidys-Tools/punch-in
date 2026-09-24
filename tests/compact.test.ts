import { describe, expect, test } from 'bun:test';
import { compactLevel, type CompactLevel } from '../src/views.js';

describe('compactLevel', () => {
  const level = (rows: number, font: string, ring: string): CompactLevel =>
    compactLevel(rows, font as never, ring as never);

  test('full layout in a normal terminal', () => {
    // blocky+smooth: body = rows-4; fullH = 4+6+4 = 14 -> need rows >= 18
    expect(level(30, 'blocky', 'wide')).toBe(0);
    expect(level(18, 'blocky', 'wide')).toBe(0);
    // digital+pixel: fullH = 3+6+4 = 13 -> need rows >= 17
    expect(level(30, 'digital', 'pixel')).toBe(0);
    expect(level(17, 'digital', 'pixel')).toBe(0);
  });

  test('ring drops first as the terminal squishes', () => {
    // blocky+smooth: noRingH = 6, noStartedH = 5, timerH = 4
    expect(level(18, 'blocky', 'wide')).toBe(0);
    expect(level(10, 'blocky', 'wide')).toBe(1); // body 6: no full, yes noRing
    expect(level(9, 'blocky', 'wide')).toBe(2); // body 5: yes noStarted
    expect(level(8, 'blocky', 'wide')).toBe(3); // body 4: yes timerH
    expect(level(7, 'blocky', 'wide')).toBe(4); // body 3: single line
  });

  test('pixel font needs less room', () => {
    // pixel+smooth: fullH = 3+6+4 = 13, noRingH = 5, noStartedH = 4, timerH = 3
    expect(level(17, 'pixel', 'wide')).toBe(0); // body 13
    expect(level(16, 'pixel', 'wide')).toBe(1); // body 12
    expect(level(15, 'pixel', 'wide')).toBe(1); // body 11
    expect(level(12, 'pixel', 'wide')).toBe(1); // body 8
    expect(level(9, 'pixel', 'wide')).toBe(1); // body 5
    expect(level(8, 'pixel', 'wide')).toBe(2); // body 4
    expect(level(7, 'pixel', 'wide')).toBe(3); // body 3
    expect(level(6, 'pixel', 'wide')).toBe(4); // body 2
    expect(level(5, 'pixel', 'wide')).toBe(4); // body 1
  });

  test('no ring never overflows', () => {
    // blocky+none: fullH = 4+0+4 = 8, noRingH = 6, noStartedH = 5
    expect(level(13, 'blocky', 'none')).toBe(0); // body 9
    expect(level(10, 'blocky', 'none')).toBe(1); // body 6
    expect(level(9, 'blocky', 'none')).toBe(2); // body 5
    expect(level(8, 'blocky', 'none')).toBe(3); // body 4
    expect(level(7, 'blocky', 'none')).toBe(4); // body 3
  });

  test('wrapped header/footer reserve more rows', () => {
    // blocky+smooth: fullH = 14, noRingH = 6, noStartedH = 5, timerH = 4
    expect(compactLevel(19, 'blocky', 'wide')).toBe(0); // default: body 15 -> full
    expect(compactLevel(19, 'blocky', 'wide', 6)).toBe(1); // wrapped: body 13 -> ring drops
    expect(compactLevel(19, 'blocky', 'wide', 13)).toBe(1); // wrapped: body 6 -> no ring
    expect(compactLevel(19, 'blocky', 'wide', 14)).toBe(2); // wrapped: body 5 -> started drops
    expect(compactLevel(19, 'blocky', 'wide', 15)).toBe(3); // wrapped: body 4 -> glyphs only
    expect(compactLevel(10, 'blocky', 'wide', 6)).toBe(3); // wrapped: body 4 -> glyphs only
  });
});
