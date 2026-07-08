import { compileWithWatch } from "../compiler/compiler.js";
import type { ParsedArgs } from "./index.js";
import { basename, dirname, resolve } from "node:path";

export async function devCommand(parsed: ParsedArgs): Promise<void> {
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
