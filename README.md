# punch

`punch` is a small terminal time tracker for project work. Start a session, stop it when you are done, and review the day in the interactive TUI.

It is built with Bun, TypeScript, React, and Ink. Session history is stored in a local JSON file, so there is no server or account to configure.

## Install

For the published package, install Punch globally with npm:

```sh
npm install --global punch
```

Check the installed version with:

```sh
punch --version
```

To remove the npm installation:

```sh
npm uninstall --global punch
```

npm removes the program but does not remove session history or preferences. Those files stay in the data paths described below.

For a standalone Windows install, run the PowerShell installer from the latest GitHub release:

```powershell
irm https://raw.githubusercontent.com/exodus712/punch-in/main/install.ps1 | iex
```

The installer verifies the release checksum, installs `punch.exe` under `%LOCALAPPDATA%\punch\bin`, and leaves session data untouched during upgrades.

For a standalone macOS or Linux install, run:

```sh
curl -fsSL https://raw.githubusercontent.com/exodus712/punch-in/main/install.sh | sh
```

The script detects the operating system and architecture, verifies the release checksum, and installs `punch` under `~/.local/bin`. If that directory is not already on `PATH`, it prints the export command to add to your shell profile.

To remove a standalone install, run:

```powershell
punch uninstall
```

This removes Punch but preserves session history and preferences. To remove those files too, use `punch uninstall --remove-data`; it requires an explicit confirmation and lists the exact files first.

For development or a source checkout, you need [Bun](https://bun.sh/) installed.

```sh
bun install
```

Run the app directly from the checkout:

```sh
bun run start
```

To make the `punch` command available globally from this checkout, link the package after installing:

```sh
bun link
```

You can then use the `punch` commands below from any directory. Alternatively, prefix commands with `bun run start --` when running directly from the checkout. With no command, `punch` opens the TUI in an interactive terminal. On the first launch, it asks for a clock format, visual style, and project-name behavior.

## Command-line use

```text
punch in [PROJECT]    Start a session. The default project is "general".
punch out             Stop the active session and save it.
punch status          Show the active session and elapsed time.
punch goal [HOURS]    Show or set the daily goal.
punch settings        Open settings in the TUI.
punch help            Print command help.
```

`start` is an alias for `in`, and `stop` is an alias for `out`.

Examples:

```sh
punch in research
punch status
punch out
punch goal 6
```

The goal accepts a number greater than 0 and up to 24 hours. It defaults to 8 hours.

## TUI controls

From the main screen:

```text
i       Start a session and enter a project name
o       Ask for confirmation, then stop the active session
a       Open Activity
s       Open Settings
t       Cycle timer fonts
r       Cycle ring styles
c       Cycle ring concepts
?       Show help
q       Quit
```

In Activity, `Tab` switches between Sessions and Analytics, the left and right arrow keys change the day, and `Esc` returns to the timer.

In Settings and first-run setup, `Space` changes the selected value, `Enter` saves or continues, and `Esc` cancels or goes back. Settings include the clock format, timer font, ring style, ring concept, and whether a new session can reuse the last project.

## Activity

Activity opens on the current day. Sessions shows each project, start time, stop time, and duration in chronological order. Analytics shows total time, session count, average session length, the top project, an hourly activity view, and project totals.

The app does not assign a productivity score or collect notes.

## Data files

By default, `punch` stores session history in:

```text
%APPDATA%/punch/punch.json                 When APPDATA is set (including on Windows)
$XDG_CONFIG_HOME/punch/punch.json          When APPDATA is unset and XDG_CONFIG_HOME is set
~/.config/punch/punch.json                 When neither variable is set
```

Set `PUNCH_DATA` to use another history file. Preferences are stored beside it in `preferences.json`, or at the path in `PUNCH_PREFERENCES` if that variable is set.

The files contain local JSON with timestamps, project names, durations, the daily goal, and display preferences. They are created when you save the first session or preference.

## Development

```sh
bun run dev       # Run with watch mode
bun run test      # Run the test suite
bun run typecheck # Check TypeScript without emitting files
bun run preview   # Render timer and ring design samples
bun run build:release # Build standalone release artifacts
bun run verify:package # Pack and test a clean npm installation
```

On Windows, run the installer smoke test after building release artifacts:

```powershell
pwsh -NoProfile -File .\scripts\verify-windows-installer.ps1
```

The source lives in `src/`, tests live in `tests/`, and the preview script writes its plain-text output to `target/preview-ideas.txt`.

## License

MIT. See [LICENSE](MIT%20License).
