import React from 'react';
import { Box, Text, useAnimation, useApp, useInput, useWindowSize } from 'ink';
import {
  goal as cmdGoal,
  start as cmdStart,
  stop as cmdStop,
  type CmdResult,
} from './commands.js';
import {
  DEFAULT_GOAL_SECS,
  elapsedSeconds,
  formatDuration,
  load,
  todaySessions,
  type Store,
} from './store.js';

export type Design = 'minimal' | 'goal-ring';

const DESIGNS: Design[] = ['minimal', 'goal-ring'];

function designName(d: Design): string {
  return d;
}

function nextDesign(d: Design): Design {
  return DESIGNS[(DESIGNS.indexOf(d) + 1) % DESIGNS.length];
}

type Mode = 'normal' | 'input';

type PromptKind = 'project' | 'goal';

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

// ---------- goal ring (braille) ----------

interface RingCell {
  ch: string;
  filled: boolean;
  plain: boolean;
}

const BRAILLE_BITS = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20, 0x40, 0x80];

function brailleRing(frac: number, radius: number): RingCell[][] {
  const outer = radius;
  const inner = radius * 0.72;
  const cellCols = Math.ceil((2 * outer + 1) / 2);
  const cellRows = Math.ceil((2 * outer + 1) / 4);
  const cx = outer;
  const cy = outer;
  const grid: RingCell[][] = [];
  for (let row = 0; row < cellRows; row++) {
    const cells: RingCell[] = [];
    for (let col = 0; col < cellCols; col++) {
      let mask = 0;
      let anyFilled = false;
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 2; c++) {
          const x = col * 2 + c;
          const y = row * 4 + r;
          const dist = Math.hypot(x - cx, y - cy);
          if (dist >= inner && dist <= outer) {
            const angle = (Math.atan2(x - cx, -(y - cy)) + Math.PI * 2) % (Math.PI * 2);
            if (angle / (Math.PI * 2) <= frac) {
              anyFilled = true;
            }
            mask |= BRAILLE_BITS[r * 2 + c];
          }
        }
      }
      if (mask === 0) {
        cells.push({ ch: ' ', filled: false, plain: true });
      } else {
        cells.push({ ch: String.fromCodePoint(0x2800 + mask), filled: anyFilled, plain: false });
      }
    }
    grid.push(cells);
  }
  return grid;
}

function withPercent(grid: RingCell[][], pct: string): RingCell[][] {
  const centerRow = Math.floor(grid.length / 2);
  const row = grid[centerRow];
  const mid = Math.floor(row.length / 2);
  if (!row[mid].plain) {
    return grid;
  }
  let start = mid;
  while (start - 1 >= 0 && row[start - 1].plain) start--;
  let end = mid;
  while (end + 1 < row.length && row[end + 1].plain) end++;
  const runLen = end - start + 1;
  const pad = Math.max(0, Math.floor((runLen - pct.length) / 2));
  const text = ' '.repeat(pad) + pct + ' '.repeat(Math.max(0, runLen - pad - pct.length));
  const next = row.slice();
  for (let i = 0; i < runLen; i++) {
    next[start + i] = { ch: text[i] ?? ' ', filled: false, plain: true };
  }
  grid[centerRow] = next;
  return grid;
}

function RingRow({ cells }: { cells: RingCell[] }) {
  const spans: React.ReactElement[] = [];
  let i = 0;
  while (i < cells.length) {
    const kind: 'filled' | 'track' | 'plain' = cells[i].plain
      ? 'plain'
      : cells[i].filled
        ? 'filled'
        : 'track';
    let text = '';
    let j = i;
    while (
      j < cells.length &&
      (cells[j].plain ? 'plain' : cells[j].filled ? 'filled' : 'track') === kind
    ) {
      text += cells[j].ch;
      j++;
    }
    spans.push(
      kind === 'filled' ? (
        <Text key={i} color="green" bold>
          {text}
        </Text>
      ) : kind === 'track' ? (
        <Text key={i} color="gray">
          {text}
        </Text>
      ) : (
        <Text key={i}>{text}</Text>
      ),
    );
    i = j;
  }
  return <Text>{spans}</Text>;
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

function todayStats(store: Store): { count: number; total: number } {
  const today = todaySessions(store.history);
  const total = today.reduce((sum, s) => sum + s.duration_secs, 0);
  return { count: today.length, total };
}

function DesignView({ store, design }: { store: Store; design: Design }) {
  return (
    <Box flexDirection="column" alignItems="center">
      <TimerLines store={store} />
      {design === 'minimal' && <MinimalBody store={store} />}
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

function GoalRingBody({ store }: { store: Store }) {
  const goal = store.goal_secs > 0 ? store.goal_secs : DEFAULT_GOAL_SECS;
  const { total } = todayStats(store);
  const frac = Math.min(1, total / goal);
  const pct = Math.round((total / goal) * 100);
  const grid = withPercent(brailleRing(frac, 9.5), `${pct}%`);
  return (
    <>
      <Text>{' '}</Text>
      {grid.map((row, i) => (
        <RingRow key={i} cells={row} />
      ))}
      <Text color="gray">
        today {formatDuration(total)} · goal {formatDuration(goal)}
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
  prompt,
  input,
  status,
  design,
}: {
  mode: Mode;
  prompt: PromptKind;
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
            {prompt === 'project' ? 'project name: ' : 'daily goal (hours): '}
          </Text>
          <Text color="white">{input}▌</Text>
        </Text>
      ) : (
        <Text>{' '}</Text>
      )}
      <Text color="gray">
        {mode === 'input'
          ? 'enter confirm · esc cancel'
          : `q quit · i in · o out · g goal · t design (${designName(design)})`}
      </Text>
    </Box>
  );
}

interface ShellProps {
  store: Store;
  design: Design;
  mode: Mode;
  prompt: PromptKind;
  input: string;
  status: StatusMsg | null;
}

export function Shell({ store, design, mode, prompt, input, status }: ShellProps) {
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
      <Footer mode={mode} prompt={prompt} input={input} status={status} design={design} />
    </Box>
  );
}

export function App() {
  const { exit } = useApp();
  const [store, setStore] = React.useState<Store>(() => {
    const loaded = load();
    return loaded.ok ? loaded.value : { active: null, history: [], goal_secs: DEFAULT_GOAL_SECS };
  });
  const [mode, setMode] = React.useState<Mode>('normal');
  const [prompt, setPrompt] = React.useState<PromptKind>('project');
  const [design, setDesign] = React.useState<Design>('minimal');
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
    report(prompt === 'project' ? cmdStart(value || null) : cmdGoal(Number(value)));
    reload();
  };

  const beginInput = (kind: PromptKind) => {
    setPrompt(kind);
    setInput('');
    setMode('input');
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
      beginInput('project');
    } else if (keyInput === 'g') {
      beginInput('goal');
    } else if (keyInput === 'o') {
      punchOut();
    } else if (keyInput === 't' || key.tab) {
      setDesign((d) => nextDesign(d));
    }
  });

  return (
    <Shell
      store={store}
      design={design}
      mode={mode}
      prompt={prompt}
      input={input}
      status={status}
    />
  );
}
