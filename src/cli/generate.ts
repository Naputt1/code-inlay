import { compile, printDiagnostics } from "../compiler.js";
import type { ParsedArgs } from "./index.js";
import { basename, dirname, resolve } from "node:path";

export async function generateCommand(parsed: ParsedArgs): Promise<void> {
  const configFlag = parsed.flags.config as string | undefined;
  const cwdFlag = parsed.flags.cwd as string | undefined;

  let cwd: string;
  let configFile: string;

  if (cwdFlag) {
    cwd = cwdFlag;
    configFile = configFlag ?? "backend.config.ts";
  } else if (configFlag) {
    cwd = resolve(process.cwd(), dirname(configFlag));
    configFile = basename(configFlag);
  } else {
    cwd = process.cwd();
    configFile = "backend.config.ts";
  }

  const result = await compile({
    configFile,
    cwd,
    module: parsed.flags.module as string | undefined,
    route: parsed.flags.route as string | undefined,
    forceRegion: parsed.flags.forceRegion as string | undefined,
  });

  printDiagnostics(result.diagnostics);

  const hasErrors = result.diagnostics.some((d) => d.level === "error");
  if (hasErrors) {
    process.exitCode = 1;
    return;
  }

  if (result.changedFiles.length > 0) {
    console.log(`Updated ${result.changedFiles.length} file(s):`);
    for (const file of result.changedFiles) {
      console.log(`  - ${file}`);
    }
  } else {
    console.log("No changes.");
  }
}
