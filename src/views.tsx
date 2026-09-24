import React from 'react';
import { useKeyboard, useRenderer, useTerminalDimensions } from '@opentui/react';
import { editSession as cmdEditSession, start as cmdStart, stop as cmdStop, type CmdResult } from './commands.js';
import { elapsedSeconds, formatDateTimeInput, formatDuration, isSameDay, load, parseDateTimeInput, type Active, type Session, type Store } from './store.js';
import { activityForDay, nextDay, previousDay, type ActivitySummary } from './activity.js';
import {
  DEFAULT_PREFERENCES,
  savePreferences,
  type ClockFormat,
  type Preferences,
  loadPreferences,
} from './preferences.js';
import { FONTS, TIMER_COLORS, accentColor, gradientColor, timerBlocks, timerFontHeight, type TimerColor, type TimerFont } from './fonts.js';
import { RING_CONCEPTS, RING_STYLES, ringData, ringGrid, ringHeight, type Cell, type RingConcept, type RingStyle } from './ring.js';
import {
  TIMER_ANIMATIONS,
  animationDescription,
  animationLabel,
  createAnimationState,
  digitKey,
  faceColor,
  prepareBlocks,
  syncAnimationState,
  type TimerAnimation,
} from './timer-animation.js';

export type InitialScreen = 'timer' | 'settings';
export type { TimerFont } from './fonts.js';
export type { RingConcept, RingStyle } from './ring.js';
type Mode = 'normal' | 'input' | 'stop-confirm';
type Screen = 'timer' | 'setup' | 'settings' | 'activity' | 'edit-session';
type ActivityTab = 'sessions' | 'analytics';
type VisualFocus = 0 | 1 | 2 | 3;
type EditStep = 0 | 1 | 2;

interface StatusMsg {
  text: string;
  isError: boolean;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function isCompactViewport(rows: number, columns: number): boolean {
  return rows < 19 || columns < 60;
}

export type CompactLevel = 0 | 1 | 2 | 3 | 4;

export function compactLevel(
  rows: number,
  font: TimerFont,
  ringStyle: RingStyle,
  reservedRows: number = 4,
): CompactLevel {
  const bodyRows = rows - reservedRows;
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
    <text>
      <b>
        {[...row].map((char, index) => {
          if (char === ' ') return <React.Fragment key={index}> </React.Fragment>;
          const { r, g, b } = gradientColor(position++ / visible);
          const hex = `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
          return <span key={index} fg={hex}>{char}</span>;
        })}
      </b>
    </text>
  );
}

function TimerGlyphs({
  active,
  font,
  color,
  accent,
  animation,
}: {
  active: Active | null;
  font: TimerFont;
  color: TimerColor;
  accent: string;
  animation: TimerAnimation;
}) {
  const secs = active ? elapsedSeconds(active) : 0;
  const now = Date.now();
  const glyphColor = color !== 'gray' ? accent : active ? 'green' : 'gray';
  const motion = active !== null && animation !== 'none';
  const stateRef = React.useRef(createAnimationState(animation));
  const state = stateRef.current;
  const baseBlocks = timerBlocks(secs, font);

  if (!motion) {
    const staticRows = Array.from({ length: baseBlocks[0]?.rows.length ?? 0 }, (_, row) =>
      baseBlocks.map((block) => `${block.rows[row] ?? ''} `).join(''),
    );
    return (
      <>
        {staticRows.map((row, index) =>
          font === 'gradient' ? (
            <GradientText key={index} row={row} />
          ) : (
            <text key={index} fg={glyphColor}><b>{row}</b></text>
          ),
        )}
      </>
    );
  }

  syncAnimationState(state, {
    active: true,
    digits: digitKey(baseBlocks),
    now,
    animation,
  });
  const blocks = prepareBlocks({ blocks: baseBlocks, animation, active: true, now });
  const height = blocks[0]?.rows.length ?? 0;

  const totalVisible = Math.max(
    1,
    blocks.reduce(
      (sum, block) => sum + Math.max(1, [...(block.rows[0] ?? '')].filter((ch) => ch !== ' ').length),
      0,
    ) - 1,
  );
  let runningGradient = 0;
  const starts = blocks.map((block) => {
    const visible = Math.max(1, [...(block.rows[0] ?? '')].filter((ch) => ch !== ' ').length);
    const start = runningGradient;
    runningGradient += visible;
    return { start, visible };
  });

  return (
    <>
      {Array.from({ length: height }, (_, row) => (
        <text key={row}>
          <b>
            {blocks.map((block, blockIndex) => {
              const face = faceColor({
                baseColor: glyphColor,
                animation,
                place: block.place,
                kind: block.kind,
                active: true,
                now,
                state,
              });
              const glyph = block.rows[row] ?? '';
              const range = starts[blockIndex]!;
              return (
                <React.Fragment key={blockIndex}>
                  {[...glyph].map((ch, charIndex) => {
                    if (ch === ' ') return <React.Fragment key={charIndex}> </React.Fragment>;
                    let fg = face;
                    if (font === 'gradient') {
                      const progress = (range.start + Math.min(charIndex, range.visible - 1)) / totalVisible;
                      const { r, g, b } = gradientColor(progress);
                      const hex = `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
                      fg = faceColor({
                        baseColor: hex,
                        animation,
                        place: block.place,
                        kind: block.kind,
                        active: true,
                        now,
                        state,
                      });
                    }
                    return (
                      <span key={charIndex} fg={fg}>
                        {ch}
                      </span>
                    );
                  })}
                  <React.Fragment key="gap"> </React.Fragment>
                </React.Fragment>
              );
            })}
          </b>
        </text>
      ))}
    </>
  );
}

