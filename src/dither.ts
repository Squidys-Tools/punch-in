// Ordered-dither backgrounds for the timer screen.
//
// The model follows dithercn (https://dithercn.dev): a "field" returns a smooth
// tone in 0..1 for every pixel, and the engine turns that tone into ink or paper
// by comparing it to an ordered (Bayer) threshold. Here a pixel is half a
// terminal cell (upper or lower half block), so every cell carries two pixels
// and the pixels are square.

export type DitherBackground = 'none' | 'ripple' | 'plasma' | 'clouds' | 'waves';

export const DITHER_BACKGROUNDS: DitherBackground[] = ['none', 'ripple', 'plasma', 'clouds', 'waves'];

export function isDitherBackground(value: unknown): value is DitherBackground {
  return typeof value === 'string' && (DITHER_BACKGROUNDS as string[]).includes(value);
}

export function backgroundLabel(value: DitherBackground): string {
  return value;
}

export function backgroundDescription(value: DitherBackground): string {
  switch (value) {
    case 'none': return 'plain background';
    case 'ripple': return 'dithered rings drifting outward';
    case 'plasma': return 'dithered plasma swirl';
    case 'clouds': return 'dithered clouds drifting by';
    case 'waves': return 'dithered waves rolling across';
  }
}

// ---------- noise helpers (ports of the helpers dithercn gives every field) ----------

const fract = (x: number): number => x - Math.floor(x);
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Deterministic 2D hash in 0..1. */
export function hash21(x: number, y: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
}

/** Smooth value noise in 0..1. */
export function noise2(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash21(ix, iy);
  const b = hash21(ix + 1, iy);
  const c = hash21(ix, iy + 1);
  const d = hash21(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Soft cloudy noise in 0..1. */
export function fbm(x: number, y: number, octaves = 3): number {
  let sum = 0;
  let amplitude = 0.5;
  let total = 0;
  let px = x;
  let py = y;
  for (let octave = 0; octave < octaves; octave++) {
    sum += amplitude * noise2(px, py);
    total += amplitude;
    px = px * 2.03 + 17.3;
    py = py * 2.03 + 9.1;
    amplitude *= 0.5;
  }
  return sum / total;
}

// ---------- ordered dither ----------

function buildBayer(size: number): number[] {
  let matrix = [0];
  for (let n = 1; n < size; n *= 2) {
    const next: number[] = new Array(matrix.length * 4);
    const side = n * 2;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = matrix[y * n + x]! * 4;
        next[y * side + x] = v;
        next[y * side + x + n] = v + 2;
        next[(y + n) * side + x] = v + 3;
        next[(y + n) * side + x + n] = v + 1;
      }
    }
    matrix = next;
  }
  return matrix;
}

const BAYER_SIZE = 8;
const BAYER = buildBayer(BAYER_SIZE).map((value) => (value + 0.5) / (BAYER_SIZE * BAYER_SIZE));

/** Threshold for pixel (x, y), strictly between 0 and 1. */
export function bayerThreshold(x: number, y: number): number {
  return BAYER[(y & (BAYER_SIZE - 1)) * BAYER_SIZE + (x & (BAYER_SIZE - 1))]!;
}

/** True when a pixel of the given tone is drawn as ink. */
export function ditherPixel(tone: number, x: number, y: number): boolean {
  return tone > bayerThreshold(x, y);
}

// ---------- fields ----------

/** `u` runs 0..1 left to right, `v` 0..1 top to bottom, `aspect` is width / height in pixels. */
export type Field = (u: number, v: number, aspect: number, t: number) => number;

const rippleField: Field = (u, v, aspect, t) => {
  const px = u * aspect;
  const dropX = aspect * (0.5 + 0.12 * Math.sin(t * 0.17));
  const dropY = 0.5 + 0.1 * Math.cos(t * 0.13);
  const wobble = fbm(px * 2.2 + t * 0.05, v * 2.2, 2) - 0.5;
  const d = Math.hypot(px - dropX, v - dropY) + wobble * 0.08;
  const rings = smoothstep(0.35, 1, 0.5 + 0.5 * Math.cos(d * 20 - t * 1.2));
  return rings * (0.25 + 0.75 * Math.exp(-d * 0.8));
};

const plasmaField: Field = (u, v, aspect, t) => {
  const x = u * aspect * 6;
  const y = v * 6;
  const value =
    Math.sin(x + t * 0.6) +
    Math.sin(y * 1.3 - t * 0.45) +
    Math.sin((x + y) * 0.7 + t * 0.35) +
    Math.sin(Math.hypot(x - 3 * aspect, y - 3) * 1.2 - t * 0.7);
  return clamp01(0.5 + value * 0.25);
};

