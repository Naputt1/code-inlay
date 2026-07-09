// ─────────────────────────────────────────────────────────────
// @schemago/goast — Go source → AST parser
// Bridges to Go's `go/parser` via the decl-parser binary.
// The binary outputs the full AST as a JSON tree matching goast
// node format, so no recursive conversion is needed.
// ─────────────────────────────────────────────────────────────

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import type { File, ImportSpec, Declaration } from "./nodes.js";

export type ParseError = {
  kind: "ParseError";
  message: string;
};

export type ParseResult = {
  file: File;
  imports: ImportSpec[];
  declarations: Declaration[];
};

// ─── Convenience functions ────────────────────────────────

export function parseSource(source: string, parserPath?: string): File {
  const parser = new GoParser(parserPath);
  const result = parser.parse(source);
  if (result.kind === "ParseError") {
    throw new Error(result.message);
  }
  return result.file;
}

export function parseFile(filename: string, parserPath?: string): File {
  const source = readFileSync(filename, "utf8");
  return parseSource(source, parserPath);
}

// ─── Parser bridge ─────────────────────────────────────────

export function createParser(declParserPath?: string): GoParser {
  return new GoParser(declParserPath);
}

export class GoParser {
  private binaryPath: string | null;

  constructor(declParserPath?: string) {
    this.binaryPath = declParserPath ?? null;
    if (this.binaryPath && !existsSync(this.binaryPath)) {
      this.binaryPath = null;
    }
  }

  hasParser(): boolean {
    return this.binaryPath !== null;
  }

  parse(source: string, _filename?: string): ParseResult | ParseError {
    if (!this.binaryPath) {
      return {
        kind: "ParseError",
        message:
          "decl-parser binary not found. Build it with: cd tools/decl-parser && go build -o decl-parser .",
      };
    }

    const result = spawnSync(this.binaryPath, { input: source, encoding: "utf8" });
    if (result.error) {
      return { kind: "ParseError", message: result.error.message };
    }
    if (result.status !== 0) {
      return { kind: "ParseError", message: result.stderr || result.stdout || "unknown error" };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      return { kind: "ParseError", message: "failed to parse decl-parser output as JSON" };
    }

    // Check for error response from Go binary
    if (parsed.kind === "ParseError") {
      return { kind: "ParseError", message: parsed.message ?? "parse error" };
    }

    // Validate we have a file node
    if (!parsed.file || parsed.file.kind !== "File") {
      return { kind: "ParseError", message: "decl-parser output missing File node" };
    }

    // Type-assert to File — the Go binary already outputs nodes matching
    // goast's format exactly, so no recursive conversion is needed.
    const file = parsed.file as File;
    return {
      file,
      imports: file.imports,
      declarations: file.decls,
    };
  }
}