function RingRow({ cells, accent }: { cells: Cell[]; accent: string }) {
  return (
    <text>
      {cells.map((cell, index) => {
        const fg = cell.cat === 0 ? accent : cell.cat === -1 ? 'gray' : undefined;
        return cell.cat === 0 ? (
          <b key={index}><span fg={fg}>{cell.ch}</span></b>
        ) : (
          <span key={index} fg={fg}>{cell.ch}</span>
        );
      })}
    </text>
  );
}

function TimerBody({ store, preferences, compact, accent }: { store: Store; preferences: Preferences; compact: boolean; accent: string }) {
  const active = store.active;
  const data = ringData(store, preferences.ringConcept);
  return (
    <box style={{ flexDirection: 'column', alignItems: 'center' }}>
      <TimerGlyphs active={active} font={preferences.font} color={preferences.color} accent={accent} animation={preferences.animation} />
      {active ? (
        <>
          <text fg={accent}><b>▶ {active.project}</b></text>
          {!compact && <text fg="gray">started {formatTime(active.started_at, preferences.clockFormat, true)}</text>}
        </>
      ) : (
        <>
          <text fg="gray">ready when you are</text>
          <text fg={accent}>press i to start</text>
        </>
      )}
      {!compact && preferences.ringStyle !== 'none' && (
        <>
          <text>{' '}</text>
          {ringGrid(preferences.ringStyle, data).map((row, index) => <RingRow key={index} cells={row} accent={accent} />)}
          <text fg="gray">{data.label}</text>
        </>
      )}
    </box>
  );
}

function Header({ preferences, accent }: { preferences: Preferences; accent: string }) {
  return (
    <box style={{ paddingLeft: 1, paddingRight: 1 }}>
      <text><span fg={accent}><b>PUNCH IN</b></span><span>{`  ·  ${formatClock(new Date(), preferences.clockFormat)}`}</span></text>
    </box>
  );
}

