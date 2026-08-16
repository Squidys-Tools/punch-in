import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import packageMetadata from '../package.json';

type ReleaseTarget = {
  target: Bun.Build.CompileTarget;
  platform: 'windows' | 'macos' | 'linux';
  architecture: 'x64' | 'arm64';
  file: string;
};

type ReleaseArtifact = {
  target: Bun.Build.CompileTarget;
  platform: ReleaseTarget['platform'];
  architecture: ReleaseTarget['architecture'];
  file: string;
  sha256: string;
};

type ReleaseManifest = {
  name: string;
  version: string;
  artifacts: ReleaseArtifact[];
};

const projectDir = path.resolve(import.meta.dirname, '..');
const outputDir = path.resolve(
  process.env.RELEASE_OUTPUT_DIR ?? path.join(projectDir, 'dist', 'releases'),
);
const version = packageMetadata.version;
const expectedTag = `v${version}`;
const releaseTag = process.env.GITHUB_REF_NAME;

const targets = [
  {
    target: 'bun-windows-x64',
    platform: 'windows',
    architecture: 'x64',
    file: `punch-v${version}-windows-x64.exe`,
  },
  {
    target: 'bun-darwin-arm64',
    platform: 'macos',
    architecture: 'arm64',
    file: `punch-v${version}-macos-arm64`,
  },
  {
    target: 'bun-darwin-x64',
    platform: 'macos',
    architecture: 'x64',
    file: `punch-v${version}-macos-x64`,
  },
  {
    target: 'bun-linux-x64-baseline',
    platform: 'linux',
    architecture: 'x64',
    file: `punch-v${version}-linux-x64`,
  },
  {
    target: 'bun-linux-arm64',
    platform: 'linux',
    architecture: 'arm64',
    file: `punch-v${version}-linux-arm64`,
  },
] satisfies readonly ReleaseTarget[];

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

if (releaseTag !== undefined && releaseTag !== expectedTag) {
  throw new Error(`Release tag ${releaseTag} does not match package version ${expectedTag}`);
}

mkdirSync(outputDir, { recursive: true });

for (const target of targets) {
  const outputPath = path.join(outputDir, target.file);
  const checksumPath = `${outputPath}.sha256`;
  for (const stalePath of [outputPath, checksumPath]) {
    if (existsSync(stalePath)) {
      rmSync(stalePath);
    }
  }

  const result = await Bun.build({
    entrypoints: [path.join(projectDir, 'src', 'main.ts')],
    compile: {
      target: target.target,
      outfile: outputPath,
      autoloadDotenv: false,
      autoloadBunfig: false,
    },
    minify: true,
  });

  if (!result.success) {
    throw new Error(`Failed to build ${target.target}: ${result.logs.join('\n')}`);
  }

  const digest = sha256(outputPath);
  writeFileSync(checksumPath, `${digest}  ${target.file}\n`);
}

const artifacts: ReleaseArtifact[] = targets.map((target) => {
  const filePath = path.join(outputDir, target.file);
  return {
    target: target.target,
    platform: target.platform,
    architecture: target.architecture,
    file: target.file,
    sha256: sha256(filePath),
  };
});

const manifest: ReleaseManifest = {
  name: packageMetadata.name,
  version,
  artifacts,
};
writeFileSync(
  path.join(outputDir, 'release-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

console.log(`Built ${artifacts.length} standalone ${packageMetadata.name}@${version} releases.`);
