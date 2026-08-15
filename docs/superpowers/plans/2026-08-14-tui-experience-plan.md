# Punch TUI Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved polished Punch TUI experience: required first-run customization, persisted settings, contextual timer interactions, help, and a today-focused Activity screen.

**Architecture:** Keep session data in `src/store.ts`, add a separate preferences persistence module, and isolate Activity calculations in pure functions so they can be tested without Ink. Refactor the existing single-screen Ink app into a small screen state machine in `src/views.tsx`, with dedicated components for setup, settings, help, and Activity. The main timer remains the default screen and owns only frequent actions; `main.ts` adds the `settings` entry point.

**Tech Stack:** Bun, TypeScript, React 19, Ink 7, ink-testing-library, Bun test.

## Global Constraints

- The timer remains the visual hero; visual personality comes from color, typography, rings, and restrained feedback.
- Frequent actions stay directly accessible; infrequent customization moves into dedicated screens.
- First-run setup is mandatory before the main timer is available.
- Settings use `Space` to change/toggle a focused choice, `Enter` to save, and `Esc` to cancel or return.
- Help opens with `?` and closes with `Esc`.
- Activity opens with `a`, defaults to today’s Sessions view, switches views with `Tab`, changes days with `←`/`→`, and returns with `Esc`.
- Activity v1 is day-focused; week/month ranges, notes, productivity scores, and a general command palette are out of scope.
- Preferences are stored separately from session history.
- No new runtime dependencies.

## File map

- Create `src/fonts.ts`: timer glyph definitions and `TimerFont`, `FONTS`, `timerRows`, and `timerFontHeight` APIs.
- Create `src/ring.ts`: ring styles/concepts and pure ring data/grid rendering APIs.
- Create `src/preferences.ts`: persisted first-run and display preferences, separate from `punch.json`.
- Create `src/activity.ts`: pure day selection and analytics projections over `Session[]`.
- Modify `src/store.ts`: preserve existing store compatibility and expose date-aware session helpers needed by Activity.
- Modify `src/views.tsx`: timer polish, screen state machine, setup/settings/help/Activity rendering, and keyboard handling.
- Modify `src/main.ts`: add `punch settings` and pass an initial screen to `App`.
- Modify `tests/store.test.ts`: cover date-aware session selection without changing legacy store behavior.
- Create `tests/preferences.test.ts`: preference defaults, persistence, malformed data, and separate file selection.
- Create `tests/activity.test.ts`: day filtering and all analytics projections.
- Create `tests/fonts.test.ts`: font row heights and stable timer output.
- Create `tests/ring.test.ts`: ring dimensions and concept data.
- Modify `tests/render.test.ts`: interaction coverage for setup, help, confirmation, settings, Activity, and the new footer.
- Modify `tests/commands.test.ts`: update stop-message expectations only if the command result copy changes; command semantics remain unchanged.

---

### Task 1: Bring visual primitives and preferences into the main branch

**Files:**
- Create: `src/fonts.ts`
- Create: `src/ring.ts`
- Create: `src/preferences.ts`
- Modify: `src/store.ts`
- Create: `tests/fonts.test.ts`
- Create: `tests/ring.test.ts`
- Create: `tests/preferences.test.ts`
- Modify: `tests/store.test.ts`

**Interfaces:**
- `src/fonts.ts` produces `TimerFont`, `FONTS`, `timerRows(secs: number, font: TimerFont): string[]`, and `timerFontHeight(font: TimerFont): number`.
- `src/ring.ts` produces `RingStyle`, `RingConcept`, `RING_STYLES`, `RING_CONCEPTS`, `ringData(store, concept, now?)`, `ringGrid(style, data)`, and `ringHeight(style)`.
- `src/preferences.ts` produces:

```ts
export type ClockFormat = '12h' | '24h';

export interface Preferences {
  setupComplete: boolean;
  clockFormat: ClockFormat;
  font: TimerFont;
  ringStyle: RingStyle;
  ringConcept: RingConcept;
  reuseLastProject: boolean;
}

export type PreferencesResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export const DEFAULT_PREFERENCES: Preferences;
export function preferencesFile(): string;
export function loadPreferences(): PreferencesResult<Preferences>;
export function savePreferences(preferences: Preferences): PreferencesResult<void>;
export function loadPreferencesPath(file: string): PreferencesResult<Preferences>;
export function savePreferencesPath(file: string, preferences: Preferences): PreferencesResult<void>;
```

- `src/store.ts` adds `sessionsOn(history: Session[], date: Date): Session[]` while retaining `todaySessions(history)` as a compatibility wrapper.

- [ ] **Step 1: Write failing tests for primitive APIs and preferences.**

