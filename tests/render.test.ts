import { act } from 'react';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React from 'react';
import { testRender } from '@opentui/react/test-utils';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
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

type Setup = Awaited<ReturnType<typeof testRender>>;

const RENDER_SIZE = { width: 100, height: 30 };
const STDIN_FLUSH_MS = 30;

async function settle(setup: Setup): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, STDIN_FLUSH_MS));
    await setup.renderOnce();
  });
}

async function frameText(setup: Setup): Promise<string> {
  await settle(setup);
  return setup.captureCharFrame();
}

async function settledFrame(setup: Setup, needle: string): Promise<string> {
  await settle(setup);
  try {
    return await setup.waitForFrame((frame) => flat(frame).includes(needle));
  } catch {
    return setup.captureCharFrame();
  }
}

function flat(frame: string): string {
  return frame.replace(/\s+/g, ' ');
}

type Input = {
  typeText: (text: string) => Promise<void>;
  pressEnter: () => Promise<void>;
  pressEscape: () => Promise<void>;
  pressTab: () => Promise<void>;
  pressArrow: (direction: 'up' | 'down' | 'left' | 'right') => Promise<void>;
  pressKey: (key: string, modifiers?: { shift?: boolean; ctrl?: boolean; meta?: boolean }) => Promise<void>;
};

function createInput(setup: Setup): Input {
  const run = async (emit: () => void): Promise<void> => {
    await act(async () => {
      emit();
      await new Promise((resolve) => setTimeout(resolve, STDIN_FLUSH_MS));
      await setup.renderOnce();
    });
  };
  return {
    typeText: (text) => run(() => void setup.mockInput.typeText(text)),
    pressEnter: () => run(() => setup.mockInput.pressEnter()),
    pressEscape: () => run(() => setup.mockInput.pressEscape()),
    pressTab: () => run(() => setup.mockInput.pressTab()),
    pressArrow: (direction) => run(() => setup.mockInput.pressArrow(direction)),
    pressKey: (key, modifiers) => run(() => setup.mockInput.pressKey(key, modifiers)),
  };
}

