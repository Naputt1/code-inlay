#!/usr/bin/env node
import { generateCommand } from "./generate.js";
import { checkCommand } from "./check.js";
import { diffCommand } from "./diff.js";
import { devCommand } from "./dev.js";
import { pluginCommand } from "./plugin.js";
import { inspectCommand } from "./inspect.js";
import { docsCommand } from "./docs.js";
import { initCommand } from "./init.js";

export type ParsedArgs = {
  command: string;
  subcommand?: string;
  args: string[];
  flags: Record<string, string | boolean | string[]>;
};

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  switch (parsed.command) {
    case "generate":
      await generateCommand(parsed);
      break;
    case "check":
      await checkCommand(parsed);
      break;
    case "diff":
      await diffCommand(parsed);
      break;
    case "watch":
    case "dev":
      await devCommand(parsed);
      break;
    case "plugin":
      await pluginCommand(parsed);
      break;
    case "inspect":
      await inspectCommand(parsed);
      break;
    case "docs":
      await docsCommand(parsed);
      break;
    case "init":
      await initCommand(parsed);
      break;
    case "help":
    default:
      printHelp();
  }
}

export function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] ?? "help";
  const flags: Record<string, string | boolean | string[]> = {};
  const args: string[] = [];
  let i = 1;

  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const eqIndex = arg.indexOf("=");
      if (eqIndex !== -1) {
        const key = arg.slice(2, eqIndex);
        const value = arg.slice(eqIndex + 1);
        setFlag(flags, key, value);
      } else {
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith("--")) {
          setFlag(flags, key, next);
          i += 1;
        } else {
          setFlag(flags, key, true);
        }
      }
    } else {
      args.push(arg);
    }
    i += 1;
  }

  const subCommands = ["plugin", "inspect", "docs"];
  const subcommand = subCommands.includes(command) ? args[0] : undefined;
  const subArgs = subcommand ? args.slice(1) : args;

  return { command, subcommand, args: subArgs, flags };
}

function setFlag(
  flags: Record<string, string | boolean | string[]>,
  key: string,
  value: string | boolean,
): void {
  const kebab = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  if (kebab in flags) {
    const existing = flags[kebab];
    if (Array.isArray(existing)) {
      (flags[kebab] as string[]).push(value as string);
    } else {
      flags[kebab] = [existing as string, value as string];
    }
  } else {
    flags[kebab] = value;
  }
}

export function printHelp(): void {
  console.log(`Usage: backend-gen <command> [options]

Commands:
  generate                     Full compile + write files
  check                        Dry-run, exit 1 on changes
  diff                         Show pending changes
  dev                          Watch mode with live-reload
  plugin <add|remove|list|update>  Plugin management
  inspect <ast|route|regions|plugins|graph>  Introspection
  docs <api|markdown|diagram>  Documentation generation
  init                         Scaffold a new project

Options:
  --config <path>              Config file path (default: backend.config.ts)
  --cwd <path>                 Working directory (default: cwd)
  --module <name>              Filter to single module
  --route <id>                 Filter to single route
  --force-region <id>          Override drift protection
  --format <tree|json|mermaid> Output format (for inspect commands)
  `);
}

// cli/index.ts is a module of sub-commands; main entry is src/cli.ts
