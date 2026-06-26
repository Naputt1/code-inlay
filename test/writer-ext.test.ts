import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateBeforeWrite, detectDrift, atomicWritePatches } from "../src/index.js";
import { applyInnerMarkers } from "../src/writer/go-writer.js";
import type { GeneratedFilePatch, Diagnostic, GeneratedRegion } from "../src/index.js";

describe("validateBeforeWrite", () => {
  it("accepts valid patches", () => {
    const diagnostics: Diagnostic[] = [];
    const patches: GeneratedFilePatch[] = [
      {
        path: "test.go",
        regions: [{ id: "r1", content: "a", owner: "test", language: "go", stableHash: "h1" }],
      },
    ];
    const result = validateBeforeWrite(patches, diagnostics);
    expect(result).toBe(true);
  });

  it("reports error for duplicate region IDs in same file", () => {
    const diagnostics: Diagnostic[] = [];
    const patches: GeneratedFilePatch[] = [
      {
        path: "test.go",
        regions: [
          { id: "r1", content: "a", owner: "test", language: "go", stableHash: "h1" },
          { id: "r1", content: "b", owner: "test", language: "go", stableHash: "h2" },
        ],
      },
    ];
    const result = validateBeforeWrite(patches, diagnostics);
    expect(result).toBe(false);
    expect(diagnostics.some((d) => d.code === "duplicate-region-id")).toBe(true);
  });

  it("reports error for duplicate region IDs across files", () => {
    const diagnostics: Diagnostic[] = [];
    const patches: GeneratedFilePatch[] = [
      {
        path: "a.go",
        regions: [{ id: "dup", content: "x", owner: "test", language: "go", stableHash: "h1" }],
      },
      {
        path: "b.go",
        regions: [{ id: "dup", content: "y", owner: "test", language: "go", stableHash: "h2" }],
      },
    ];
    const result = validateBeforeWrite(patches, diagnostics);
    expect(result).toBe(false);
    expect(diagnostics.some((d) => d.code === "duplicate-region-id")).toBe(true);
  });
});

describe("detectDrift", () => {
  it("returns false when no regions to check", () => {
    const diagnostics: Diagnostic[] = [];
    const result = detectDrift("some text", [], {}, diagnostics);
    expect(result).toBe(false);
    expect(diagnostics).toHaveLength(0);
  });
});

describe("applyInnerMarkers", () => {
  it("returns new body verbatim when neither has markers", () => {
    const region: GeneratedRegion = {
      id: "r1",
      content: "",
      owner: "test",
      language: "go",
      stableHash: "h1",
    };
    const existing = "some existing code";
    const newBody = "entirely new code";
    expect(applyInnerMarkers(region, existing, newBody)).toBe("entirely new code");
  });
});

describe("atomicWritePatches — dry run", () => {
  it("succeeds with valid patches in dry run mode", () => {
    const cwd = join(tmpdir(), `atomic-dry-${Date.now()}`);
    mkdirSync(cwd, { recursive: true });
    const diagnostics: Diagnostic[] = [];
    const patches: GeneratedFilePatch[] = [
      {
        path: "test.go",
        regions: [
          { id: "r1", content: "package test", owner: "test", language: "go", stableHash: "h1" },
        ],
      },
    ];
    atomicWritePatches(patches, cwd, "skeleton", diagnostics, undefined, true);
    expect(diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
  });
});
