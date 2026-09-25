import { describe, expect, test } from 'bun:test';
import { ACCENT_COLOR_HEX, FONTS, TIMER_COLOR_HEX, TIMER_COLORS, accentColor, assembleRows, blockyDigits, digitalDigits, glyphRows, pixelDigits, timerBlocks, timerFontHeight, timerRows } from '../src/fonts.js';

describe('timer fonts', () => {
  test('every timer style renders five rows', () => {
    for (const font of FONTS) {
      expect(timerFontHeight(font)).toBe(5);
      expect(timerRows(3661, font)).toHaveLength(5);
    }
  });

  test('renders a stable timer row set for every font', () => {
    for (const font of FONTS) {
      const rows = timerRows(3661, font);
      expect(rows.length).toBeGreaterThan(0);
      if (font === 'digital') expect(rows.join('\n')).toContain(' ___ ');
      else if (font === 'pixel') expect(rows.join('\n')).toMatch(/[^ ]/);
      else expect(rows.join('\n')).toContain('███');
    }
  });

  test('blocky font uses a four-by-five glyph grid', () => {
    expect(Object.values(blockyDigits).every((rows) =>
      rows.length === 5 && rows.every((row) => row.length === 4),
    )).toBe(true);
  });

  test('digital font uses a five-by-five glyph grid', () => {
    for (const glyph of Object.values(digitalDigits)) {
      expect(glyph).toHaveLength(5);
      expect(glyph.every((row) => row.length === 5)).toBe(true);
    }
  });

  test('pixel font uses an eight-by-twenty source grid', () => {
    for (const [character, glyph] of Object.entries(pixelDigits)) {
      const sourceWidth = character === ':' ? 2 : 8;
      const renderedWidth = character === ':' ? 1 : 4;
      expect(glyph).toHaveLength(20);
      expect(glyph.every((row) => row.length === sourceWidth)).toBe(true);
      const rendered = glyphRows(character, 'pixel');
      expect(rendered).toHaveLength(5);
      expect(rendered.every((row) => row.length === renderedWidth)).toBe(true);
    }
  });

  test('gradient keeps the blocky font geometry', () => {
    for (const character of '0123456789:') {
      expect(glyphRows(character, 'gradient')).toEqual(glyphRows(character, 'blocky'));
    }
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
