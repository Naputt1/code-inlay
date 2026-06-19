import { spawnSync } from "node:child_process";
import type { Diagnostic } from "./types.js";

export function formatGoSnippet(content: string, diagnostics: Diagnostic[], regionId: string): string {
  const trimmed = content.trimEnd();
  if (!trimmed) return "";

  const mode = classifySnippet(trimmed);
  const source = wrapSnippet(trimmed, mode);
  const result = spawnSync("gofmt", { input: source, encoding: "utf8" });

  if (result.error || result.status !== 0) {
    diagnostics.push({
      level: "warning",
      code: "gofmt-failed",
      message: `Could not format generated Go for region "${regionId}".`,
      regionId,
    });
    return trimmed;
  }

  return unwrapSnippet(result.stdout, mode).trimEnd();
}

type SnippetMode = "decl" | "stmt";

function classifySnippet(content: string): SnippetMode {
  return /^(type|func|var|const|import)\s/.test(content) ? "decl" : "stmt";
}

function wrapSnippet(content: string, mode: SnippetMode): string {
  if (mode === "decl") {
    return `package generated\n\n${content}\n`;
  }

  const indented = content
    .split("\n")
    .map((line) => (line ? `\t${line}` : ""))
    .join("\n");
  return `package generated\n\nfunc generated() {\n${indented}\n}\n`;
}

function unwrapSnippet(source: string, mode: SnippetMode): string {
  const withoutPackage = source.replace(/^package generated\s+/, "");
  if (mode === "decl") {
    return withoutPackage;
  }

  const body = withoutPackage
    .replace(/^func generated\(\) \{\n/, "")
    .replace(/\n\}\s*$/, "");
  return body
    .split("\n")
    .map((line) => line.replace(/^\t/, ""))
    .join("\n");
}
