import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Diagnostic } from "../types/index.js";

function isCompleteSnippet(content: string): boolean {
  if (/^}$/.test(content)) return false;
  if (content.startsWith("type ") && !content.trimEnd().endsWith("}")) return false;
  let depth = 0;
  for (const ch of content) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
  }
  if (depth !== 0) return false;
  return true;
}

function findGoMod(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 20; i++) {
    const candidate = resolve(dir, "go.mod");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function readModulePath(goModPath: string): string | null {
  const modContent = readFileSync(goModPath, "utf8");
  const match = modContent.match(/^module\s+(\S+)/m);
  return match ? match[1] : null;
}

function sortGoImports(absolutePath: string): void {
  const content = readFileSync(absolutePath, "utf8");
  const importRegex = /import\s*\(([\s\S]*?)\)/g;
  let match;
  let result = content;

  const goModPath = findGoMod(dirname(absolutePath));
  const modulePath = goModPath ? readModulePath(goModPath) : null;

  while ((match = importRegex.exec(content)) !== null) {
    const blockContent = match[1];
    const lines = blockContent.split("\n");
    const specs: { alias: string; path: string }[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//")) continue;
      const specMatch = trimmed.match(/^(\w+\s+)?("(?:[^"\\]|\\.)*")$/);
      if (specMatch) {
        const alias = specMatch[1]?.trim() ?? "";
        const path = JSON.parse(specMatch[2]);
        specs.push({ alias, path });
      }
    }

    if (specs.length === 0) continue;

    const group1: { alias: string; path: string }[] = [];
    const group2: { alias: string; path: string }[] = [];

    for (const spec of specs) {
      const hasDot = spec.path.includes(".");
      const isModuleLocal = modulePath !== null && spec.path.startsWith(modulePath + "/");
      if (hasDot && !isModuleLocal) {
        group2.push(spec);
      } else {
        group1.push(spec);
      }
    }

    group1.sort((a, b) => a.path.localeCompare(b.path));
    group2.sort((a, b) => a.path.localeCompare(b.path));

    const formatEntry = (s: { alias: string; path: string }) =>
      s.alias ? `\t${s.alias} "${s.path}"` : `\t"${s.path}"`;

    const parts: string[] = group1.map(formatEntry);
    if (group2.length > 0) {
      parts.push("");
      parts.push(...group2.map(formatEntry));
    }

    const before = content.substring(0, match.index);
    const after = content.substring(match.index + match[0].length);
    result = before + `import (\n${parts.join("\n")}\n)` + after;
    importRegex.lastIndex = before.length + `import (\n${parts.join("\n")}\n)`.length;
  }

  if (result !== content) {
    writeFileSync(absolutePath, result, "utf8");
  }
}

export function formatFile(absolutePath: string, diagnostics: Diagnostic[]): void {
  if (!absolutePath.endsWith(".go")) return;

  sortGoImports(absolutePath);

  const result = spawnSync("gofmt", ["-w", absolutePath], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    diagnostics.push({
      level: "warning",
      code: "gofmt-failed",
      message: `Could not format "${absolutePath}": ${result.error?.message ?? result.stderr?.trim() ?? "unknown error"}`,
    });
  }
}

export function formatGoSnippet(
  content: string,
  diagnostics: Diagnostic[],
  regionId: string,
): string {
  const trimmed = content.trimEnd();
  if (!trimmed) return "";

  if (!isCompleteSnippet(trimmed)) {
    return trimmed;
  }

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

  const body = withoutPackage.replace(/^func generated\(\) \{\n/, "").replace(/\n\}\s*$/, "");
  return body
    .split("\n")
    .map((line) => line.replace(/^\t/, ""))
    .join("\n");
}
