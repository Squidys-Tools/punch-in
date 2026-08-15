import { formatDuration, sessionsOn, type Store } from './store.js';

export type RingStyle = 'none' | 'smooth' | 'thin' | 'pixel';
export type RingConcept = 'day-dial' | 'day-left';

export const RING_STYLES: RingStyle[] = ['none', 'smooth', 'thin', 'pixel'];
export const RING_CONCEPTS: RingConcept[] = ['day-dial', 'day-left'];

export interface Cell {
  ch: string;
  cat: number;
}

export interface RingData {
  frac: number;
  center: string;
  label: string;
}

export function ringHeight(style: RingStyle): number {
  return style === 'none' ? 0 : 6;
}

export function ringData(store: Store, concept: RingConcept, now: Date = new Date()): RingData {
  const elapsed = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const day = 24 * 3600;
  const total = sessionsOn(store.history, now).reduce((sum, session) => sum + session.duration_secs, 0);
  const passed = elapsed / day;
  const frac = concept === 'day-left' ? 1 - passed : passed;
  const percent = `${Math.round(frac * 100)}%`;
  return {
    frac: Math.max(0, Math.min(1, frac)),
    center: percent,
    label:
      concept === 'day-left'
        ? `today ${formatDuration(total)} · ${formatDuration(day - elapsed)} left`
        : `today ${formatDuration(total)} · ${Math.round(passed * 100)}% of the day passed`,
  };
}

export function ringGrid(style: RingStyle, data: RingData): Cell[][] {
  if (style === 'none') return [];
  const rows = 6;
  const cols = style === 'pixel' ? 21 : 23;
  const grid: Cell[][] = [];
  for (let row = 0; row < rows; row++) {
    const cells: Cell[] = [];
    for (let col = 0; col < cols; col++) {
      const x = (col - (cols - 1) / 2) / ((cols - 1) / 2);
      const y = (row - (rows - 1) / 2) / ((rows - 1) / 2);
      const distance = Math.hypot(x, y);
      const inner = style === 'thin' ? 0.78 : 0.58;
      if (distance < inner || distance > 1.08) {
        cells.push({ ch: ' ', cat: -2 });
        continue;
      }
      const angle = (Math.atan2(x, -y) + Math.PI * 2) % (Math.PI * 2);
      const progress = angle / (Math.PI * 2);
      const filled = progress <= data.frac;
      cells.push({
        ch: filled ? (style === 'pixel' ? '█' : '⠿') : style === 'pixel' ? '·' : '⠒',
        cat: filled ? 0 : -1,
      });
    }
    grid.push(cells);
  }
  const centerRow = Math.floor(rows / 2);
  const centerStart = Math.floor((cols - data.center.length) / 2);
  for (let i = 0; i < data.center.length; i++) {
    grid[centerRow][centerStart + i] = { ch: data.center[i], cat: -2 };
  }
  return grid;
}