describe('timer interactions', () => {
  test('idle footer exposes frequent actions without setup controls', async () => {
    const setup = await testRender(React.createElement(App), RENDER_SIZE);
    try {
      const frame = await settledFrame(setup, 'a activity');

      expect(flat(frame)).toContain('a activity');
      expect(flat(frame)).not.toContain('? help');
      expect(flat(frame)).not.toContain('t font');
      expect(flat(frame)).not.toContain('r ring');
      expect(flat(frame)).not.toContain('c concept');
      expect(flat(frame)).toContain('s settings');
      expect(flat(frame)).toContain('i start');
      expect(flat(frame)).toContain('q quit');
      expect(flat(frame)).not.toContain('design:');
      expect(flat(frame)).not.toContain('g goal');
    } finally {
      setup.renderer.destroy();
    }
  });

  test('s opens settings from the main timer', async () => {
    const setup = await testRender(React.createElement(App), RENDER_SIZE);
    try {
      const input = createInput(setup);
      await frameText(setup);
      await input.typeText('s');
      const frame = await settledFrame(setup, 'SETTINGS');

      expect(flat(frame)).toContain('SETTINGS');
    } finally {
      setup.renderer.destroy();
    }
  });

  test('starting a project shows the active state and stop action', async () => {
    const setup = await testRender(React.createElement(App), RENDER_SIZE);
    try {
      const input = createInput(setup);
      await frameText(setup);
      await input.typeText('i');
      await frameText(setup);
      await input.typeText('blog');
      await frameText(setup);
      await input.pressEnter();
      const frame = await settledFrame(setup, '▶ blog');

      expect(flat(frame)).toContain('blog');
      expect(flat(frame)).toContain('o stop');
      expect(flat(frame)).not.toContain('TRACKING');
      expect(flat(frame)).not.toContain('started tracking');
      expect(flat(frame)).toContain('▶');
    } finally {
      setup.renderer.destroy();
    }
  });

  test('Esc cancels punch-out confirmation without writing a session', async () => {
    const setup = await testRender(React.createElement(App), RENDER_SIZE);
    try {
      const input = createInput(setup);
      await frameText(setup);
      await input.typeText('i');
      await frameText(setup);
      await input.typeText('blog');
      await frameText(setup);
      await input.pressEnter();
      await frameText(setup);
      await input.typeText('o');
      const confirmFrame = await settledFrame(setup, 'Esc cancel');
      expect(flat(confirmFrame)).toContain('Esc cancel');
      await input.pressEscape();
      const frame = await settledFrame(setup, 'blog');

      expect(flat(frame)).toContain('blog');
      expect(JSON.parse(readFileSync(dataFile, 'utf8')).history).toHaveLength(0);
    } finally {
      setup.renderer.destroy();
    }
  });

  test('Enter confirms punch-out and reports the logged project', async () => {
    const setup = await testRender(React.createElement(App), RENDER_SIZE);
    try {
      const input = createInput(setup);
      await frameText(setup);
      await input.typeText('i');
      await frameText(setup);
      await input.typeText('research');
      await frameText(setup);
      await input.pressEnter();
      await frameText(setup);
      await input.typeText('o');
      await frameText(setup);
      await input.pressEnter();
      const frame = await settledFrame(setup, 'Logged');

      expect(flat(frame)).toContain('Logged');
      expect(flat(frame)).toContain('research');
      const stored = JSON.parse(readFileSync(dataFile, 'utf8'));
      expect(stored.active).toBeNull();
      expect(stored.history).toHaveLength(1);
    } finally {
      setup.renderer.destroy();
    }
  });

  test('logged status does not leak into Settings', async () => {
    const setup = await testRender(React.createElement(App), RENDER_SIZE);
    try {
      const input = createInput(setup);
      await frameText(setup);
      await input.typeText('i');
      await frameText(setup);
      await input.typeText('research');
      await frameText(setup);
      await input.pressEnter();
      await frameText(setup);
      await input.typeText('o');
      await frameText(setup);
      await input.pressEnter();
      await settledFrame(setup, 'Logged');
      await input.typeText('s');
      const frame = await settledFrame(setup, 'SETTINGS');

      expect(flat(frame)).toContain('SETTINGS');
      expect(flat(frame)).not.toContain('Logged');
    } finally {
      setup.renderer.destroy();
    }
  });
});

