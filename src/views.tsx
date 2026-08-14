import React from 'react';
import { Box, Text, useAnimation, useInput, useWindowSize } from 'ink';
import { start as cmdStart, stop as cmdStop, type CmdResult } from './commands.js';
import {
  elapsedSeconds,
  formatDuration,
  load,
  todaySessions,
  totalOn,
  type Session,
  type Store,
} from './store.js';

export type Design = 'minimal' | 'today-line' | 'session-list' | 'goal-ring';

const DESIGNS: Design[] = ['minimal', 'today-line', 'session-list', 'goal-ring'];

function designName(d: Design): string {
  return d;
}

function nextDesign(d: Design): Design {
  return DESIGNS[(DESIGNS.indexOf(d) + 1) % DESIGNS.length];
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

// ---------- terminal helpers ----------

function bigTime(secs: number): string[] {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const parts = [
    String(h).padStart(2, '0'),
    String(m).padStart(2, '0'),
    String(s).padStart(2, '0'),
  ];
  const out: string[] = Array.from({ length: 5 }, () => '');
  parts.forEach((part, i) => {
    for (const ch of part) {
      const glyph = digit(ch);
      for (let row = 0; row < 5; row++) {
        out[row] += glyph[row] + ' ';
      }
    }
    if (i < 2) {
      const colon = digit(':');
      for (let row = 0; row < 5; row++) {
        out[row] += colon[row] + ' ';
      }
    }
  });
  return out;
}

function digit(c: string): string[] {
  const glyphs: Record<string, string[]> = {
    '0': ['███', '█ █', '█ █', '█ █', '███'],
    '1': [' █ ', '██ ', ' █ ', ' █ ', '███'],
    '2': ['███', '  █', '███', '█  ', '███'],
    '3': ['███', '  █', '███', '  █', '███'],
    '4': ['█ █', '█ █', '███', '  █', '  █'],
    '5': ['███', '█  ', '███', '  █', '███'],
    '6': ['███', '█  ', '███', '█ █', '███'],
    '7': ['███', '  █', '  █', '  █', '  █'],
    '8': ['███', '█ █', '███', '█ █', '███'],
    '9': ['███', '█ █', '███', '  █', '███'],
    ':': ['   ', ' █ ', '   ', ' █ ', '   '],
  };
  return glyphs[c] ?? ['   ', '   ', '   ', '   ', '   '];
}

function bar(width: number, frac: number): string {
  const filled = Math.max(0, Math.round(width * frac));
  return '█'.repeat(Math.min(filled, width)) + '░'.repeat(width - Math.min(filled, width));
}

function ring(frac: number): string[] {
  const W = 13;
  const H = 7;
  const cells: Array<[number, number]> = [];
  for (let x = 1; x <= W - 2; x++) cells.push([x, 0]);
  for (let y = 1; y <= H - 2; y++) cells.push([W - 1, y]);
  for (let x = W - 2; x >= 1; x--) cells.push([x, H - 1]);
  for (let y = H - 2; y >= 1; y--) cells.push([0, y]);
  const filled = Math.max(0, Math.round(frac * cells.length));
  const grid: string[][] = Array.from({ length: H }, () => Array(W).fill(' '));
  for (const [x, y] of cells) grid[y][x] = '░';
  for (let i = 0; i < filled; i++) {
    const [x, y] = cells[i];
    grid[y][x] = '█';
  }
  return grid.map((row) => row.join(''));
}

// ---------- views ----------

function TimerLines({ store }: { store: Store }) {
  const active = store.active;
  if (!active) {
    return (
      <>
        <Text color="gray" bold>
          00:00:00
        </Text>
        <Text>no active session</Text>
        <Text>press i to punch in</Text>
      </>
    );
  }
  const elapsed = elapsedSeconds(active);
  const rows = bigTime(elapsed);
  return (
    <>
      {rows.map((row, i) => (
        <Text key={i} color="green" bold>
          {row}
        </Text>
      ))}
      <Text color="cyan" bold>
        ▶ {active.project}
      </Text>
      <Text>started {fmtTime(active.started_at, true)}</Text>
    </>
  );
}

function todayStats(store: Store): { count: number; total: number; yesterday: number } {
  const today = todaySessions(store.history);
  const total = today.reduce((sum, s) => sum + s.duration_secs, 0);
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterday = totalOn(store.history, y);
  return { count: today.length, total, yesterday };
}

function DesignView({ store, design }: { store: Store; design: Design }) {
  return (
    <Box flexDirection="column" alignItems="center">
      <TimerLines store={store} />
      {design === 'minimal' && <MinimalBody store={store} />}
      {design === 'today-line' && <TodayLineBody store={store} />}
      {design === 'session-list' && <SessionListBody store={store} />}
      {design === 'goal-ring' && <GoalRingBody store={store} />}
    </Box>
  );
}

function MinimalBody({ store }: { store: Store }) {
  if (!store.active) return null;
  const { count, total } = todayStats(store);
  return (
    <>
      <Text>{' '}</Text>
      <Text color="gray">
        {count} sessions today · {formatDuration(total)}
      </Text>
    </>
  );
}

function TodayLineBody({ store }: { store: Store }) {
  const { count, total, yesterday } = todayStats(store);
  const frac = yesterday > 0 ? Math.min(1, total / yesterday) : 0;
  return (
    <>
      <Text>{' '}</Text>
      <Text>
        <Text color="gray">
          {count} · {formatDuration(total)} today  {' '}
        </Text>
        <Text color="yellow">{bar(24, frac)}</Text>
        <Text color="gray">{`  (${formatDuration(yesterday)} yesterday)`}</Text>
      </Text>
    </>
  );
}

function sessionLine(s: Session): string {
  return `${fmtTime(s.started_at, false)} – ${fmtTime(s.ended_at, false)}   ${s.project}   ${formatDuration(s.duration_secs).padStart(12)}`;
}

function SessionListBody({ store }: { store: Store }) {
  const today = todaySessions(store.history).slice(-8).reverse();
  return (
    <>
      <Text>{' '}</Text>
      {today.length === 0 && <Text color="gray">no sessions today</Text>}
      {today.map((s, i) => (
        <Text key={i} color="gray">
          {sessionLine(s)}
        </Text>
      ))}
    </>
  );
}

function GoalRingBody({ store }: { store: Store }) {
  const { total, yesterday } = todayStats(store);
  const frac = yesterday > 0 ? Math.min(1, total / yesterday) : 0;
  return (
    <>
      <Text>{' '}</Text>
      {ring(frac).map((row, i) => (
        <Text key={i} color="yellow">
          {row}
        </Text>
      ))}
      <Text color="gray">
        today {formatDuration(total)}  ·  yesterday {formatDuration(yesterday)}
      </Text>
    </>
  );
}

function Header({ design }: { design: Design }) {
  const now = new Date();
  return (
    <Box paddingX={1} height={3}>
      <Text>
        <Text color="cyan" bold>
          PUNCH
        </Text>
        <Text>{`  ·  ${fmtClock(now)}`}</Text>
        <Text color="magenta">{`  ·  design: ${designName(design)}`}</Text>
      </Text>
    </Box>
  );
}

function Footer({
  mode,
  input,
  status,
  design,
}: {
  mode: Mode;
  input: string;
  status: StatusMsg | null;
  design: Design;
}) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={status ? (status.isError ? 'red' : 'green') : undefined}>
        {status ? status.text : ' '}
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
      <Text color="gray">
        {mode === 'input'
          ? 'enter confirm · esc cancel'
          : `q quit · i in · o out · t design (${designName(design)})`}
      </Text>
    </Box>
  );
}

