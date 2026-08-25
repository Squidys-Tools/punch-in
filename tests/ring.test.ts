import { describe, expect, test } from 'bun:test';
import { RING_CONCEPTS, RING_STYLES, ringData, ringGrid, ringHeight } from '../src/ring.js';
import { DEFAULT_GOAL_SECS, type Store } from '../src/store.js';

const store: Store = { active: null, history: [], goal_secs: DEFAULT_GOAL_SECS };

describe('progress rings', () => {
  test('none has no rows and every visible style has rows', () => {
    expect(ringHeight('none')).toBe(0);
    for (const style of RING_STYLES.filter((value) => value !== 'none')) {
      expect(ringHeight(style)).toBeGreaterThan(0);
      expect(ringGrid(style, ringData(store, RING_CONCEPTS[0], new Date(2026, 7, 14, 12)))).toHaveLength(
        ringHeight(style),
      );
    }
  });

  test('every ring concept returns a bounded fraction and label', () => {
    for (const concept of RING_CONCEPTS) {
      const data = ringData(store, concept, new Date(2026, 7, 14, 12));
      expect(data.frac).toBeGreaterThanOrEqual(0);
      expect(data.frac).toBeLessThanOrEqual(1);
      expect(data.center.length).toBeGreaterThan(0);
      expect(data.label.length).toBeGreaterThan(0);
    }
  });

  test('ring progress does not become full before the fraction reaches one', () => {
    const cells = ringGrid('wide', { frac: 0.9, center: '90%', label: '' }).flat();
    const perimeter = cells.filter((cell) => cell.cat === 0 || cell.cat === -1);
    expect(perimeter.some((cell) => cell.cat === -1)).toBe(true);
    expect(ringGrid('wide', { frac: 1, center: '100%', label: '' }).flat().some((cell) => cell.cat === -1)).toBe(false);
  });

  test('wide ring has a curved outline instead of a rectangle', () => {
    const rows = ringGrid('wide', { frac: 0.5, center: '50%', label: '' });
    const activeCells = (row: typeof rows[number]) => row.filter((cell) => cell.cat === 0 || cell.cat === -1).length;
    expect(activeCells(rows[0])).toBeLessThan(activeCells(rows[Math.floor(rows.length / 2)]));
  });
});
