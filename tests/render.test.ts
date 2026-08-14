import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React from 'react';
import { render } from 'ink-testing-library';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { App, Shell, type Design } from '../src/views.js';
import type { Store } from '../src/store.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'punch-render-'));
  process.env.PUNCH_DATA = path.join(dir, 'punch.json');
});

afterEach(() => {
  delete process.env.PUNCH_DATA;
  rmSync(dir, { recursive: true, force: true });
});

function fakeStore(): Store {
  const now = new Date();
  const history = [];
  const spec: Array<[string, number]> = [['web', 45], ['blog', 90], ['tui', 30]];
  for (let i = 0; i < spec.length; i++) {
    const start = new Date(now.getTime() - 180 * 60 * 1000 + i * 40 * 60 * 1000);
    const end = new Date(start.getTime() + spec[i][1] * 60 * 1000);
    history.push({
      project: spec[i][0],
      started_at: start,
      ended_at: end,
      duration_secs: spec[i][1] * 60,
    });
  }
  const yStart = new Date(now.getTime() - 24 * 3600 * 1000 - 30 * 60 * 1000);
  history.push({
    project: 'blog',
    started_at: yStart,
    ended_at: new Date(yStart.getTime() + 70 * 60 * 1000),
    duration_secs: 70 * 60,
  });
  return {
    active: { project: 'tui', started_at: new Date(now.getTime() - 5 * 60 * 1000) },
    history,
  };
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1b[()][A-B0-9]/g, '');
}

async function flush(ms = 25): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe('design previews', () => {
  const designs: Design[] = ['minimal', 'today-line', 'session-list', 'goal-ring'];

  for (const design of designs) {
    test(`${design} renders without panicking`, () => {
      const instance = render(
        React.createElement(Shell, {
          store: fakeStore(),
          design,
          mode: 'normal',
          input: '',
          status: null,
        }),
      );
      const frame = instance.lastFrame() ?? '';
      instance.unmount();

      expect(frame.length).toBeGreaterThan(0);
      expect(frame).toContain('PUNCH');
      expect(frame).toContain('tui');

      const preview = `target/preview-${design}.txt`;
      writeFileSync(preview, stripAnsi(frame));
    });
  }
});

describe('App interaction', () => {
  test('tab cycles the design', async () => {
    const instance = render(React.createElement(App));
    await flush();
    instance.stdin.write('\t');
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain('design: today-line');
  });

  test('i enters input mode and enter starts a session', async () => {
    const instance = render(React.createElement(App));
    await flush();
    instance.stdin.write('i');
    await flush();
    expect(instance.lastFrame()).toContain('project name:');

    instance.stdin.write('blog');
    await flush();
    instance.stdin.write('\r');
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain("started tracking 'blog'");
    expect(frame).toContain('▶ blog');
  });

  test('o punches out the active session', async () => {
    writeFileSync(
      process.env.PUNCH_DATA!,
      JSON.stringify({
        active: { project: 'web', started_at: new Date(Date.now() - 60 * 1000) },
        history: [],
      }),
      'utf8',
    );

    const instance = render(React.createElement(App));
    await flush();
    instance.stdin.write('o');
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain('stopped');
    expect(frame).toContain("'web'");
  });
});
