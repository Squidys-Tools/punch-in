import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface Active {
  project: string;
  started_at: Date;
}

export interface Session {
  project: string;
  started_at: Date;
  ended_at: Date;
  duration_secs: number;
}

export interface Store {
  active: Active | null;
  history: Session[];
}

function configDir(): string {
  if (process.env.APPDATA) {
    return process.env.APPDATA;
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) {
    return xdg;
  }
  return path.join(os.homedir(), '.config');
}

export function dataFile(): string {
  if (process.env.PUNCH_DATA) {
    return process.env.PUNCH_DATA;
  }
  return path.join(configDir(), 'punch', 'punch.json');
}

export function load(): Result<Store> {
  return loadPath(dataFile());
}

export function save(store: Store): Result<void> {
  return savePath(dataFile(), store);
}

export function loadPath(file: string): Result<Store> {
  if (!fs.existsSync(file)) {
    return ok({ active: null, history: [] });
  }
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return errValue(`failed to read ${file}: ${errMsg(err)}`);
  }
  try {
    const parsed = JSON.parse(raw, reviveDates);
    const store = parsed as Partial<Store>;
    return ok({
      active:
        store.active && typeof store.active === 'object'
          ? {
              project: String(store.active.project ?? ''),
              started_at: asDate(store.active.started_at),
            }
          : null,
      history: Array.isArray(store.history)
        ? store.history.map((s) => ({
            project: String(s.project ?? ''),
            started_at: asDate(s.started_at),
            ended_at: asDate(s.ended_at),
            duration_secs: Number(s.duration_secs ?? 0),
          }))
        : [],
    });
  } catch (err) {
    return errValue(`corrupt data file ${file}: ${errMsg(err)}`);
  }
}

export function savePath(file: string, store: Store): Result<void> {
  const parent = path.dirname(file);
  if (parent) {
    fs.mkdirSync(parent, { recursive: true });
  }
  const raw = JSON.stringify(serializeStore(store), null, 2);
  try {
    fs.writeFileSync(file, raw + '\n');
  } catch (err) {
    return errValue(`failed to write ${file}: ${errMsg(err)}`);
  }
  return ok(undefined);
}

function serializeStore(store: Store): unknown {
  return {
    active: store.active
      ? {
          project: store.active.project,
          started_at: toRfc3339Local(store.active.started_at),
        }
      : null,
    history: store.history.map((s) => ({
      project: s.project,
      started_at: toRfc3339Local(s.started_at),
      ended_at: toRfc3339Local(s.ended_at),
      duration_secs: s.duration_secs,
    })),
  };
}

export function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export function todaySessions(history: Session[]): Session[] {
  return history.filter((s) => isSameDay(s.started_at, new Date()));
}

export function totalOn(history: Session[], date: Date): number {
  return history
    .filter((s) => isSameDay(s.started_at, date))
    .reduce((sum, s) => sum + s.duration_secs, 0);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function elapsedSeconds(active: Active | null, now: Date = new Date()): number {
  if (!active) return 0;
  return Math.max(0, Math.floor((now.getTime() - active.started_at.getTime()) / 1000));
}

// ---------- helpers ----------

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function errValue(error: string): Result<never> {
  return { ok: false, error };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function asDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === 'string') return new Date(v);
  return new Date(0);
}

function reviveDates(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return value;
}

export function toRfc3339Local(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${base}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
