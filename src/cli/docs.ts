import type { AppAst, ArchitectureAst } from "../types.js";
import { compile } from "../compiler.js";
import { generateApiDocs } from "../docsgen.js";
import type { ParsedArgs } from "./index.js";

export async function docsCommand(parsed: ParsedArgs): Promise<void> {
  const subcommand = parsed.subcommand ?? "api";
  const cwd = (parsed.flags.cwd as string) ?? process.cwd();
  const configFile = (parsed.flags.config as string) ?? "backend.config.ts";

  const result = await compile({ configFile, cwd, dryRun: true });

  if (!result.ast || !result.architecture) {
    console.error("Failed to compile.");
    process.exitCode = 1;
    return;
  }

  switch (subcommand) {
    case "api":
      generateAndPrintDocs(result.ast, result.architecture, "markdown");
      break;
    case "markdown":
      generateAndPrintDocs(result.ast, result.architecture, "markdown");
      break;
    case "diagram":
      generateAndPrintDocs(result.ast, result.architecture, "mermaid");
      break;
    default:
      console.error(`Unknown docs subcommand "${subcommand}".`);
      console.log(`Usage: backend-gen docs <api|markdown|diagram>`);
      process.exitCode = 1;
  }
}

function generateAndPrintDocs(
  ast: AppAst,
  architecture: ArchitectureAst,
  format: "markdown" | "mermaid",
): void {
  console.log(generateApiDocs(ast, architecture, format));
}
