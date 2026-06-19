import { compile, printDiagnostics } from "../compiler.js";
import type { ParsedArgs } from "./index.js";

export async function checkCommand(parsed: ParsedArgs): Promise<void> {
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
  if (hasErrors || result.changedFiles.length > 0) {
    if (result.changedFiles.length > 0) {
      console.log(`Would update ${result.changedFiles.length} file(s):`);
      for (const file of result.changedFiles) {
        console.log(`  - ${file}`);
      }
    }
    process.exitCode = 1;
    return;
  }

  console.log("No changes.");
}
