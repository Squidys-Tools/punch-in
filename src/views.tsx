import React from 'react';
import { Box, Text, useAnimation, useApp, useInput, useWindowSize } from 'ink';
import { start as cmdStart, stop as cmdStop, type CmdResult } from './commands.js';
import { elapsedSeconds, load, type Active, type Store } from './store.js';
import {
  FONTS,
  gradientColor,
  timerFontHeight,
  timerRows,
  type TimerFont,
} from './fonts.js';
import {
  RING_CONCEPTS,
  RING_STYLES,
  ringData,
  ringGrid,
  ringHeight,
  type Cell,
  type RingConcept,
  type RingStyle,
} from './ring.js';

export type { TimerFont } from './fonts.js';
export type { RingConcept, RingStyle } from './ring.js';

const RING_COLORS = ['green', 'cyan', 'magenta', 'yellow', 'blue', 'red'];

function next<T>(list: T[], v: T): T {
  return list[(list.indexOf(v) + 1) % list.length];
}

type Mode = 'normal' | 'input';

interface StatusMsg {
  text: string;
  isError: boolean;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function twelveHour(d: Date): { h: number; ampm: string } {
  const h = d.getHours() % 12 || 12;
  return { h, ampm: d.getHours() < 12 ? 'AM' : 'PM' };
}

function fmtTime(d: Date, withSeconds: boolean): string {
  const { h, ampm } = twelveHour(d);
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = withSeconds ? `:${String(d.getSeconds()).padStart(2, '0')}` : '';
  return `${String(h).padStart(2, '0')}:${mm}${ss} ${ampm}`;
}

function fmtClock(d: Date): string {
  const { h, ampm } = twelveHour(d);
  return [
    `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, ' ')}, ${d.getFullYear()}`,
    `${String(h).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')} ${ampm}`,
  ].join('  ');
}

// ---------- text measurement ----------

// Number of terminal rows `text` occupies when wrapped within `cols` columns.
// Conservative: assumes wrapping at any character, so the result is always at
// least what Ink renders (word wrapping only packs lines tighter).
function textRows(text: string, cols: number): number {
  const width = Math.max(1, cols);
  let lines = 0;
  for (const part of text.split('\n')) {
    lines += Math.max(1, Math.ceil(part.length / width));
  }
  return lines;
}

// ---------- compact layout ----------

// 0 = full (timer + project + started + ring)
// 1 = drop ring            (timer + project + started)
// 2 = drop started         (timer + project)
// 3 = timer glyphs only
// 4 = single-line timer
export type CompactLevel = 0 | 1 | 2 | 3 | 4;

export function compactLevel(
  rows: number,
  font: TimerFont,
  ringStyle: RingStyle,
  reservedRows: number = 4,
): CompactLevel {
  const bodyRows = rows - reservedRows; // rows actually taken by header + footer
  const timerH = timerFontHeight(font);
  const ringH = ringHeight(ringStyle);
  const fullH = timerH + ringH + 4;
  const noRingH = timerH + 2;
  const noStartedH = timerH + 1;
  if (bodyRows >= fullH) return 0;
  if (bodyRows >= noRingH) return 1;
  if (bodyRows >= noStartedH) return 2;
  if (bodyRows >= timerH) return 3;
  return 4;
}

function fmtElapsed(active: Active): string {
  const secs = elapsedSeconds(active);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ---------- components ----------

function GradientText({ row }: { row: string }) {
  const chars: React.ReactNode[] = [];
  const visible = row.split('').filter((ch) => ch !== ' ').length;
  let col = 0;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === ' ') {
      chars.push(' ');
      continue;
    }
    const { r, g, b } = gradientColor(col / Math.max(1, visible - 1));
    const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    chars.push(
      <Text key={i} color={hex}>
        {ch}
      </Text>,
    );
    col++;
  }
  return <Text bold>{chars}</Text>;
}

