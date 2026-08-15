# Punch TUI Experience Design

## Goal

Make Punch feel polished, playful, and expressive while keeping the everyday timer calm, readable, and fast to use. The interface should make the current state obvious without becoming a dense power-user dashboard.

## Design principles

- The timer remains the visual hero.
- Frequent actions stay directly accessible; infrequent customization moves into dedicated screens.
- Visual personality comes from color, typography, rings, and restrained feedback rather than constant motion or decoration.
- Activity data is concrete and non-judgmental: show what was tracked, not productivity scores.
- Small terminals remain usable through the existing compact layout behavior.

## Main timer

The main screen keeps the existing timer, project, and ring composition, but strengthens state communication.

When idle, the centered body should invite the user to start tracking. When a session is active, the elapsed timer is the hero and the project receives a distinct live treatment, such as a status marker or `TRACKING` label. The active state should also make the next action clear without adding permanent button chrome.

Punch-out is a guarded interaction. Choosing stop changes the body/footer into a confirmation state showing the project and elapsed duration. `Enter` or an explicit confirmation key completes the stop; `Esc` cancels and returns to the active timer.

After a successful stop, show a temporary confirmation in the status area using language such as `Logged 01:24:18 to “Research”`. This is confirmation of the recorded result, not a generic success log.

The everyday footer should advertise only high-frequency actions:

```text
a activity · ? help · i start · o stop · q quit
```

The exact footer wording may adapt to the current state, for example showing `o stop` only while active.

## Help overlay

`?` opens a lightweight centered overlay. `Esc` closes it.

Help answers “What can I do right now?” It lists the current keyboard controls, explains state-dependent actions, and briefly describes the active visual settings/ring when useful. It does not provide editable controls and should not become a second settings screen.

## First-run setup

First launch requires a short setup flow before the main timer is available. The flow is a guided personalization moment, not a form.

Each step previews the choice in the actual timer presentation:

1. Clock format: 12-hour or 24-hour.
2. Visual style: timer font, ring style, and ring concept, shown with a live preview.
3. Behavior: whether starting a session may suggest or reuse the last-used project.

`Space` changes the focused choice, `Enter` saves/advances, and `Esc` backs up to the previous step where applicable. The flow ends with a brief ready state before entering the timer. Sensible defaults should be visible and selectable, but the user must complete the setup before entering the main timer.

## Settings

The `settings` command opens a dedicated settings screen with a more structured layout than Help. It shows selectable rows, current values, and a live preview where visual settings are involved.

Interaction model:

- Arrow keys move between rows/options.
- `Space` changes or toggles the focused setting.
- `Enter` saves the current choices.
- `Esc` cancels unsaved changes or returns to the timer.

Settings include clock format, timer font, ring style, ring concept, and the optional last-used-project behavior. Preferences persist between launches. Reduced-motion and other accessibility controls can be added as a later settings expansion.

## Activity

`a` opens a dedicated Activity screen focused on today. It opens to the Sessions view because exact records are the primary source of truth.

Activity navigation:

- `Tab` switches between Sessions and Analytics.
- `←`/`→` moves to the previous or next day.
- `Esc` returns to the timer.

Date ranges such as week and month are intentionally out of scope for the first version.

### Sessions view

The screen shows the selected date, total tracked time, and number of sessions, followed by chronological sessions. Each row includes project, start time, stop time, and duration. No notes are collected.

Example:

```text
TODAY · AUG 14, 2026
04:18:32 tracked · 3 sessions

  Research       09:12 AM → 10:36 AM   01:24:18
  Writing        11:05 AM → 12:17 PM   01:12:44
  Admin          02:02 PM → 03:43 PM   01:41:30

Tab analytics · ←→ day · Esc back
```

### Analytics view

Analytics summarizes the same selected day without assigning a productivity score. It includes total tracked time, session count, average session length, most-used project, a compact activity visualization, and a project breakdown.

## Data requirements

Existing session records must support project, start time, stop time, and duration. The design does not add notes or other free-form session metadata. Preferences are stored separately from session history so changing presentation settings does not alter logged work.

## Error and edge states

- If there are no sessions for a selected day, show a friendly empty state and retain day navigation.
- If a session is currently active, Activity should identify it as active and avoid presenting a misleading stop time.
- If settings cannot be saved, retain the current screen and show a clear error without losing the user’s unsaved selections.
- If the terminal is too small, reuse the existing compact strategy and prioritize timer state, project, and actionable controls.

## Initial scope

This design covers the main TUI polish, help overlay, mandatory first-run setup, settings screen, punch-out confirmation, persisted display preferences, and today-focused Activity with Sessions/Analytics modes. Weekly/monthly analytics, notes, productivity scoring, and a general command palette are later enhancements.