function Footer({ mode, input, status, store, accent }: { mode: Mode; input: string; status: StatusMsg | null; store: Store; accent: string }) {
  let help = 'a activity · s settings · i start · q quit';
  if (store.active) help = 'a activity · s settings · o stop · q quit';
  if (mode === 'input') help = 'enter confirm · esc cancel';
  if (mode === 'stop-confirm') help = 'enter confirm · esc cancel';
  return (
    <box style={{ flexDirection: 'column', paddingLeft: 1, paddingRight: 1 }}>
      <text fg={status ? (status.isError ? 'red' : 'green') : undefined}>{status?.text ?? ' '}</text>
      {mode === 'input' && <text><span fg={accent}><b>project name: </b></span><span fg="white">{input}▌</span></text>}
      {mode === 'stop-confirm' && <text fg="yellow"><b>stop tracking this session? Enter confirm · Esc cancel</b></text>}
      {mode === 'normal' && <text>{' '}</text>}
      <text fg="gray">{help}</text>
    </box>
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
  if (focus === 1) return preferences.color;
  if (focus === 2) return preferences.ringStyle;
  return preferences.ringConcept;
}

function SetupScreen({ preferences, step, focus, status, accent }: { preferences: Preferences; step: number; focus: VisualFocus; status: StatusMsg | null; accent: string }) {
  const title = step === 0 ? 'CLOCK FORMAT' : step === 1 ? 'VISUAL STYLE' : 'STARTING SESSIONS';
  return (
    <CenteredScreen>
      <box style={{ flexDirection: 'column', alignItems: 'center' }}>
        <text fg={accent}><b>WELCOME TO PUNCH</b></text>
        <text fg="gray">make the timer feel like yours · step {step + 1} of 3</text>
        <text>{' '}</text>
        <text fg="magenta"><b>{title}</b></text>
        {status && <text fg="red">{status.text}</text>}
        {step === 0 && <text><span fg="yellow">› </span>clock: <span fg="green"><b>{setupValue(preferences, step, focus)}</b></span></text>}
        {step === 1 && (
          <>
            <text fg={focus === 0 ? 'yellow' : 'gray'}>{focus === 0 ? '›' : ' '} font: {preferences.font}</text>
            <text fg={focus === 1 ? 'yellow' : 'gray'}>{focus === 1 ? '›' : ' '} accent: {preferences.color}</text>
            <text fg={focus === 2 ? 'yellow' : 'gray'}>{focus === 2 ? '›' : ' '} ring: {preferences.ringStyle}</text>
            <text fg={focus === 3 ? 'yellow' : 'gray'}>{focus === 3 ? '›' : ' '} concept: {preferences.ringConcept}</text>
          </>
        )}
        {step === 2 && <text><span fg="yellow">› </span>reuse last project: <span fg="green"><b>{setupValue(preferences, step, focus)}</b></span></text>}
        <text>{' '}</text>
        <text fg="gray">Space change · Enter continue · Esc back</text>
      </box>
    </CenteredScreen>
  );
}

type SettingKey =
  | 'clockFormat'
  | 'font'
  | 'color'
  | 'ringStyle'
  | 'ringConcept'
  | 'reuseLastProject'
  | 'animation';
const SETTING_KEYS: SettingKey[] = [
  'clockFormat',
  'font',
  'color',
  'ringStyle',
  'ringConcept',
  'reuseLastProject',
  'animation',
];

function settingLabel(key: SettingKey): string {
  switch (key) {
    case 'clockFormat': return 'clock format';
    case 'font': return 'timer font';
    case 'color': return 'accent color';
    case 'ringStyle': return 'ring style';
    case 'ringConcept': return 'ring concept';
    case 'reuseLastProject': return 'reuse last project';
    case 'animation': return 'timer animation';
  }
}

function settingValue(preferences: Preferences, key: SettingKey): string {
  if (key === 'clockFormat') return clockLabel(preferences.clockFormat);
  if (key === 'reuseLastProject') return preferences.reuseLastProject ? 'on' : 'off';
  if (key === 'animation') return animationLabel(preferences.animation);
  return preferences[key];
}

function SettingsScreen({ preferences, focus, status, accent }: { preferences: Preferences; focus: number; status: StatusMsg | null; accent: string }) {
  return (
    <CenteredScreen>
      <box style={{ flexDirection: 'column', alignItems: 'center' }}>
        <text fg={accent}><b>SETTINGS</b></text>
        <text fg="gray">customize the timer · changes are saved together</text>
        {status && <text fg="red">{status.text}</text>}
        <text>{' '}</text>
        {SETTING_KEYS.map((key, index) => (
          <text key={key} fg={focus === index ? 'yellow' : undefined}>
            {focus === index ? '› ' : '  '}{settingLabel(key)}: {focus === index ? <b>{settingValue(preferences, key)}</b> : settingValue(preferences, key)}
          </text>
        ))}
        <text fg="gray">  {animationDescription(preferences.animation)}</text>
        <text>{' '}</text>
        <text fg="gray">keys · i start · o stop · a activity · t/r/c style · q quit</text>
        <text fg="gray">↑↓ move · Space change · Enter save · Esc cancel</text>
      </box>
    </CenteredScreen>
  );
}

function dateHeading(date: Date): string {
  return `${DAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${String(date.getDate()).padStart(2, ' ')}, ${date.getFullYear()}`;
}

function ActivitySessions({ summary, preferences, active, selectedIndex }: { summary: ActivitySummary; preferences: Preferences; active: Active | null; selectedIndex: number }) {
  const projectWidth = Math.max(12, ...summary.sessions.map((session) => session.project.length), active?.project.length ?? 0);
  const durationWidth = Math.max(8, ...summary.sessions.map((session) => formatDuration(session.duration_secs).length), active ? formatDuration(elapsedSeconds(active)).length : 0);
  const row = (project: string, start: string, end: string, duration: string, selected = false) => (
    <>
      <span fg={selected ? 'yellow' : undefined}>{selected ? '› ' : '  '}</span>
      {`${project.padEnd(projectWidth, ' ')}  ${`${start} → ${end}`.padEnd(21, ' ')}${duration.padStart(durationWidth, ' ')}`}
    </>
  );
  return (
    <box style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
      <text fg="gray">{formatDuration(summary.totalSecs)} tracked · {summary.sessionCount} sessions</text>
      <text>{' '}</text>
      {summary.sessions.map((session, index) => (
        <text key={`${session.started_at.toISOString()}-${index}`}>
          {row(session.project, formatTime(session.started_at, preferences.clockFormat), formatTime(session.ended_at, preferences.clockFormat), formatDuration(session.duration_secs), index === selectedIndex)}
        </text>
      ))}
      {active && <text fg="magenta"><b>{row(active.project, formatTime(active.started_at, preferences.clockFormat), 'ACTIVE', formatDuration(elapsedSeconds(active)))}</b></text>}
      {summary.sessions.length === 0 && !active && <text fg="gray">no sessions logged on this day</text>}
    </box>
  );
}

function ActivityAnalytics({ summary, accent }: { summary: ActivitySummary; accent: string }) {
  const bars = Array.from({ length: 9 }, (_, index) => {
    const hour = index + 8;
    const count = summary.sessions.filter((session) => session.started_at.getHours() === hour).length;
    return <span key={hour} fg={count ? accent : 'gray'}>{count ? '██' : '··'}</span>;
  });
  return (
    <>
      <text fg="gray">{summary.totalSecs ? formatDuration(summary.totalSecs) : '0s'} total · {summary.sessionCount} sessions</text>
      <text>{' '}</text>
      <text fg="yellow">TOTAL      <span fg="white">{formatDuration(summary.totalSecs)}</span></text>
      <text fg="yellow">AVERAGE    <span fg="white">{formatDuration(summary.averageSecs)}</span></text>
      <text fg="yellow">TOP PROJECT<span fg="white"> {summary.topProject?.project ?? '—'}</span></text>
      <text>{' '}</text>
      <text fg="gray">ACTIVITY  08 09 10 11 12 13 14 15 16</text>
      <text>{'          '}{bars}</text>
      <text>{' '}</text>
      <text fg="gray">PROJECTS</text>
      {summary.projectTotals.length === 0 ? <text fg="gray">no project data</text> : summary.projectTotals.map((item) => <text key={item.project}>  {item.project.padEnd(16, ' ')} {formatDuration(item.durationSecs)}</text>)}
    </>
  );
}

function CenteredScreen({ children }: { children: React.ReactNode }) {
  const { height } = useTerminalDimensions();
  return <box style={{ height, width: '100%', justifyContent: 'center', alignItems: 'center' }}>{children}</box>;
}

function ActivityScreen({ store, preferences, date, tab, selectedIndex, accent }: { store: Store; preferences: Preferences; date: Date; tab: ActivityTab; selectedIndex: number; accent: string }) {
  const summary = activityForDay(store.history, date);
  return (
    <CenteredScreen>
      <box style={{ flexDirection: 'column', alignItems: 'center' }}>
        <text fg={accent}><b>ACTIVITY · {tab === 'sessions' ? 'SESSIONS' : 'ANALYTICS'}</b></text>
        <text fg="magenta"><b>{dateHeading(date)}</b></text>
        <text>{' '}</text>
        {tab === 'sessions' ? <ActivitySessions summary={summary} preferences={preferences} active={store.active && isSameDay(store.active.started_at, date) ? store.active : null} selectedIndex={selectedIndex} /> : <ActivityAnalytics summary={summary} accent={accent} />}
        <text>{' '}</text>
        <text fg="gray">{tab === 'sessions' && summary.sessions.length > 0 ? '↑↓ select · Enter edit · ' : ''}Tab {tab === 'sessions' ? 'analytics' : 'sessions'} · ←→ day · Esc back</text>
      </box>
    </CenteredScreen>
  );
}

interface EditValues {
  project: string;
  startedAt: Date;
  endedAt: Date;
}

function EditSessionScreen({ values, step, input, status, accent }: { values: EditValues; step: EditStep; input: string; status: StatusMsg | null; accent: string }) {
  const duration = Math.max(0, Math.floor((values.endedAt.getTime() - values.startedAt.getTime()) / 1000));
  const value = (field: EditStep, text: string) => <span fg={step === field ? 'white' : undefined}>{step === field ? `${text}▌` : text}</span>;
  return (
    <CenteredScreen>
      <box style={{ flexDirection: 'column', alignItems: 'center' }}>
        <text fg={accent}><b>EDIT TIME ENTRY</b></text>
        <text fg="gray">change the project or time · step {step + 1} of 3</text>
        {status && <text fg="red">{status.text}</text>}
        <text>{' '}</text>
        <text><span fg={step === 0 ? 'yellow' : 'gray'}>{step === 0 ? '›' : ' '} project: </span>{value(0, step === 0 ? input : values.project)}</text>
        <text><span fg={step === 1 ? 'yellow' : 'gray'}>{step === 1 ? '›' : ' '} start:   </span>{value(1, step === 1 ? input : formatDateTimeInput(values.startedAt))}</text>
        <text><span fg={step === 2 ? 'yellow' : 'gray'}>{step === 2 ? '›' : ' '} end:     </span>{value(2, step === 2 ? input : formatDateTimeInput(values.endedAt))}</text>
        <text fg="gray">          duration: {formatDuration(duration)}</text>
        <text>{' '}</text>
        <text fg="gray">Enter next · Ctrl+A clear · Esc cancel</text>
        {step > 0 && <text fg="gray">Use YYYY-MM-DD HH:MM[:SS]</text>}
      </box>
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
  const { width, height } = useTerminalDimensions();
  const compact = isCompactViewport(height, width);
  const accent = accentColor(preferences.color);
  return (
    <box style={{ flexDirection: 'column', height, width: '100%' }}>
      <Header preferences={preferences} accent={accent} />
      <box style={{ flexGrow: 1, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
        <TimerBody store={store} preferences={preferences} compact={compact} accent={accent} />
      </box>
      <Footer mode={mode} input={input} status={status} store={store} accent={accent} />
    </box>
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
  const renderer = useRenderer();
  const [store, setStore] = React.useState<Store>(() => loadStore());
  const [preferenceLoad] = React.useState(() => loadPreferences());
  const preferenceLoadError = preferenceLoad.ok ? null : preferenceLoad.error;
  const initialPreferences = preferenceLoad.ok ? preferenceLoad.value : DEFAULT_PREFERENCES;
  const [preferences, setPreferences] = React.useState<Preferences>(initialPreferences);
  const [mode, setMode] = React.useState<Mode>('normal');
  const [input, setInput] = React.useState('');
  const [status, setStatus] = React.useState<StatusMsg | null>(() =>
    preferenceLoadError
      ? { text: `Unable to load preferences: ${preferenceLoadError}`, isError: true }
      : null,
  );
  const [screen, setScreen] = React.useState<Screen>(() => {
    if (!preferenceLoad.ok) return initialScreen === 'settings' ? 'settings' : 'setup';
    return !preferenceLoad.value.setupComplete ? 'setup' : initialScreen;
  });
  const [setupStep, setSetupStep] = React.useState(0);
  const [visualFocus, setVisualFocus] = React.useState<VisualFocus>(0);
  const [settingsFocus, setSettingsFocus] = React.useState(0);
  const [draftPreferences, setDraftPreferences] = React.useState(preferences);
  const [activityDate, setActivityDate] = React.useState(() => new Date());
  const [activityTab, setActivityTab] = React.useState<ActivityTab>('sessions');
  const [activitySelection, setActivitySelection] = React.useState(0);
  const [editingSession, setEditingSession] = React.useState<Session | null>(null);
  const [editValues, setEditValues] = React.useState<EditValues | null>(null);
  const [editStep, setEditStep] = React.useState<EditStep>(0);
  const [editInput, setEditInput] = React.useState('');

  const [, setTick] = React.useState(0);
  const animationActive = preferences.animation !== 'none' && store.active !== null;
  React.useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), animationActive ? 50 : 500);
    return () => clearInterval(timer);
  }, [animationActive]);

  const report = (result: CmdResult) => setStatus({ text: result.message, isError: !result.ok });
  const reload = () => setStore(loadStore());

  const submitInput = () => {
    const value = input.trim();
    setInput('');
    setMode('normal');
    const result = cmdStart(value || null);
    if (result.ok) setStatus(null);
    else report(result);
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
    if (preferenceLoadError) {
      setStatus({
        text: `Unable to save preferences: repair the preferences file and restart (${preferenceLoadError})`,
        isError: true,
      });
      return;
    }
    const result = savePreferences(next);
    if (!result.ok) {
      setStatus({ text: result.error, isError: true });
      return;
    }
    setPreferences(next);
    setDraftPreferences(next);
    setScreen(nextScreen);
  };

  const saveQuickPreference = (next: Preferences) => {
    if (preferenceLoadError) {
      setStatus({
        text: `Unable to save preferences: repair the preferences file and restart (${preferenceLoadError})`,
        isError: true,
      });
      return;
    }
    const result = savePreferences(next);
    if (!result.ok) {
      setStatus({ text: result.error, isError: true });
      return;
    }
    setPreferences(next);
    setDraftPreferences(next);
  };

  const beginEditSession = (session: Session) => {
    const values = { project: session.project, startedAt: new Date(session.started_at), endedAt: new Date(session.ended_at) };
    setEditingSession(session);
    setEditValues(values);
    setEditStep(0);
    setEditInput(values.project);
    setStatus(null);
    setScreen('edit-session');
  };

  const commitEditStep = () => {
    if (!editValues) return;
    if (editStep === 0) {
      const project = editInput.trim();
      if (!project) {
        setStatus({ text: 'Project name cannot be blank', isError: true });
        return;
      }
      const next = { ...editValues, project };
      setEditValues(next);
      setEditStep(1);
      setEditInput(formatDateTimeInput(next.startedAt));
      setStatus(null);
      return;
    }

    const parsed = parseDateTimeInput(editInput);
    if (!parsed) {
      setStatus({ text: 'Use YYYY-MM-DD HH:MM[:SS]', isError: true });
      return;
    }
    if (editStep === 1) {
      const next = { ...editValues, startedAt: parsed };
      setEditValues(next);
      setEditStep(2);
      setEditInput(formatDateTimeInput(next.endedAt));
      setStatus(null);
      return;
    }

    const index = editingSession ? store.history.indexOf(editingSession) : -1;
    const result = cmdEditSession(index, editValues.project, editValues.startedAt, parsed);
    if (!result.ok) {
      setStatus({ text: result.message, isError: true });
      return;
    }
    setStatus({ text: result.message, isError: false });
    setEditingSession(null);
    setEditValues(null);
    setActivitySelection(0);
    reload();
    setScreen('activity');
  };

  const changeSetupChoice = () => {
    setDraftPreferences((current) => {
      if (setupStep === 0) return { ...current, clockFormat: current.clockFormat === '12h' ? '24h' : '12h' };
      if (setupStep === 2) return { ...current, reuseLastProject: !current.reuseLastProject };
      if (visualFocus === 0) return { ...current, font: cycle(FONTS, current.font) };
      if (visualFocus === 1) return { ...current, color: cycle(TIMER_COLORS, current.color) };
      if (visualFocus === 2) return { ...current, ringStyle: cycle(RING_STYLES, current.ringStyle) };
      return { ...current, ringConcept: cycle(RING_CONCEPTS, current.ringConcept) };
    });
  };

  const changeSetting = () => {
    const key = SETTING_KEYS[settingsFocus];
    setDraftPreferences((current) => {
      if (key === 'clockFormat') return { ...current, clockFormat: current.clockFormat === '12h' ? '24h' : '12h' };
      if (key === 'font') return { ...current, font: cycle(FONTS, current.font) };
      if (key === 'color') return { ...current, color: cycle(TIMER_COLORS, current.color) };
      if (key === 'ringStyle') return { ...current, ringStyle: cycle(RING_STYLES, current.ringStyle) };
      if (key === 'ringConcept') return { ...current, ringConcept: cycle(RING_CONCEPTS, current.ringConcept) };
      if (key === 'animation') return { ...current, animation: cycle(TIMER_ANIMATIONS, current.animation) };
      return { ...current, reuseLastProject: !current.reuseLastProject };
    });
  };

  useKeyboard((key) => {
    const keyInput = key.sequence ?? key.name ?? '';
    const isReturn = key.name === 'return';
    const isEscape = key.name === 'escape';
    const isTab = key.name === 'tab';
    const isBackspace = key.name === 'backspace' || key.name === 'delete';
    const isUp = key.name === 'up';
    const isDown = key.name === 'down';
    const isLeft = key.name === 'left';
    const isRight = key.name === 'right';
    // Single printable char (code-point count guards against multi-byte escape
    // sequences from special keys); mirrors Ink's `input` argument.
    const isChar = keyInput.length > 0 && [...keyInput].length === 1;
    if (screen === 'setup') {
      if (keyInput === ' ' || key.name === 'space') changeSetupChoice();
      else if (isReturn) {
        if (setupStep < 2) setSetupStep((value) => value + 1);
        else saveDraft({ ...draftPreferences, setupComplete: true });
      } else if (isEscape && setupStep > 0) {
        setSetupStep((value) => value - 1);
      } else if (setupStep === 1 && (isUp || isDown)) {
        setVisualFocus((value) => isDown ? ((value + 1) % 4) as VisualFocus : ((value + 3) % 4) as VisualFocus);
      }
      return;
    }
    if (screen === 'settings') {
      if (isUp) setSettingsFocus((value) => (value + SETTING_KEYS.length - 1) % SETTING_KEYS.length);
      else if (isDown) setSettingsFocus((value) => (value + 1) % SETTING_KEYS.length);
      else if (keyInput === ' ' || key.name === 'space') changeSetting();
      else if (isReturn) saveDraft(draftPreferences);
      else if (isEscape) { setDraftPreferences(preferences); setScreen('timer'); }
      return;
    }
    if (screen === 'activity') {
      if (isEscape) setScreen('timer');
      else if (isTab) setActivityTab((value) => value === 'sessions' ? 'analytics' : 'sessions');
      else if (isLeft) { setActivityDate((value) => previousDay(value)); setActivitySelection(0); }
      else if (isRight) { setActivityDate((value) => nextDay(value)); setActivitySelection(0); }
      else if (activityTab === 'sessions' && isUp) setActivitySelection((value) => Math.max(0, value - 1));
      else if (activityTab === 'sessions' && isDown) {
        const count = activityForDay(store.history, activityDate).sessions.length;
        setActivitySelection((value) => Math.min(Math.max(0, count - 1), value + 1));
      }
      else if (activityTab === 'sessions' && (isReturn || keyInput === 'e')) {
        const sessions = activityForDay(store.history, activityDate).sessions;
        const selected = sessions[activitySelection];
        if (selected) beginEditSession(selected);
      }
      return;
    }
    if (screen === 'edit-session') {
      if (isEscape) {
        setEditingSession(null);
        setEditValues(null);
        setStatus(null);
        setScreen('activity');
      } else if ((key.ctrl && keyInput === 'a') || keyInput === '\x01') setEditInput('');
      else if (isBackspace) setEditInput((value) => value.slice(0, -1));
      else if (isReturn) commitEditStep();
      else if (isChar && !key.ctrl && !key.meta) setEditInput((value) => value + keyInput);
      return;
    }
    if (mode === 'input') {
      if (isReturn) submitInput();
      else if (isEscape) { setMode('normal'); setInput(''); }
      else if (isBackspace) setInput((value) => value.slice(0, -1));
      else if (isChar && !key.ctrl && !key.meta) setInput((value) => value + keyInput);
      return;
    }
    if (mode === 'stop-confirm') {
      if (isReturn) confirmPunchOut();
      else if (isEscape) setMode('normal');
      return;
    }
    if (keyInput === 'q') renderer.destroy();
    else if (keyInput === 'i') {
      const recent = store.history.slice().sort((a, b) => b.started_at.getTime() - a.started_at.getTime())[0]?.project;
      setInput(preferences.reuseLastProject ? recent ?? '' : '');
      setMode('input');
    }
    else if (keyInput === 'o' && store.active) setMode('stop-confirm');
    else if (keyInput === 't') saveQuickPreference({ ...preferences, font: cycle(FONTS, preferences.font) });
    else if (keyInput === 'r') saveQuickPreference({ ...preferences, ringStyle: cycle(RING_STYLES, preferences.ringStyle) });
    else if (keyInput === 'c') saveQuickPreference({ ...preferences, ringConcept: cycle(RING_CONCEPTS, preferences.ringConcept) });
    else if (keyInput === '?') { setStatus(null); setDraftPreferences(preferences); setScreen('settings'); }
    else if (keyInput === 'a') { setStatus(null); setActivityDate(new Date()); setActivityTab('sessions'); setActivitySelection(0); setScreen('activity'); }
    else if (keyInput === 's') { setStatus(null); setDraftPreferences(preferences); setScreen('settings'); }
  });

  if (screen === 'setup') return <SetupScreen preferences={draftPreferences} step={setupStep} focus={visualFocus} status={status} accent={accentColor(draftPreferences.color)} />;
  if (screen === 'settings') return <SettingsScreen preferences={draftPreferences} focus={settingsFocus} status={status} accent={accentColor(draftPreferences.color)} />;
  if (screen === 'activity') return <ActivityScreen store={store} preferences={preferences} date={activityDate} tab={activityTab} selectedIndex={activitySelection} accent={accentColor(preferences.color)} />;
  if (screen === 'edit-session' && editValues) return <EditSessionScreen values={editValues} step={editStep} input={editInput} status={status} accent={accentColor(preferences.color)} />;
  return <Shell store={store} preferences={preferences} mode={mode} input={input} status={status} />;
};
