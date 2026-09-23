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
  test('lists only the supported animations with human labels', () => {
    expect(TIMER_ANIMATIONS).toEqual(['none', 'digit-flash', 'colon-blink']);
    expect(animationLabel('digit-flash')).toBe('digit flash');
    expect(animationDescription('none')).toBe('static digits');
    expect(animationDescription('digit-flash')).toBe('flash only digits that change');
    expect(isTimerAnimation('colon-blink')).toBe(true);
    expect(isTimerAnimation('roll')).toBe(false);
  });

  test('mixes colors for the digit flash fade', () => {
    expect(mixColor('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixColor('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mixColor('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColor('green', 'black', 1)).toBe('#000000');
  });
});

describe('animation state', () => {
  test('detects digit changes for the flash', () => {
    const state = createAnimationState('digit-flash');
    const now = 1_000_000;
    const first = timerBlocks(9, 'blocky');
    syncAnimationState(state, { active: true, digits: digitKey(first), now, animation: 'digit-flash' });
    expect(state.wasActive).toBe(true);
    expect(state.flashUntil.every((until) => until === 0)).toBe(true);

    const next = timerBlocks(10, 'blocky');
    syncAnimationState(state, { active: true, digits: digitKey(next), now, animation: 'digit-flash' });
    expect(state.flashUntil[5]).toBe(now + 220);
    expect(state.flashUntil[4]).toBe(now + 220);
    expect(state.flashUntil[0]).toBe(0);
    expect(faceColor({
      baseColor: '#00ff00',
      animation: 'digit-flash',
      place: 5,
      kind: 'digit',
      active: true,
      now: now + 50,
      state,
    })).not.toBe('#00ff00');
  });

  test('colon blink blanks colons on the off phase', () => {
    const state = createAnimationState('colon-blink');
    const blocks = timerBlocks(1, 'blocky');
    syncAnimationState(state, { active: true, digits: digitKey(blocks), now: 0, animation: 'colon-blink' });
    const off = prepareBlocks({ blocks, animation: 'colon-blink', active: true, now: 500 });
    expect(off[2]!.rows.every((row) => row.trim() === '')).toBe(true);
    const on = prepareBlocks({ blocks, animation: 'colon-blink', active: true, now: 1000 });
    expect(on[2]!.rows.some((row) => row.includes('█'))).toBe(true);
  });

  test('resetting an inactive timer clears its flash state', () => {
    const state = createAnimationState('digit-flash');
    const blocks = timerBlocks(9, 'blocky');
    syncAnimationState(state, { active: true, digits: digitKey(blocks), now: 100, animation: 'digit-flash' });
    syncAnimationState(state, { active: false, digits: '000000', now: 200, animation: 'digit-flash' });
    expect(state.wasActive).toBe(false);
    expect(state.digits).toBe('');
    expect(state.flashUntil.every((until) => until === 0)).toBe(true);
  });
});
