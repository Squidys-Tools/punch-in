import { describe, expect, test } from 'bun:test';
import { FONTS, TIMER_COLORS, TIMER_COLOR_HEX, timerFontHeight, timerRows } from '../src/fonts.js';

describe('timer fonts', () => {
  test('each font reports the height of its rendered rows', () => {
    for (const font of FONTS) {
      expect(timerRows(3661, font)).toHaveLength(timerFontHeight(font));
    }
  });

  test('renders a stable timer row set for every font', () => {
    for (const font of FONTS) {
      const rows = timerRows(3661, font);
      expect(rows.length).toBeGreaterThan(0);
      if (font === 'digital') expect(rows.join('\n')).toContain(' _ ');
      else if (font === 'pixel') expect(rows.join('\n')).toMatch(/[^ ]/);
      else expect(rows.join('\n')).toContain('███');
    }
  });

  test('pixel font is more compact than the digital font', () => {
    expect(timerFontHeight('pixel')).toBeLessThan(timerFontHeight('digital'));
    expect(timerRows(3661, 'pixel')[0].length).toBeLessThan(timerRows(3661, 'digital')[0].length);
  });

  test('exposes the complete pastel timer palette', () => {
    expect(TIMER_COLORS).toEqual(['gray', 'pink', 'peach', 'lemon', 'mint', 'sky', 'lilac']);
    expect(TIMER_COLOR_HEX).toEqual({
      pink: '#FFB3C6',
      peach: '#FFD1A9',
      lemon: '#FDFD96',
      mint: '#B5EAD7',
      sky: '#A7C7E7',
      lilac: '#C3B1E1',
    });
  });
});
