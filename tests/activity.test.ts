import { describe, expect, test } from 'bun:test';
import { activityForDay, nextDay, previousDay } from '../src/activity.js';
import type { Session } from '../src/store.js';

function session(
  project: string,
  started: [number, number, number, number],
  durationSecs: number,
): Session {
  const start = new Date(started[0], started[1], started[2], started[3], 0, 0);
  return {
    project,
    started_at: start,
    ended_at: new Date(start.getTime() + durationSecs * 1000),
    duration_secs: durationSecs,
  };
}

const day = new Date(2026, 7, 14, 12, 0, 0);
const history = [
  session('Writing', [2026, 7, 14, 11], 120),
  session('Research', [2026, 7, 14, 9], 300),
  session('Research', [2026, 7, 14, 13], 600),
  session('Yesterday', [2026, 7, 13, 23], 900),
];

describe('activity summaries', () => {
  test('filters sessions to the selected day in chronological order', () => {
    const summary = activityForDay(history, day);
    expect(summary.sessions.map((item) => item.project)).toEqual(['Research', 'Writing', 'Research']);
    expect(summary.sessionCount).toBe(3);
    expect(summary.totalSecs).toBe(1020);
  });

  test('calculates average and project totals with a stable order', () => {
    const summary = activityForDay(history, day);
    expect(summary.averageSecs).toBe(340);
    expect(summary.projectTotals).toEqual([
      { project: 'Research', durationSecs: 900 },
      { project: 'Writing', durationSecs: 120 },
    ]);
    expect(summary.topProject).toEqual({ project: 'Research', durationSecs: 900 });
  });

  test('returns a useful empty summary', () => {
    const summary = activityForDay(history, new Date(2026, 7, 12, 12));
    expect(summary.sessions).toEqual([]);
    expect(summary.totalSecs).toBe(0);
    expect(summary.sessionCount).toBe(0);
    expect(summary.averageSecs).toBe(0);
    expect(summary.topProject).toBeNull();
    expect(summary.projectTotals).toEqual([]);
  });

  test('moves one local calendar day at a time', () => {
    expect(previousDay(day)).toEqual(new Date(2026, 7, 13, 12));
    expect(nextDay(day)).toEqual(new Date(2026, 7, 15, 12));
  });
});
