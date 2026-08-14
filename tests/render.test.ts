import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React from 'react';
import { render as inkRender } from 'ink';
import { render } from 'ink-testing-library';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { App, Shell, type Design } from '../src/views.js';
import { DEFAULT_GOAL_SECS, type Store } from '../src/store.js';

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
    goal_secs: DEFAULT_GOAL_SECS,
  };
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1b[()][A-B0-9]/g, '');
}

async function flush(ms = 25): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

class FakeStdin extends EventEmitter {
  isTTY = true;
  data: unknown = null;
  write(data: unknown) {
    this.data = data;
    this.emit('readable');
    this.emit('data', data);
  }
  setEncoding() {}
  setRawMode() {}
  resume() {}
  pause() {}
  ref() {}
  unref() {}
  read() {
    const { data } = this;
    this.data = null;
    return data;
  }
}

class FakeStdout extends EventEmitter {
  isTTY = true;
  get columns() {
    return 100;
  }
  get rows() {
    return 30;
  }
  frames: string[] = [];
  write = (frame: string) => {
    this.frames.push(frame);
  };
}

describe('design previews', () => {
  const designs: Design[] = ['minimal', 'goal-ring'];

  for (const design of designs) {
    test(`${design} renders without panicking`, () => {
      const instance = render(
        React.createElement(Shell, {
          store: fakeStore(),
          design,
          mode: 'normal',
          prompt: 'project',
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

    expect(frame).toContain('design: goal-ring');
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

  test('g enters goal input and sets the daily goal', async () => {
    const instance = render(React.createElement(App));
    await flush();
    instance.stdin.write('g');
    await flush();
    expect(instance.lastFrame()).toContain('daily goal (hours):');

    instance.stdin.write('4');
    await flush();
    instance.stdin.write('\r');
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain('daily goal set to 4h 00m 00s');
  });

  test('q exits the app', async () => {
    const stdin = new FakeStdin() as unknown as NodeJS.ReadStream;
    const stdout = new FakeStdout() as unknown as NodeJS.WriteStream;

    const instance = inkRender(React.createElement(App), {
      stdout,
      stderr: stdout,
      stdin,
      debug: true,
      exitOnCtrlC: false,
      patchConsole: false,
    });

    await flush();
    stdin.write('q');

    const result = await Promise.race([
      instance.waitUntilExit().then(() => 'exited'),
      new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 1000)),
    ]);

    expect(result).toBe('exited');
  });
});
