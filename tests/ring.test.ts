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
});
