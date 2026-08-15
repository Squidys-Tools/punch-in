import { describe, expect, test } from 'bun:test';
import { FONTS, timerFontHeight, timerRows } from '../src/fonts.js';

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
      expect(rows.join('\n')).toContain(font === 'digital' ? ' _ ' : '███');
    }
  });

  test('pixel font is larger than the compact digital font', () => {
    expect(timerFontHeight('pixel')).toBeGreaterThan(timerFontHeight('digital'));
    expect(timerRows(3661, 'pixel')[0].length).toBeGreaterThan(timerRows(3661, 'digital')[0].length);
  });
});