function RingRow({ cells }: { cells: Cell[] }) {
  const spans: React.ReactElement[] = [];
  let i = 0;
  while (i < cells.length) {
    const cat = cells[i].cat;
    let text = '';
    let j = i;
    while (j < cells.length && cells[j].cat === cat) {
      text += cells[j].ch;
      j++;
    }
    if (cat === -2) {
      spans.push(<Text key={i}>{text}</Text>);
    } else if (cat === -1) {
      spans.push(
        <Text key={i} color="gray">
          {text}
        </Text>,
      );
    } else {
      spans.push(
        <Text key={i} color={RING_COLORS[cat % RING_COLORS.length]} bold>
          {text}
        </Text>,
      );
    }
    i = j;
  }
  return <Text>{spans}</Text>;
}

function TimerGlyphs({ store, font }: { store: Store; font: TimerFont }) {
  const active = store.active;
  if (!active) {
    return (
      <Text color="gray" bold>
        00:00:00
      </Text>
    );
  }
  const elapsed = elapsedSeconds(active);
  const rows = timerRows(elapsed, font);
  return (
    <>
      {rows.map((row, i) =>
        font === 'gradient' ? (
          <GradientText key={i} row={row} />
        ) : (
          <Text key={i} color="green" bold>
            {row}
          </Text>
        ),
      )}
    </>
  );
}

function RingBody({
  store,
  style,
  concept,
}: {
  store: Store;
  style: RingStyle;
  concept: RingConcept;
}) {
  const data = ringData(store, concept);
  const grid = ringGrid(style, data);
  return (
    <>
      <Text>{' '}</Text>
      {grid.map((row, i) => (
        <RingRow key={i} cells={row} />
      ))}
      <Text color="gray">{data.label}</Text>
    </>
  );
}

function DesignView({
  store,
  font,
  ringStyle,
  ringConcept,
  compact,
}: {
  store: Store;
  font: TimerFont;
  ringStyle: RingStyle;
  ringConcept: RingConcept;
  compact: CompactLevel;
}) {
  const active = store.active;
  let body: React.ReactNode;
  if (!active) {
    body =
      compact === 4 ? (
        <Text color="gray">no active session</Text>
      ) : (
        <>
          <Text color="gray" bold>
            00:00:00
          </Text>
          <Text>no active session</Text>
          <Text>press i to punch in</Text>
        </>
      );
  } else if (compact === 4) {
    body = (
      <Text color="green" bold>
        {fmtElapsed(active)}
      </Text>
    );
  } else {
    body = (
      <>
        <TimerGlyphs store={store} font={font} />
        {compact <= 2 && (
          <Text color="cyan" bold>
            ▶ {active.project}
          </Text>
        )}
        {compact <= 1 && <Text>started {fmtTime(active.started_at, true)}</Text>}
      </>
    );
  }
  return (
    <Box flexDirection="column" alignItems="center">
      {body}
      {compact === 0 && ringStyle !== 'none' && (
        <RingBody store={store} style={ringStyle} concept={ringConcept} />
      )}
    </Box>
  );
}

// Header/footer text as plain strings, mirroring the colored rendering in the
// components below, so Shell can measure how many rows they actually occupy.
function headerText(font: TimerFont, ringStyle: RingStyle, ringConcept: RingConcept, now: Date): string {
  return `PUNCH  ·  ${fmtClock(now)}  ·  ${font} / ${ringStyle} / ${ringConcept}`;
}

function statusText(status: StatusMsg | null): string {
  return status ? status.text : ' ';
}

function inputText(mode: Mode, input: string): string {
  return mode === 'input' ? `project name: ${input}▌` : ' ';
}

function helpText(mode: Mode, font: TimerFont, ringStyle: RingStyle, ringConcept: RingConcept): string {
  return mode === 'input'
    ? 'enter confirm · esc cancel'
    : `q quit · i in · o out · t font (${font}) · r ring (${ringStyle}) · c concept (${ringConcept})`;
}

function Header({ font, ringStyle, ringConcept }: { font: TimerFont; ringStyle: RingStyle; ringConcept: RingConcept }) {
  const now = new Date();
  return (
    <Box paddingX={1}>
      <Text>
        <Text color="cyan" bold>
          PUNCH
        </Text>
        <Text>{`  ·  ${fmtClock(now)}`}</Text>
        <Text color="magenta">{`  ·  ${font} / ${ringStyle} / ${ringConcept}`}</Text>
      </Text>
    </Box>
  );
}