```ts
test('each timer font reports the height of its rows', () => {
  for (const font of FONTS) {
    expect(timerRows(3661, font)).toHaveLength(timerFontHeight(font));
  }
});

test('missing preferences load the first-run defaults', () => {
  const result = loadPreferencesPath(path.join(dir, 'preferences.json'));
  expect(result).toEqual({ ok: true, value: DEFAULT_PREFERENCES });
});

test('preferences round-trip independently from session history', () => {
  const file = path.join(dir, 'preferences.json');
  const value = { ...DEFAULT_PREFERENCES, setupComplete: true, clockFormat: '24h' as const };
  expect(savePreferencesPath(file, value).ok).toBe(true);
  expect(loadPreferencesPath(file)).toEqual({ ok: true, value });
});
```

- [ ] **Step 2: Run the focused tests and verify they fail for missing modules/APIs.**

Run: `bun test tests/fonts.test.ts tests/ring.test.ts tests/preferences.test.ts tests/store.test.ts`

Expected: FAIL because the new modules and `sessionsOn` do not exist yet.

- [ ] **Step 3: Implement the primitives and preference persistence.** Copy the existing visual work available on `feature/feat/fonts-rings` into `src/fonts.ts` and `src/ring.ts`, keep the public names above, and make malformed preference files return `corrupt preferences file <path>: <message>` while missing files return defaults. Resolve the preference path from `PUNCH_PREFERENCES` when set, otherwise next to the session data file as `preferences.json`. Normalize unknown fields to defaults so older preference files remain usable.

- [ ] **Step 4: Add date-aware store selection.** Implement `sessionsOn` with local calendar-day comparison and make `todaySessions(history)` delegate to it with `new Date()`; do not change the JSON shape of `Store` or `Session`.

- [ ] **Step 5: Run focused tests and typecheck.**

Run: `bun test tests/fonts.test.ts tests/ring.test.ts tests/preferences.test.ts tests/store.test.ts && bun run typecheck`

Expected: PASS with no type errors.

- [ ] **Step 6: Commit the self-contained foundation.**

```bash
git add src/fonts.ts src/ring.ts src/preferences.ts src/store.ts tests/fonts.test.ts tests/ring.test.ts tests/preferences.test.ts tests/store.test.ts
git commit -m "feat: add visual primitives and persisted preferences"
```

### Task 2: Add pure Activity projections

**Files:**
- Create: `src/activity.ts`
- Create: `tests/activity.test.ts`

**Interfaces:**

```ts
export interface ProjectTotal {
  project: string;
  durationSecs: number;
}

export interface ActivitySummary {
  date: Date;
  sessions: Session[];
  totalSecs: number;
  sessionCount: number;
  averageSecs: number;
  topProject: ProjectTotal | null;
  projectTotals: ProjectTotal[];
}

export function activityForDay(history: Session[], date: Date): ActivitySummary;
export function previousDay(date: Date): Date;
export function nextDay(date: Date): Date;
```

- [ ] **Step 1: Write failing tests for today, empty days, project totals, and averages.** Use fixed local dates and sessions crossing different calendar days. Assert chronological session order, `totalSecs`, `sessionCount`, integer `averageSecs`, descending project totals with a stable alphabetical tie-break, and `topProject === null` for an empty day.

- [ ] **Step 2: Run the focused test file to verify failure.**

Run: `bun test tests/activity.test.ts`

Expected: FAIL because `src/activity.ts` does not exist.

- [ ] **Step 3: Implement `activityForDay`, `previousDay`, and `nextDay`.** Filter by local `started_at` calendar day, preserve session objects, calculate all summary fields from the filtered set, and never mutate the input history.

- [ ] **Step 4: Run focused tests and typecheck.**

