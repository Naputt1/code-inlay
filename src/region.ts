import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Diagnostic, FileDiff, GeneratedFilePatch } from "./types.js";
import { formatGoSnippet } from "./format.js";

const startPattern =
  /^([ \t]*)\/\/ @gen:start ([a-zA-Z0-9._-]+)(?: hash:\S+)?(?: owner:\S+)?[ \t]*$/gm;
const endPattern = /^([ \t]*)\/\/ @gen:end ([a-zA-Z0-9._-]+)(?: hash:\S+)?[ \t]*$/gm;

export function applyPatches(input: {
  cwd: string;
  patches: GeneratedFilePatch[];
  diagnostics: Diagnostic[];
  write: boolean;
  fileCreation?: "disabled" | "markers-only" | "skeleton";
}): { changedFiles: string[]; diffs: FileDiff[] } {
  const fileCreation = input.fileCreation ?? "skeleton";
  const changedFiles: string[] = [];
  const diffs: FileDiff[] = [];

  for (const patch of input.patches) {
    const absolutePath = resolve(input.cwd, patch.path);
    if (!existsSync(absolutePath)) {
      if (fileCreation === "disabled") {
        input.diagnostics.push({
          level: "error",
          code: "file-not-found",
          message: `File "${patch.path}" does not exist and file creation is disabled.`,
          file: patch.path,
        });
        continue;
      }

      const pkg = derivePackage(patch.path);
      const skeleton = [
        `package ${pkg}`,
        "",
        ...patch.regions.flatMap((r) => [`// @gen:start ${r.id}`, `// @gen:end ${r.id}`]),
        "",
      ].join("\n");
      mkdirSync(dirname(absolutePath), { recursive: true });
      const before = "";
      const after = injectRegions(skeleton, patch.regions, input.diagnostics, patch.path);
      changedFiles.push(patch.path);
      diffs.push({ path: patch.path, before, after });
      if (input.write) {
        writeFileSync(absolutePath, after);
      }
      continue;
    }

    const before = readFileSync(absolutePath, "utf8");
    const after = injectRegions(before, patch.regions, input.diagnostics, patch.path);
    if (before !== after) {
      changedFiles.push(patch.path);
      diffs.push({ path: patch.path, before, after });
      if (input.write) {
        writeFileSync(absolutePath, after);
      }
    }
  }

  return { changedFiles, diffs };
}

export function injectRegions(
  fileText: string,
  regions: { id: string; content: string; stableHash?: string; owner?: string }[],
  diagnostics: Diagnostic[],
  file?: string,
): string {
  const formattedRegions = regions.map((r) => ({
    ...r,
    content: formatGoSnippet(r.content, diagnostics, r.id),
  }));

  const matches = parseRegions(fileText, diagnostics, file);
  let next = fileText;
  const seenPatchRegions = new Set<string>();
  const planned = formattedRegions
    .map((region) => {
      if (seenPatchRegions.has(region.id)) {
        diagnostics.push({
          level: "error",
          code: "duplicate-generated-region",
          message: `Generated region "${region.id}" appears more than once in one file patch.`,
          file,
          regionId: region.id,
        });
      }
      seenPatchRegions.add(region.id);
      const match = matches.find((candidate) => candidate.id === region.id);
      return { region, match };
    })
    .sort((a, b) => (b.match?.startIndex ?? -1) - (a.match?.startIndex ?? -1));

  for (const { region, match } of planned) {
    if (!match) {
      diagnostics.push({
        level: "error",
        code: "missing-region",
        message: `Missing region "${region.id}"${file ? ` in ${file}` : ""}.`,
        file,
        regionId: region.id,
      });
      continue;
    }

    const newline = fileText.includes("\r\n") ? "\r\n" : "\n";
    const content = region.content.trimEnd();
    next = `${next.slice(0, match.startLineEnd)}${content}${newline}${next.slice(match.endIndex)}`;
  }

  return next;
}

