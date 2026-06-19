import { compileWithWatch } from "../compiler.js";
import type { ParsedArgs } from "./index.js";

export async function devCommand(parsed: ParsedArgs): Promise<void> {
  const cwd = (parsed.flags.cwd as string) ?? process.cwd();
  const configFile = (parsed.flags.config as string) ?? "backend.config.ts";

  console.log("Starting development watch mode... (Ctrl+C to stop)");

  await compileWithWatch({
    configFile,
    cwd,
    module: parsed.flags.module as string | undefined,
    route: parsed.flags.route as string | undefined,
    forceRegion: parsed.flags.forceRegion as string | undefined,
    watch: true,
  });
}
