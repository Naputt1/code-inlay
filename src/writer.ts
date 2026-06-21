import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Diagnostic, FileDiff, GeneratedFilePatch } from "./types.js";
import { formatFile, formatGoSnippet } from "./format.js";

export type FileSnapshot = {
  path: string;
  content: string;
};

export type WriteResult = {
  changedFiles: string[];
  diffs: FileDiff[];
  writtenPaths: string[];
};

export function snapshotFiles(patches: GeneratedFilePatch[], cwd: string): FileSnapshot[] {
  return patches
    .filter((patch) => existsSync(resolve(cwd, patch.path)))
    .map((patch) => {
      const absolutePath = resolve(cwd, patch.path);
      return { path: patch.path, content: readFileSync(absolutePath, "utf8") };
    });
}

export function restoreFromSnapshot(
  snapshots: FileSnapshot[],
  cwd: string,
  excludePaths: Set<string>,
): void {
  for (const snapshot of snapshots) {
    if (excludePaths.has(snapshot.path)) continue;
    const absolutePath = resolve(cwd, snapshot.path);
    writeFileSync(absolutePath, snapshot.content);
  }
}

export function validateBeforeWrite(
  patches: GeneratedFilePatch[],
  diagnostics: Diagnostic[],
): boolean {
  let valid = true;

  const seenRegionIds = new Set<string>();
  const seenRegionHashes = new Set<string>();

  for (const file of patches) {
    const seenInFile = new Set<string>();

    for (const region of file.regions) {
      if (seenInFile.has(region.id)) {
        diagnostics.push({
          level: "error",
          code: "duplicate-generated-region",
          message: `Generated region "${region.id}" appears more than once in "${file.path}".`,
          file: file.path,
          regionId: region.id,
        });
        valid = false;
      }
      seenInFile.add(region.id);

      if (seenRegionIds.has(region.id)) {
        diagnostics.push({
          level: "error",
          code: "duplicate-region-id",
          message: `Region id "${region.id}" appears in multiple files.`,
          file: file.path,
          regionId: region.id,
        });
        valid = false;
      }
      seenRegionIds.add(region.id);

      if (region.stableHash && seenRegionHashes.has(region.stableHash)) {
        diagnostics.push({
          level: "error",
          code: "duplicate-region-hash",
          message: `Duplicate stable hash "${region.stableHash}" for region "${region.id}".`,
          file: file.path,
          regionId: region.id,
        });
        valid = false;
      }
      if (region.stableHash) {
        seenRegionHashes.add(region.stableHash);
      }
    }
  }

  return valid;
}

const orphanPattern =
  /^([ \t]*)\/\/ @gen:start ([a-zA-Z0-9._-]+)(?: hash:(\S+))?(?: owner:(\S+))?[ \t]*$/gm;

export function removeOrphanedRegions(
  fileText: string,
  plannedRegionIds: Set<string>,
  diagnostics: Diagnostic[],
  file?: string,
): string {
  const planned = new Set(plannedRegionIds);
  let result = fileText;

  const orphans: Array<{ id: string; start: number; end: number }> = [];
  const starts: Array<{ id: string; index: number; lineEnd: number }> = [];
  let match: RegExpExecArray | null;

  const localStart = new RegExp(orphanPattern.source, orphanPattern.flags);
  while ((match = localStart.exec(result)) !== null) {
    const id = match[2];
    if (planned.has(id)) continue;
    if (!id.endsWith(".usecase") && !id.endsWith(".0usecase.imports")) continue;
    starts.push({ id, index: match.index, lineEnd: lineEndIndex(result, match.index) });
  }

  const localEnd = new RegExp(endPattern.source, endPattern.flags);
  const ends: Array<{ id: string; index: number; lineEnd: number }> = [];
  while ((match = localEnd.exec(result)) !== null) {
    ends.push({ id: match[2], index: match.index, lineEnd: lineEndIndex(result, match.index) });
  }

  for (const start of starts) {
    const end = ends.find(
      (candidate) => candidate.id === start.id && candidate.index > start.index,
    );
    if (!end) continue;
    orphans.push({ id: start.id, start: start.index, end: end.lineEnd });
    diagnostics.push({
      level: "warning",
      code: "orphaned-region-removed",
      message: `Removed orphaned region "${start.id}" that is no longer generated.`,
      file,
      regionId: start.id,
    });
  }

  orphans.sort((a, b) => b.start - a.start);
  for (const orphan of orphans) {
    const before = result.slice(0, orphan.start);
    const after = result.slice(orphan.end);
    const beforeTrimmed = before.replace(/\n+$/, "");
    const gap = before.length - beforeTrimmed.length;
    const afterTrimmed = after.replace(/^\n+/, "");
    const afterGap = after.length - afterTrimmed.length;
    const separator = gap > 0 && afterGap > 0 ? "\n" : "\n\n";
    result = beforeTrimmed + separator + afterTrimmed;
  }

  return result;
}

