import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  dataFile,
  formatDuration,
  isSameDay,
  loadPath,
  savePath,
  startOfDay,
  todaySessions,
  totalOn,
  toRfc3339Local,
  type Session,
  type Store,
} from '../src/store.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'punch-store-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function makeSession(started: Date, ended: Date, project: string, durationSecs: number): Session {
  return { project, started_at: started, ended_at: ended, duration_secs: durationSecs };
}

describe('formatDuration', () => {
  test('formats seconds only', () => {
    expect(formatDuration(5)).toBe('5s');
  });

  test('formats minutes and seconds', () => {
    expect(formatDuration(65)).toBe('1m 05s');
  });

  test('formats hours, minutes and seconds', () => {
    expect(formatDuration(3661)).toBe('1h 01m 01s');
  });

  test('formats zero', () => {
    expect(formatDuration(0)).toBe('0s');
  });
});

describe('dataFile', () => {
  test('respects PUNCH_DATA env override', () => {
    process.env.PUNCH_DATA = path.join(dir, 'custom.json');
    expect(dataFile()).toBe(path.join(dir, 'custom.json'));
    delete process.env.PUNCH_DATA;
  });
});

describe('save/load roundtrip', () => {
  test('persists active session and history', () => {
    const file = path.join(dir, 'punch.json');
    const started = new Date();
    const ended = new Date(started.getTime() + 45 * 60 * 1000);
    const store: Store = {
      active: { project: 'web', started_at: started },
      history: [makeSession(started, ended, 'web', 2700)],
    };

    const saved = savePath(file, store);
    expect(saved.ok).toBe(true);

    const raw = readFileSync(file, 'utf8');
    const activeStarted = JSON.parse(raw).active.started_at as string;
    expect(activeStarted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(activeStarted).not.toMatch(/Z$/);
    const seconds = (ms: number) => Math.floor(ms / 1000) * 1000;
    expect(new Date(activeStarted).getTime()).toBe(seconds(started.getTime()));

    const loaded = loadPath(file);
    if (!loaded.ok) throw new Error(loaded.error);
    const data = loaded.value;
    expect(data.active?.project).toBe('web');
    expect(data.active?.started_at.getTime()).toBe(seconds(started.getTime()));
    expect(data.history).toHaveLength(1);
    expect(data.history[0].project).toBe('web');
    expect(data.history[0].started_at.getTime()).toBe(seconds(started.getTime()));
    expect(data.history[0].ended_at.getTime()).toBe(seconds(ended.getTime()));
    expect(data.history[0].duration_secs).toBe(2700);
  });

  test('missing file loads an empty store', () => {
    const loaded = loadPath(path.join(dir, 'nope.json'));
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.value.active).toBeNull();
    expect(loaded.value.history).toEqual([]);
  });

  test('preserves unknown persisted fields across a rewrite', () => {
    const file = path.join(dir, 'legacy.json');
    writeFileSync(
      file,
      JSON.stringify({ active: null, history: [], goal_secs: 6 * 3600 }),
      'utf8',
    );

    const loaded = loadPath(file);
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.value.extra).toEqual({ goal_secs: 21600 });

    const saved = savePath(file, loaded.value);
    expect(saved.ok).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8')).goal_secs).toBe(21600);
  });

  test('corrupt file returns an error', () => {
    const file = path.join(dir, 'bad.json');
    const { writeFileSync } = require('node:fs');
    writeFileSync(file, '{not json');
    const loaded = loadPath(file);
    expect(loaded.ok).toBe(false);
  });

  test('writes RFC3339 dates with local offset that JS can parse', () => {
    const d = new Date(2026, 7, 14, 10, 30, 0);
    const iso = toRfc3339Local(d);
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(new Date(iso).getTime()).toBe(d.getTime());
  });
});

describe('date helpers', () => {
  test('isSameDay compares calendar days', () => {
    const a = new Date(2026, 7, 14, 23, 59, 59);
    const b = new Date(2026, 7, 14, 0, 0, 0);
    expect(isSameDay(a, b)).toBe(true);
    expect(isSameDay(a, new Date(2026, 7, 13, 12, 0, 0))).toBe(false);
  });

  test('startOfDay normalizes to local midnight', () => {
    const d = startOfDay(new Date(2026, 7, 14, 18, 30, 0));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getDate()).toBe(14);
  });

  test('todaySessions filters by today', () => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const today = makeSession(todayStart, new Date(todayStart.getTime() + 60000), 'x', 60);
    const yesterday = makeSession(
      new Date(todayStart.getTime() - 24 * 3600 * 1000),
      new Date(todayStart.getTime() - 24 * 3600 * 1000 + 60000),
      'y',
      60,
    );
    const result = todaySessions([today, yesterday]);
    expect(result).toHaveLength(1);
    expect(result[0].project).toBe('x');
  });

  test('totalOn sums durations for a date', () => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const yesterday = new Date(todayStart.getTime() - 24 * 3600 * 1000);
    const history = [
      makeSession(todayStart, todayStart, 'a', 100),
      makeSession(todayStart, todayStart, 'b', 200),
      makeSession(yesterday, yesterday, 'c', 300),
    ];
    expect(totalOn(history, todayStart)).toBe(300);
    expect(totalOn(history, yesterday)).toBe(300);
  });
});
