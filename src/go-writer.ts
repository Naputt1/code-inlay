import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CompilerCache,
  Diagnostic,
  GeneratedFilePatch,
  GeneratedRegion,
  GoDeclaration,
} from "./types.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const parserBinary = resolve(__dirname, "../tools/decl-parser/decl-parser");

function shortHash(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, 8);
}

export function parseGoFile(source: string): GoDeclaration[] {
  const result = spawnSync(parserBinary, { input: source, encoding: "utf8" });
  if (result.error || result.status !== 0) return [];
  try {
    const parsed = JSON.parse(result.stdout);
    if (parsed.error) return [];
    return parsed as GoDeclaration[];
  } catch {
    return [];
  }
}

type BlobMarker = { id: string; startIdx: number; endIdx: number; indent: string };

const startMarkerRe = /^([ \t]*)\/\/ @gen:start ([a-zA-Z0-9._-]+)/gm;
const endMarkerRe = /^([ \t]*)\/\/ @gen:end ([a-zA-Z0-9._-]+)/gm;

function findBlobMarkers(text: string, blobIds: Set<string>): Map<string, BlobMarker> {
  const markers = new Map<string, BlobMarker>();
  const starts: Array<{ id: string; index: number; indent: string }> = [];
  const ends: Array<{ id: string; index: number; indent: string }> = [];

  let m: RegExpExecArray | null;
  const startLocal = new RegExp(startMarkerRe.source, startMarkerRe.flags);
  while ((m = startLocal.exec(text)) !== null) {
    if (blobIds.has(m[2])) {
      starts.push({ id: m[2], index: m.index, indent: m[1] });
    }
  }
  const endLocal = new RegExp(endMarkerRe.source, endMarkerRe.flags);
  while ((m = endLocal.exec(text)) !== null) {
    if (blobIds.has(m[2])) {
      ends.push({ id: m[2], index: m.index, indent: m[1] });
    }
  }

  for (const start of starts) {
    const end = ends.find((e) => e.id === start.id && e.index > start.index);
    if (end) {
      markers.set(start.id, {
        id: start.id,
        startIdx: start.index,
        endIdx: end.index + end.indent.length + `// @gen:end ${start.id}`.length,
        indent: start.indent,
      });
    }
  }
  return markers;
}

export function injectGoFile(
  fileText: string,
  patch: GeneratedFilePatch,
  cache: CompilerCache,
  diagnostics: Diagnostic[],
): string {
  const blobIds = new Set(
    patch.regions.filter((r) => !r.symbolName && r.kind !== "imports").map((r) => r.id),
  );

  const declarations = parseGoFile(fileText);
  const lines = fileText.split("\n");
  const blobLineRanges = findBlobLineRanges(fileText, blobIds);

  const symbolRegions: GeneratedRegion[] = [];
  for (const region of patch.regions) {
    if (region.symbolName) symbolRegions.push(region);
  }
  symbolRegions.sort((a, b) => a.id.localeCompare(b.id));
  const plannedByName = new Map(symbolRegions.map((r) => [r.symbolName!, r]));

  if (declarations.length === 0) {
    let t = buildFromScratch(lines, plannedByName, symbolRegions, fileText);
    t = applyBlobRegions(t, patch, blobIds);
    t = mergeImports(t, patch, fileText);
    return cleanBlankLines(t);
  }

  const fileCache = cache.symbolsByFile?.[patch.path] ?? {};
  const isGenerated = (name: string) => fileCache[name] !== undefined || plannedByName.has(name);

  const userDecls: GoDeclaration[] = [];
  const existingGen: Array<{ decl: GoDeclaration; region: GeneratedRegion }> = [];
  const orphanSymbols: string[] = [];

  const isInsideBlob = (decl: GoDeclaration): boolean => {
    for (const [, range] of blobLineRanges) {
      if (decl.startLine >= range.start && decl.endLine <= range.end) return true;
    }
    return false;
  };

  for (const decl of declarations) {
    if (decl.kind === "imports" || decl.symbolName === "") continue;
    if (isInsideBlob(decl)) continue;
    if (plannedByName.has(decl.symbolName)) {
      existingGen.push({ decl, region: plannedByName.get(decl.symbolName)! });
    } else if (isGenerated(decl.symbolName)) {
      orphanSymbols.push(decl.symbolName);
    } else {
      userDecls.push(decl);
    }
  }

  const isOutOfOrder = (() => {
    const orderMap = new Map(symbolRegions.map((r, i) => [r.symbolName!, i]));
    let prev = -1;
    for (const { decl } of existingGen) {
      const idx = orderMap.get(decl.symbolName);
      if (idx === undefined) continue;
      if (idx < prev) return true;
      prev = idx;
    }
    return false;
  })();

  if (isOutOfOrder) {
    diagnostics.push({
      level: "warning",
      code: "generated-out-of-order",
      message: `Generated symbols in "${patch.path}" are out of config order.`,
      file: patch.path,
    });
  }

  const newLines: string[] = [];
  const pkgLine = lines.find((l) => /^package\s+\w+/.test(l.trim()));
  if (pkgLine) {
    newLines.push(pkgLine);
    newLines.push("");
  }

  if (isOutOfOrder) {
    for (const decl of userDecls) {
      const start = decl.startLine - 1;
      const end = decl.endLine;
      for (let i = start; i < end && i < lines.length; i++) {
        newLines.push(lines[i]);
      }
      newLines.push("");
    }
    for (const region of symbolRegions) {
      appendGenerated(newLines, region, fileText);
    }
  } else {
    const plannedSet = new Set<string>();
    for (const { decl, region } of existingGen) {
      appendGenerated(newLines, region, fileText);
      plannedSet.add(decl.symbolName);
    }

    for (const region of symbolRegions) {
      if (region.symbolName && !plannedSet.has(region.symbolName)) {
        newLines.push("");
        newLines.push(buildDeclarationText(region, buildBody(region, fileText)));
      }
    }

    for (const decl of userDecls) {
      const start = decl.startLine - 1;
      const end = decl.endLine;
      for (let i = start; i < end && i < lines.length; i++) {
        newLines.push(lines[i]);
      }
      newLines.push("");
    }
  }

  for (const sym of orphanSymbols) {
    diagnostics.push({
      level: "warning",
      code: "orphaned-symbol-removed",
      message: `Removed orphaned symbol "${sym}" that is no longer generated.`,
      file: patch.path,
    });
  }

  let result = newLines.join("\n");
  result = applyBlobRegions(result, patch, blobIds);
  result = mergeImports(result, patch, fileText);
  result = cleanBlankLines(result);

  return result;
}

