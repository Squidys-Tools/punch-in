import React from 'react';
import { Box, Text, useAnimation, useApp, useInput, useWindowSize } from 'ink';
import { start as cmdStart, stop as cmdStop, type CmdResult } from './commands.js';
import { elapsedSeconds, formatDuration, isSameDay, load, type Active, type Store } from './store.js';
import { activityForDay, nextDay, previousDay, type ActivitySummary } from './activity.js';
import {
  DEFAULT_PREFERENCES,
  savePreferences,
  type ClockFormat,
  type Preferences,
  loadPreferences,
} from './preferences.js';
import { FONTS, gradientColor, timerRows, type TimerFont } from './fonts.js';
import { RING_CONCEPTS, RING_STYLES, ringData, ringGrid, type Cell, type RingConcept, type RingStyle } from './ring.js';

export type InitialScreen = 'timer' | 'settings';
type Mode = 'normal' | 'input' | 'stop-confirm';
type Screen = 'timer' | 'setup' | 'settings' | 'help' | 'activity';
type ActivityTab = 'sessions' | 'analytics';
type VisualFocus = 0 | 1 | 2;

interface StatusMsg {
  text: string;
  isError: boolean;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function isCompactViewport(rows: number, columns: number): boolean {
  return rows < 19 || columns < 60;
}

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

function TimerBody({ store, preferences, compact }: { store: Store; preferences: Preferences; compact: boolean }) {
  const active = store.active;
  const data = ringData(store, preferences.ringConcept);
  return (
    <Box flexDirection="column" alignItems="center">
      <TimerGlyphs active={active} font={preferences.font} />
      {active ? (
        <>
          <Text color="magenta" bold>● TRACKING</Text>
          <Text color="cyan" bold>▶ {active.project}</Text>
          {!compact && <Text color="gray">started {formatTime(active.started_at, preferences.clockFormat, true)}</Text>}
        </>
      ) : (
        <>
          <Text color="gray">ready when you are</Text>
          <Text color="cyan">press i to start</Text>
        </>
      )}
      {!compact && preferences.ringStyle !== 'none' && (
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
  let help = 'a activity · s settings · ? help · i start · q quit';
  if (store.active) help = 'a activity · s settings · ? help · o stop · q quit';
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

function clockLabel(value: ClockFormat): string {
  return value === '12h' ? '12-hour' : '24-hour';
}

function cycle<T>(values: readonly T[], value: T): T {
  return values[(values.indexOf(value) + 1) % values.length];
}

function setupValue(preferences: Preferences, step: number, focus: VisualFocus): string {
  if (step === 0) return clockLabel(preferences.clockFormat);
  if (step === 2) return preferences.reuseLastProject ? 'on' : 'off';
  if (focus === 0) return preferences.font;
  if (focus === 1) return preferences.ringStyle;
  return preferences.ringConcept;
}

function SetupScreen({ preferences, step, focus, status }: { preferences: Preferences; step: number; focus: VisualFocus; status: StatusMsg | null }) {
  const title = step === 0 ? 'CLOCK FORMAT' : step === 1 ? 'VISUAL STYLE' : 'STARTING SESSIONS';
  return (
    <CenteredScreen>
      <Box flexDirection="column" alignItems="center">
        <Text color="cyan" bold>WELCOME TO PUNCH</Text>
        <Text color="gray">make the timer feel like yours · step {step + 1} of 3</Text>
        <Text>{' '}</Text>
        <Text color="magenta" bold>{title}</Text>
        {status && <Text color="red">{status.text}</Text>}
        {step === 0 && <Text><Text color="yellow">› </Text>clock: <Text color="green" bold>{setupValue(preferences, step, focus)}</Text></Text>}
        {step === 1 && (
          <>
            <Text color={focus === 0 ? 'yellow' : 'gray'}>{focus === 0 ? '›' : ' '} font: {preferences.font}</Text>
            <Text color={focus === 1 ? 'yellow' : 'gray'}>{focus === 1 ? '›' : ' '} ring: {preferences.ringStyle}</Text>
            <Text color={focus === 2 ? 'yellow' : 'gray'}>{focus === 2 ? '›' : ' '} concept: {preferences.ringConcept}</Text>
          </>
        )}
        {step === 2 && <Text><Text color="yellow">› </Text>reuse last project: <Text color="green" bold>{setupValue(preferences, step, focus)}</Text></Text>}
        <Text>{' '}</Text>
        <Text color="gray">Space change · Enter continue · Esc back</Text>
      </Box>
    </CenteredScreen>
  );
}

type SettingKey = 'clockFormat' | 'font' | 'ringStyle' | 'ringConcept' | 'reuseLastProject';
const SETTING_KEYS: SettingKey[] = ['clockFormat', 'font', 'ringStyle', 'ringConcept', 'reuseLastProject'];

function settingLabel(key: SettingKey): string {
  switch (key) {
    case 'clockFormat': return 'clock format';
    case 'font': return 'timer font';
    case 'ringStyle': return 'ring style';
    case 'ringConcept': return 'ring concept';
    case 'reuseLastProject': return 'reuse last project';
  }
}

function settingValue(preferences: Preferences, key: SettingKey): string {
  if (key === 'clockFormat') return clockLabel(preferences.clockFormat);
  if (key === 'reuseLastProject') return preferences.reuseLastProject ? 'on' : 'off';
  return preferences[key];
}

function SettingsScreen({ preferences, focus, status }: { preferences: Preferences; focus: number; status: StatusMsg | null }) {
  return (
    <CenteredScreen>
      <Box flexDirection="column" alignItems="center">
        <Text color="cyan" bold>SETTINGS</Text>
        <Text color="gray">customize the timer · changes are saved together</Text>
        {status && <Text color="red">{status.text}</Text>}
        <Text>{' '}</Text>
        {SETTING_KEYS.map((key, index) => (
          <Text key={key} color={focus === index ? 'yellow' : undefined}>
            {focus === index ? '› ' : '  '}{settingLabel(key)}: <Text bold={focus === index}>{settingValue(preferences, key)}</Text>
          </Text>
        ))}
        <Text>{' '}</Text>
        <Text color="gray">↑↓ move · Space change · Enter save · Esc cancel</Text>
      </Box>
    </CenteredScreen>
  );
}

function dateHeading(date: Date): string {
  return `${DAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${String(date.getDate()).padStart(2, ' ')}, ${date.getFullYear()}`;
}

function ActivitySessions({ summary, preferences, active }: { summary: ActivitySummary; preferences: Preferences; active: Active | null }) {
  const projectWidth = Math.max(12, ...summary.sessions.map((session) => session.project.length), active?.project.length ?? 0);
  const durationWidth = Math.max(8, ...summary.sessions.map((session) => formatDuration(session.duration_secs).length), active ? formatDuration(elapsedSeconds(active)).length : 0);
  const row = (project: string, start: string, end: string, duration: string) => (
    <Text>{'  '}{project.padEnd(projectWidth, ' ')}  {`${start} → ${end}`.padEnd(21, ' ')}{duration.padStart(durationWidth, ' ')}</Text>
  );
  return (
    <Box flexDirection="column" alignItems="flex-start">
      <Text color="gray">{formatDuration(summary.totalSecs)} tracked · {summary.sessionCount} sessions</Text>
      <Text>{' '}</Text>
      {summary.sessions.map((session, index) => (
        <React.Fragment key={`${session.started_at.toISOString()}-${index}`}>
          {row(session.project, formatTime(session.started_at, preferences.clockFormat), formatTime(session.ended_at, preferences.clockFormat), formatDuration(session.duration_secs))}
        </React.Fragment>
      ))}
      {active && <Text color="magenta" bold>{row(active.project, formatTime(active.started_at, preferences.clockFormat), 'ACTIVE', formatDuration(elapsedSeconds(active)))}</Text>}
      {summary.sessions.length === 0 && !active && <Text color="gray">no sessions logged on this day</Text>}
    </Box>
  );
}

function ActivityAnalytics({ summary }: { summary: ActivitySummary }) {
  const bars = Array.from({ length: 9 }, (_, index) => {
    const hour = index + 8;
    const count = summary.sessions.filter((session) => session.started_at.getHours() === hour).length;
    return <Text key={hour} color={count ? 'cyan' : 'gray'}>{count ? '██' : '··'}</Text>;
  });
  return (
    <>
      <Text color="gray">{summary.totalSecs ? formatDuration(summary.totalSecs) : '0s'} total · {summary.sessionCount} sessions</Text>
      <Text>{' '}</Text>
      <Text color="yellow">TOTAL      <Text color="white">{formatDuration(summary.totalSecs)}</Text></Text>
      <Text color="yellow">AVERAGE    <Text color="white">{formatDuration(summary.averageSecs)}</Text></Text>
      <Text color="yellow">TOP PROJECT<Text color="white"> {summary.topProject?.project ?? '—'}</Text></Text>
      <Text>{' '}</Text>
      <Text color="gray">ACTIVITY  08 09 10 11 12 13 14 15 16</Text>
      <Text>          {bars}</Text>
      <Text>{' '}</Text>
      <Text color="gray">PROJECTS</Text>
      {summary.projectTotals.length === 0 ? <Text color="gray">no project data</Text> : summary.projectTotals.map((item) => <Text key={item.project}>  {item.project.padEnd(16, ' ')} {formatDuration(item.durationSecs)}</Text>)}
    </>
  );
}

function CenteredScreen({ children }: { children: React.ReactNode }) {
  const { rows } = useWindowSize();
  return <Box height={rows} width="100%" justifyContent="center" alignItems="center">{children}</Box>;
}

function ActivityScreen({ store, preferences, date, tab }: { store: Store; preferences: Preferences; date: Date; tab: ActivityTab }) {
  const summary = activityForDay(store.history, date);
  return (
    <CenteredScreen>
      <Box flexDirection="column" alignItems="center">
        <Text color="cyan" bold>ACTIVITY · {tab === 'sessions' ? 'SESSIONS' : 'ANALYTICS'}</Text>
        <Text color="magenta" bold>{dateHeading(date)}</Text>
        <Text>{' '}</Text>
        {tab === 'sessions' ? <ActivitySessions summary={summary} preferences={preferences} active={store.active && isSameDay(store.active.started_at, date) ? store.active : null} /> : <ActivityAnalytics summary={summary} />}
        <Text>{' '}</Text>
        <Text color="gray">Tab {tab === 'sessions' ? 'analytics' : 'sessions'} · ←→ day · Esc back</Text>
      </Box>
    </CenteredScreen>
  );
}

function HelpScreen() {
  return (
    <CenteredScreen>
      <Box flexDirection="column" alignItems="center">
        <Text color="cyan" bold>HELP</Text>
        <Text>{' '}</Text>
        <Text><Text color="yellow">i</Text> start a session</Text>
        <Text><Text color="yellow">o</Text> stop the active session</Text>
        <Text><Text color="yellow">a</Text> open Activity</Text>
        <Text><Text color="yellow">s</Text> open Settings</Text>
        <Text><Text color="yellow">?</Text> open this help</Text>
        <Text><Text color="yellow">q</Text> quit</Text>
        <Text>{' '}</Text>
        <Text color="gray">Esc close</Text>
      </Box>
    </CenteredScreen>
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
  const { rows, columns } = useWindowSize();
  const compact = isCompactViewport(rows, columns);
  return (
    <Box flexDirection="column" height={rows} width="100%">
      <Header preferences={preferences} />
      <Box flexGrow={1} flexDirection="column" justifyContent="center" alignItems="center" width="100%">
        <TimerBody store={store} preferences={preferences} compact={compact} />
      </Box>
      <Footer mode={mode} input={input} status={status} store={store} />
    </Box>
  );
}

function loadStore(): Store {
  const loaded = load();
  return loaded.ok ? loaded.value : { active: null, history: [], goal_secs: 8 * 3600 };
}

export interface AppProps {
  initialScreen?: InitialScreen;
}

export const App: React.FC<AppProps> = ({ initialScreen = 'timer' }) => {
  const { exit } = useApp();
  const [store, setStore] = React.useState<Store>(() => loadStore());
  const [preferences, setPreferences] = React.useState<Preferences>(() => {
    const loaded = loadPreferences();
    return loaded.ok ? loaded.value : DEFAULT_PREFERENCES;
  });
  const [mode, setMode] = React.useState<Mode>('normal');
  const [input, setInput] = React.useState('');
  const [status, setStatus] = React.useState<StatusMsg | null>(null);
  const [screen, setScreen] = React.useState<Screen>(() => {
    const loaded = loadPreferences();
    return loaded.ok && !loaded.value.setupComplete ? 'setup' : initialScreen;
  });
  const [setupStep, setSetupStep] = React.useState(0);
  const [visualFocus, setVisualFocus] = React.useState<VisualFocus>(0);
  const [settingsFocus, setSettingsFocus] = React.useState(0);
  const [draftPreferences, setDraftPreferences] = React.useState(preferences);
  const [activityDate, setActivityDate] = React.useState(() => new Date());
  const [activityTab, setActivityTab] = React.useState<ActivityTab>('sessions');

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

  const saveDraft = (next: Preferences, nextScreen: Screen = 'timer') => {
    const result = savePreferences(next);
    if (!result.ok) {
      setStatus({ text: result.error, isError: true });
      return;
    }
    setPreferences(next);
    setDraftPreferences(next);
    setScreen(nextScreen);
  };

  const changeSetupChoice = () => {
    setDraftPreferences((current) => {
      if (setupStep === 0) return { ...current, clockFormat: current.clockFormat === '12h' ? '24h' : '12h' };
      if (setupStep === 2) return { ...current, reuseLastProject: !current.reuseLastProject };
      if (visualFocus === 0) return { ...current, font: cycle(FONTS, current.font) };
      if (visualFocus === 1) return { ...current, ringStyle: cycle(RING_STYLES, current.ringStyle) };
      return { ...current, ringConcept: cycle(RING_CONCEPTS, current.ringConcept) };
    });
  };

  const changeSetting = () => {
    const key = SETTING_KEYS[settingsFocus];
    setDraftPreferences((current) => {
      if (key === 'clockFormat') return { ...current, clockFormat: current.clockFormat === '12h' ? '24h' : '12h' };
      if (key === 'font') return { ...current, font: cycle(FONTS, current.font) };
      if (key === 'ringStyle') return { ...current, ringStyle: cycle(RING_STYLES, current.ringStyle) };
      if (key === 'ringConcept') return { ...current, ringConcept: cycle(RING_CONCEPTS, current.ringConcept) };
      return { ...current, reuseLastProject: !current.reuseLastProject };
    });
  };

  useInput((keyInput, key) => {
    if (screen === 'setup') {
      if (keyInput === ' ') changeSetupChoice();
      else if (key.return) {
        if (setupStep < 2) setSetupStep((value) => value + 1);
        else saveDraft({ ...draftPreferences, setupComplete: true });
      } else if (key.escape && setupStep > 0) {
        setSetupStep((value) => value - 1);
      } else if (setupStep === 1 && (key.leftArrow || key.rightArrow)) {
        setVisualFocus((value) => key.rightArrow ? ((value + 1) % 3) as VisualFocus : ((value + 2) % 3) as VisualFocus);
      }
      return;
    }
    if (screen === 'settings') {
      if (key.upArrow) setSettingsFocus((value) => (value + SETTING_KEYS.length - 1) % SETTING_KEYS.length);
      else if (key.downArrow) setSettingsFocus((value) => (value + 1) % SETTING_KEYS.length);
      else if (keyInput === ' ') changeSetting();
      else if (key.return) saveDraft(draftPreferences);
      else if (key.escape) { setDraftPreferences(preferences); setScreen('timer'); }
      return;
    }
    if (screen === 'help') {
      if (key.escape) setScreen('timer');
      return;
    }
    if (screen === 'activity') {
      if (key.escape) setScreen('timer');
      else if (key.tab) setActivityTab((value) => value === 'sessions' ? 'analytics' : 'sessions');
      else if (key.leftArrow) setActivityDate((value) => previousDay(value));
      else if (key.rightArrow) setActivityDate((value) => nextDay(value));
      return;
    }
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
    else if (keyInput === 'i') {
      const recent = store.history.slice().sort((a, b) => b.started_at.getTime() - a.started_at.getTime())[0]?.project;
      setInput(preferences.reuseLastProject ? recent ?? '' : '');
      setMode('input');
    }
    else if (keyInput === 'o' && store.active) setMode('stop-confirm');
    else if (keyInput === '?') { setStatus(null); setScreen('help'); }
    else if (keyInput === 'a') { setStatus(null); setActivityDate(new Date()); setActivityTab('sessions'); setScreen('activity'); }
    else if (keyInput === 's') { setStatus(null); setDraftPreferences(preferences); setScreen('settings'); }
  });

  if (screen === 'setup') return <SetupScreen preferences={draftPreferences} step={setupStep} focus={visualFocus} status={status} />;
  if (screen === 'settings') return <SettingsScreen preferences={draftPreferences} focus={settingsFocus} status={status} />;
  if (screen === 'help') return <HelpScreen />;
  if (screen === 'activity') return <ActivityScreen store={store} preferences={preferences} date={activityDate} tab={activityTab} />;
  return <Shell store={store} preferences={preferences} mode={mode} input={input} status={status} />;
};
