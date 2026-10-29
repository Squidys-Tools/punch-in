import { describe, expect, test } from 'bun:test';
import { FONTS, accentColor, assembleRows, glyphRows, pixelDigits, timerBlocks, timerFontHeight, timerRows } from '../src/fonts.js';

describe('timer fonts', () => {
  test('every timer style renders five rows', () => {
    for (const font of FONTS) {
      expect(timerFontHeight(font)).toBe(5);
      expect(timerRows(3661, font)).toHaveLength(5);
    }
  });

  test('pixel font downscales an eight-by-twenty source grid', () => {
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

  test('accent token maps the legacy gray choice to cyan and keeps custom colors', () => {
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
