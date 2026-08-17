import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { preferencesFile } from './preferences.js';
import { dataFile } from './store.js';

export interface UninstallResult {
  ok: boolean;
  message: string;
}

export interface UninstallOptions {
  removeData?: boolean;
  confirmed?: boolean;
  manifestFile?: string;
}

export type DataFilesResult =
  | { ok: true; files: readonly string[] }
  | { ok: false; error: string };

interface InstallManifest {
  name: 'punch';
  installDirectory: string;
  executable: string;
}

interface InstallManifestLocation {
  file: string;
  manifest: InstallManifest;
}

export function dataFilesForRemoval(): DataFilesResult {
  const configured = [dataFile(), preferencesFile()];
  const files: string[] = [];

  for (const file of configured) {
    const normalized = normalizeDataFile(file);
    if (!normalized.ok) return normalized;
    if (!files.some((existing) => samePath(existing, normalized.path))) {
      files.push(normalized.path);
    }
  }

  return { ok: true, files };
}

export function uninstall(options: UninstallOptions = {}): UninstallResult {
  const removeData = options.removeData ?? false;
  const confirmed = options.confirmed ?? !removeData;
  const dataFiles = dataFilesForRemoval();
  if (!dataFiles.ok) return uninstallFail(dataFiles.error);

  if (removeData && !confirmed) {
    return uninstallFail(`Data removal was not confirmed. No files were changed. Files: ${dataFiles.files.join(', ')}`);
  }

  const location = locateInstallManifest(options.manifestFile);
  if (!location.ok) return uninstallFail(location.error);

  if (removeData) {
    const removedData = removeFiles(dataFiles.files, 'data');
    if (!removedData.ok) return removedData;
  }

  if (!location.value) {
    const dataMessage = removeData
      ? ` Removed data files: ${dataFiles.files.join(', ')}.`
      : ' Session data and preferences were preserved.';
    if (isNpmInstall()) {
      return ok(`Punch is installed by npm. Run npm uninstall --global punch.${dataMessage}`);
    }
    return ok(`Punch is running from a source checkout. Remove the checkout manually.${dataMessage}`);
  }

  const removedProgram = removeInstalledProgram(location.value);
  if (!removedProgram.ok) return removedProgram;

  const dataMessage = removeData
    ? ` Removed data files: ${dataFiles.files.join(', ')}.`
    : ' Session data and preferences were preserved.';
  return ok(`Removed Punch from ${location.value.manifest.installDirectory}.${dataMessage}`);
}

function locateInstallManifest(explicitFile?: string):
  | { ok: true; value: InstallManifestLocation | null }
  | { ok: false; error: string } {
  const candidates = explicitFile
    ? [explicitFile]
    : manifestCandidates();
  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  if (!existing) return { ok: true, value: null };

  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(existing, 'utf8'));
    const manifest = parseManifest(parsed, existing);
    if (!manifest.ok) return manifest;
    return { ok: true, value: { file: existing, manifest: manifest.value } };
  } catch (error) {
    return fail(`failed to read install manifest ${existing}: ${errorMessage(error)}`);
  }
}