function buildFromScratch(
  lines: string[],
  plannedByName: Map<string, GeneratedRegion>,
  symbolRegions: GeneratedRegion[],
  fileText: string,
): string {
  const newLines: string[] = [];
  const pkgLine = lines.find((l) => /^package\s+\w+/.test(l.trim()));
  if (pkgLine) {
    newLines.push(pkgLine);
    newLines.push("");
  }
  for (const region of symbolRegions) {
    newLines.push("");
    newLines.push(buildDeclarationText(region, buildBody(region, fileText)));
  }
  return newLines.join("\n");
}

function findBlobLineRanges(
  text: string,
  blobIds: Set<string>,
): Map<string, { start: number; end: number }> {
  const ranges = new Map<string, { start: number; end: number }>();
  const starts: Array<{ id: string; line: number }> = [];
  const ends: Array<{ id: string; line: number }> = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const m1 = lines[i].match(/^[ \t]*\/\/ @gen:start ([a-zA-Z0-9._-]+)/);
    if (m1 && blobIds.has(m1[1])) starts.push({ id: m1[1], line: i + 1 });
    const m2 = lines[i].match(/^[ \t]*\/\/ @gen:end ([a-zA-Z0-9._-]+)/);
    if (m2 && blobIds.has(m2[1])) ends.push({ id: m2[1], line: i + 1 });
  }

  for (const s of starts) {
    const e = ends.find((x) => x.id === s.id && x.line > s.line);
    if (e) ranges.set(s.id, { start: s.line, end: e.line });
  }
  return ranges;
}

function applyBlobRegions(text: string, patch: GeneratedFilePatch, blobIds: Set<string>): string {
  const blobRegions = patch.regions.filter((r) => blobIds.has(r.id));
  if (blobRegions.length === 0) return text;

  const markers = findBlobMarkers(text, blobIds);
  let result = text;

  for (const region of blobRegions) {
    const marker = markers.get(region.id);
    if (marker) {
      const content = region.content;
      const replacement = `${marker.indent}// @gen:start ${region.id}\n${content}\n${marker.indent}// @gen:end ${region.id}`;
      result = result.slice(0, marker.startIdx) + replacement + result.slice(marker.endIdx);
    } else {
      result += `\n// @gen:start ${region.id}\n${region.content}\n// @gen:end ${region.id}\n`;
    }
  }
  return result;
}

function appendGenerated(out: string[], region: GeneratedRegion, fileText: string): void {
  const body = buildBody(region, fileText);
  const text = buildDeclarationText(region, body);
  out.push(text);
  out.push("");
}

function buildBody(region: GeneratedRegion, fileText: string): string {
  let body = region.content;

  if (region.expectsUserCode && !region.isStub && body.trim()) {
    const existingBody = extractExistingBody(fileText, region);
    if (existingBody !== null) {
      body = applyInnerMarkers(region, existingBody, body);
    } else {
      const sh = shortHash(region.id);
      const nl = fileText.includes("\r\n") ? "\r\n" : "\n";
      body = `${body}${nl}\t// @gen:end ${sh}`;
    }
  }

  return body;
}

