import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { start, status, stop } from '../src/commands.js';
import { loadPath } from '../src/store.js';

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
