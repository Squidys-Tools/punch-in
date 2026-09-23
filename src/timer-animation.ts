import { blankBlock, replaceBlock, type TimerBlock, type TimerFont } from './fonts.js';

export type TimerAnimation =
  | 'none'
  | 'pulse'
  | 'digit-flash'
  | 'colon-blink'
  | 'roll'
  | 'entrance'
  | 'minute-flash';

export const TIMER_ANIMATIONS: TimerAnimation[] = [
  'none',
  'pulse',
  'digit-flash',
  'colon-blink',
  'roll',
  'entrance',
  'minute-flash',
];

export function isTimerAnimation(value: unknown): value is TimerAnimation {
  return typeof value === 'string' && (TIMER_ANIMATIONS as string[]).includes(value);
}

export function animationLabel(value: TimerAnimation): string {
  return value === 'none' ? 'none' : value.replace(/-/g, ' ');
}

export function animationDescription(value: TimerAnimation): string {
  switch (value) {
    case 'none': return 'static digits';
    case 'pulse': return 'brightness pulse each second';
    case 'digit-flash': return 'flash only digits that change';
    case 'colon-blink': return 'classic colon blink';
    case 'roll': return 'scramble digits as they change';
    case 'entrance': return 'stagger digits when a session starts';
    case 'minute-flash': return 'flash the whole timer each minute';
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

export function normalizeColor(color: string): string {
  return NAMED_HEX[color] ?? color;
}

function parseHex(color: string): [number, number, number] | null {
  const hex = normalizeColor(color).replace('#', '');
  if (hex.length !== 6) return null;
  const n = Number.parseInt(hex, 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixColor(from: string, to: string, t: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  if (!a || !b) return t >= 0.5 ? to : from;
  const k = Math.max(0, Math.min(1, t));
  const channel = (x: number, y: number) => Math.round(x + (y - x) * k);
  const rgb = [channel(a[0], b[0]), channel(a[1], b[1]), channel(a[2], b[2])] as const;
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function lighten(color: string, amount: number): string {
  return mixColor(color, '#ffffff', amount);
}

export function darken(color: string, amount: number): string {
  return mixColor(color, '#000000', amount);
}

const DIGIT_PLACES = 6;
const SCRAMBLE_MS = 180;
const FLASH_MS = 220;
const ENTRANCE_MS = 720;
const MINUTE_FLASH_MS = 400;
const SCRAMBLE_STEP_MS = 45;

export interface AnimationState {
  digits: string;
  flashUntil: number[];
  scrambleUntil: number[];
  entranceAt: number | null;
  minute: number | null;
  minuteFlashUntil: number;
  wasActive: boolean;
  animation: TimerAnimation;
}

export function createAnimationState(animation: TimerAnimation): AnimationState {
  return {
    digits: '',
    flashUntil: Array(DIGIT_PLACES).fill(0),
    scrambleUntil: Array(DIGIT_PLACES).fill(0),
    entranceAt: null,
    minute: null,
    minuteFlashUntil: 0,
    wasActive: false,
    animation,
  };
}

export function syncAnimationState(
  state: AnimationState,
  opts: { active: boolean; secs: number; digits: string; now: number; animation: TimerAnimation },
): void {
  const { active, secs, digits, now, animation } = opts;
  if (state.animation !== animation) {
    Object.assign(state, createAnimationState(animation));
  }
  if (!active) {
    state.wasActive = false;
    state.digits = '';
    state.entranceAt = null;
    state.minute = null;
    state.minuteFlashUntil = 0;
    state.flashUntil.fill(0);
    state.scrambleUntil.fill(0);
    return;
  }
  if (!state.wasActive) {
    state.wasActive = true;
    state.digits = digits;
    state.minute = Math.floor(secs / 60);
    state.entranceAt = animation === 'entrance' ? now : null;
    return;
  }
  if (state.digits && state.digits !== digits) {
    for (let place = 0; place < DIGIT_PLACES; place++) {
      if (state.digits[place] !== digits[place]) {
        if (animation === 'digit-flash') state.flashUntil[place] = now + FLASH_MS;
        if (animation === 'roll') state.scrambleUntil[place] = now + SCRAMBLE_MS;
      }
    }
  }
  state.digits = digits;
  const minute = Math.floor(secs / 60);
  if (state.minute === null) {
    state.minute = minute;
  } else if (minute !== state.minute) {
    state.minute = minute;
    if (animation === 'minute-flash') state.minuteFlashUntil = now + MINUTE_FLASH_MS;
  }
}

export function prepareBlocks(options: {
  blocks: TimerBlock[];
  font: TimerFont;
  animation: TimerAnimation;
  active: boolean;
  now: number;
  state: AnimationState;
}): TimerBlock[] {
  const { font, animation, active, now, state } = options;
  if (!active || animation === 'none') return options.blocks;
  return options.blocks.map((block) => {
    if (animation === 'entrance' && state.entranceAt !== null) {
      const progress = (now - state.entranceAt) / ENTRANCE_MS;
      if (progress >= 1) {
        state.entranceAt = null;
      } else if (progress < block.place * 0.07) {
        return blankBlock(block);
      }
    }
    if (animation === 'colon-blink' && block.kind === 'colon') {
      if (Math.floor(now / 500) % 2 === 1) return blankBlock(block);
    }
    if (animation === 'roll' && block.kind === 'digit') {
      const until = state.scrambleUntil[block.place] ?? 0;
      if (now < until) {
        const step = Math.floor((until - now) / SCRAMBLE_STEP_MS) + block.place;
        return replaceBlock(block, String((step * 7 + 3) % 10), font);
      }
    }
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
  if (!active || animation === 'none') return baseColor;
  let color = baseColor;
  if (animation === 'pulse') {
    const phase = (now % 1000) / 1000;
    const flash = phase < 0.35 ? 1 - phase / 0.35 : 0;
    color = mixColor(color, lighten(color, 0.55), flash);
  }
  if (animation === 'digit-flash' && kind === 'digit') {
    const until = state.flashUntil[place] ?? 0;
    if (now < until) color = mixColor(color, '#ffffff', ((until - now) / FLASH_MS) * 0.9);
  }
  if (animation === 'minute-flash' && now < state.minuteFlashUntil) {
    color = mixColor(color, '#ffffff', ((state.minuteFlashUntil - now) / MINUTE_FLASH_MS) * 0.75);
  }
  if (animation === 'entrance' && state.entranceAt !== null) {
    const progress = (now - state.entranceAt) / ENTRANCE_MS;
    const start = place * 0.07;
    const local = Math.max(0, Math.min(1, (progress - start) / 0.35));
    color = mixColor(darken(color, 0.65), color, local);
  }
  return color;
}

export function digitKey(blocks: TimerBlock[]): string {
  return blocks
    .filter((block) => block.kind === 'digit')
    .map((block) => block.value)
    .join('');
}
