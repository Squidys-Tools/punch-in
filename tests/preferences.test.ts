import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_PREFERENCES,
  loadPreferencesPath,
  savePreferencesPath,
  type Preferences,
} from '../src/preferences.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'punch-preferences-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('preferences', () => {
  test('missing preferences load the first-run defaults', () => {
    const result = loadPreferencesPath(path.join(dir, 'preferences.json'));
    expect(result).toEqual({ ok: true, value: DEFAULT_PREFERENCES });
  });

  test('preferences round-trip independently from session history', () => {
    const file = path.join(dir, 'preferences.json');
    const value: Preferences = {
      ...DEFAULT_PREFERENCES,
      setupComplete: true,
      clockFormat: '24h',
      color: 'lilac',
      reuseLastProject: true,
    };
    expect(savePreferencesPath(file, value).ok).toBe(true);
    expect(loadPreferencesPath(file)).toEqual({ ok: true, value });
  });

  test('malformed preferences return a readable error', () => {
    const file = path.join(dir, 'preferences.json');
    writeFileSync(file, '{not json', 'utf8');
    const result = loadPreferencesPath(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(`corrupt preferences file ${file}`);
  });

  test('unknown preference fields are normalized to defaults', () => {
    const file = path.join(dir, 'preferences.json');
    writeFileSync(file, JSON.stringify({ setupComplete: true, clockFormat: 'weird', color: 'ultraviolet' }), 'utf8');
    const result = loadPreferencesPath(file);
    expect(result).toEqual({ ok: true, value: { ...DEFAULT_PREFERENCES, setupComplete: true } });
  });
});
