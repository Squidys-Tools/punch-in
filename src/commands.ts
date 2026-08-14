import { formatDuration, load, save, type Active } from './store.js';

export const DEFAULT_PROJECT = 'general';

export interface CmdResult {
  ok: boolean;
  message: string;
}

function ok(message: string): CmdResult {
  return { ok: true, message };
}

function fail(message: string): CmdResult {
  return { ok: false, message };
}

export function start(project: string | null): CmdResult {
  const name = project?.trim() || DEFAULT_PROJECT;
  const store = load();
  if (!store.ok) return fail(store.error);
  const data = store.value;
  if (data.active) {
    return fail(`a session is already running for '${data.active.project}'`);
  }
  data.active = {
    project: name,
    started_at: new Date(),
  } satisfies Active;
  const saveErr = save(data);
  if (!saveErr.ok) return fail(saveErr.error);
  return ok(`started tracking '${name}'`);
}

export function stop(): CmdResult {
  const store = load();
  if (!store.ok) return fail(store.error);
  const data = store.value;
  const active = data.active;
  if (!active) {
    return fail('no session is currently running');
  }
  const endedAt = new Date();
  const durationSecs = Math.max(0, Math.floor((endedAt.getTime() - active.started_at.getTime()) / 1000));
  data.history.push({
    project: active.project,
    started_at: active.started_at,
    ended_at: endedAt,
    duration_secs: durationSecs,
  });
  data.active = null;
  const saveErr = save(data);
  if (!saveErr.ok) return fail(saveErr.error);
  return ok(`stopped '${active.project}' after ${formatDuration(durationSecs)}`);
}

export function status(): CmdResult {
  const store = load();
  if (!store.ok) return fail(store.error);
  const active = store.value.active;
  if (active) {
    const elapsed = Math.max(0, Math.floor((Date.now() - active.started_at.getTime()) / 1000));
    return ok(`tracking '${active.project}' for ${formatDuration(elapsed)}`);
  }
  return ok('no session is running');
}
