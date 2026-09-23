#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import React from 'react';
import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import packageMetadata from '../package.json';
import { goal, listDay, start, status, stop } from './commands.js';
import { exportSessions } from './export.js';
import { parseDateArg } from './store.js';
import { dataFilesForRemoval, uninstall } from './uninstall.js';
import { App } from './views.js';

const VERSION = packageMetadata.version;

const USAGE = `punch - a simple CLI time tracker

Usage: punch [COMMAND]

Commands:
  in [PROJECT]   Punch in: start tracking time on a project (defaults to "general")
  out            Punch out: stop the active session and record it
  status         Show the active session and elapsed time
  list [DATE]    List sessions for a day (YYYY-MM-DD, "today", or "yesterday")
  export [FMT]   Print history as CSV (default) or JSON, e.g. "punch export json"
  goal [HOURS]   Show or set the daily goal (e.g. "punch goal 6" for 6 hours)
  settings       Open the interactive settings screen
  uninstall      Remove Punch while preserving data
  help           Print this help

Options:
  -h, --help     Print help
  -v, --version  Print version

With no command, punch opens the interactive TUI.
`;

function printResult(result: { ok: boolean; message: string }): void {
  if (result.ok) {
    console.log(result.message);
  } else {
    console.error(`error: ${result.message}`);
    process.exit(1);
  }
}

async function runTui(initialScreen?: 'settings'): Promise<void> {
  const renderer = await createCliRenderer();
  try {
    const root = createRoot(renderer);
    try {
      if (initialScreen) {
        root.render(React.createElement(App, { initialScreen }));
      } else {
        root.render(React.createElement(App));
      }
      await new Promise<void>((resolve) => {
        if (renderer.isDestroyed) resolve();
        else renderer.once('destroy', () => resolve());
      });
    } finally {
      root.unmount();
    }
  } finally {
    if (!renderer.isDestroyed) renderer.destroy();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case undefined: {
      if (!process.stdin.isTTY) {
        printResult(status());
        return;
      }
      await runTui();
      return;
    }
    case 'in':
    case 'start': {
      printResult(start(args[1] ?? null));
      return;
    }
    case 'out':
    case 'stop': {
      printResult(stop());
      return;
    }
    case 'status': {
      printResult(status());
      return;
    }
    case 'list': {
      const parsed = parseDateArg(args[1]);
      if (!parsed.ok) {
        printResult(parsed);
        return;
      }
      printResult(listDay(parsed.date));
      return;
    }
    case 'export': {
      printResult(exportSessions(args[1] ?? null));
      return;
    }
    case 'goal': {
      const raw = args[1];
      printResult(goal(raw === undefined ? null : Number(raw)));
      return;
    }
    case 'settings': {
      if (!process.stdin.isTTY) {
        console.error('error: settings requires an interactive terminal');
        process.exit(1);
      }
      await runTui('settings');
      return;
    }
    case 'uninstall': {
      const extraArgs = args.slice(1);
      const removeData = extraArgs.includes('--remove-data');
      const unknownArg = extraArgs.find((arg) => arg !== '--remove-data');
      if (unknownArg) {
        printResult({ ok: false, message: `unrecognized uninstall option '${unknownArg}'` });
        return;
      }

      if (!removeData) {
        printResult(uninstall());
        return;
      }

      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        printResult({
          ok: false,
          message: 'uninstall --remove-data requires an interactive terminal confirmation',
        });
        return;
      }

      const dataFiles = dataFilesForRemoval();
      if (!dataFiles.ok) {
        printResult({ ok: false, message: dataFiles.error });
        return;
      }

      console.log('The following Punch data files will be deleted:');
      for (const file of dataFiles.files) console.log(`  ${file}`);
      const prompt = createInterface({ input: process.stdin, output: process.stdout });
      try {
        const answer = (await prompt.question('Type "yes" to continue: ')).trim().toLowerCase();
        printResult(uninstall({ removeData: true, confirmed: answer === 'yes' }));
      } finally {
        prompt.close();
      }
      return;
    }
    case 'help':
    case '-h':
    case '--help': {
      console.log(USAGE);
      return;
    }
    case '-v':
    case '--version': {
      console.log(`punch ${VERSION}`);
      return;
    }
    default: {
      console.error(`error: unrecognized subcommand '${command}'`);
      console.error(USAGE);
      process.exit(2);
    }
  }
}

await main();
