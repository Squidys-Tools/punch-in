import { describe, expect, test } from 'bun:test';
import { timerBlocks } from '../src/fonts.js';
import {
  TIMER_ANIMATIONS,
  animationDescription,
  animationLabel,
  createAnimationState,
  digitKey,
  faceColor,
  isTimerAnimation,
  mixColor,
  prepareBlocks,
  syncAnimationState,
} from '../src/timer-animation.js';

describe('timer animation prefs', () => {
  test('lists every selectable animation with a human label', () => {
    expect(TIMER_ANIMATIONS).toEqual([
      'none',
      'pulse',
      'digit-flash',
      'colon-blink',
      'roll',
      'entrance',
      'minute-flash',
    ]);
    expect(animationLabel('digit-flash')).toBe('digit flash');
    expect(animationDescription('none')).toBe('static digits');
    expect(isTimerAnimation('roll')).toBe(true);
    expect(isTimerAnimation('sparkle')).toBe(false);
  });

  test('mixes colors for flash/pulse fades', () => {
    expect(mixColor('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixColor('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mixColor('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColor('green', 'black', 1)).toBe('#000000');
  });
});

describe('animation state', () => {
  test('detects digit changes for flash and roll', () => {
    const state = createAnimationState('digit-flash');
    const now = 1_000_000;
    const first = timerBlocks(9, 'blocky');
    syncAnimationState(state, { active: true, secs: 9, digits: digitKey(first), now, animation: 'digit-flash' });
    expect(state.wasActive).toBe(true);
    expect(state.flashUntil.every((until) => until === 0)).toBe(true);

    const next = timerBlocks(10, 'blocky');
    syncAnimationState(state, { active: true, secs: 10, digits: digitKey(next), now, animation: 'digit-flash' });
    expect(state.flashUntil[5]).toBe(now + 220);
    expect(state.flashUntil[4]).toBeGreaterThan(now);
    expect(state.flashUntil[0]).toBe(0);
  });

  test('minute flash arms on minute rollover', () => {
    const state = createAnimationState('minute-flash');
    const now = 2_000_000;
    const start = timerBlocks(59, 'blocky');
    syncAnimationState(state, { active: true, secs: 59, digits: digitKey(start), now, animation: 'minute-flash' });
    const next = timerBlocks(60, 'blocky');
    syncAnimationState(state, { active: true, secs: 60, digits: digitKey(next), now: now + 100, animation: 'minute-flash' });
    expect(state.minuteFlashUntil).toBe(now + 100 + 400);
    expect(faceColor({
      baseColor: '#00ff00',
      animation: 'minute-flash',
      place: 0,
      kind: 'digit',
      active: true,
      now: now + 150,
      state,
    })).not.toBe('#00ff00');
  });

  test('entrance starts when a session becomes active', () => {
    const state = createAnimationState('entrance');
    syncAnimationState(state, { active: false, secs: 0, digits: '000000', now: 10, animation: 'entrance' });
    expect(state.entranceAt).toBeNull();
    const blocks = timerBlocks(1, 'blocky');
    syncAnimationState(state, { active: true, secs: 1, digits: digitKey(blocks), now: 50, animation: 'entrance' });
    expect(state.entranceAt).toBe(50);

    const early = prepareBlocks({ blocks, font: 'blocky', animation: 'entrance', active: true, now: 55, state });
    expect(early[7]!.rows.every((row) => row.trim() === '')).toBe(true);
    expect(early[0]!.rows.some((row) => row.includes('█'))).toBe(true);
  });

  test('colon blink blanks colons on the off phase', () => {
    const state = createAnimationState('colon-blink');
    const blocks = timerBlocks(1, 'blocky');
    syncAnimationState(state, { active: true, secs: 1, digits: digitKey(blocks), now: 0, animation: 'colon-blink' });
    const off = prepareBlocks({ blocks, font: 'blocky', animation: 'colon-blink', active: true, now: 500, state });
    expect(off[2]!.rows.every((row) => row.trim() === '')).toBe(true);
    const on = prepareBlocks({ blocks, font: 'blocky', animation: 'colon-blink', active: true, now: 1000, state });
    expect(on[2]!.rows.some((row) => row.includes('█'))).toBe(true);
  });

  test('roll scrambles a changing digit before settling', () => {
    const state = createAnimationState('roll');
    const now = 3_000_000;
    const first = timerBlocks(8, 'blocky');
    syncAnimationState(state, { active: true, secs: 8, digits: digitKey(first), now, animation: 'roll' });
    const second = timerBlocks(9, 'blocky');
    syncAnimationState(state, { active: true, secs: 9, digits: digitKey(second), now, animation: 'roll' });
    expect(state.scrambleUntil[5]).toBe(now + 180);

    const mid = prepareBlocks({ blocks: second, font: 'blocky', animation: 'roll', active: true, now: now + 50, state });
    expect(mid[7]!.value).not.toBe('9');
    const settled = prepareBlocks({ blocks: second, font: 'blocky', animation: 'roll', active: true, now: now + 200, state });
    expect(settled[7]!.value).toBe('9');
  });
});
