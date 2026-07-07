// ─────────────────────────────────────────────────────────────
// @schemago/go-ast — Go source → AST parser
// Currently bridges to Go's `go/parser` via the decl-parser binary.
// Future: pure TypeScript parser.
// ─────────────────────────────────────────────────────────────

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Declaration, ImportSpec, Tag, Type, Field } from "./nodes.js";

// ─── JSON wire format from decl-parser ────────────────────

type ParsedDeclaration = {
  kind: string;
  symbolName: string;
  receiver?: string;
  signature?: string;
  body?: string;
  bodyStart?: number;
  bodyEnd?: number;
  startLine: number;
  endLine: number;
  imports?: string[];
};

export type ParseError = {
  kind: "ParseError";
  message: string;
};

export type ParseResult = {
  imports: ImportSpec[];
  declarations: Declaration[];
};

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
        message: "decl-parser binary not found. Build it with: cd tools/decl-parser && go build -o decl-parser .",
      };
    }

    const result = spawnSync(this.binaryPath, { input: source, encoding: "utf8" });
    if (result.error) {
      return { kind: "ParseError", message: result.error.message };
    }
    if (result.status !== 0) {
      return { kind: "ParseError", message: result.stderr || result.stdout || "unknown error" };
    }

    let parsed: ParsedDeclaration[];
    try {
      parsed = JSON.parse(result.stdout);
      if (!Array.isArray(parsed)) {
        return { kind: "ParseError", message: "expected array from decl-parser" };
      }
    } catch {
      return { kind: "ParseError", message: "failed to parse decl-parser output as JSON" };
    }

    return convertDeclarations(parsed);
  }
}

// ─── Convert flat JSON to AST nodes ────────────────────────

function convertDeclarations(parsed: ParsedDeclaration[]): ParseResult {
  let imports: ImportSpec[] = [];
  const decls: Declaration[] = [];

  for (const pd of parsed) {
    if (pd.kind === "imports") {
      imports = convertImports(pd.imports ?? []);
      continue;
    }
    const decl = convertDeclaration(pd);
    if (decl) decls.push(decl);
  }

  return { imports, declarations: decls };
}

function convertImports(imports: string[]): ImportSpec[] {
  return imports.map((imp) => {
    // Format: `alias "path"` or `"path"`
    const match = imp.match(/^(\S+)\s+"(.+)"$/);
    if (match) {
      return { kind: "ImportSpec", path: match[2], name: match[1] };
    }
    const pathMatch = imp.match(/"(.+)"/);
    if (pathMatch) {
      return { kind: "ImportSpec", path: pathMatch[1] };
    }
    return { kind: "ImportSpec", path: imp };
  });
}

function convertDeclaration(pd: ParsedDeclaration): Declaration | null {
  switch (pd.kind) {
    case "function":
    case "method":
      return convertFuncDecl(pd);
    case "struct":
    case "interface":
    case "type":
      // For these, we keep the signature as the raw type spec and parse it minimally.
      // A full TypeScript parser would properly parse these in the future.
      return { kind: "GenDecl", token: "type", specs: [], lparen: false };
    case "var":
    case "const":
    case "imports":
      return null;
    default:
      return null;
  }
}

function convertFuncDecl(pd: ParsedDeclaration): Declaration | null {
  if (!pd.symbolName) return null;

  // symbolName format:
  //   "Foo" for functions
  //   "ReceiverType.Foo" for methods
  const dotIndex = pd.symbolName.lastIndexOf(".");
  const isMethod = dotIndex > 0;

  const name = isMethod ? pd.symbolName.slice(dotIndex + 1) : pd.symbolName;

  // Store signature and body as raw string placeholders.
  // Full TypeScript parser would properly parse these.
  return {
    kind: "FuncDecl",
    name,
    recv: isMethod ? { kind: "Field", names: [], type: { kind: "Ident", name: pd.receiver ?? "" }, embedded: true } : undefined,
    type: { kind: "FuncType", params: [], results: [] },
    body: pd.body ? { kind: "BlockStmt", list: [] } : undefined,
  };
}