describe('setup and settings', () => {
  test('first launch requires setup before showing the timer', async () => {
    unlinkSync(preferencesFile);
    const setup = await testRender(React.createElement(App), RENDER_SIZE);
    try {
      const input = createInput(setup);
      const welcomeFrame = await settledFrame(setup, 'WELCOME TO PUNCH');
      expect(flat(welcomeFrame)).toContain('WELCOME TO PUNCH');
      expect(flat(welcomeFrame)).not.toContain('ready when you are');

      await input.pressEnter();
      await frameText(setup);
      await input.pressEnter();
      await frameText(setup);
      await input.pressEnter();
      const frame = await settledFrame(setup, 'ready when you are');

      expect(flat(frame)).toContain('ready when you are');
      expect(JSON.parse(readFileSync(preferencesFile, 'utf8')).setupComplete).toBe(true);
    } finally {
      setup.renderer.destroy();
    }
  });

  test('settings uses Space to change and Enter to save', async () => {
    const setup = await testRender(React.createElement(App, { initialScreen: 'settings' }), RENDER_SIZE);
    try {
      const input = createInput(setup);
      const settingsFrame = await settledFrame(setup, 'SETTINGS');
      expect(flat(settingsFrame)).toContain('SETTINGS');
      expect(flat(settingsFrame)).toContain('Space change');
      expect(flat(settingsFrame)).toContain('keys · i start');
      expect(flat(settingsFrame)).toContain('t/r/c style');

      await input.typeText(' ');
      await frameText(setup);
      await input.pressEnter();
      await frameText(setup);
      const saved = JSON.parse(readFileSync(preferencesFile, 'utf8'));

      expect(saved.clockFormat).toBe('24h');
    } finally {
      setup.renderer.destroy();
    }
  });

  test('settings cycles and saves timer colors', async () => {
    const setup = await testRender(React.createElement(App, { initialScreen: 'settings' }), RENDER_SIZE);
    try {
      const input = createInput(setup);
      await frameText(setup);
      await input.pressArrow('down');
      await frameText(setup);
      await input.pressArrow('down');
      const grayFrame = await settledFrame(setup, 'timer color: gray');
      expect(flat(grayFrame)).toContain('timer color: gray');
      await input.typeText(' ');
      const pinkFrame = await settledFrame(setup, 'timer color: pink');
      expect(flat(pinkFrame)).toContain('timer color: pink');
      await input.pressEnter();
      await frameText(setup);
      const saved = JSON.parse(readFileSync(preferencesFile, 'utf8'));

      expect(saved.color).toBe('pink');
    } finally {
      setup.renderer.destroy();
    }
  });

  test('settings cycles timer animation and saves it', async () => {
    const setup = await testRender(React.createElement(App, { initialScreen: 'settings' }), RENDER_SIZE);
    try {
      const input = createInput(setup);
      await frameText(setup);
      for (let i = 0; i < 6; i++) {
        await input.pressArrow('down');
        await frameText(setup);
      }
      const noneFrame = await settledFrame(setup, 'timer animation: none');
      expect(flat(noneFrame)).toContain('timer animation: none');
      expect(flat(noneFrame)).toContain('static digits');
      await input.typeText(' ');
      const digitFlashFrame = await settledFrame(setup, 'timer animation: digit flash');
      expect(flat(digitFlashFrame)).toContain('timer animation: digit flash');
      expect(flat(digitFlashFrame)).toContain('flash only digits that change');
      await input.pressEnter();
      await frameText(setup);
      const saved = JSON.parse(readFileSync(preferencesFile, 'utf8'));

      expect(saved.animation).toBe('digit-flash');
    } finally {
      setup.renderer.destroy();
    }
  });

  test('Esc discards unsaved settings and returns to the timer', async () => {
    const setup = await testRender(React.createElement(App, { initialScreen: 'settings' }), RENDER_SIZE);
    try {
      const input = createInput(setup);
      await frameText(setup);
      await input.typeText(' ');
      await frameText(setup);
      await input.pressEscape();
      const frame = await settledFrame(setup, 'ready when you are');

      expect(flat(frame)).toContain('ready when you are');
      expect(JSON.parse(readFileSync(preferencesFile, 'utf8')).clockFormat).toBe('12h');
    } finally {
      setup.renderer.destroy();
    }
  });
});