function extractExistingBody(fileText: string, region: GeneratedRegion): string | null {
  const decls = parseGoFile(fileText);
  const match = decls.find((d) => d.symbolName === region.symbolName);
  if (!match || !match.bodyStart || !match.bodyEnd) return null;
  const lines = fileText.split("\n");
  const startIdx = match.bodyStart;
  const endIdx = match.bodyEnd - 1;
  if (startIdx >= endIdx || startIdx >= lines.length) return null;
  return lines.slice(startIdx, endIdx).join("\n");
}

function applyInnerMarkers(
  region: GeneratedRegion,
  existingBody: string,
  newGeneratedBody: string,
): string {
  const sh = shortHash(region.id);
  const nl = existingBody.includes("\r\n") ? "\r\n" : "\n";

  const endIdx = existingBody.search(new RegExp(`// @gen:end ${escapeRegex(sh)}\\b`));
  const startIdx = existingBody.search(new RegExp(`// @gen:start ${escapeRegex(sh)}\\b`));

  if (endIdx >= 0) {
    const beforeEnd = existingBody.slice(0, endIdx).replace(/\s+$/, "");
    const afterEndLine = existingBody.indexOf(nl, endIdx);
    const afterEnd = afterEndLine >= 0 ? existingBody.slice(afterEndLine + nl.length) : "";
    return `${beforeEnd}${nl}\t// @gen:end ${sh}${nl}${afterEnd}`;
  }

  if (startIdx >= 0) {
    const beforeStartLine = existingBody.lastIndexOf(nl, startIdx);
    const beforeStart =
      beforeStartLine >= 0 ? existingBody.slice(0, beforeStartLine).replace(/\s+$/, "") : "";
    return `${beforeStart}${nl}\t// @gen:start ${sh}${nl}${newGeneratedBody}`;
  }

  return `${newGeneratedBody}${nl}\t// @gen:end ${sh}`;
}

function buildDeclarationText(region: GeneratedRegion, body: string): string {
  if (region.kind === "method" || region.kind === "function") {
    if (region.signature) {
      const nl = body.includes("\r\n") ? "\r\n" : "\n";
      const cleanBody = body.replace(/^\n+/, "").replace(/\n+$/, "");
      return `${region.signature} {${nl}${cleanBody}${nl}}`;
    }
  }
  return region.content;
}

function importPath(spec: string): string {
  const m = spec.match(/"([^"]+)"/);
  return m ? m[1] : spec;
}

function mergeImports(text: string, patch: GeneratedFilePatch, fileText: string): string {
  const plannedSpecs: string[] = [];
  const seenPaths = new Set<string>();
  for (const region of patch.regions) {
    if (region.imports) {
      for (const imp of region.imports) {
        const p = importPath(imp);
        if (!seenPaths.has(p)) {
          seenPaths.add(p);
          plannedSpecs.push(imp);
        }
      }
    }
  }

  const existingSpecs: string[] = [];
  for (const line of fileText.split("\n")) {
    const trimmed = line.trim();
    const m = trimmed.match(/^(\w+\s+)?"([^"]+)"/);
    if (m) {
      const p = m[2];
      if (!seenPaths.has(p)) {
        seenPaths.add(p);
        existingSpecs.push(trimmed);
      }
    }
  }

  const allSpecs = [...plannedSpecs, ...existingSpecs].sort();
  if (allSpecs.length === 0) return text;

  const importBlockRe = /^([ \t]*)import\s*\([^)]*\)[ \t]*$/m;
  const importBlockExists = importBlockRe.test(text);

  if (importBlockExists) {
    const indent = text.match(importBlockRe)?.[1] ?? "";
    const lines: string[] = [`${indent}import (`];
    for (const spec of allSpecs) {
      lines.push(`${indent}\t${spec}`);
    }
    lines.push(`${indent})`);
    const replacement = lines.join("\n");
    return text.replace(importBlockRe, replacement);
  }

  const pkgIdx = text.search(/^package\s+\w+\s*$/m);
  if (pkgIdx >= 0) {
    const lineEnd = text.indexOf("\n", pkgIdx);
    const insertAt = lineEnd >= 0 ? lineEnd + 1 : text.length;
    const lines: string[] = [""];
    lines.push("import (");
    for (const spec of allSpecs) {
      lines.push(`\t${spec}`);
    }
    lines.push(")");
    return text.slice(0, insertAt) + lines.join("\n") + text.slice(insertAt);
  }

  return text;
}

function cleanBlankLines(text: string): string {
  return (
    text
      .replace(/\n{3,}/g, "\n\n")
      .replace(/^\n+/, "")
      .replace(/\n+$/, "") + "\n"
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
