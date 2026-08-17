import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { uninstall } from '../src/uninstall.js';

let dir: string;
let installDir: string;
let executable: string;
let manifestFile: string;
let dataPath: string;
let preferencesPath: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'punch-uninstall-'));
  installDir = path.join(dir, 'bin');
  mkdirSync(installDir, { recursive: true });
  executable = path.join(installDir, process.platform === 'win32' ? 'punch.exe' : 'punch');
  manifestFile = path.join(installDir, 'punch-install.json');
  dataPath = path.join(dir, 'data', 'punch.json');
  preferencesPath = path.join(dir, 'data', 'preferences.json');

  writeFileSync(executable, 'fake executable');
  writeFileSync(
    manifestFile,
    `${JSON.stringify({
      name: 'punch',
      version: '0.1.0',
      platform: process.platform === 'win32' ? 'windows' : 'linux',
      architecture: 'x64',
      installDirectory: installDir,
      executable,
      installerVersion: '1',
    })}\n`,
  );
  mkdirSync(path.dirname(dataPath), { recursive: true });
  writeFileSync(dataPath, '{}\n');
  writeFileSync(preferencesPath, '{}\n');

  process.env.PUNCH_INSTALL_MANIFEST = manifestFile;
  process.env.PUNCH_DATA = dataPath;
  process.env.PUNCH_PREFERENCES = preferencesPath;
});

afterEach(() => {
  delete process.env.PUNCH_INSTALL_MANIFEST;
  delete process.env.PUNCH_DATA;
  delete process.env.PUNCH_PREFERENCES;
  rmSync(dir, { recursive: true, force: true });
});

describe('uninstall', () => {
  test('removes the installed program while preserving data by default', () => {
    const result = uninstall({ manifestFile });

    expect(result.ok).toBe(true);
    expect(existsSync(executable)).toBe(false);
    expect(existsSync(manifestFile)).toBe(false);
    expect(existsSync(dataPath)).toBe(true);
    expect(existsSync(preferencesPath)).toBe(true);
  });

  test('requires confirmation before removing data', () => {
    const result = uninstall({ manifestFile, removeData: true, confirmed: false });

    expect(result.ok).toBe(false);
    expect(existsSync(executable)).toBe(true);
    expect(existsSync(manifestFile)).toBe(true);
    expect(existsSync(dataPath)).toBe(true);
    expect(existsSync(preferencesPath)).toBe(true);
  });

  test('removes the configured data files after confirmation', () => {
    const result = uninstall({ manifestFile, removeData: true, confirmed: true });

    expect(result.ok).toBe(true);
    expect(existsSync(executable)).toBe(false);
    expect(existsSync(manifestFile)).toBe(false);
    expect(existsSync(dataPath)).toBe(false);
    expect(existsSync(preferencesPath)).toBe(false);
  });

  test('rejects a manifest that points outside its install directory', () => {
    const outsideExecutable = path.join(dir, 'outside.exe');
    writeFileSync(outsideExecutable, 'must remain');
    writeFileSync(
      manifestFile,
      JSON.stringify({
        name: 'punch',
        installDirectory: installDir,
        executable: outsideExecutable,
      }),
    );

    const result = uninstall({ manifestFile, removeData: true, confirmed: true });

    expect(result.ok).toBe(false);
    expect(existsSync(outsideExecutable)).toBe(true);
    expect(existsSync(manifestFile)).toBe(true);
    expect(existsSync(dataPath)).toBe(true);
    expect(existsSync(preferencesPath)).toBe(true);
  });
});
