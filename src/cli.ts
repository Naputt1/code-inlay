#!/usr/bin/env node
import { compile, compileWithWatch, printDiagnostics } from "./compiler.js";

type CliArgs = {
  command: "generate" | "check" | "diff" | "watch";
  configFile: string;
  cwd: string;
  module?: string;
  route?: string;
  forceRegion?: string;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "watch") {
    await compileWithWatch({
      configFile: args.configFile,
      cwd: args.cwd,
      module: args.module,
      route: args.route,
      forceRegion: args.forceRegion,
      watch: true,
    });
    return;
  }

  const result = await compile({
    configFile: args.configFile,
    cwd: args.cwd,
    module: args.module,
    route: args.route,
    check: args.command === "check" || args.command === "diff",
    forceRegion: args.forceRegion,
  });

  printDiagnostics(result.diagnostics);

  const hasErrors = result.diagnostics.some((diagnostic) => diagnostic.level === "error");
  if (hasErrors) {
    process.exitCode = 1;
    return;
  }

  if (args.command === "diff") {
    for (const diff of result.diffs) {
      console.log(`--- ${diff.path}`);
      console.log(`+++ ${diff.path}`);
      console.log(renderSimpleDiff(diff.before, diff.after));
    }
  } else if (result.changedFiles.length > 0) {
    console.log(
      `${args.command === "check" ? "Would update" : "Updated"} ${result.changedFiles.length} file(s):`,
    );
    for (const file of result.changedFiles) {
      console.log(`  - ${file}`);
    }

    if (result.dependencyGraph) {
      const regionCount = Object.keys(result.dependencyGraph.nodes).filter(
        (id) => result.dependencyGraph!.nodes[id].kind === "generated-region",
      ).length;
      console.log(`  (${regionCount} generated regions)`);
    }
  } else {
    console.log("No changes.");
  }

  if (args.command === "check" && result.changedFiles.length > 0) {
    process.exitCode = 1;
  }
}

function parseArgs(argv: string[]): CliArgs {
  const command = argv[0];
  if (
    command !== "generate" &&
    command !== "check" &&
    command !== "diff" &&
    command !== "watch"
  ) {
    throw new Error(
      "Usage: backend-gen <generate|check|diff|watch> --config backend.config.ts [--module name] [--route id] [--force-region id]",
    );
  }

  const args: CliArgs = {
    command,
    configFile: "backend.config.ts",
    cwd: process.cwd(),
  };

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--config" && next) {
      args.configFile = next;
      index += 1;
    } else if (arg === "--cwd" && next) {
      args.cwd = next;
      index += 1;
    } else if (arg === "--module" && next) {
      args.module = next;
      index += 1;
    } else if (arg === "--route" && next) {
      args.route = next;
      index += 1;
    } else if (arg === "--force-region" && next) {
      args.forceRegion = next;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument "${arg}".`);
    }
  }

  return args;
}

function renderSimpleDiff(before: string, after: string): string {
  if (before === after) return "";
  return ["@@ before", before.trimEnd(), "@@ after", after.trimEnd()].join("\n");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
