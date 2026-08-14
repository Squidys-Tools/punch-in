// ---------- goal ring ----------
//
// Pure rendering of the progress ring. Styles:
//   smooth - thick braille band (the classic look)
//   thin   - hairline braille band
//   pixel  - chunky block ring
//
// To customize a ring look, tweak the parameters in ringGrid() (radius,
// innerRatio). Terminal chars are roughly twice as tall as wide, so rings
// are sampled on a pixel grid that makes the braille/block cells trace a
// circle (char box ~2:1 wide:tall).

import {
  formatDuration,
  todaySessions,
  type Store,
} from './store.js';

export type RingStyle = 'none' | 'smooth' | 'thin' | 'pixel';
export type RingConcept = 'day-dial' | 'day-left';

export const RING_STYLES: RingStyle[] = ['none', 'smooth', 'thin', 'pixel'];
export const RING_CONCEPTS: RingConcept[] = ['day-dial', 'day-left'];

export interface Cell {
  ch: string;
  cat: number; // -2 blank, -1 track, 0+ filled segment
}

const BRAILLE_BITS = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20, 0x40, 0x80];

interface Arc {
  start: number; // fraction of the circle (0..1), clockwise from 12 o'clock
  end: number;
  cat: number;
}

function angleFrac(x: number, y: number, cx: number, cy: number): number {
  return ((Math.atan2(x - cx, -(y - cy)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
}

function arcCat(f: number, arcs: Arc[]): number {
  for (const a of arcs) {
    if (f >= a.start && f < a.end) return a.cat;
  }
  return -1;
}

// Pixel grid centered on (cx, cy). Braille cells map 2x4 px; we sample a
// square pixel grid (cx == cy) so the braille char box is ~2:1, tracing a
// circle on a terminal where chars are twice as tall as wide.
function ringPixelGrid(radius: number, innerRatio: number, arcs: Arc[]): number[][] {
  const outer = radius;
  const inner = radius * innerRatio;
  const size = Math.ceil(outer * 2 + 1);
  const cx = outer;
  const cy = outer;
  const px: number[][] = [];
  for (let y = 0; y < size; y++) {
    const row: number[] = [];
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d >= inner && d <= outer) {
        row.push(arcCat(angleFrac(x, y, cx, cy), arcs));
      } else {
        row.push(-2);
      }
    }
    px.push(row);
  }
  return px;
}

function brailleFromPixels(px: number[][]): Cell[][] {
  const size = px.length;
  const rows = Math.ceil(size / 4);
  const cols = Math.ceil(size / 2);
  const grid: Cell[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: Cell[] = [];
    for (let cellCol = 0; cellCol < cols; cellCol++) {
      let mask = 0;
      let cat = -2;
      for (let rr = 0; rr < 4; rr++) {
        for (let cc = 0; cc < 2; cc++) {
          const y = r * 4 + rr;
          const x = cellCol * 2 + cc;
          if (y < size && x < size) {
            const p = px[y][x];
            if (p >= -1) {
              mask |= BRAILLE_BITS[rr * 2 + cc];
              if (cat === -2 && p === -1) cat = -1;
              if (cat === -2 && p >= 0) cat = p;
            }
          }
        }
      }
      row.push(mask ? { ch: String.fromCodePoint(0x2800 + mask), cat } : { ch: ' ', cat: -2 });
    }
    grid.push(row);
  }
  return grid;
}

const QUADS: Record<number, string> = {
  0: ' ', 1: '▘', 2: '▝', 3: '▀', 4: '▖', 5: '▌', 6: '▞', 7: '▛',
  8: '▗', 9: '▚', 10: '▐', 11: '▜', 12: '▄', 13: '▙', 14: '▟', 15: '█',
};

// Block ring. Each cell = 2x2 px, and rx:ry = 2:1 compensates for terminal
// chars being twice as tall as wide, so the ring reads as a circle on screen.
// The ellipse is anchored to the grid center (cols, rows), not (rx, ry).
function blockRing(rx: number, ry: number, innerRatio: number, arcs: Arc[]): Cell[][] {
  const cols = Math.ceil((2 * rx + 1) / 2);
  const rows = Math.ceil((2 * ry + 1) / 2);
  const cx = cols;
  const cy = rows;
  const grid: Cell[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < cols; c++) {
      let val = 0;
      let cat = -2;
      for (let dr = 0; dr < 2; dr++) {
        for (let dc = 0; dc < 2; dc++) {
          const x = c * 2 + dc + 0.5;
          const y = r * 2 + dr + 0.5;
          const nd = Math.hypot((x - cx) / rx, (y - cy) / ry);
          if (nd >= innerRatio && nd <= 1) {
            val |= dr === 0 ? (dc === 0 ? 1 : 2) : dc === 0 ? 4 : 8;
            if (cat === -2) cat = arcCat(angleFrac(x, y, cx, cy), arcs);
          }
        }
      }
      row.push(val ? { ch: QUADS[val], cat } : { ch: ' ', cat: -2 });
    }
    grid.push(row);
  }
  return grid;
}

// Centers `text` in the ring hole. `centerRow` is the grid row at the ring's
// vertical center (not necessarily floor(rows/2)) — that's where the hole is
// widest, so the label gets proper padding on both sides.
function overlayCenter(grid: Cell[][], text: string, centerRow: number): Cell[][] {
  const row = grid[centerRow];
  const mid = Math.floor(row.length / 2);
  if (row[mid].cat !== -2) return grid;
  let start = mid;
  while (start - 1 >= 0 && row[start - 1].cat === -2) start--;
  let end = mid;
  while (end + 1 < row.length && row[end + 1].cat === -2) end++;
  const runLen = end - start + 1;
  const pad = Math.max(0, Math.floor((runLen - text.length) / 2));
  const filled = ' '.repeat(pad) + text + ' '.repeat(Math.max(0, runLen - pad - text.length));
  const next = row.slice();
  for (let i = 0; i < runLen; i++) {
    next[start + i] = { ch: filled[i] ?? ' ', cat: -2 };
  }
  grid[centerRow] = next;
  return grid;
}

export function ringHeight(style: RingStyle): number {
  return style === 'none' ? 0 : 6;
}

export interface RingData {
  frac: number;
  center: string;
  label: string;
}

function pct(frac: number): string {
  return `${Math.round(frac * 100)}%`;
}

export function ringData(store: Store, concept: RingConcept, now: Date = new Date()): RingData {
  const today = todaySessions(store.history, now);
  const total = today.reduce((sum, s) => sum + s.duration_secs, 0);
  const dayElapsed = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const dayTotal = 24 * 3600;
  switch (concept) {
    case 'day-dial': {
      const frac = dayElapsed / dayTotal;
      return {
        frac,
        center: pct(frac),
        label: `today ${formatDuration(total)} · ${pct(frac)} of the day passed`,
      };
    }
    case 'day-left': {
      const frac = 1 - dayElapsed / dayTotal;
      return {
        frac,
        center: pct(frac),
        label: `today ${formatDuration(total)} · ${formatDuration(dayTotal - dayElapsed)} left`,
      };
    }
  }
}

export function ringGrid(style: RingStyle, data: RingData): Cell[][] {
  if (style === 'none') return [];
  const arcs = [{ start: 0, end: data.frac, cat: 0 }];
  if (style === 'pixel') return overlayCenter(blockRing(10.5, 5.5, 0.62, arcs), data.center, 3);
  const innerRatio = style === 'thin' ? 0.75 : 0.55;
  return overlayCenter(brailleFromPixels(ringPixelGrid(10.5, innerRatio, arcs)), data.center, 2);
}