export function atomicWritePatches(
  patches: GeneratedFilePatch[],
  cwd: string,
  fileCreation: "disabled" | "markers-only" | "skeleton",
  diagnostics: Diagnostic[],
): WriteResult {
  const changedFiles: string[] = [];
  const diffs: FileDiff[] = [];
  const writtenPaths: string[] = [];

  const snapshots = snapshotFiles(patches, cwd);

  for (const patch of patches) {
    const absolutePath = resolve(cwd, patch.path);
    const fileExists = existsSync(absolutePath);

    if (!fileExists) {
      if (fileCreation === "disabled") {
        diagnostics.push({
          level: "error",
          code: "file-not-found",
          message: `File "${patch.path}" does not exist and file creation is disabled.`,
          file: patch.path,
        });
        continue;
      }

      const isGo = patch.path.endsWith(".go");
      const pkg = isGo ? derivePackage(patch.path) : undefined;
      const skeleton = buildSkeleton(patch.regions, pkg);
      mkdirSync(dirname(absolutePath), { recursive: true });
      const before = "";
      const after = injectContent(skeleton, patch.regions, diagnostics, patch.path);
      changedFiles.push(patch.path);
      diffs.push({ path: patch.path, before, after });

      writeAtomic(absolutePath, after, diagnostics);
      if (!hasErrorsForFile(diagnostics, patch.path)) {
        formatFile(absolutePath, diagnostics);
        writtenPaths.push(patch.path);
      }
      continue;
    }

    const statBefore = statSync(absolutePath);
    const before = readFileSync(absolutePath, "utf8");

    let after = injectContent(before, patch.regions, diagnostics, patch.path);
    const plannedIds = new Set(patch.regions.map((r) => r.id));
    after = removeOrphanedRegions(after, plannedIds, diagnostics, patch.path);
    if (before !== after) {
      const statAfter = statSync(absolutePath);
      if (statAfter.mtimeMs !== statBefore.mtimeMs || statAfter.size !== statBefore.size) {
        diagnostics.push({
          level: "warning",
          code: "concurrent-edit",
          message: `File "${patch.path}" changed between read and write. Skipping this file.`,
          file: patch.path,
        });
        continue;
      }

      changedFiles.push(patch.path);
      diffs.push({ path: patch.path, before, after });

      writeAtomic(absolutePath, after, diagnostics);
      if (!hasErrorsForFile(diagnostics, patch.path)) {
        formatFile(absolutePath, diagnostics);
        writtenPaths.push(patch.path);
      }
    }
  }

  const hasFailures = patches.some((patch) =>
    diagnostics.some(
      (d) => d.file === patch.path && d.level === "error" && d.code === "file-not-found",
    ),
  );

  if (hasFailures) {
    const writtenSet = new Set(writtenPaths);
    restoreFromSnapshot(snapshots, cwd, writtenSet);
  }

  return { changedFiles, diffs, writtenPaths };
}

function writeAtomic(absolutePath: string, content: string, diagnostics: Diagnostic[]): void {
  const tmpPath = absolutePath + ".gen.tmp";
  try {
    writeFileSync(tmpPath, content);
    renameSync(tmpPath, absolutePath);
  } catch (error) {
    diagnostics.push({
      level: "error",
      code: "write-failed",
      message: `Failed to write "${absolutePath}": ${error instanceof Error ? error.message : String(error)}`,
    });
    try {
      if (existsSync(tmpPath)) renameSync(tmpPath, absolutePath + ".gen.failed");
    } catch {
      // ignore
    }
  }
}

function hasErrorsForFile(diagnostics: Diagnostic[], file: string): boolean {
  return diagnostics.some((d) => d.file === file && d.level === "error");
}

function buildSkeleton(regions: GeneratedFilePatch["regions"], pkg?: string): string {
  const lines: string[] = [];
  if (pkg) {
    lines.push(`package ${pkg}`);
    lines.push("");
  }
  for (const r of regions) {
    if (r.language === "json") continue;
    lines.push(`// @gen:start ${r.id}`);
    lines.push(`// @gen:end ${r.id}`);
  }
  lines.push("");
  return lines.join("\n");
}

function derivePackage(filePath: string): string {
  if (filePath.startsWith("cmd/")) return "main";
  const dir = dirname(filePath);
  if (dir === ".") return "main";
  return dir.split(/[\\/]/).pop() ?? "main";
}

const startPattern =
  /^([ \t]*)\/\/ @gen:start ([a-zA-Z0-9._-]+)(?: hash:(\S+))?(?: owner:(\S+))?[ \t]*$/gm;
const endPattern = /^([ \t]*)\/\/ @gen:end ([a-zA-Z0-9._-]+)(?: hash:(\S+))?[ \t]*$/gm;

type RegionMatch = {
  id: string;
  hash?: string;
  owner?: string;
  startIndex: number;
  startLineEnd: number;
  endIndex: number;
  endLineEnd: number;
};

