#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import packageMetadata from '../package.json';
import { goal, start, status, stop } from './commands.js';
import { App } from './views.js';

const VERSION = packageMetadata.version;

const USAGE = `punch - a simple CLI time tracker

Usage: punch [COMMAND]

Commands:
  in [PROJECT]   Punch in: start tracking time on a project (defaults to "general")
  out            Punch out: stop the active session and record it
  status         Show the active session and elapsed time
  goal [HOURS]   Show or set the daily goal (e.g. "punch goal 6" for 6 hours)
  settings       Open the interactive settings screen
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

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case undefined: {
      if (!process.stdin.isTTY) {
        printResult(status());
        return;
      }
      const { waitUntilExit } = render(
        React.createElement(App),
        { alternateScreen: true },
      );
      waitUntilExit();
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
      const { waitUntilExit } = render(
        React.createElement(App, { initialScreen: 'settings' }),
        { alternateScreen: true },
      );
      waitUntilExit();
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

main();