describe('activity', () => {
  test('? opens Settings with the key list and Esc returns to the timer', async () => {
    const setup = await testRender(React.createElement(App), RENDER_SIZE);
    try {
      const input = createInput(setup);
      await frameText(setup);
      await input.typeText('?');
      const settingsFrame = await settledFrame(setup, 'SETTINGS');
      expect(flat(settingsFrame)).toContain('SETTINGS');
      expect(flat(settingsFrame)).toContain('keys · i start');
      expect(flat(settingsFrame)).toContain('Esc cancel');
      expect(settingsFrame.split('\n').findIndex((line) => line.trim().length > 0)).toBeGreaterThan(0);
      await input.pressEscape();
      const frame = await settledFrame(setup, 'ready when you are');

      expect(flat(frame)).toContain('ready when you are');
      expect(flat(frame)).not.toContain('SETTINGS');
    } finally {
      setup.renderer.destroy();
    }
  });

  test('Activity opens on today sessions and Tab switches to analytics', async () => {
    const now = new Date();
    const started = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);
    writeFileSync(dataFile, JSON.stringify({
      active: null,
      history: [{
        project: 'Research',
        started_at: started,
        ended_at: new Date(started.getTime() + 45 * 60 * 1000),
        duration_secs: 45 * 60,
      }],
    }), 'utf8');

    const setup = await testRender(React.createElement(App), RENDER_SIZE);
    try {
      const input = createInput(setup);
      await frameText(setup);
      await input.typeText('a');
      const activityFrame = await settledFrame(setup, 'ACTIVITY');
      expect(flat(activityFrame)).toContain('ACTIVITY');
      expect(flat(activityFrame)).toContain('SESSIONS');
      expect(flat(activityFrame)).toContain('Research');
      expect(activityFrame.split('\n').findIndex((line) => line.trim().length > 0)).toBeGreaterThan(0);
      await input.pressTab();
      const frame = await settledFrame(setup, 'ANALYTICS');

      expect(flat(frame)).toContain('ANALYTICS');
      expect(flat(frame)).toContain('TOTAL');
      expect(flat(frame)).toContain('AVERAGE');
      expect(flat(frame)).toContain('Research');
    } finally {
      setup.renderer.destroy();
    }
  });

  test('Activity shows an active session without inventing a stop time', async () => {
    const started = new Date(Date.now() - 5 * 60 * 1000);
    writeFileSync(dataFile, JSON.stringify({
      active: { project: 'Live', started_at: started },
      history: [],
    }), 'utf8');

    const setup = await testRender(React.createElement(App), RENDER_SIZE);
    try {
      const input = createInput(setup);
      await frameText(setup);
      await input.typeText('a');
      const frame = await settledFrame(setup, 'ACTIVITY');

      expect(flat(frame)).toContain('ACTIVE');
      expect(flat(frame)).toContain('Live');
    } finally {
      setup.renderer.destroy();
    }
  });

  test('Activity hides the active session when viewing another day', async () => {
    const started = new Date(Date.now() - 5 * 60 * 1000);
    writeFileSync(dataFile, JSON.stringify({
      active: { project: 'Live', started_at: started },
      history: [],
    }), 'utf8');

    const setup = await testRender(React.createElement(App), RENDER_SIZE);
    try {
      const input = createInput(setup);
      await frameText(setup);
      await input.typeText('a');
      await frameText(setup);
      await input.pressArrow('left');
      const frame = await frameText(setup);

      expect(flat(frame)).not.toContain('ACTIVE');
      expect(flat(frame)).not.toContain('Live');
    } finally {
      setup.renderer.destroy();
    }
  });

  test('selects and edits a completed session project', async () => {
    const now = new Date();
    const started = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);
    const ended = new Date(started.getTime() + 45 * 60 * 1000);
    writeFileSync(dataFile, JSON.stringify({
      active: null,
      history: [{
        project: 'Research',
        started_at: started,
        ended_at: ended,
        duration_secs: 45 * 60,
      }],
    }), 'utf8');

    const setup = await testRender(React.createElement(App), RENDER_SIZE);
    try {
      const input = createInput(setup);
      await frameText(setup);
      await input.typeText('a');
      const sessionsFrame = await settledFrame(setup, '↑↓ select · Enter edit');
      expect(flat(sessionsFrame)).toContain('↑↓ select · Enter edit');
      await input.pressEnter();
      const editFrame = await settledFrame(setup, 'EDIT TIME ENTRY');
      expect(flat(editFrame)).toContain('EDIT TIME ENTRY');
      await input.pressKey('a', { ctrl: true });
      await frameText(setup);
      await input.typeText('Client');
      await frameText(setup);
      await input.pressEnter();
      await frameText(setup);
      await input.pressEnter();
      await frameText(setup);
      await input.pressEnter();
      const frame = await settledFrame(setup, 'ACTIVITY');
      const saved = JSON.parse(readFileSync(dataFile, 'utf8'));

      expect(flat(frame)).toContain('ACTIVITY');
      expect(flat(frame)).toContain('Client');
      expect(saved.history[0].project).toBe('Client');
    } finally {
      setup.renderer.destroy();
    }
  });
});

