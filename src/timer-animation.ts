import { blankBlock, type TimerBlock } from './fonts.js';

export type TimerAnimation = 'none' | 'digit-flash' | 'colon-blink';

export const TIMER_ANIMATIONS: TimerAnimation[] = ['none', 'digit-flash', 'colon-blink'];

export function isTimerAnimation(value: unknown): value is TimerAnimation {
  return typeof value === 'string' && (TIMER_ANIMATIONS as string[]).includes(value);
}

export function animationLabel(value: TimerAnimation): string {
  return value === 'none' ? 'none' : value.replace(/-/g, ' ');
}

export function animationDescription(value: TimerAnimation): string {
  switch (value) {
    case 'none': return 'static digits';
    case 'digit-flash': return 'flash only digits that change';
    case 'colon-blink': return 'classic colon blink';
  }
}

const NAMED_HEX: Record<string, string> = {
  green: '#00ff00',
  gray: '#808080',
  red: '#ff0000',
  yellow: '#ffff00',
  magenta: '#ff00ff',
  cyan: '#00ffff',
  white: '#ffffff',
  black: '#000000',
};

function parseHex(color: string): [number, number, number] | null {
  const hex = (NAMED_HEX[color] ?? color).replace('#', '');
  if (hex.length !== 6) return null;
  const value = Number.parseInt(hex, 16);
  if (Number.isNaN(value)) return null;
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function mixColor(from: string, to: string, amount: number): string {
  const start = parseHex(from);
  const end = parseHex(to);
  if (!start || !end) return amount >= 0.5 ? to : from;
  const progress = Math.max(0, Math.min(1, amount));
  const channel = (a: number, b: number) => Math.round(a + (b - a) * progress);
  const rgb = [channel(start[0], end[0]), channel(start[1], end[1]), channel(start[2], end[2])] as const;
  return `#${rgb.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

const DIGIT_PLACES = 6;
const FLASH_MS = 220;

export interface AnimationState {
  digits: string;
  flashUntil: number[];
  wasActive: boolean;
  animation: TimerAnimation;
}

export function createAnimationState(animation: TimerAnimation): AnimationState {
  return {
    digits: '',
    flashUntil: Array(DIGIT_PLACES).fill(0),
    wasActive: false,
    animation,
  };
}

export function syncAnimationState(
  state: AnimationState,
  options: { active: boolean; digits: string; now: number; animation: TimerAnimation },
): void {
  const { active, digits, now, animation } = options;
  if (state.animation !== animation) {
    Object.assign(state, createAnimationState(animation));
  }
  if (!active) {
    state.wasActive = false;
    state.digits = '';
    state.flashUntil.fill(0);
    return;
  }
  if (!state.wasActive) {
    state.wasActive = true;
    state.digits = digits;
    return;
  }
  if (state.digits && state.digits !== digits) {
    for (let place = 0; place < DIGIT_PLACES; place++) {
      if (state.digits[place] !== digits[place]) {
        if (animation === 'digit-flash') state.flashUntil[place] = now + FLASH_MS;
      }
    }
  }
  state.digits = digits;
}

export function prepareBlocks(options: {
  blocks: TimerBlock[];
  animation: TimerAnimation;
  active: boolean;
  now: number;
}): TimerBlock[] {
  const { blocks, animation, active, now } = options;
  if (!active || animation !== 'colon-blink') return blocks;
  return blocks.map((block) => {
    if (block.kind === 'colon' && Math.floor(now / 500) % 2 === 1) return blankBlock(block);
    return block;
  });
}

export function faceColor(options: {
  baseColor: string;
  animation: TimerAnimation;
  place: number;
  kind: 'digit' | 'colon';
  active: boolean;
  now: number;
  state: AnimationState;
}): string {
  const { baseColor, animation, place, kind, active, now, state } = options;
  if (!active || animation !== 'digit-flash' || kind !== 'digit') return baseColor;
  const until = state.flashUntil[place] ?? 0;
  if (now >= until) return baseColor;
  return mixColor(baseColor, '#ffffff', ((until - now) / FLASH_MS) * 0.9);
}

export function digitKey(blocks: TimerBlock[]): string {
  return blocks
    .filter((block) => block.kind === 'digit')
    .map((block) => block.value)
    .join('');
}
