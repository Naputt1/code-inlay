import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Diagnostic, FileDiff, GeneratedFilePatch } from "./types.js";

type RegionMatch = {
  id: string;
  startIndex: number;
  startLineEnd: number;
  endIndex: number;
  endLineEnd: number;
};

const startPattern = /^([ \t]*)\/\/ @gen:start ([a-zA-Z0-9._-]+)[ \t]*$/gm;
const endPattern = /^([ \t]*)\/\/ @gen:end ([a-zA-Z0-9._-]+)[ \t]*$/gm;

export function applyPatches(input: {
  cwd: string;
  patches: GeneratedFilePatch[];
  diagnostics: Diagnostic[];
  write: boolean;
}): { changedFiles: string[]; diffs: FileDiff[] } {
  const changedFiles: string[] = [];
  const diffs: FileDiff[] = [];

  for (const patch of input.patches) {
    const absolutePath = resolve(input.cwd, patch.path);
    if (!existsSync(absolutePath)) {
      const pkg = derivePackage(patch.path);
      const skeleton = [
        `package ${pkg}`,
        "",
        ...patch.regions.flatMap((r) => [
          `// @gen:start ${r.id}`,
          `// @gen:end ${r.id}`,
        ]),
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
  regions: { id: string; content: string }[],
  diagnostics: Diagnostic[],
  file?: string,
): string {
  const matches = parseRegions(fileText, diagnostics, file);
  let next = fileText;
  const seenPatchRegions = new Set<string>();
  const planned = regions
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

function parseRegions(fileText: string, diagnostics: Diagnostic[], file?: string): RegionMatch[] {
  const starts = [...fileText.matchAll(startPattern)].map((match) => ({
    id: match[2],
    index: match.index ?? 0,
    lineEnd: lineEnd(fileText, match.index ?? 0),
  }));
  const ends = [...fileText.matchAll(endPattern)].map((match) => ({
    id: match[2],
    index: match.index ?? 0,
    lineEnd: lineEnd(fileText, match.index ?? 0),
  }));

  const matches: RegionMatch[] = [];
  const seen = new Set<string>();

  for (const start of starts) {
    const end = ends.find((candidate) => candidate.id === start.id && candidate.index > start.index);
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

function lineEnd(fileText: string, index: number): number {
  const nextLine = fileText.indexOf("\n", index);
  return nextLine === -1 ? fileText.length : nextLine + 1;
}

function derivePackage(filePath: string): string {
  if (filePath.startsWith("cmd/")) return "main";
  const dir = dirname(filePath);
  if (dir === ".") return "main";
  return dir.split(/[\\/]/).pop() ?? "main";
}