describe('preference save errors', () => {
  test('shows a preference save error while setup remains open', async () => {
    const blockedParent = path.join(dir, 'blocked-parent');
    writeFileSync(blockedParent, 'not a directory', 'utf8');
    process.env.PUNCH_PREFERENCES = path.join(blockedParent, 'preferences.json');

    const setup = await testRender(React.createElement(App), RENDER_SIZE);
    try {
      const input = createInput(setup);
      await frameText(setup);
      await input.pressEnter();
      await frameText(setup);
      await input.pressEnter();
      await frameText(setup);
      await input.pressEnter();
      const frame = await settledFrame(setup, 'failed to prepare directory for preferences');

      expect(flat(frame)).toContain('failed to prepare directory for preferences');
    } finally {
      setup.renderer.destroy();
    }
  });

  test('quarantines an unreadable preferences file and never overwrites it', async () => {
    const corrupt = '{not valid preferences';
    writeFileSync(preferencesFile, corrupt, 'utf8');

    const setup = await testRender(React.createElement(App, { initialScreen: 'settings' }), RENDER_SIZE);
    try {
      const input = createInput(setup);
      const loadErrorFrame = await settledFrame(setup, 'Unable to load preferences');
      expect(flat(loadErrorFrame)).toContain('Unable to load preferences');
      await input.typeText(' ');
      await frameText(setup);
      await input.pressEnter();
      const frame = await settledFrame(setup, 'Unable to save preferences');

      expect(flat(frame)).toContain('Unable to save preferences');
      expect(flat(frame)).toContain('moved aside');
      expect(existsSync(preferencesFile)).toBe(false);
      const backup = readdirSync(dir).find((name) => name.startsWith('preferences.json.corrupt-'));
      expect(backup).toBeDefined();
      expect(readFileSync(path.join(dir, backup ?? ''), 'utf8')).toBe(corrupt);
    } finally {
      setup.renderer.destroy();
    }
  });

  test('quick preference keys also refuse to save over quarantined preferences', async () => {
    const corrupt = '{not valid preferences';
    writeFileSync(preferencesFile, corrupt, 'utf8');

    const setup = await testRender(React.createElement(App, { initialScreen: 'settings' }), RENDER_SIZE);
    try {
      const input = createInput(setup);
      await frameText(setup);
      await input.pressEscape();
      await frameText(setup);
      await input.typeText('t');
      const frame = await settledFrame(setup, 'Unable to save preferences');

      expect(flat(frame)).toContain('Unable to save preferences');
      expect(existsSync(preferencesFile)).toBe(false);
      const backup = readdirSync(dir).find((name) => name.startsWith('preferences.json.corrupt-'));
      expect(backup).toBeDefined();
      expect(readFileSync(path.join(dir, backup ?? ''), 'utf8')).toBe(corrupt);
    } finally {
      setup.renderer.destroy();
    }
  });
});

describe('optional project reuse', () => {
  test('prefills the most recent project only when enabled', async () => {
    const started = new Date(Date.now() - 90 * 60 * 1000);
    writeFileSync(dataFile, JSON.stringify({
      active: null,
      history: [{
        project: 'Previous project',
        started_at: started,
        ended_at: new Date(started.getTime() + 30 * 60 * 1000),
        duration_secs: 30 * 60,
      }],
    }), 'utf8');
    savePreferencesPath(preferencesFile, { ...DEFAULT_PREFERENCES, setupComplete: true, reuseLastProject: true });

    const setup = await testRender(React.createElement(App), RENDER_SIZE);
    try {
      const input = createInput(setup);
      await frameText(setup);
      await input.typeText('i');
      const frame = await settledFrame(setup, 'project name: Previous project');

      expect(flat(frame)).toContain('project name: Previous project');
    } finally {
      setup.renderer.destroy();
    }
  });
});