Run: `bun test tests/activity.test.ts && bun run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the Activity domain module.**

```bash
git add src/activity.ts tests/activity.test.ts
git commit -m "feat: add activity summaries"
```

### Task 3: Refactor the timer and add guarded punch-out

**Files:**
- Modify: `src/views.tsx`
- Modify: `tests/render.test.ts`
- Modify: `tests/commands.test.ts` only if completion copy is changed in `commands.ts`

**Interfaces:**
- `App` accepts an optional `initialScreen?: 'timer' | 'settings'`, defaulting to `'timer'`.
- Timer rendering consumes `Preferences` and `Store`.
- The existing `start`, `stop`, `goal`, and `status` command APIs remain unchanged.

- [ ] **Step 1: Write failing render tests for the new timer states.** Add tests that start a session through `i`, assert the active timer shows the project and `o stop`, press `o`, assert a confirmation containing the project and duration with `Enter confirm · Esc cancel`, press `Esc` and assert the session remains active, then repeat and press `Enter` to assert `Logged ` plus the project and that the store history contains one session. Add an idle assertion for the footer `a activity · ? help · i start · q quit`.

- [ ] **Step 2: Run the targeted render tests to verify failure.**

Run: `bun test tests/render.test.ts`

Expected: FAIL because the current app stops immediately and still exposes design/goal controls.

- [ ] **Step 3: Replace hard-coded timer rendering with preference-driven rendering.** Use `timerRows`/`timerFontHeight` for the timer, `ringData`/`ringGrid` for the ring, and a clock formatter that accepts `ClockFormat`. Preserve the compact terminal behavior by measuring header/footer rows before choosing whether to omit the ring/project/start time.

- [ ] **Step 4: Add the main-screen state machine.** Add `stop-confirm` state. While it is active, ignore unrelated global shortcuts, render the project/duration confirmation, let `Enter` call `cmdStop()` and reload the store, let `Esc` return to the timer without writing, and format successful completion as `Logged <duration> to “<project>”`. Keep input-mode `Esc` cancellation intact.

- [ ] **Step 5: Update the everyday footer.** Remove font/ring/concept/goal controls from the normal footer. Show only contextual frequent actions, including `a`, `?`, `i`, `o` when active, and `q`. Keep setup/settings controls inside their own screens.

- [ ] **Step 6: Run render tests, the full suite, and typecheck.**

Run: `bun test && bun run typecheck`

Expected: PASS after replacing stale assertions for the old `design`/`goal` footer.

- [ ] **Step 7: Commit the timer interaction work.**

```bash
git add src/views.tsx tests/render.test.ts tests/commands.test.ts
git commit -m "feat: polish timer state and confirm punch out"
```

### Task 4: Implement mandatory first-run setup and persisted settings

**Files:**
- Modify: `src/views.tsx`
- Modify: `src/main.ts`
- Modify: `tests/render.test.ts`
- Modify: `tests/preferences.test.ts`

**Interfaces:**
- `SetupScreen` and `SettingsScreen` consume a draft `Preferences` value and emit either `save(Preferences)` or `cancel`.
- `App` loads preferences once on startup; if `setupComplete` is false, it renders setup and does not expose the timer or quit path until setup is saved.
- `punch settings` renders `App` with `initialScreen: 'settings'` and uses Ink’s alternate screen.

- [ ] **Step 1: Write failing tests for the setup state machine.** With an empty preferences file, render `App`, assert the first setup step appears and the normal timer/footer does not. Press `Space` to change a choice, `Enter` to advance through clock, visual, and behavior steps, and assert that the saved preference file has `setupComplete: true` before the timer appears. Assert `Esc` backs up one setup step and cannot bypass the flow.

- [ ] **Step 2: Write failing tests for settings interaction.** Render with completed preferences and `initialScreen: 'settings'`; assert selectable rows, use arrows to move, `Space` to change the focused value, `Enter` to save, and `Esc` to discard a changed value. Assert Help/settings copy is not rendered in the same layout.

- [ ] **Step 3: Run targeted tests to verify failure.**

Run: `bun test tests/render.test.ts tests/preferences.test.ts`

Expected: FAIL because preferences are not loaded by `App` and no setup/settings screens exist.

- [ ] **Step 4: Implement the shared preference editor.** Render rows for clock format, font, ring style, ring concept, and last-used-project behavior. Use `Space` to cycle enum values or toggle booleans, `Enter` to save, and `Esc` to cancel/back up. Setup uses the same draft model in three guided steps; settings shows all rows together with a live timer preview.

- [ ] **Step 5: Add first-run gating and settings CLI entry.** In `App`, load preferences before choosing the initial screen. If the file is missing or incomplete, enter setup. In `main.ts`, add `settings` to usage text and render `App({ initialScreen: 'settings' })`; when settings is invoked on an unconfigured install, setup still takes precedence.

- [ ] **Step 6: Run the complete verification suite.**

Run: `bun test && bun run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit setup and settings.**

```bash
git add src/views.tsx src/main.ts src/preferences.ts tests/render.test.ts tests/preferences.test.ts
git commit -m "feat: add first-run setup and settings"
```

### Task 5: Add Help overlay and Activity screen

**Files:**
- Modify: `src/views.tsx`
- Modify: `tests/render.test.ts`
- Modify: `tests/activity.test.ts` only if view-facing fixtures need shared helpers

**Interfaces:**
- Help is opened by `?`, rendered as a centered overlay, and closed by `Esc`.
- Activity is opened by `a` in normal timer mode, starts with `activityForDay(store.history, new Date())`, and owns `activityView: 'sessions' | 'analytics'` plus `activityDate: Date`.
- Activity consumes `ActivitySummary`, `Store.active`, and `Preferences.clockFormat`.

