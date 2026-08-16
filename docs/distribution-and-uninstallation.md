# Distribution and uninstallation plan

This document describes how Punch should reach users and how each installation method should remove the program without removing user data by accident.

## Goals

- Make the first install a single command for users who do not want to manage runtimes.
- Publish an npm package for Node and Bun users.
- Keep building from source straightforward for contributors.
- Make removal predictable for every install method.
- Preserve session history and preferences unless the user explicitly asks to delete them.

## Supported installation methods

### npm package

The primary package-manager install should be:

```sh
npm install --global punch
```

The published package should contain the built JavaScript entrypoint, production dependencies, and the files needed at runtime. It should not require users to run TypeScript directly.

The package should expose a normal executable through `bin`. The build should target a supported Node version so that the package works with npm. Bun should remain supported for development and source installs.

This path also gives users `npx punch` and, where supported, `bunx punch`.

Uninstallation belongs to npm:

```sh
npm uninstall --global punch
```

`punch uninstall` should detect that Punch came from npm and print this command rather than trying to remove files from inside the package.

### One-line installer

The one-line installer is for users who want Punch without installing Node or Bun.

macOS and Linux should use a shell installer:

```sh
curl -fsSL https://punch.dev/install.sh | sh
```

Windows should use a PowerShell installer:

```powershell
irm https://punch.dev/install.ps1 | iex
```

The installers should detect the operating system and architecture, download the matching release artifact, install it into a user-local directory, and explain any `PATH` change the user needs to make.

The installer should not require administrator access by default. Suggested locations are `~/.local/bin` on macOS and Linux, and `%LOCALAPPDATA%\\punch\\bin` on Windows.

Each install should write a small manifest beside the executable. The manifest should record the installed version, platform, architecture, install directory, and installer version. It gives `punch uninstall` enough information to remove the custom installation later.

The downloaded artifact should have a published checksum. The installer should verify it before moving the executable into place. Release automation should produce the artifacts and checksums from the same version tag.

### Build from source

Contributors and users who prefer source builds should keep using Bun:

```sh
git clone https://github.com/exodus712/punch-in.git
cd punch
bun install
bun run start
```

The source workflow should not install or remove files outside the checkout. `punch uninstall` should explain that the source checkout must be removed manually and should offer the data removal command only if the user requests it.

## Uninstallation behavior

The default command is:

```sh
punch uninstall
```

It removes Punch while preserving session history and preferences.

Deleting data is a separate, explicit operation:

```sh
punch uninstall --remove-data
```

This command must show the exact data files it will delete and require an affirmative confirmation. A declined confirmation must leave both the program and the data untouched.

There will be no `--dry-run` command. The confirmation prompt is enough to show the destructive action before it occurs.

The data removal option should cover the configured paths for:

- session history, normally `punch.json`
- preferences, normally `preferences.json`
- any future Punch-owned files documented as user data

It must respect `PUNCH_DATA` and `PUNCH_PREFERENCES`. It must not delete a parent configuration directory if that directory contains files that Punch did not create.

## Installer-specific behavior

### npm

Print the npm uninstall command and exit. npm owns the package files.

### System package managers

Homebrew, Scoop, WinGet, and similar managers should own their files. If Punch can identify the manager, it should print the matching uninstall command. Punch should not bypass the manager.

### One-line installer

Use the install manifest to locate the executable and related files. On macOS and Linux, a helper can remove the executable after Punch exits. On Windows, the command should start a short-lived helper that waits for Punch to exit before deleting the locked executable.

The uninstaller must only remove paths recorded by the manifest. It must not recursively remove a broad parent directory.

### Source checkout

Print source cleanup instructions and leave the checkout untouched. Data removal remains available through `--remove-data` after confirmation.

## CLI and release work

Implement the work in this order:

1. Centralize the version used by the CLI and package metadata.
2. Add a production build that emits the npm entrypoint under `dist`.
3. Add package tests for a clean npm install and uninstall instructions.
4. Add release builds for the supported Windows, macOS, and Linux targets.
5. Add checksums and the install manifests.
6. Implement installer detection and `punch uninstall`.
7. Add `punch uninstall --remove-data` with confirmation and path-safety checks.
8. Add CI coverage for install, upgrade, uninstall, and data preservation.
9. Document the three install paths in the README.

The first release should support npm, the one-line installers, and source installation. Homebrew, Scoop, and WinGet can follow once the release artifacts and uninstall behavior have been tested on clean machines.
