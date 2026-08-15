import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React from 'react';
import { render } from 'ink-testing-library';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { App } from '../src/views.js';
import { DEFAULT_PREFERENCES, savePreferencesPath } from '../src/preferences.js';

let dir: string;
let dataFile: string;
let preferencesFile: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'punch-render-'));
  dataFile = path.join(dir, 'punch.json');
  preferencesFile = path.join(dir, 'preferences.json');
  process.env.PUNCH_DATA = dataFile;
  process.env.PUNCH_PREFERENCES = preferencesFile;
  savePreferencesPath(preferencesFile, { ...DEFAULT_PREFERENCES, setupComplete: true });
});

afterEach(() => {
  delete process.env.PUNCH_DATA;
  delete process.env.PUNCH_PREFERENCES;
  rmSync(dir, { recursive: true, force: true });
});

async function flush(ms = 25): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe('timer interactions', () => {
  test('idle footer exposes frequent actions without setup controls', async () => {
    const instance = render(React.createElement(App));
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain('a activity');
    expect(frame).toContain('? help');
    expect(frame).toContain('i start');
    expect(frame).toContain('q quit');
    expect(frame).not.toContain('design:');
    expect(frame).not.toContain('g goal');
  });

  test('starting a project shows the active state and stop action', async () => {
    const instance = render(React.createElement(App));
    await flush();
    instance.stdin.write('i');
    await flush();
    instance.stdin.write('blog');
    await flush();
    instance.stdin.write('\r');
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain('blog');
    expect(frame).toContain('o stop');
    expect(frame).toContain('TRACKING');
  });

  test('Esc cancels punch-out confirmation without writing a session', async () => {
    const instance = render(React.createElement(App));
    await flush();
    instance.stdin.write('i');
    await flush();
    instance.stdin.write('blog');
    await flush();
    instance.stdin.write('\r');
    await flush();
    instance.stdin.write('o');
    await flush();
    expect(instance.lastFrame()).toContain('Esc cancel');
    instance.stdin.write('\x1b');
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain('blog');
    expect(JSON.parse(readFileSync(dataFile, 'utf8')).history).toHaveLength(0);
  });

  test('Enter confirms punch-out and reports the logged project', async () => {
    const instance = render(React.createElement(App));
    await flush();
    instance.stdin.write('i');
    await flush();
    instance.stdin.write('research');
    await flush();
    instance.stdin.write('\r');
    await flush();
    instance.stdin.write('o');
    await flush();
    instance.stdin.write('\r');
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain('Logged');
    expect(frame).toContain('research');
    const stored = JSON.parse(readFileSync(dataFile, 'utf8'));
    expect(stored.active).toBeNull();
    expect(stored.history).toHaveLength(1);
  });
});
