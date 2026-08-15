#!/usr/bin/env bun
// Design ideation gallery. Run: bun run scripts/preview.ts
// Also writes a color-stripped copy to target/preview-ideas.txt
//
// This renders the real font/ring code from src/fonts.ts and src/ring.ts.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { FONTS, timerRows, type TimerFont } from '../src/fonts.js';
import {
  RING_CONCEPTS,
  RING_STYLES,
  ringData,
  ringGrid,
  type Cell,
  type RingConcept,
  type RingStyle,
} from '../src/ring.js';

const RESET = '\x1b[0m';
const c = (code: string, s: string) => `\x1b[${code}m${s}${RESET}`;
const green = (s: string) => c('32', s);
const cyan = (s: string) => c('36', s);
const gray = (s: string) => c('90', s);
const magenta = (s: string) => c('35', s);
const yellow = (s: string) => c('33', s);

function ringColor(cat: number, s: string): string {
  switch (cat) {
    case -2: return s;
    case -1: return gray(s);
    case 0: return green(s);
    case 1: return cyan(s);
    case 2: return magenta(s);
    case 3: return yellow(s);
    default: return s;
  }
}

function cellsToString(cells: Cell[]): string {
  let out = '';
  let i = 0;
  while (i < cells.length) {
    const cat = cells[i].cat;
    let text = '';
    let j = i;
    while (j < cells.length && cells[j].cat === cat) {
      text += cells[j].ch;
      j++;
    }
    out += ringColor(cat, text);
    i = j;
  }
  return out;
}

function ringRows(grid: Cell[][]): string[] {
  return grid.map((row) => cellsToString(row));
}

// ---------- scenario (deterministic) ----------

const NOW = new Date('2026-08-14T13:33:00');
const mk = (project: string, mins: number): { project: string; started_at: Date; ended_at: Date; duration_secs: number } => {
  const started_at = new Date(NOW.getTime() - 180 * 60 * 1000 + Math.random());
  return { project, started_at, ended_at: new Date(started_at.getTime() + mins * 60 * 1000), duration_secs: mins * 60 };
};

const store = {
  active: null,
  history: [mk('web', 45), mk('blog', 90), mk('tui', 30)],
};

// ---------- gallery ----------

const INDENT = ' '.repeat(16);
const SAMPLE_SECS = 2 * 3600 + 45 * 60;

function section(title: string): string {
  return `\n${green('━━━ ' + title + ' ' + '━'.repeat(Math.max(1, 46 - title.length)))}`;
}

function show(name: string, desc: string, body: string[]): string {
  return `\n${yellow(`▸ ${name}`)}${gray(' — ' + desc)}\n${body.map((r) => INDENT + r).join('\n')}`;
}

let out = '';

out += '\n' + magenta('PUNCH design ideation gallery') + gray('  ·  timer 02:45:00  ·  now 1:33 PM') + '\n';

// ---------- timer text styles ----------

out += section('TIMER TEXT STYLES');

for (const font of FONTS) {
  const desc =
    font === 'blocky'
      ? '5x3 solid blocks'
      : font === 'digital'
        ? 'seven-segment LCD'
        : font === 'pixel'
          ? 'braille dot-matrix, compact'
          : 'blocky with a hue sweep';
  out += show(font, desc, [...timerRows(SAMPLE_SECS, font), green('  ▶ tui')]);
}

// ---------- ring styles ----------

out += section('RING STYLES (same 56% progress)');

for (const style of RING_STYLES) {
  if (style === 'none') continue;
  const desc = {
    smooth: 'thick braille band, classic look',
    thin: 'hairline braille band',
    pixel: 'chunky block ring',
  }[style]!;
  const data = ringData(store, 'day-dial', NOW);
  out += show(style, desc, [...ringRows(ringGrid(style, data)), gray(`  ${data.label}`)]);
}

// ---------- ring concepts ----------

out += section('RING CONCEPTS — what the ring means');

for (const concept of RING_CONCEPTS) {
  const desc = {
    'day-dial': 'time of day on a 24h ring — zero config',
    'day-left': 'how much of the day remains — zero config',
  }[concept]!;
  const data = ringData(store, concept, NOW);
  out += show(`concept: ${concept}`, desc, [...ringRows(ringGrid('smooth', data)), gray(`  ${data.label}`)]);
}

out += '\n';

console.log(out);

mkdirSync(path.resolve('target'), { recursive: true });
writeFileSync(path.resolve('target', 'preview-ideas.txt'), out.replace(/\x1b\[[0-9;]*m/g, ''), 'utf8');