describe('feature parity with documented controls', () => {
  test('t, r, and c cycle font, ring style, and concept without advertising them in the footer', async () => {
    const setup = await testRender(React.createElement(App), RENDER_SIZE);
    try {
      const input = createInput(setup);
      const idle = await settledFrame(setup, 'ready when you are');
      expect(flat(idle)).toContain('s settings');
      expect(flat(idle)).not.toContain('t font');
      expect(flat(idle)).not.toContain('r ring');
      expect(flat(idle)).not.toContain('c concept');
      expect(JSON.parse(readFileSync(preferencesFile, 'utf8')).font).toBe('blocky');

      await input.typeText('t');
      await settledFrame(setup, 'ready when you are');
      expect(JSON.parse(readFileSync(preferencesFile, 'utf8')).font).toBe('digital');

      await input.typeText('r');
      await settledFrame(setup, 'ready when you are');
      expect(JSON.parse(readFileSync(preferencesFile, 'utf8')).ringStyle).toBe('narrow');

      await input.typeText('c');
      const frame = await settledFrame(setup, 'ready when you are');
      expect(JSON.parse(readFileSync(preferencesFile, 'utf8')).ringConcept).toBe('day-left');
      expect(flat(frame)).not.toContain('t font');
      expect(flat(frame)).not.toContain('r ring');
      expect(flat(frame)).not.toContain('c concept');
    } finally {
      setup.renderer.destroy();
    }
  });

  test('q destroys the renderer to quit', async () => {
    const setup = await testRender(React.createElement(App), RENDER_SIZE);
    try {
      const input = createInput(setup);
      await frameText(setup);
      await input.typeText('q');
      expect(setup.renderer.isDestroyed).toBe(true);
    } finally {
      if (!setup.renderer.isDestroyed) setup.renderer.destroy();
    }
  });

  test('compact viewport hides the ring without losing the timer', async () => {
    const compact = await testRender(React.createElement(App), { width: 50, height: 16 });
    try {
      const frame = await settledFrame(compact, 'ready when you are');
      expect(flat(frame)).toContain('ready when you are');
      expect(flat(frame)).toContain('press i to start');
      expect(flat(frame)).not.toContain('of the day passed');
      expect(flat(frame)).not.toContain('of the day remaining');
    } finally {
      compact.renderer.destroy();
    }

    const full = await testRender(React.createElement(App), RENDER_SIZE);
    try {
      const frame = await settledFrame(full, 'of the day');
      expect(flat(frame)).toMatch(/of the day (passed|remaining)/);
    } finally {
      full.renderer.destroy();
    }
  });
});

