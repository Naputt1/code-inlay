// ─────────────────────────────────────────────────────────────
// @schemago/goast — Go source → AST parser
// Bridges to Go's `go/parser` via the decl-parser binary.
// The binary outputs the full AST as a JSON tree matching goast
// node format, so no recursive conversion is needed.
// ─────────────────────────────────────────────────────────────

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, sep } from "node:path";
import type { File, ImportSpec, Declaration } from "./nodes.js";

export type ParseError = {
  kind: "ParseError";
  message: string;
};

export type ParseResult = {
  kind: "ParseResult";
  file: File;
  imports: ImportSpec[];
  declarations: Declaration[];
};

export type SummaryKind =
  | "function" | "method" | "struct" | "interface"
  | "type" | "const" | "var" | "imports";

export type SummaryDeclaration = {
  kind: SummaryKind;
  symbolName: string;
  receiver?: string;
  signature?: string;
  body?: string;
  bodyStart: number;
  bodyEnd: number;
  startLine: number;
  endLine: number;
  imports?: string[];
};

export type SummaryResult = SummaryDeclaration[];

// ─── Convenience functions ────────────────────────────────

/** Parse a Go source string and return the full AST File node. Throws on error. */
export function parseSource(source: string, parserPath?: string): File {
  const parser = new GoParser(parserPath);
  const result = parser.parse(source);
  if (result.kind === "ParseError") {
    throw new Error(result.message);
  }
  return result.file;
}

/** Read a .go file from disk and parse it into an AST File node. Throws on error. */
export function parseFile(filename: string, parserPath?: string): File {
  const source = readFileSync(filename, "utf8");
  return parseSource(source, parserPath);
}

// ─── Parser bridge ─────────────────────────────────────────

/** Create a GoParser instance with optional explicit binary path. */
export function createParser(declParserPath?: string): GoParser {
  return new GoParser(declParserPath);
}

export class GoParser {
  private binaryPath: string | null;

  constructor(declParserPath?: string) {
    const _dirname = fileURLToPath(new URL(".", import.meta.url));
    if (declParserPath) {
      this.binaryPath = declParserPath;
    } else {
      // Auto-detect binary relative to this source file
      const dir = _dirname.endsWith(sep) ? _dirname : _dirname + sep;
      const inDist = dir.includes(`${sep}dist${sep}`);
      const rel = inDist ? "../tools/decl-parser/decl-parser" : "../tools/decl-parser/decl-parser";
      this.binaryPath = resolve(_dirname, rel);
    }
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

    const result = spawnSync(this.binaryPath, { input: source, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
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
      kind: "ParseResult",
      file,
      imports: file.imports,
      declarations: file.decls,
    };
  }

  parseSummary(source: string): SummaryResult | ParseError {
    if (!this.binaryPath) {
      return [];
    }

    const result = spawnSync(this.binaryPath, ["--format=summary"], {
      input: source, encoding: "utf8", maxBuffer: 50 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) return [];

    try {
      const parsed = JSON.parse(result.stdout);
      if (parsed.kind === "ParseError") return [];
      if (!Array.isArray(parsed)) return [];
      return parsed as SummaryResult;
    } catch {
      return [];
    }
  }
}

/** Parse a Go source string and return declaration summaries. */
export function parseSummarySource(source: string, parserPath?: string): SummaryResult {
  const parser = new GoParser(parserPath);
  const result = parser.parseSummary(source);
  return Array.isArray(result) ? result : [];
}

/** Read a .go file and return declaration summaries. */
export function parseSummaryFile(filename: string, parserPath?: string): SummaryResult {
  const source = readFileSync(filename, "utf8");
  return parseSummarySource(source, parserPath);
}
