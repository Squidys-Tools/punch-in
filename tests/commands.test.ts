import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { goal, start, status, stop } from '../src/commands.js';
import { DEFAULT_GOAL_SECS, loadPath } from '../src/store.js';

let dir: string;
let dataFile: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'punch-cmd-'));
  dataFile = path.join(dir, 'punch.json');
  process.env.PUNCH_DATA = dataFile;
});

afterEach(() => {
  delete process.env.PUNCH_DATA;
  rmSync(dir, { recursive: true, force: true });
});

function readStore() {
  const loaded = loadPath(dataFile);
  if (!loaded.ok) throw new Error(loaded.error);
  return loaded.value;
}

describe('start', () => {
  test('starts tracking general by default', () => {
    const result = start(null);
    expect(result.ok).toBe(true);
    expect(result.message).toBe("started tracking 'general'");
    expect(readStore().active?.project).toBe('general');
  });

  test('starts tracking a named project', () => {
    const result = start('blog');
    expect(result.ok).toBe(true);
    expect(result.message).toBe("started tracking 'blog'");
    expect(readStore().active?.project).toBe('blog');
  });

  test('trims the project name and falls back to general for empty input', () => {
    expect(start('  ').message).toBe("started tracking 'general'");
  });

  test('rejects a second session while one is running', () => {
    start('web');
    const result = start('blog');
    expect(result.ok).toBe(false);
    expect(result.message).toBe("a session is already running for 'web'");
  });
});

describe('status', () => {
  test('reports no session when idle', () => {
    expect(status().message).toBe('no session is running');
  });

  test('reports the active session and elapsed time', () => {
    start('web');
    const result = status();
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/^tracking 'web' for \d+s$/);
  });
});

describe('stop', () => {
  test('records the session and clears the active one', () => {
    start('web');
    const result = stop();
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/^stopped 'web' after \d+s$/);

    const store = readStore();
    expect(store.active).toBeNull();
    expect(store.history).toHaveLength(1);
    expect(store.history[0].project).toBe('web');
    expect(store.history[0].duration_secs).toBeGreaterThanOrEqual(0);
  });

  test('errors when nothing is running', () => {
    const result = stop();
    expect(result.ok).toBe(false);
    expect(result.message).toBe('no session is currently running');
  });

  test('writes a JSON file on disk', () => {
    start('api');
    stop();
    const raw = readFileSync(dataFile, 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.history).toHaveLength(1);
    expect(parsed.history[0].project).toBe('api');
  });
});

describe('goal', () => {
  test('reports the default goal when unset', () => {
    const result = goal(null);
    expect(result.ok).toBe(true);
    expect(result.message).toBe(`daily goal: ${formatHours(DEFAULT_GOAL_SECS)}`);
  });

  test('sets the daily goal', () => {
    const result = goal(6);
    expect(result.ok).toBe(true);
    expect(result.message).toBe('daily goal set to 6h 00m 00s');
    expect(readStore().goal_secs).toBe(6 * 3600);
  });

  test('persists a non-integer goal rounded to seconds', () => {
    goal(7.5);
    expect(readStore().goal_secs).toBe(27000);
  });

  test('rejects zero, negative, and out-of-range goals', () => {
    expect(goal(0).ok).toBe(false);
    expect(goal(-2).ok).toBe(false);
    expect(goal(25).ok).toBe(false);
    expect(goal(Number.NaN).ok).toBe(false);
  });
});

function formatHours(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}