interface ShellProps {
  store: Store;
  design: Design;
  mode: Mode;
  input: string;
  status: StatusMsg | null;
}

export function Shell({ store, design, mode, input, status }: ShellProps) {
  const { rows } = useWindowSize();
  return (
    <Box flexDirection="column" height={rows} width="100%">
      <Header design={design} />
      <Box
        flexGrow={1}
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        width="100%"
      >
        <DesignView store={store} design={design} />
      </Box>
      <Footer mode={mode} input={input} status={status} design={design} />
    </Box>
  );
}

export function App() {
  const [store, setStore] = React.useState<Store>(() => {
    const loaded = load();
    return loaded.ok ? loaded.value : { active: null, history: [] };
  });
  const [mode, setMode] = React.useState<Mode>('normal');
  const [design, setDesign] = React.useState<Design>('minimal');
  const [input, setInput] = React.useState('');
  const [status, setStatus] = React.useState<StatusMsg | null>(null);
  const [quit, setQuit] = React.useState(false);

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
    const project = input.trim();
    setInput('');
    setMode('normal');
    report(cmdStart(project || null));
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
      setQuit(true);
    } else if (keyInput === 'i' || keyInput === 'p') {
      setInput('');
      setMode('input');
    } else if (keyInput === 'o') {
      punchOut();
    } else if (keyInput === 't' || key.tab) {
      setDesign((d) => nextDesign(d));
    }
  });

  if (quit) {
    return null;
  }

  return (
    <Shell
      store={store}
      design={design}
      mode={mode}
      input={input}
      status={status}
    />
  );
}
