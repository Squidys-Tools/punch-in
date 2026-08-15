import { describe, expect, test } from 'bun:test';
import { isCompactViewport } from '../src/views.js';

describe('responsive timer layout', () => {
  test('compacts only when the terminal cannot comfortably hold the ring', () => {
    expect(isCompactViewport(30, 100)).toBe(false);
    expect(isCompactViewport(18, 100)).toBe(true);
    expect(isCompactViewport(30, 59)).toBe(true);
  });
});
