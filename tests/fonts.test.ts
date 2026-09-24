import { describe, expect, test } from 'bun:test';
import { ACCENT_COLOR_HEX, FONTS, TIMER_COLOR_HEX, TIMER_COLORS, accentColor, assembleRows, blockyDigits, timerBlocks, timerFontHeight, timerRows } from '../src/fonts.js';

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

  test('blocky font uses a wider, shorter grid', () => {
    expect(Object.values(blockyDigits).every((rows) =>
      rows.length === 4 && rows.every((row) => row.length === 4),
    )).toBe(true);
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

  test('accent token maps the legacy gray choice to cyan and keeps custom colors', () => {
    expect(ACCENT_COLOR_HEX).toEqual({
      gray: '#00FFFF',
      pink: '#FFB3C6',
      peach: '#FFD1A9',
      lemon: '#FDFD96',
      mint: '#B5EAD7',
      sky: '#A7C7E7',
      lilac: '#C3B1E1',
    });
    expect(accentColor('gray')).toBe('#00FFFF');
    expect(accentColor('peach')).toBe('#FFD1A9');
  });

  test('timer blocks expose digit and colon places for animation', () => {
    const blocks = timerBlocks(3661, 'blocky');
    expect(blocks.map((block) => block.kind)).toEqual([
      'digit', 'digit', 'colon', 'digit', 'digit', 'colon', 'digit', 'digit',
    ]);
    expect(blocks.filter((block) => block.kind === 'digit').map((block) => block.value).join('')).toBe('010101');
    expect(assembleRows(blocks)).toEqual(timerRows(3661, 'blocky'));
  });
});
