import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  dataFile,
  formatDateTimeInput,
  formatDuration,
  isSameDay,
  loadPath,
  parseDateTimeInput,
  savePath,
  sessionsOn,
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

describe('editable date and time values', () => {
  test('formats and parses local date-time input', () => {
    const date = new Date(2026, 7, 14, 10, 30, 45);
    const input = formatDateTimeInput(date);
    expect(input).toBe('2026-08-14 10:30:45');
    expect(parseDateTimeInput(input)?.getTime()).toBe(date.getTime());
    expect(parseDateTimeInput('2026-08-14 10:30')?.getSeconds()).toBe(0);
  });

  test('rejects malformed and impossible date-time input', () => {
    expect(parseDateTimeInput('tomorrow morning')).toBeNull();
    expect(parseDateTimeInput('2026-02-30 10:30:00')).toBeNull();
    expect(parseDateTimeInput('2026-08-14 25:00:00')).toBeNull();
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
      goal_secs: 8 * 3600,
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
  test('sessionsOn filters by a supplied local calendar day', () => {
    const date = new Date(2026, 7, 14, 12, 0, 0);
    const matching = makeSession(
      new Date(2026, 7, 14, 9, 0, 0),
      new Date(2026, 7, 14, 10, 0, 0),
      'today',
      3600,
    );
    const other = makeSession(
      new Date(2026, 7, 13, 23, 0, 0),
      new Date(2026, 7, 14, 1, 0, 0),
      'yesterday',
      7200,
    );

    expect(sessionsOn([matching, other], date)).toEqual([matching]);
  });

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