export function injectContent(
  fileText: string,
  regions: GeneratedFilePatch["regions"],
  diagnostics: Diagnostic[],
  file?: string,
): string {
  const formattedRegions = regions.map((r) => ({
    ...r,
    content: r.language === "go" ? formatGoSnippet(r.content, diagnostics, r.id) : r.content,
  }));

  if (formattedRegions.length > 0 && formattedRegions.every((r) => r.language === "json")) {
    return formattedRegions.map((r) => r.content).join("\n");
  }

  const matches = parseRegionMarkers(fileText, diagnostics, file);
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

    const owner = region.owner ? ` owner:${region.owner}` : "";
    const hash = region.stableHash ? ` hash:${region.stableHash}` : "";

    const startMarker = `// @gen:start ${region.id}${hash}${owner}`;
    const endMarker = `// @gen:end ${region.id}${hash}`;

    const beforeStart = next.slice(0, match.startIndex);
    const afterEnd = next.slice(match.endLineEnd);

    const existingStartLine = next.slice(match.startIndex, match.startLineEnd);
    const existingEndLine = next.slice(match.endIndex, match.endLineEnd);

    const wsStart = existingStartLine.match(/^([ \t]*)/)?.[1] ?? "";
    const wsEnd = existingEndLine.match(/^([ \t]*)/)?.[1] ?? "";

    next = `${beforeStart}${wsStart}${startMarker}${newline}${content}${newline}${wsEnd}${endMarker}${newline}${afterEnd}`;
  }

  return next;
}

function parseRegionMarkers(
  fileText: string,
  diagnostics: Diagnostic[],
  file?: string,
): RegionMatch[] {
  const starts = [...fileText.matchAll(startPattern)].map((match) => ({
    id: match[2],
    hash: match[3] ?? undefined,
    owner: match[4] ?? undefined,
    index: match.index ?? 0,
    lineEnd: lineEndIndex(fileText, match.index ?? 0),
  }));
  const ends = [...fileText.matchAll(endPattern)].map((match) => ({
    id: match[2],
    hash: match[3] ?? undefined,
    index: match.index ?? 0,
    lineEnd: lineEndIndex(fileText, match.index ?? 0),
  }));

  const matches: RegionMatch[] = [];
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
      hash: start.hash,
      owner: start.owner,
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

function lineEndIndex(fileText: string, index: number): number {
  const nextLine = fileText.indexOf("\n", index);
  return nextLine === -1 ? fileText.length : nextLine + 1;
}

export function upgradeLegacyMarkers(
  fileText: string,
  plannedRegions: Array<{ id: string; stableHash?: string; owner?: string; contentHash?: string }>,
  cache?: Record<string, { contentHash: string }>,
  diagnostics?: Diagnostic[],
): string {
  let next = fileText;
  const legacyPattern = /^([ \t]*)\/\/ @gen:start ([a-zA-Z0-9._-]+)[ \t]*$/gm;
  const legacyMarkers = [...fileText.matchAll(legacyPattern)];

  for (const match of legacyMarkers) {
    const regionId = match[2];
    const planned = plannedRegions.find((r) => r.id === regionId);
    if (!planned) continue;

    const startIndex = match.index ?? 0;
    const lineEnd = lineEndIndex(fileText, startIndex);

    const regionContent = extractRegionContent(fileText, regionId);
    const cached = cache?.[regionId];

    const shouldUpgrade =
      !regionContent ||
      (cached && cached.contentHash === planned.contentHash) ||
      (cached && regionContent === cached.contentHash);

    if (shouldUpgrade) {
      const owner = planned.owner ? ` owner:${planned.owner}` : "";
      const hash = planned.stableHash ? ` hash:${planned.stableHash}` : "";
      const newStart = `// @gen:start ${regionId}${hash}${owner}`;
      next = `${next.slice(0, startIndex)}${newStart}\n${next.slice(lineEnd)}`;

      const endMarker = `// @gen:end ${regionId}`;
      const endIdx = next.lastIndexOf(endMarker);
      if (endIdx !== -1) {
        const endLineEnd = lineEndIndex(next, endIdx);
        const newEnd = `// @gen:end ${regionId}${hash}`;
        next = `${next.slice(0, endIdx)}${newEnd}${next.slice(endLineEnd)}`;
      }
    } else if (diagnostics) {
      diagnostics.push({
        level: "warning",
        code: "legacy-region-drift",
        message: `Region "${regionId}" has legacy markers with manual content. Run with --force-region ${regionId} to overwrite.`,
        regionId,
      });
    }
  }

  return next;
}

function extractRegionContent(fileText: string, regionId: string): string {
  const startPat = new RegExp(`// @gen:start ${escapeRegex(regionId)}`);
  const endPat = new RegExp(`// @gen:end ${escapeRegex(regionId)}`);

  const startMatch = fileText.match(startPat);
  const endMatch = fileText.match(endPat);
  if (!startMatch || !endMatch || startMatch.index === undefined || endMatch.index === undefined)
    return "";

  const startLineEnd = lineEndIndex(fileText, startMatch.index);
  return fileText.slice(startLineEnd, endMatch.index);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
