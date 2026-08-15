import { sessionsOn, type Session } from './store.js';

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

export function activityForDay(history: Session[], date: Date): ActivitySummary {
  const sessions = sessionsOn(history, date).slice().sort((a, b) => a.started_at.getTime() - b.started_at.getTime());
  const projectDurations = new Map<string, number>();
  const totalSecs = sessions.reduce((total, session) => {
    projectDurations.set(session.project, (projectDurations.get(session.project) ?? 0) + session.duration_secs);
    return total + session.duration_secs;
  }, 0);
  const projectTotals = [...projectDurations.entries()]
    .map(([project, durationSecs]) => ({ project, durationSecs }))
    .sort((a, b) => b.durationSecs - a.durationSecs || a.project.localeCompare(b.project));

  return {
    date,
    sessions,
    totalSecs,
    sessionCount: sessions.length,
    averageSecs: sessions.length === 0 ? 0 : Math.floor(totalSecs / sessions.length),
    topProject: projectTotals[0] ?? null,
    projectTotals,
  };
}

export function previousDay(date: Date): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - 1);
  return result;
}

export function nextDay(date: Date): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + 1);
  return result;
}
