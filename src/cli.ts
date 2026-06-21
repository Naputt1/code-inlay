#!/usr/bin/env node
import { parseArgs } from "./cli/index.js";
import { generateCommand } from "./cli/generate.js";
import { checkCommand } from "./cli/check.js";
import { diffCommand } from "./cli/diff.js";
import { devCommand } from "./cli/dev.js";
import { pluginCommand } from "./cli/plugin.js";
import { inspectCommand } from "./cli/inspect.js";
import { docsCommand } from "./cli/docs.js";
import { initCommand } from "./cli/init.js";

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  switch (parsed.command) {
    case "generate":
      return generateCommand(parsed);
    case "check":
      return checkCommand(parsed);
    case "diff":
      return diffCommand(parsed);
    case "watch":
    case "dev":
      return devCommand(parsed);
    case "plugin":
      return pluginCommand(parsed);
    case "inspect":
      return inspectCommand(parsed);
    case "docs":
      return docsCommand(parsed);
    case "init":
      return initCommand(parsed);
    default: {
      const { printHelp } = await import("./cli/index.js");
      printHelp();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
