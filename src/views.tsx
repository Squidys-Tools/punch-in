import React from 'react';
import { Box, Text, useAnimation, useApp, useInput, useWindowSize } from 'ink';
import { start as cmdStart, stop as cmdStop, type CmdResult } from './commands.js';
import { elapsedSeconds, formatDuration, load, type Active, type Store } from './store.js';
import {
  DEFAULT_PREFERENCES,
  type ClockFormat,
  type Preferences,
  loadPreferences,
} from './preferences.js';
import { gradientColor, timerRows, type TimerFont } from './fonts.js';
import { ringData, ringGrid, type Cell } from './ring.js';

export type InitialScreen = 'timer' | 'settings';
type Mode = 'normal' | 'input' | 'stop-confirm';

interface StatusMsg {
  text: string;
  isError: boolean;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatTime(date: Date, clockFormat: ClockFormat, seconds = false): string {
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const suffix = seconds ? `:${String(date.getSeconds()).padStart(2, '0')}` : '';
  if (clockFormat === '24h') {
    return `${String(date.getHours()).padStart(2, '0')}:${minutes}${suffix}`;
  }
  const hour = date.getHours() % 12 || 12;
  return `${String(hour).padStart(2, '0')}:${minutes}${suffix} ${date.getHours() < 12 ? 'AM' : 'PM'}`;
}

function formatClock(date: Date, clockFormat: ClockFormat): string {
  return `${DAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${String(date.getDate()).padStart(2, ' ')}, ${date.getFullYear()}  ${formatTime(date, clockFormat, true)}`;
}

function GradientText({ row }: { row: string }) {
  const visible = Math.max(1, [...row].filter((char) => char !== ' ').length - 1);
  let position = 0;
  return (
    <Text bold>
      {[...row].map((char, index) => {
        if (char === ' ') return <React.Fragment key={index}> </React.Fragment>;
        const { r, g, b } = gradientColor(position++ / visible);
        const hex = `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
        return <Text key={index} color={hex}>{char}</Text>;
      })}
    </Text>
  );
}

function TimerGlyphs({ active, font }: { active: Active | null; font: TimerFont }) {
  const rows = timerRows(active ? elapsedSeconds(active) : 0, font);
  return (
    <>
      {rows.map((row, index) =>
        font === 'gradient' ? (
          <GradientText key={index} row={row} />
        ) : (
          <Text key={index} color={active ? 'green' : 'gray'} bold>{row}</Text>
        ),
      )}
    </>
  );
}

function RingRow({ cells }: { cells: Cell[] }) {
  return (
    <Text>
      {cells.map((cell, index) => (
        <Text key={index} color={cell.cat === 0 ? 'cyan' : cell.cat === -1 ? 'gray' : undefined} bold={cell.cat === 0}>
          {cell.ch}
        </Text>
      ))}
    </Text>
  );
}

function TimerBody({ store, preferences }: { store: Store; preferences: Preferences }) {
  const active = store.active;
  const data = ringData(store, preferences.ringConcept);
  return (
    <Box flexDirection="column" alignItems="center">
      <TimerGlyphs active={active} font={preferences.font} />
      {active ? (
        <>
          <Text color="magenta" bold>● TRACKING</Text>
          <Text color="cyan" bold>▶ {active.project}</Text>
          <Text color="gray">started {formatTime(active.started_at, preferences.clockFormat, true)}</Text>
        </>
      ) : (
        <>
          <Text color="gray">ready when you are</Text>
          <Text color="cyan">press i to start</Text>
        </>
      )}
      {preferences.ringStyle !== 'none' && (
        <>
          <Text>{' '}</Text>
          {ringGrid(preferences.ringStyle, data).map((row, index) => <RingRow key={index} cells={row} />)}
          <Text color="gray">{data.label}</Text>
        </>
      )}
    </Box>
  );
}

function Header({ preferences }: { preferences: Preferences }) {
  return (
    <Box paddingX={1}>
      <Text>
        <Text color="cyan" bold>PUNCH</Text>
        <Text>{`  ·  ${formatClock(new Date(), preferences.clockFormat)}`}</Text>
      </Text>
    </Box>
  );
}

function Footer({ mode, input, status, store }: { mode: Mode; input: string; status: StatusMsg | null; store: Store }) {
  let help = 'a activity · ? help · i start · q quit';
  if (store.active) help = 'a activity · ? help · o stop · q quit';
  if (mode === 'input') help = 'enter confirm · esc cancel';
  if (mode === 'stop-confirm') help = 'enter confirm · esc cancel';
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={status ? (status.isError ? 'red' : 'green') : undefined}>{status?.text ?? ' '}</Text>
      {mode === 'input' && <Text><Text color="cyan" bold>project name: </Text><Text color="white">{input}▌</Text></Text>}
      {mode === 'stop-confirm' && <Text color="yellow" bold>stop tracking this session? Enter confirm · Esc cancel</Text>}
      {mode === 'normal' && <Text>{' '}</Text>}
      <Text color="gray">{help}</Text>
    </Box>
  );
}

export interface ShellProps {
  store: Store;
  preferences: Preferences;
  mode: Mode;
  input: string;
  status: StatusMsg | null;
}

export function Shell({ store, preferences, mode, input, status }: ShellProps) {
  const { rows } = useWindowSize();
  return (
    <Box flexDirection="column" height={rows} width="100%">
      <Header preferences={preferences} />
      <Box flexGrow={1} flexDirection="column" justifyContent="center" alignItems="center" width="100%">
        <TimerBody store={store} preferences={preferences} />
      </Box>
      <Footer mode={mode} input={input} status={status} store={store} />
    </Box>
  );
}

function loadStore(): Store {
  const loaded = load();
  return loaded.ok ? loaded.value : { active: null, history: [], goal_secs: 8 * 3600 };
}

export function App({ initialScreen = 'timer' }: { initialScreen?: InitialScreen } = {}) {
  const { exit } = useApp();
  const [store, setStore] = React.useState<Store>(() => loadStore());
  const [preferences] = React.useState<Preferences>(() => {
    const loaded = loadPreferences();
    return loaded.ok ? loaded.value : DEFAULT_PREFERENCES;
  });
  const [mode, setMode] = React.useState<Mode>('normal');
  const [input, setInput] = React.useState('');
  const [status, setStatus] = React.useState<StatusMsg | null>(null);
  const [screen] = React.useState<InitialScreen>(initialScreen);

  useAnimation({ interval: 500 });

  const report = (result: CmdResult) => setStatus({ text: result.message, isError: !result.ok });
  const reload = () => setStore(loadStore());

  const submitInput = () => {
    const value = input.trim();
    setInput('');
    setMode('normal');
    report(cmdStart(value || null));
    reload();
  };

  const confirmPunchOut = () => {
    const active = store.active;
    const result = cmdStop();
    if (result.ok && active) {
      setStatus({ text: `Logged ${formatDuration(elapsedSeconds(active))} to “${active.project}”`, isError: false });
    } else {
      report(result);
    }
    setMode('normal');
    reload();
  };

  useInput((keyInput, key) => {
    if (screen !== 'timer') return;
    if (mode === 'input') {
      if (key.return) submitInput();
      else if (key.escape) { setMode('normal'); setInput(''); }
      else if (key.backspace) setInput((value) => value.slice(0, -1));
      else if (keyInput && !key.ctrl && !key.meta) setInput((value) => value + keyInput);
      return;
    }
    if (mode === 'stop-confirm') {
      if (key.return) confirmPunchOut();
      else if (key.escape) setMode('normal');
      return;
    }
    if (keyInput === 'q') exit();
    else if (keyInput === 'i') { setInput(''); setMode('input'); }
    else if (keyInput === 'o' && store.active) setMode('stop-confirm');
  });

  return <Shell store={store} preferences={preferences} mode={mode} input={input} status={status} />;
}