- [ ] **Step 1: Write failing render tests for Help.** Press `?`, assert a centered panel containing the current actions, state-dependent stop confirmation behavior, and `Esc close`; press `Esc` and assert the timer returns.

- [ ] **Step 2: Write failing render tests for Activity navigation.** Press `a`, assert `TODAY`, the Sessions view, session rows with project/start/stop/duration, and `Tab analytics`. Press `Tab`, assert total/session count/average/top project/activity visualization/project breakdown. Press `ArrowLeft` and `ArrowRight`, assert the selected day changes. Press `Esc`, assert return to the timer. Add an empty-day assertion and an active-session assertion that shows an active duration without a fake stop time.

- [ ] **Step 3: Run targeted render tests to verify failure.**

Run: `bun test tests/render.test.ts`

Expected: FAIL because `?` and `a` are currently unhandled.

- [ ] **Step 4: Implement Help as a modal layer.** Keep it read-only, center it within the current terminal size, and route all input to `Esc` close while open. Do not put settings controls or font/ring setup actions in the main footer.

- [ ] **Step 5: Implement Activity Sessions view.** Use `activityForDay` for rows and summary data, format dates according to the persisted clock preference, show chronological sessions, show a friendly empty state, and append an active row with `ACTIVE` plus elapsed duration when applicable.

- [ ] **Step 6: Implement Activity Analytics view.** Use the same selected date and summary; render the agreed metrics and a compact deterministic activity visualization based on session start-hour buckets. Keep the visualization readable in narrow terminals and avoid productivity scores.

- [ ] **Step 7: Implement Activity key handling.** In Activity mode, `Tab` switches the subview, left/right changes by one local day, and `Esc` returns to the timer. Do not let timer shortcuts trigger while Activity or Help is open.

- [ ] **Step 8: Run the full suite and typecheck.**

Run: `bun test && bun run typecheck`

Expected: PASS.

- [ ] **Step 9: Commit Help and Activity.**

```bash
git add src/views.tsx tests/render.test.ts tests/activity.test.ts
git commit -m "feat: add help and activity screens"
```

### Task 6: Persist last-project behavior and finish responsive polish

**Files:**
- Modify: `src/views.tsx`
- Modify: `src/commands.ts`
- Modify: `tests/render.test.ts`
- Modify: `tests/commands.test.ts`

**Interfaces:**
- Do not add a `lastProject` preference field. Derive the reusable project from the most recent session and keep only the `reuseLastProject` boolean in preferences.
- Starting a session continues to call `start(project)` and must still default to `general` when reuse is disabled or no history exists.

- [ ] **Step 1: Write failing tests for the reuse toggle.** With completed preferences and a prior session, assert that starting input is prefilled only when `reuseLastProject` is true. With it false, assert the input is empty. Assert an empty history never creates an empty project.

- [ ] **Step 2: Run the focused render tests to verify failure.**

Run: `bun test tests/render.test.ts`

Expected: FAIL because the current project input always starts empty.

- [ ] **Step 3: Implement opt-in reuse without changing command semantics.** Prefill the input draft from the most recent history project only when enabled; do not silently submit it as a default, and let the user edit or clear it before pressing `Enter`.

- [ ] **Step 4: Add narrow-terminal assertions.** Render the timer, Help, setup, settings, and Activity at representative widths/heights and assert no frame contains a thrown error or loses the primary action text. Reuse the existing compact layout measurement helpers rather than adding a second layout system.

- [ ] **Step 5: Run the final verification commands.**

Run: `bun test && bun run typecheck && git diff --check`

Expected: all tests pass, typecheck passes, and the diff has no whitespace errors.

- [ ] **Step 6: Commit final polish.**

```bash
git add src/views.tsx src/commands.ts tests/render.test.ts tests/commands.test.ts
git commit -m "feat: polish preferences and responsive tui behavior"
```

## Plan self-review

- Spec coverage: main timer, guarded punch-out, logged confirmation, clean footer, Help, mandatory setup, settings command, persisted 12/24-hour choice, optional project reuse, Activity Sessions/Analytics, today default, day navigation, empty/active/error states, and narrow-terminal behavior each have an explicit task.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation step is required; out-of-scope features are named explicitly rather than left open.
- Type consistency: `Preferences`, `ActivitySummary`, `TimerFont`, `RingStyle`, and `RingConcept` are defined before views consume them; `activityForDay` is the single summary projection used by both Activity modes.
- Baseline verification: before implementation, `bun run typecheck` and the existing 33-test suite pass on `main`.
