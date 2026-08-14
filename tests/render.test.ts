import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React from 'react';
import { render as inkRender } from 'ink';
import { render } from 'ink-testing-library';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { App, Shell, type RingConcept, type RingStyle, type TimerFont } from '../src/views.js';
import { type Store } from '../src/store.js';

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
  const fonts: TimerFont[] = ['blocky', 'digital', 'pixel', 'gradient'];
  const ringStyles: RingStyle[] = ['none', 'smooth', 'thin', 'pixel'];
  const ringConcepts: RingConcept[] = ['day-dial', 'day-left'];

  for (const font of fonts) {
    test(`font ${font} renders without panicking`, () => {
      const instance = render(
        React.createElement(Shell, {
          store: fakeStore(),
          font,
          ringStyle: 'smooth',
          ringConcept: 'day-dial',
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
    });
  }

  for (const ringStyle of ringStyles) {
    for (const ringConcept of ringConcepts) {
      test(`ring ${ringStyle}/${ringConcept} renders without panicking`, () => {
        const instance = render(
          React.createElement(Shell, {
            store: fakeStore(),
            font: 'blocky',
            ringStyle,
            ringConcept,
            mode: 'normal',
            input: '',
            status: null,
          }),
        );
        const frame = instance.lastFrame() ?? '';
        instance.unmount();

        expect(frame.length).toBeGreaterThan(0);
        expect(frame).toContain('PUNCH');
      });
    }
  }

  test('writes combined previews', () => {
    const pick = (font: TimerFont, ringStyle: RingStyle, ringConcept: RingConcept) => {
      const instance = render(
        React.createElement(Shell, {
          store: fakeStore(),
          font,
          ringStyle,
          ringConcept,
          mode: 'normal',
          input: '',
          status: null,
        }),
      );
      const frame = instance.lastFrame() ?? '';
      instance.unmount();
      return frame;
    };
    writeFileSync('target/preview-minimal.txt', stripAnsi(pick('blocky', 'none', 'day-dial')));
    writeFileSync('target/preview-goal-ring.txt', stripAnsi(pick('blocky', 'smooth', 'day-left')));
  });
});

describe('App interaction', () => {
  test('t cycles the timer font', async () => {
    const instance = render(React.createElement(App));
    await flush();
    instance.stdin.write('\t');
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain('t font (digital)');
  });

  test('r cycles the ring style', async () => {
    const instance = render(React.createElement(App));
    await flush();
    instance.stdin.write('r');
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain('r ring (thin)');
  });

  test('c cycles the ring concept', async () => {
    const instance = render(React.createElement(App));
    await flush();
    instance.stdin.write('c');
    await flush();
    const frame = instance.lastFrame() ?? '';
    instance.unmount();

    expect(frame).toContain('c concept (day-left)');
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