const cloudsField: Field = (u, v, aspect, t) => {
  const x = u * aspect * 3.2 + t * 0.07;
  const y = v * 3.2 - t * 0.03;
  return smoothstep(0.25, 0.85, fbm(x, y, 3));
};

const wavesField: Field = (u, v, aspect, t) => {
  const x = u * aspect;
  const wave = Math.sin((v + 0.05 * Math.sin(x * 7 + t * 0.8) + 0.03 * Math.sin(x * 15 - t * 0.5)) * 26 - t * 0.9);
  return smoothstep(0.1, 1, 0.5 + 0.5 * wave) * (0.15 + 0.85 * v * v);
};

const FIELDS: Record<Exclude<DitherBackground, 'none'>, Field> = {
  ripple: rippleField,
  plasma: plasmaField,
  clouds: cloudsField,
  waves: wavesField,
};

export function fieldFor(background: Exclude<DitherBackground, 'none'>): Field {
  return FIELDS[background];
}

// ---------- rendering ----------

/** Cell codes: bit 0 = upper pixel is ink, bit 1 = lower pixel is ink. */
export const DITHER_CHARS = [' ', '▀', '▄', '█'] as const;

export interface ClearRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Cells from the clear rectangle at which the effect reaches full strength. */
const CLEAR_FADE_START = 1.5;
const CLEAR_FADE_END = 7;

/** 0 inside the rectangle, rising to 1 a few cells outside it. Rows count double: cells are twice as tall as wide. */
export function clearStrength(rect: ClearRect, cx: number, cy: number): number {
  const dx = Math.max(rect.x - cx, 0, cx - (rect.x + rect.width - 1));
  const dy = Math.max(rect.y - cy, 0, cy - (rect.y + rect.height - 1));
  return smoothstep(CLEAR_FADE_START, CLEAR_FADE_END, Math.hypot(dx, dy * 2));
}

export interface DitherOptions {
  background: DitherBackground;
  cols: number;
  rows: number;
  /** Seconds. */
  time: number;
  /**
   * 0..1: how much to calm the centre of the screen so the timer stays
   * readable. 0 leaves the effect at full strength everywhere.
   */
  calm?: number;
  /** Cell rectangle (relative to the screen) that stays empty, fading in around its edges. */
  clear?: ClearRect;
  /** Reused between frames when its length matches cols * rows. */
  out?: Uint8Array;
}

const DEFAULT_CALM = 0.75;
/** Peak tone, so even the busiest areas stay textured instead of solid. */
const MAX_TONE = 0.82;

/** Dither a whole screen of half-block cells. Returns one code per cell, row by row. */
export function renderDither(options: DitherOptions): Uint8Array {
  const { background, cols, rows, time } = options;
  const size = Math.max(0, cols) * Math.max(0, rows);
  const out = options.out && options.out.length === size ? options.out : new Uint8Array(size);
  if (background === 'none' || size === 0) return out.fill(0);

  const field = fieldFor(background);
  const calm = clamp01(options.calm ?? DEFAULT_CALM);
  const clear = options.clear && options.clear.width > 0 && options.clear.height > 0 ? options.clear : null;
  const pixelRows = rows * 2;
  const aspect = cols / pixelRows;
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const keep = clear ? clearStrength(clear, cx, cy) : 1;
      if (keep === 0) {
        out[cy * cols + cx] = 0;
        continue;
      }
      let code = 0;
      for (let half = 0; half < 2; half++) {
        const py = cy * 2 + half;
        const u = (cx + 0.5) / cols;
        const v = (py + 0.5) / pixelRows;
        // Elliptical vignette: 0 in the middle, 1 toward the edges.
        const dx = (u - 0.5) * 2;
        const dy = (v - 0.5) * 2;
        const edge = smoothstep(0.25, 1.05, Math.hypot(dx * 0.8, dy));
        const strength = (1 - calm + calm * edge) * keep;
        const tone = clamp01(field(u, v, aspect, time)) * MAX_TONE * strength;
        if (ditherPixel(tone, cx, py)) code |= 1 << half;
      }
      out[cy * cols + cx] = code;
    }
  }
  return out;
}

/** Plain-text view of a dither frame, handy for tests and previews. */
export function ditherText(codes: Uint8Array, cols: number): string[] {
  const lines: string[] = [];
  for (let start = 0; start < codes.length; start += cols) {
    let line = '';
    for (let index = start; index < start + cols; index++) line += DITHER_CHARS[codes[index]!];
    lines.push(line);
  }
  return lines;
}
