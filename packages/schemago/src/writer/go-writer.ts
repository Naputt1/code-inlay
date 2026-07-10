import { createHash } from "node:crypto";
import { createParser, parseSummaryFile } from "@schemago/goast";
import type {
  CompilerCache,
  Diagnostic,
  GeneratedFilePatch,
  GeneratedRegion,
  GoDeclaration,
} from "../types/index.js";

export function shortHash(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, 8);
}

let _parser: ReturnType<typeof createParser> | null = null;
function getParser() {
  if (!_parser) _parser = createParser();
  return _parser;
}

export function parseGoFile(source: string): GoDeclaration[] {
  const result = getParser().parseSummary(source);
  return Array.isArray(result) ? (result as GoDeclaration[]) : [];
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
    let t = injectAllViaMarkers(fileText, patch, diagnostics, patch.path);
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

  const adoptedSymbols = new Set<string>();
  for (let i = existingGen.length - 1; i >= 0; i--) {
    const { decl, region } = existingGen[i];
    if (!region.isStub) continue;
    const existingBody = extractExistingBody(fileText, region);
    if (existingBody === null) continue;
    const norm = (s: string) => s.replace(/\s/g, "");
    if (norm(existingBody) !== norm(region.content)) {
      userDecls.push(decl);
      adoptedSymbols.add(decl.symbolName);
      existingGen.splice(i, 1);
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

  const genByName = new Map(existingGen.map((e) => [e.decl.symbolName, e]));
  const userNames = new Set(userDecls.map((d) => d.symbolName));
  const emittedGen = new Set<string>();
  const emittedUser = new Set<string>();

  if (isOutOfOrder) {
    for (const decl of userDecls) {
      if (emittedUser.has(decl.symbolName)) continue;
      emittedUser.add(decl.symbolName);
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
    for (const decl of declarations) {
      if (decl.kind === "imports" || decl.symbolName === "") continue;
      if (isInsideBlob(decl)) continue;

      const genEntry = genByName.get(decl.symbolName);
      if (genEntry) {
        if (!emittedGen.has(decl.symbolName)) {
          emittedGen.add(decl.symbolName);
          appendGenerated(newLines, genEntry.region, fileText);
        }
        continue;
      }

      if (userNames.has(decl.symbolName) || orphanSymbols.includes(decl.symbolName)) {
        if (orphanSymbols.includes(decl.symbolName)) continue;
        if (emittedUser.has(decl.symbolName)) continue;
        emittedUser.add(decl.symbolName);
        const start = decl.startLine - 1;
        const end = decl.endLine;
        for (let i = start; i < end && i < lines.length; i++) {
          newLines.push(lines[i]);
        }
        newLines.push("");
        continue;
      }
    }

    const placedNames = new Set([...emittedGen, ...userNames]);
    for (const region of symbolRegions) {
      if (region.symbolName && !placedNames.has(region.symbolName)) {
        newLines.push("");
        newLines.push(buildDeclarationText(region, buildBody(region, fileText)));
      }
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

function injectAllViaMarkers(
  fileText: string,
  patch: GeneratedFilePatch,
  diagnostics: Diagnostic[],
  file?: string,
): string {
  const markerIds = new Set(patch.regions.filter((r) => r.kind !== "imports").map((r) => r.id));

  // Remove orphan blob markers (IDs no longer in the plan)
  const allMarkers = findAllBlobMarkers(fileText);
  let result = fileText;
  const orphanIds: Array<{ start: number; end: number }> = [];
  for (const [, marker] of allMarkers) {
    if (!markerIds.has(marker.id)) {
      orphanIds.push({ start: marker.startIdx, end: marker.endIdx });
      diagnostics.push({
        level: "warning",
        code: "orphaned-region-removed",
        message: `Removed orphaned region "${marker.id}" that is no longer generated.`,
        file,
        regionId: marker.id,
      });
    }
  }
  orphanIds.sort((a, b) => b.start - a.start);
  for (const { start, end } of orphanIds) {
    const before = result.slice(0, start);
    const after = result.slice(end);
    const beforeTrimmed = before.replace(/\n+$/, "");
    const afterTrimmed = after.replace(/^\n+/, "");
    result = beforeTrimmed + "\n\n" + afterTrimmed;
  }

  const markers = findBlobMarkers(result, markerIds);
  for (const region of patch.regions) {
    if (region.kind === "imports") continue;
    const marker = markers.get(region.id);
    if (marker) {
      const content = region.content;
      const replacement = `${marker.indent}// @gen:start ${region.id}\n${content}\n${marker.indent}// @gen:end ${region.id}`;
      result = result.slice(0, marker.startIdx) + replacement + result.slice(marker.endIdx);
    } else {
      const nl = fileText.includes("\r\n") ? "\r\n" : "\n";
      result += `${nl}// @gen:start ${region.id}${nl}${region.content}${nl}// @gen:end ${region.id}${nl}`;
    }
  }
  return result;
}

function findAllBlobMarkers(text: string): Map<string, BlobMarker> {
  const markers = new Map<string, BlobMarker>();
  const starts: Array<{ id: string; index: number; indent: string }> = [];
  const ends: Array<{ id: string; index: number; indent: string }> = [];

  let m: RegExpExecArray | null;
  const startLocal = new RegExp(startMarkerRe.source, startMarkerRe.flags);
  while ((m = startLocal.exec(text)) !== null) {
    starts.push({ id: m[2], index: m.index, indent: m[1] });
  }
  const endLocal = new RegExp(endMarkerRe.source, endMarkerRe.flags);
  while ((m = endLocal.exec(text)) !== null) {
    ends.push({ id: m[2], index: m.index, indent: m[1] });
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

  const existingBody = extractExistingBody(fileText, region);

  if (region.kind === "struct") {
    body = extractStructInnerBody(body, region.symbolName);
  }

  if (region.isStub && existingBody !== null) {
    return body;
  }

  if (region.expectsUserCode && !region.isStub && (body.trim() || existingBody !== null)) {
    const sh = shortHash(region.id);
    const hasStart = body.includes(`// @gen:start ${sh}`);
    const hasEnd = body.includes(`// @gen:end ${sh}`);
    const existingHasMarkers = existingBody ? existingBody.includes(`// @gen:start ${sh}`) : false;
    if (existingBody !== null) {
      if (hasStart || hasEnd || existingHasMarkers) {
        body = applyInnerMarkers(region, existingBody, body);
      } else if (existingBody.trim()) {
        const nl = fileText.includes("\r\n") ? "\r\n" : "\n";
        body = `${existingBody}${nl}\t// @gen:start ${sh}${nl}\t// @gen:end ${sh}`;
      } else {
        const nl = fileText.includes("\r\n") ? "\r\n" : "\n";
        body = `${body}${nl}\t// @gen:start ${sh}${nl}\t// @gen:end ${sh}`;
      }
    } else if (hasStart && !hasEnd) {
      const nl = fileText.includes("\r\n") ? "\r\n" : "\n";
      body = `${body}${nl}\t// @gen:end ${sh}`;
    }
  }

  return body;
}

function extractStructInnerBody(fullDecl: string, symbolName?: string): string {
  if (!symbolName) return fullDecl;
  const re = new RegExp(`^type\\s+${escapeRegex(symbolName)}\\s+struct\\s*\\{`);
  const m = fullDecl.match(re);
  if (!m) return fullDecl;
  let inner = fullDecl.slice(m[0].length);
  if (inner.endsWith("}")) inner = inner.slice(0, -1);
  return inner.trim();
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

function collectMarkerPositions(text: string, sh: string): { starts: number[]; ends: number[] } {
  const starts: number[] = [];
  const ends: number[] = [];
  const startRe = new RegExp(`// @gen:start ${escapeRegex(sh)}`, "g");
  const endRe = new RegExp(`// @gen:end ${escapeRegex(sh)}`, "g");
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(text)) !== null) starts.push(m.index);
  while ((m = endRe.exec(text)) !== null) ends.push(m.index);
  return { starts, ends };
}

function extractInner(text: string, startIdx: number, endIdx: number, nl: string): string {
  const afterStartLine = text.indexOf(nl, startIdx);
  const innerStart = afterStartLine >= 0 ? afterStartLine + nl.length : 0;
  const beforeEndLine = text.lastIndexOf(nl, endIdx);
  const innerEnd =
    beforeEndLine >= 0 && beforeEndLine + nl.length === endIdx ? beforeEndLine : endIdx;
  return text.slice(innerStart, innerEnd);
}

function markerLine(text: string, idx: number, nl: string): string {
  const lineEnd = text.indexOf(nl, idx);
  return lineEnd >= 0 ? text.slice(idx, lineEnd + nl.length) : text.slice(idx) + nl;
}

export function applyInnerMarkers(
  region: GeneratedRegion,
  existingBody: string,
  newGeneratedBody: string,
): string {
  const sh = shortHash(region.id);
  const nl = existingBody.includes("\r\n") ? "\r\n" : "\n";

  const newMP = collectMarkerPositions(newGeneratedBody, sh);
  const existingMP = collectMarkerPositions(existingBody, sh);
  const pairCount = Math.min(newMP.starts.length, newMP.ends.length);

  if (pairCount === 0) {
    const existingEndIdx = existingBody.search(new RegExp(`// @gen:end ${escapeRegex(sh)}\\b`));
    const existingStartIdx = existingBody.search(new RegExp(`// @gen:start ${escapeRegex(sh)}\\b`));

    // Existing has complete marker pair: keep existing body as-is
    if (existingStartIdx >= 0 && existingEndIdx >= 0 && existingEndIdx > existingStartIdx) {
      return existingBody;
    }
    if (existingEndIdx >= 0) {
      const afterEndLine = existingBody.indexOf(nl, existingEndIdx);
      const afterEnd = afterEndLine >= 0 ? existingBody.slice(afterEndLine + nl.length) : "";
      return `${newGeneratedBody}${nl}${afterEnd}`;
    }
    if (existingStartIdx >= 0) {
      const beforeStartLine = existingBody.lastIndexOf(nl, existingStartIdx);
      const beforeStart = beforeStartLine >= 0 ? existingBody.slice(0, beforeStartLine) : "";
      return `${beforeStart}${nl}\t// @gen:start ${sh}${nl}${newGeneratedBody}`;
    }
    // Generated has markers but existing doesn't: keep existing, append markers
    if (newMP.starts.length > 0 && newMP.ends.length > 0) {
      const existing = existingBody.trim();
      return existing
        ? `${existing}${nl}\t// @gen:start ${sh}${nl}\t// @gen:end ${sh}`
        : `\t// @gen:start ${sh}${nl}\t// @gen:end ${sh}`;
    }
    return newGeneratedBody;
  }

  let result = "";
  let lastNewPos = 0;

  for (let i = 0; i < pairCount; i++) {
    const ns = newMP.starts[i];
    const ne = newMP.ends[i];
    if (ne <= ns) continue;

    if (i === 0 && existingMP.starts.length > 0 && existingMP.starts[0] > 0) {
      result += existingBody.slice(0, existingMP.starts[0]);
    } else {
      result += newGeneratedBody.slice(lastNewPos, ns);
    }
    result += markerLine(newGeneratedBody, ns, nl);

    if (
      i < existingMP.starts.length &&
      i < existingMP.ends.length &&
      existingMP.ends[i] > existingMP.starts[i]
    ) {
      const inner = extractInner(existingBody, existingMP.starts[i], existingMP.ends[i], nl);
      if (inner) result += inner + nl;
    } else {
      const inner = extractInner(newGeneratedBody, ns, ne, nl);
      if (inner) result += inner + nl;
    }

    result += markerLine(newGeneratedBody, ne, nl);
    const afterNewEndLine = newGeneratedBody.indexOf(nl, ne);
    lastNewPos = afterNewEndLine >= 0 ? afterNewEndLine + nl.length : newGeneratedBody.length;
  }

  if (existingMP.starts.length > pairCount) {
    for (let i = pairCount; i < existingMP.starts.length && i < existingMP.ends.length; i++) {
      const es = existingMP.starts[i];
      const ee = existingMP.ends[i];
      if (ee <= es) continue;
      result += markerLine(existingBody, es, nl);
      const inner = extractInner(existingBody, es, ee, nl);
      if (inner) result += inner + nl;
      result += markerLine(existingBody, ee, nl);
    }
  }

  let hasUserAfter = false;
  if (existingMP.ends.length > 0) {
    const le = existingMP.ends[existingMP.ends.length - 1];
    const afterLastEnd = existingBody.indexOf(nl, le);
    if (afterLastEnd >= 0) {
      const userAfter = existingBody.slice(afterLastEnd + nl.length);
      if (userAfter.length > 0) {
        result += userAfter;
        hasUserAfter = true;
      }
    }
  }
  if (!hasUserAfter) {
    result += newGeneratedBody.slice(lastNewPos);
  }

  return result;
}

function buildDeclarationText(region: GeneratedRegion, body: string): string {
  if (region.kind === "method" || region.kind === "function") {
    if (region.signature) {
      const nl = body.includes("\r\n") ? "\r\n" : "\n";
      const cleanBody = body.replace(/^\n+/, "").replace(/\n+$/, "");
      return `${region.signature} {${nl}${cleanBody}${nl}}`;
    }
  }
  if (region.kind === "struct") {
    const nl = body.includes("\r\n") ? "\r\n" : "\n";
    const cleaned = body.replace(/^\n+/, "").replace(/\n+$/, "");
    if (!cleaned.trim()) {
      return `type ${region.symbolName} struct {${nl}}`;
    }
    return `type ${region.symbolName} struct {${nl}${cleaned}${nl}}`;
  }
  return region.content;
}

function importPath(spec: string): string {
  const m = spec.match(/"([^"]+)"/);
  return m ? m[1] : spec;
}

function extractImportsFromContent(content: string): string[] {
  const specs: string[] = [];
  // Match import block: import ( ... )
  const blockMatch = content.match(/import\s*\(([\s\S]*?)\)/);
  if (blockMatch) {
    const inner = blockMatch[1];
    for (const line of inner.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && trimmed.startsWith('"') && trimmed.endsWith('"')) {
        specs.push(trimmed);
      }
      // Handle aliased imports: alias "path"
      const aliasMatch = trimmed.match(/^(\w+\s+)"([^"]+)"$/);
      if (aliasMatch) {
        specs.push(trimmed);
      }
    }
  }
  // Match single import: import "path"
  const singleMatch = content.match(/import\s+"([^"]+)"/);
  if (singleMatch && specs.length === 0) {
    specs.push(`"${singleMatch[1]}"`);
  }
  return specs;
}

export function mergeImports(text: string, patch: GeneratedFilePatch, fileText: string): string {
  const plannedSpecs: string[] = [];
  const seenPaths = new Set<string>();

  // Collect from region.imports array
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

  // Collect from region.content string (import blocks without imports array)
  for (const region of patch.regions) {
    if (region.kind === "imports" && !region.imports && region.content) {
      const importSpecs = extractImportsFromContent(region.content);
      for (const imp of importSpecs) {
        const p = importPath(imp);
        if (!seenPaths.has(p)) {
          seenPaths.add(p);
          plannedSpecs.push(imp);
        }
      }
    }
  }

  const importLineRe = /^(\w+\s+)?"([^"]+)"/;
  const importBlockRe = /^([ \t]*)import\s*\(([\s\S]*?)\)[ \t]*$/m;
  const singleImportRe = /^[ \t]*import\s+"([^"]+)"[ \t]*$/m;

  const textBlockMatch = text.match(importBlockRe);
  const fileBlockMatch = fileText.match(importBlockRe);

  // If no planned imports, copy/preserve imports from fileText
  if (plannedSpecs.length === 0) {
    const pkgIdx = text.search(/^package\s+\w+\s*$/m);
    if (pkgIdx < 0) return text;
    const lineEnd = text.indexOf("\n", pkgIdx);
    const insertAt = lineEnd >= 0 ? lineEnd + 1 : text.length;

    if (fileBlockMatch && (!textBlockMatch || fileBlockMatch[0] !== textBlockMatch[0])) {
      const fullBlock = fileBlockMatch[0];
      if (textBlockMatch) {
        return text.replace(importBlockRe, fullBlock);
      }
      return text.slice(0, insertAt) + `\n${fullBlock}\n` + text.slice(insertAt);
    }

    if (!textBlockMatch && !text.match(singleImportRe)) {
      const singleMatch = fileText.match(singleImportRe);
      if (singleMatch) {
        return text.slice(0, insertAt) + `\n${singleMatch[0]}\n` + text.slice(insertAt);
      }
    }
    return text;
  }

  if (fileBlockMatch) {
    // fileText (skeleton) has an import block — check if text needs it
    const existingSpecs = new Map<string, { spec: string; index: number }>();
    const inner = fileBlockMatch[2];
    const innerLines = inner.split("\n");
    for (let i = 0; i < innerLines.length; i++) {
      const trimmed = innerLines[i].trim();
      const m = trimmed.match(importLineRe);
      if (m) existingSpecs.set(m[2], { spec: trimmed, index: i });
    }

    const toAdd: string[] = [];
    const toUpdate = new Map<number, string>();
    for (const spec of plannedSpecs) {
      const path = importPath(spec);
      const existing = existingSpecs.get(path);
      if (!existing) {
        toAdd.push(spec);
      } else if (existing.spec !== spec) {
        toUpdate.set(existing.index, spec);
      }
    }

    // If no changes needed, ensure text has the import block from fileText
    if (toAdd.length === 0 && toUpdate.size === 0) {
      if (!textBlockMatch) {
        // text is missing the import block — copy it from fileText
        const fullBlock = fileBlockMatch[0];
        const pkgIdx = text.search(/^package\s+\w+\s*$/m);
        if (pkgIdx >= 0) {
          const lineEnd = text.indexOf("\n", pkgIdx);
          const insertAt = lineEnd >= 0 ? lineEnd + 1 : text.length;
          return text.slice(0, insertAt) + `\n${fullBlock}\n` + text.slice(insertAt);
        }
      }
      return text;
    }

    let updatedInner: string;
    if (toUpdate.size > 0) {
      const lines = [...innerLines];
      for (const [index, spec] of toUpdate) {
        lines[index] = `\t${spec}`;
      }
      updatedInner = lines.join("\n");
    } else {
      updatedInner = inner;
    }

    const indent = fileBlockMatch[1] ?? "";
    if (toAdd.length > 0) {
      const newSpecLines = toAdd.map((s) => `${indent}\t${s}`).join("\n");
      updatedInner = updatedInner.replace(/[ \t]*\n?\s*$/, "") + "\n" + newSpecLines + "\n";
    }
    const updatedBlock = `${indent}import (${updatedInner}${indent})`;

    if (textBlockMatch) {
      return text.replace(importBlockRe, updatedBlock);
    }
    const pkgIdx = text.search(/^package\s+\w+\s*$/m);
    if (pkgIdx >= 0) {
      const lineEnd = text.indexOf("\n", pkgIdx);
      const insertAt = lineEnd >= 0 ? lineEnd + 1 : text.length;
      return text.slice(0, insertAt) + `\n${updatedBlock}\n` + text.slice(insertAt);
    }
    return text;
  }

  const singleMatch = fileText.match(singleImportRe);
  if (singleMatch) {
    const existingPath = singleMatch[1];
    const aliasUpdate = plannedSpecs.find(
      (spec) => importPath(spec) === existingPath && spec !== `"${existingPath}"`,
    );
    const toAdd = plannedSpecs.filter((spec) => importPath(spec) !== existingPath);
    if (toAdd.length === 0 && !aliasUpdate) {
      if (!textBlockMatch && !text.match(singleImportRe)) {
        const pkgIdx = text.search(/^package\s+\w+\s*$/m);
        if (pkgIdx >= 0) {
          const lineEnd = text.indexOf("\n", pkgIdx);
          const insertAt = lineEnd >= 0 ? lineEnd + 1 : text.length;
          return (
            text.slice(0, insertAt) +
            `\n${fileText.match(singleImportRe)![0]}\n` +
            text.slice(insertAt)
          );
        }
      }
      return text;
    }

    const existingEntry = aliasUpdate ?? `"${existingPath}"`;
    const allLines = [`\t${existingEntry}`, ...toAdd.map((s) => `\t${s}`)].sort();
    const updatedBlock = `import (\n${allLines.join("\n")}\n)`;

    if (textBlockMatch) {
      return text.replace(importBlockRe, updatedBlock);
    }
    if (text.match(singleImportRe)) {
      return text.replace(singleImportRe, updatedBlock);
    }
    const pkgIdx = text.search(/^package\s+\w+\s*$/m);
    if (pkgIdx >= 0) {
      const lineEnd = text.indexOf("\n", pkgIdx);
      const insertAt = lineEnd >= 0 ? lineEnd + 1 : text.length;
      return text.slice(0, insertAt) + `\n${updatedBlock}\n` + text.slice(insertAt);
    }
    return text;
  }

  const allSpecs = [...plannedSpecs].sort();
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
    return text.slice(0, insertAt) + lines.join("\n") + "\n" + text.slice(insertAt);
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
