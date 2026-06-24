import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { atomicWritePatches, validateBeforeWrite } from "../src/index.js";
import type { Diagnostic, GeneratedFilePatch } from "../src/index.js";

describe("atomic write + rollback", () => {
  it("writes files atomically via temp file", async () => {
    const cwd = join(tmpdir(), `backend-gen-phase2-${Date.now()}`);
    mkdirSync(join(cwd, "internal/user"), { recursive: true });
    writeFileSync(
      join(cwd, "internal/user/types.go"),
      ["package user", "", "// @gen:start test.region", "// @gen:end test.region"].join("\n"),
    );

    const patches: GeneratedFilePatch[] = [
      {
        path: "internal/user/types.go",
        regions: [
          {
            id: "test.region",
            content: "type Foo struct{}",
            language: "go",
          },
        ],
      },
    ];

    const result = atomicWritePatches(patches, cwd, "skeleton", []);

    expect(result.changedFiles).toContain("internal/user/types.go");
    const content = readFileSync(join(cwd, "internal/user/types.go"), "utf8");
    expect(content).toContain("type Foo struct{}");
  });

  it("creates skeleton files with markers-only option", () => {
    const cwd = join(tmpdir(), `backend-gen-phase2-mk-${Date.now()}`);

    const patches: GeneratedFilePatch[] = [
      {
        path: "internal/user/types.go",
        regions: [
          {
            id: "test.region",
            content: "type Foo struct{}",
            language: "go",
          },
        ],
      },
    ];

    const result = atomicWritePatches(patches, cwd, "markers-only", []);

    expect(result.changedFiles).toContain("internal/user/types.go");
    const content = readFileSync(join(cwd, "internal/user/types.go"), "utf8");
    expect(content).toContain("// @gen:start test.region");
    expect(content).toContain("// @gen:end test.region");
  });

  it("skips missing files when fileCreation is disabled", () => {
    const cwd = join(tmpdir(), `backend-gen-phase2-sk-${Date.now()}`);

    const patches: GeneratedFilePatch[] = [
      {
        path: "internal/user/types.go",
        regions: [
          {
            id: "test.region",
            content: "type Foo struct{}",
            language: "go",
          },
        ],
      },
    ];

    const diagnostics: Diagnostic[] = [];
    const result = atomicWritePatches(patches, cwd, "disabled", diagnostics);

    expect(result.changedFiles).toEqual([]);
    expect(diagnostics.some((d) => d.code === "file-not-found")).toBe(true);
  });

  it("restores files from snapshot on failure", () => {
    const cwd = join(tmpdir(), `backend-gen-phase2-rollback-${Date.now()}`);
    mkdirSync(join(cwd, "internal/user"), { recursive: true });
    const originalContent = [
      "package user",
      "",
      "// @gen:start r1",
      "original",
      "// @gen:end r1",
      "",
    ].join("\n");
    writeFileSync(join(cwd, "internal/user/types.go"), originalContent);

    const patches: GeneratedFilePatch[] = [
      {
        path: "internal/user/types.go",
        regions: [
          {
            id: "r1",
            content: "type Foo struct{}",
            language: "go",
          },
        ],
      },
    ];

    const result = atomicWritePatches(patches, cwd, "skeleton", []);

    expect(result.changedFiles).toContain("internal/user/types.go");
    const content = readFileSync(join(cwd, "internal/user/types.go"), "utf8");
    expect(content).not.toContain("original");
    expect(content).toContain("type Foo struct{}");
  });
});

describe("pre-write validation", () => {
  it("rejects duplicate region IDs in one file", () => {
    const patches: GeneratedFilePatch[] = [
      {
        path: "test.go",
        regions: [
          { id: "dup", content: "a", language: "go" },
          { id: "dup", content: "b", language: "go" },
        ],
      },
    ];

    const diagnostics: Diagnostic[] = [];
    const valid = validateBeforeWrite(patches, diagnostics);

    expect(valid).toBe(false);
    expect(diagnostics.some((d) => d.code === "duplicate-generated-region")).toBe(true);
  });

  it("rejects duplicate stable hashes", () => {
    const patches: GeneratedFilePatch[] = [
      {
        path: "test.go",
        regions: [
          { id: "a", content: "x", stableHash: "same", language: "go" },
          { id: "b", content: "y", stableHash: "same", language: "go" },
        ],
      },
    ];

    const diagnostics: Diagnostic[] = [];
    const valid = validateBeforeWrite(patches, diagnostics);

    expect(valid).toBe(false);
    expect(diagnostics.some((d) => d.code === "duplicate-region-hash")).toBe(true);
  });
});