function Footer({
  mode,
  input,
  status,
  font,
  ringStyle,
  ringConcept,
}: {
  mode: Mode;
  input: string;
  status: StatusMsg | null;
  font: TimerFont;
  ringStyle: RingStyle;
  ringConcept: RingConcept;
}) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={status ? (status.isError ? 'red' : 'green') : undefined}>
        {statusText(status)}
      </Text>
      {mode === 'input' ? (
        <Text>
          <Text color="cyan" bold>
            project name:{' '}
          </Text>
          <Text color="white">{input}▌</Text>
        </Text>
      ) : (
        <Text>{' '}</Text>
      )}
      <Text color="gray">{helpText(mode, font, ringStyle, ringConcept)}</Text>
    </Box>
  );
}

interface ShellProps {
  store: Store;
  font: TimerFont;
  ringStyle: RingStyle;
  ringConcept: RingConcept;
  mode: Mode;
  input: string;
  status: StatusMsg | null;
}

export function Shell({ store, font, ringStyle, ringConcept, mode, input, status }: ShellProps) {
  const { rows, columns } = useWindowSize();
  const bodyWidth = Math.max(1, columns - 2); // header/footer use paddingX={1}
  const now = new Date();
  const reservedRows =
    textRows(headerText(font, ringStyle, ringConcept, now), bodyWidth) +
    textRows(statusText(status), bodyWidth) +
    textRows(inputText(mode, input), bodyWidth) +
    textRows(helpText(mode, font, ringStyle, ringConcept), bodyWidth);
  const compact = compactLevel(rows, font, ringStyle, reservedRows);
  return (
    <Box flexDirection="column" height={rows} width="100%">
      <Header font={font} ringStyle={ringStyle} ringConcept={ringConcept} />
      <Box
        flexGrow={1}
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        width="100%"
      >
        <DesignView
          store={store}
          font={font}
          ringStyle={ringStyle}
          ringConcept={ringConcept}
          compact={compact}
        />
      </Box>
      <Footer mode={mode} input={input} status={status} font={font} ringStyle={ringStyle} ringConcept={ringConcept} />
    </Box>
  );
}

export function App() {
  const { exit } = useApp();
  const [store, setStore] = React.useState<Store>(() => {
    const loaded = load();
    return loaded.ok ? loaded.value : { active: null, history: [] };
  });
  const [mode, setMode] = React.useState<Mode>('normal');
  const [font, setFont] = React.useState<TimerFont>('blocky');
  const [ringStyle, setRingStyle] = React.useState<RingStyle>('smooth');
  const [ringConcept, setRingConcept] = React.useState<RingConcept>('day-dial');
  const [input, setInput] = React.useState('');
  const [status, setStatus] = React.useState<StatusMsg | null>(null);

  useAnimation({ interval: 500 });

  const report = (result: CmdResult) => {
    setStatus({ text: result.message, isError: !result.ok });
  };

  const reload = () => {
    const loaded = load();
    if (loaded.ok) {
      setStore(loaded.value);
    } else {
      setStatus({ text: loaded.error, isError: true });
    }
  };

  const punchOut = () => {
    report(cmdStop());
    reload();
  };

  const submitInput = () => {
    const value = input.trim();
    setInput('');
    setMode('normal');
    report(cmdStart(value || null));
    reload();
  };

  useInput((keyInput, key) => {
    if (mode === 'input') {
      if (key.return) {
        submitInput();
      } else if (key.escape) {
        setMode('normal');
        setInput('');
      } else if (key.backspace) {
        setInput((s) => s.slice(0, -1));
      } else if (keyInput && !key.ctrl && !key.meta) {
        setInput((s) => s + keyInput);
      }
      return;
    }
    if (keyInput === 'q') {
      exit();
    } else if (keyInput === 'i' || keyInput === 'p') {
      setMode('input');
      setInput('');
    } else if (keyInput === 'o') {
      punchOut();
    } else if (keyInput === 't' || key.tab) {
      setFont((f) => next(FONTS, f));
    } else if (keyInput === 'r') {
      setRingStyle((s) => next(RING_STYLES, s));
    } else if (keyInput === 'c') {
      setRingConcept((c) => next(RING_CONCEPTS, c));
    }
  });

  return (
    <Shell
      store={store}
      font={font}
      ringStyle={ringStyle}
      ringConcept={ringConcept}
      mode={mode}
      input={input}
      status={status}
    />
  );
}
