import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { sep, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GeneratedRegion, GoDeclaration } from "../types/index.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const dir = __dirname.endsWith(sep) ? __dirname : __dirname + sep;
const parserBinary = resolve(
  __dirname,
  dir.includes(`${sep}dist${sep}`)
    ? "../tools/decl-parser/decl-parser"
    : "../../tools/decl-parser/decl-parser",
);
const hasParser = existsSync(parserBinary);

const funcSignatureRe = /^(func\s+(?:\([^)]*\)\s+)?(\w+)\s*\([^)]*\)(?:\s*\([^)]*\))?)\s*\{/;
const typeRe = /^type\s+(\w+)\s+/;
const varRe = /^(?:var|const)\s+(\w+)/;

function hasMultipleDecls(content: string): boolean {
  const lines = content.split("\n");
  let count = 0;
  let braceDepth = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (braceDepth === 0 && /^(func\s|type\s|var\s|const\s)/.test(trimmed)) {
      count++;
    }
    for (const ch of line) {
      if (ch === "{") braceDepth++;
      else if (ch === "}") braceDepth--;
    }
  }
  return count > 1;
}

export function enrichRegionWithRegex(region: GeneratedRegion): GeneratedRegion {
  if (region.symbolName || region.language !== "go") return region;

  const content = region.content;
  if (!content) return region;
  if (hasMultipleDecls(content)) return region;

  if (content.trim().startsWith("import")) {
    const imports: string[] = [];
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || /^\s*\)/.test(trimmed)) continue;
      if (trimmed.startsWith("import")) {
        const m = trimmed.match(/"([^"]+)"/);
        if (m) imports.push(`"${m[1]}"`);
        continue;
      }
      imports.push(trimmed);
    }
    return {
      ...region,
      kind: "imports",
      imports: imports.length > 0 ? imports : undefined,
    };
  }

  const sigMatch = content.match(funcSignatureRe);
  if (sigMatch) {
    const signature = sigMatch[1];
    const methodName = sigMatch[2];

    let symbolName = methodName;
    if (content.startsWith("func (")) {
      const recvMatch = content.match(/^func\s+\([^)]*?(\w+)\)/);
      if (recvMatch) {
        symbolName = recvMatch[1] + "." + methodName;
      }
    }

    const bodyStart = content.indexOf("{");
    const bodyEnd = content.lastIndexOf("}");
    const body = bodyStart >= 0 && bodyEnd > bodyStart ? content.slice(bodyStart + 1, bodyEnd) : "";

    return {
      ...region,
      content: body,
      symbolName,
      signature,
      kind: content.startsWith("func (") ? "method" : "function",
      expectsUserCode: region.id.endsWith(".handler"),
      isStub: region.id.endsWith(".usecase.impl") || region.id.endsWith(".impl"),
    };
  }

  const typeMatch = content.match(typeRe);
  if (typeMatch) {
    const afterSymbol = content.slice(typeMatch[0].length);
    return {
      ...region,
      symbolName: typeMatch[1],
      kind: afterSymbol.startsWith("struct")
        ? "struct"
        : afterSymbol.startsWith("interface")
          ? "interface"
          : "type",
    };
  }

  const varMatch = content.match(varRe);
  if (varMatch) {
    return {
      ...region,
      symbolName: varMatch[1],
      kind: content.startsWith("const") ? "const" : "var",
    };
  }

  return region;
}

function enrichFromDecl(region: GeneratedRegion, decl: GoDeclaration): GeneratedRegion {
  const enriched: GeneratedRegion = { ...region };

  if (decl.kind === "imports") {
    enriched.kind = "imports";
    enriched.imports = decl.imports;
    return enriched;
  }

  enriched.symbolName = decl.symbolName;
  enriched.kind = decl.kind;

  if (decl.kind === "function" || decl.kind === "method") {
    enriched.signature = decl.signature;
    enriched.content = decl.body ?? "";
    if (decl.receiver) enriched.receiver = decl.receiver;
    enriched.expectsUserCode = region.id.endsWith(".handler");
    enriched.isStub = region.id.endsWith(".usecase.impl") || region.id.endsWith(".impl");
  }

  return enriched;
}

export function tryBatchAST(regions: GeneratedRegion[]): GeneratedRegion[] | null {
  if (!hasParser) return null;

  const combined: string[] = ["package p"];
  for (const r of regions) {
    combined.push(r.content);
  }
  const source = combined.join("\n\n");

  const result = spawnSync(parserBinary, { input: source, encoding: "utf8" });
  if (result.error || result.status !== 0) return null;

  let decls: GoDeclaration[];
  try {
    const parsed = JSON.parse(result.stdout);
    if (!Array.isArray(parsed)) return null;
    decls = parsed as GoDeclaration[];
  } catch {
    return null;
  }

  if (decls.length !== regions.length) return null;

  const enriched: GeneratedRegion[] = [];
  for (let i = 0; i < regions.length; i++) {
    enriched.push(enrichFromDecl(regions[i], decls[i]));
  }
  return enriched;
}

export function batchEnrichGoRegions(files: Map<string, GeneratedRegion[]>): void {
  for (const [, regions] of files) {
    const indices: number[] = [];
    const unenriched: GeneratedRegion[] = [];

    for (let i = 0; i < regions.length; i++) {
      const r = regions[i];
      if (r.symbolName || r.language !== "go" || !r.content || hasMultipleDecls(r.content))
        continue;
      indices.push(i);
      unenriched.push(r);
    }

    if (unenriched.length === 0) continue;

    const enriched = tryBatchAST(unenriched) ?? unenriched.map((r) => enrichRegionWithRegex(r));

    for (let j = 0; j < enriched.length; j++) {
      regions[indices[j]] = enriched[j];
    }
  }
}