describe('activity navigation and session editing', () => {
  function writeSession(project = 'Research'): void {
    const now = new Date();
    const started = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);
    writeFileSync(dataFile, JSON.stringify({
      active: null,
      history: [{
        project,
        started_at: started,
        ended_at: new Date(started.getTime() + 45 * 60 * 1000),
        duration_secs: 45 * 60,
      }],
    }), 'utf8');
  }

  function dateHeadingOf(date: Date): string {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[date.getDay()]} ${months[date.getMonth()]} ${String(date.getDate()).padStart(2, ' ')}, ${date.getFullYear()}`;
  }

  test('right arrow advances the activity day', async () => {
    writeSession();
    const setup = await testRender(React.createElement(App), RENDER_SIZE);
    try {
      const input = createInput(setup);
      await frameText(setup);
      await input.typeText('a');
      const todayFrame = await settledFrame(setup, dateHeadingOf(new Date()));
      expect(flat(todayFrame)).toContain(dateHeadingOf(new Date()));

      await input.pressArrow('right');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const frame = await settledFrame(setup, dateHeadingOf(tomorrow));

      expect(flat(frame)).toContain(dateHeadingOf(tomorrow));
      expect(flat(frame)).not.toContain('Research');
    } finally {
      setup.renderer.destroy();
    }
  });

  test('e opens the session editor as an Enter alias', async () => {
    writeSession();
    const setup = await testRender(React.createElement(App), RENDER_SIZE);
    try {
      const input = createInput(setup);
      await frameText(setup);
      await input.typeText('a');
      await settledFrame(setup, 'ACTIVITY');
      await input.typeText('e');
      const frame = await settledFrame(setup, 'EDIT TIME ENTRY');

      expect(flat(frame)).toContain('EDIT TIME ENTRY');
      expect(flat(frame)).toContain('project: Research');
    } finally {
      setup.renderer.destroy();
    }
  });

  test('edit refuses a blank project name', async () => {
    writeSession();
    const setup = await testRender(React.createElement(App), RENDER_SIZE);
    try {
      const input = createInput(setup);
      await frameText(setup);
      await input.typeText('a');
      await settledFrame(setup, 'ACTIVITY');
      await input.pressEnter();
      await settledFrame(setup, 'EDIT TIME ENTRY');
      await input.pressKey('a', { ctrl: true });
      await frameText(setup);
      await input.pressEnter();
      const frame = await settledFrame(setup, 'Project name cannot be blank');

      expect(flat(frame)).toContain('Project name cannot be blank');
      expect(JSON.parse(readFileSync(dataFile, 'utf8')).history[0].project).toBe('Research');
    } finally {
      setup.renderer.destroy();
    }
  });

  test('edit refuses a malformed timestamp', async () => {
    writeSession();
    const setup = await testRender(React.createElement(App), RENDER_SIZE);
    try {
      const input = createInput(setup);
      await frameText(setup);
      await input.typeText('a');
      await settledFrame(setup, 'ACTIVITY');
      await input.pressEnter();
      await settledFrame(setup, 'EDIT TIME ENTRY');
      await input.pressEnter();
      await frameText(setup);
      await input.pressKey('a', { ctrl: true });
      await frameText(setup);
      await input.typeText('not-a-time');
      await frameText(setup);
      await input.pressEnter();
      const frame = await settledFrame(setup, 'Use YYYY-MM-DD HH:MM[:SS]');

      expect(flat(frame)).toContain('Use YYYY-MM-DD HH:MM[:SS]');
      expect(flat(frame)).toContain('EDIT TIME ENTRY');
      expect(JSON.parse(readFileSync(dataFile, 'utf8')).history[0].duration_secs).toBe(45 * 60);
    } finally {
      setup.renderer.destroy();
    }
  });

  test('edit refuses an end time before the start time', async () => {
    writeSession();
    const setup = await testRender(React.createElement(App), RENDER_SIZE);
    try {
      const input = createInput(setup);
      await frameText(setup);
      await input.typeText('a');
      await settledFrame(setup, 'ACTIVITY');
      await input.pressEnter();
      await settledFrame(setup, 'EDIT TIME ENTRY');
      await input.pressEnter();
      await frameText(setup);
      await input.pressEnter();
      await frameText(setup);
      await input.pressKey('a', { ctrl: true });
      await frameText(setup);
      await input.typeText('2000-01-01 00:00:00');
      await frameText(setup);
      await input.pressEnter();
      const frame = await settledFrame(setup, 'end time must be on or after start time');

      expect(flat(frame)).toContain('end time must be on or after start time');
      const stored = JSON.parse(readFileSync(dataFile, 'utf8')).history[0];
      expect(new Date(stored.ended_at).getDate()).toBe(new Date(stored.started_at).getDate());
    } finally {
      setup.renderer.destroy();
    }
  });

  test('Esc leaves the editor without writing changes', async () => {
    writeSession();
    const setup = await testRender(React.createElement(App), RENDER_SIZE);
    try {
      const input = createInput(setup);
      await frameText(setup);
      await input.typeText('a');
      await settledFrame(setup, 'ACTIVITY');
      await input.pressEnter();
      await settledFrame(setup, 'EDIT TIME ENTRY');
      await input.pressKey('a', { ctrl: true });
      await frameText(setup);
      await input.typeText('Discarded');
      await frameText(setup);
      await input.pressEscape();
      const frame = await settledFrame(setup, 'ACTIVITY');

      expect(flat(frame)).toContain('ACTIVITY');
      expect(flat(frame)).toContain('Research');
      expect(flat(frame)).not.toContain('Discarded');
      expect(JSON.parse(readFileSync(dataFile, 'utf8')).history[0].project).toBe('Research');
    } finally {
      setup.renderer.destroy();
    }
  });
});