export function parseRegions(fileText: string, diagnostics: Diagnostic[], file?: string) {
  const starts = [...fileText.matchAll(startPattern)].map((match) => ({
    id: match[2],
    index: match.index ?? 0,
    lineEnd: lineEndIndex(fileText, match.index ?? 0),
  }));
  const ends = [...fileText.matchAll(endPattern)].map((match) => ({
    id: match[2],
    index: match.index ?? 0,
    lineEnd: lineEndIndex(fileText, match.index ?? 0),
  }));

  const matches: Array<{
    id: string;
    startIndex: number;
    startLineEnd: number;
    endIndex: number;
    endLineEnd: number;
  }> = [];
  const seen = new Set<string>();

  for (const start of starts) {
    const end = ends.find(
      (candidate) => candidate.id === start.id && candidate.index > start.index,
    );
    if (!end) {
      diagnostics.push({
        level: "error",
        code: "malformed-region",
        message: `Region "${start.id}" has no matching end marker.`,
        file,
        regionId: start.id,
      });
      continue;
    }

    if (seen.has(start.id)) {
      diagnostics.push({
        level: "error",
        code: "duplicate-region",
        message: `Region "${start.id}" appears more than once.`,
        file,
        regionId: start.id,
      });
      continue;
    }

    seen.add(start.id);
    matches.push({
      id: start.id,
      startIndex: start.index,
      startLineEnd: start.lineEnd,
      endIndex: end.index,
      endLineEnd: end.lineEnd,
    });
  }

  const sorted = [...matches].sort((a, b) => a.startIndex - b.startIndex);
  for (let index = 1; index < sorted.length; index += 1) {
    const prev = sorted[index - 1];
    const current = sorted[index];
    if (current.startIndex < prev.endLineEnd) {
      diagnostics.push({
        level: "error",
        code: "overlapping-region",
        message: `Region "${current.id}" overlaps region "${prev.id}".`,
        file,
        regionId: current.id,
      });
    }
  }

  return matches;
}

export function detectDrift(
  fileText: string,
  regions: Array<{ id: string; content: string; stableHash?: string; contentHash?: string }>,
  cache: Record<string, { contentHash: string }>,
  diagnostics: Diagnostic[],
  file?: string,
  forceRegions?: string[],
): boolean {
  const forceSet = new Set(forceRegions ?? []);
  let hasDrift = false;

  for (const region of regions) {
    if (forceSet.has(region.id)) continue;

    const cached = cache[region.id];
    if (!cached) continue;

    const currentContent = extractRegionContent(fileText, region.id);
    if (!currentContent) continue;

    const currentContentHash = simpleHash(currentContent);
    if (currentContentHash !== cached.contentHash) {
      diagnostics.push({
        level: "warning",
        code: "region-drift",
        message: `Region "${region.id}" has been manually edited. Run --force-region ${region.id} to overwrite.`,
        file,
        regionId: region.id,
      });
      hasDrift = true;
    }
  }

  return hasDrift;
}

function extractRegionContent(fileText: string, regionId: string): string {
  const escapedId = regionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startPat = new RegExp(`// @gen:start ${escapedId}`);
  const endPat = new RegExp(`// @gen:end ${escapedId}`);

  const startMatch = fileText.match(startPat);
  const endMatch = fileText.match(endPat);
  if (!startMatch || !endMatch || startMatch.index === undefined || endMatch.index === undefined)
    return "";

  const startLineEnd = lineEndIndex(fileText, startMatch.index);
  return fileText.slice(startLineEnd, endMatch.index);
}

function simpleHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(36);
}

function lineEndIndex(fileText: string, index: number): number {
  const nextLine = fileText.indexOf("\n", index);
  return nextLine === -1 ? fileText.length : nextLine + 1;
}

function derivePackage(filePath: string): string {
  if (filePath.startsWith("cmd/")) return "main";
  const dir = dirname(filePath);
  if (dir === ".") return "main";
  return dir.split(/[\\/]/).pop() ?? "main";
}
