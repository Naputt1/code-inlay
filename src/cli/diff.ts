import { compile, printDiagnostics } from "../compiler.js";
import type { ParsedArgs } from "./index.js";

export async function diffCommand(parsed: ParsedArgs): Promise<void> {
  const cwd = (parsed.flags.cwd as string) ?? process.cwd();
  const configFile = (parsed.flags.config as string) ?? "backend.config.ts";

  const result = await compile({
    configFile,
    cwd,
    module: parsed.flags.module as string | undefined,
    route: parsed.flags.route as string | undefined,
    check: true,
  });

  printDiagnostics(result.diagnostics);

  const hasErrors = result.diagnostics.some((d) => d.level === "error");
  if (hasErrors) {
    process.exitCode = 1;
    return;
  }

  if (result.diffs.length === 0) {
    console.log("No changes.");
    return;
  }

  for (const diff of result.diffs) {
    console.log(`--- ${diff.path}`);
    console.log(`+++ ${diff.path}`);
    console.log(renderDiff(diff.before, diff.after));
  }
}

function renderDiff(before: string, after: string): string {
  if (before === after) return "";
  return ["@@ before", before.trimEnd(), "@@ after", after.trimEnd()].join(
    "\n",
  );
}
