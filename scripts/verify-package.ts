import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(object: JsonObject, key: string): string {
  const value = object[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Expected ${key} to be a non-empty string`);
  }
  return value;
}

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): string {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
}

const projectDir = path.resolve(import.meta.dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const bunCommand = process.platform === 'win32' ? 'bun.exe' : 'bun';
const packDir = mkdtempSync(path.join(os.tmpdir(), 'punch-pack-'));
const installDir = mkdtempSync(path.join(os.tmpdir(), 'punch-install-'));

try {
  const packageMetadata: unknown = JSON.parse(
    readFileSync(path.join(projectDir, 'package.json'), 'utf8'),
  );
  if (!isJsonObject(packageMetadata)) {
    throw new Error('package.json must contain an object');
  }

  const packageName = requiredString(packageMetadata, 'name');
  const packageVersion = requiredString(packageMetadata, 'version');
  run(bunCommand, ['run', 'build'], projectDir, process.env);
  const packOutput = run(
    npmCommand,
    ['pack', '--ignore-scripts', '--json', '--pack-destination', packDir],
    projectDir,
    process.env,
  );
  const packResults: unknown = JSON.parse(packOutput);
  if (!Array.isArray(packResults) || packResults.length !== 1 || !isJsonObject(packResults[0])) {
    throw new Error('npm pack did not return one package result');
  }

  const archiveName = requiredString(packResults[0], 'filename');
  const archivePath = path.resolve(packDir, archiveName);
  if (path.dirname(archivePath) !== path.resolve(packDir)) {
    throw new Error('npm pack returned an archive outside the temporary pack directory');
  }

  run(
    npmCommand,
    ['install', '--no-save', '--ignore-scripts', archivePath],
    installDir,
    process.env,
  );

  const cliEnvironment = {
    ...process.env,
    PUNCH_DATA: path.join(installDir, 'data', 'punch.json'),
  };
  const versionOutput = run(
    npmCommand,
    ['exec', '--prefix', installDir, '--', 'punch', '--version'],
    installDir,
    cliEnvironment,
  );
  if (versionOutput !== `${packageName} ${packageVersion}`) {
    throw new Error(`Unexpected installed version output: ${versionOutput}`);
  }

  const statusOutput = run(
    npmCommand,
    ['exec', '--prefix', installDir, '--', 'punch', 'status'],
    installDir,
    cliEnvironment,
  );
  if (statusOutput !== 'no session is running') {
    throw new Error(`Unexpected installed status output: ${statusOutput}`);
  }

  const readme = readFileSync(path.join(projectDir, 'README.md'), 'utf8');
  if (!readme.includes('npm uninstall --global punch')) {
    throw new Error('README.md is missing the npm uninstall command');
  }

  console.log(`Verified ${packageName}@${packageVersion} from a clean npm install.`);
} finally {
  rmSync(packDir, { recursive: true, force: true });
  rmSync(installDir, { recursive: true, force: true });
}