function manifestCandidates(): string[] {
  const candidates: string[] = [];
  const configured = process.env.PUNCH_INSTALL_MANIFEST;
  if (configured) candidates.push(path.resolve(configured));

  for (const executable of [process.execPath, process.argv[1]]) {
    if (!executable) continue;
    const candidate = path.join(path.dirname(path.resolve(executable)), 'punch-install.json');
    if (!candidates.some((existing) => samePath(existing, candidate))) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

function parseManifest(
  value: unknown,
  file: string,
): { ok: true; value: InstallManifest } | { ok: false; error: string } {
  if (!isRecord(value) || value.name !== 'punch') {
    return fail(`invalid Punch install manifest ${file}: expected name 'punch'`);
  }

  const installDirectory = absoluteString(value.installDirectory, 'installDirectory');
  if (!installDirectory.ok) return fail(`invalid Punch install manifest ${file}: ${installDirectory.error}`);
  const executable = absoluteString(value.executable, 'executable');
  if (!executable.ok) return fail(`invalid Punch install manifest ${file}: ${executable.error}`);

  const expectedManifest = path.join(installDirectory.value, 'punch-install.json');
  if (!samePath(file, expectedManifest)) {
    return fail(`invalid Punch install manifest ${file}: it must live beside the installed executable`);
  }

  if (!samePath(path.dirname(executable.value), installDirectory.value)) {
    return fail(`invalid Punch install manifest ${file}: executable is outside installDirectory`);
  }

  const executableName = process.platform === 'win32' ? 'punch.exe' : 'punch';
  if (path.basename(executable.value).toLowerCase() !== executableName.toLowerCase()) {
    return fail(`invalid Punch install manifest ${file}: unexpected executable name`);
  }

  return {
    ok: true,
    value: {
      name: 'punch',
      installDirectory: installDirectory.value,
      executable: executable.value,
    },
  };
}

function absoluteString(value: unknown, field: string):
  | { ok: true; value: string }
  | { ok: false; error: string } {
  if (typeof value !== 'string' || value.length === 0 || !path.isAbsolute(value)) {
    return { ok: false, error: `${field} must be an absolute path` };
  }
  return { ok: true, value: path.normalize(value) };
}

function normalizeDataFile(file: string):
  | { ok: true; path: string }
  | { ok: false; error: string } {
  const normalized = path.normalize(path.isAbsolute(file) ? file : path.resolve(file));
  const root = path.parse(normalized).root;
  if (samePath(normalized, root)) {
    return fail(`refusing to remove data path '${normalized}': it is a filesystem root`);
  }

  try {
    if (fs.existsSync(normalized) && fs.lstatSync(normalized).isDirectory()) {
      return fail(`refusing to remove data path '${normalized}': it is a directory`);
    }
  } catch (error) {
    return fail(`failed to inspect data path ${normalized}: ${errorMessage(error)}`);
  }

  return { ok: true, path: normalized };
}

function removeFiles(files: readonly string[], kind: string): UninstallResult {
  try {
    for (const file of files) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  } catch (error) {
    return uninstallFail(`failed to remove ${kind}: ${errorMessage(error)}`);
  }
  return ok('');
}

function removeInstalledProgram(location: InstallManifestLocation): UninstallResult {
  const files = [location.manifest.executable, location.file];
  const runningExecutable = samePath(location.manifest.executable, process.execPath);

  if (runningExecutable && process.platform === 'win32') {
    const scheduled = scheduleWindowsRemoval(files);
    if (!scheduled.ok) return scheduled;
  } else {
    const removed = removeFiles(files, 'installed program');
    if (!removed.ok) return removed;
  }

  removeUserPathEntry(location.manifest.installDirectory);
  return ok('');
}

function scheduleWindowsRemoval(files: readonly string[]): UninstallResult {
  const helperFile = path.join(os.tmpdir(), `punch-uninstall-${process.pid}-${Date.now()}.cmd`);
  const script = [
    '@echo off',
    ':wait_for_parent',
    `tasklist /FI "PID eq ${process.pid}" | findstr /C:"${process.pid}" >nul`,
    'if not errorlevel 1 (timeout /t 1 /nobreak >nul & goto wait_for_parent)',
    `del /f /q "${files[0]}" >nul 2>&1`,
    `del /f /q "${files[1]}" >nul 2>&1`,
    'del /f /q "%~f0" >nul 2>&1',
  ].join('\r\n');

  try {
    fs.writeFileSync(helperFile, `${script}\r\n`);
    const child = spawn('cmd.exe', ['/d', '/c', 'start', '""', '/b', 'cmd.exe', '/d', '/c', `"${helperFile}"`], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  } catch (error) {
    return uninstallFail(`failed to schedule installed program removal: ${errorMessage(error)}`);
  }
  return ok('');
}

function removeUserPathEntry(directory: string): void {
  if (process.platform !== 'win32') return;
  const script = [
    '$directory = [IO.Path]::GetFullPath($env:PUNCH_UNINSTALL_DIRECTORY)',
    '$current = [Environment]::GetEnvironmentVariable("Path", "User")',
    'if ($null -ne $current) {',
    '  $entries = foreach ($entry in ($current -split ";")) {',
    '    if (-not $entry) { continue }',
    '    try { if ([IO.Path]::GetFullPath($entry) -ine $directory) { $entry } } catch { $entry }',
    '  }',
    '  [Environment]::SetEnvironmentVariable("Path", ($entries -join ";"), "User")',
    '}',
  ].join(' ');
  spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, PUNCH_UNINSTALL_DIRECTORY: directory },
  });
}

function isNpmInstall(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.normalize(entry).split(path.sep).some((part) => part.toLowerCase() === 'node_modules');
}

function samePath(a: string, b: string): boolean {
  const left = path.normalize(a).replace(/[\\/]$/, '');
  const right = path.normalize(b).replace(/[\\/]$/, '');
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ok(message: string): UninstallResult {
  return { ok: true, message };
}

function uninstallFail(message: string): UninstallResult {
  return { ok: false, message };
}

function fail(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
