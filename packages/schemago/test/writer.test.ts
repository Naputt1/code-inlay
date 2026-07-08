import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  atomicWritePatches,
  validateBeforeWrite,
  injectContent,
  detectDrift,
  applyInnerMarkers,
  shortHash,
} from "../src/index.js";
import { contentHash } from "../src/utils/hash.js";
import type { Diagnostic, GeneratedFilePatch, GeneratedRegion } from "../src/index.js";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    statSync: vi.fn(actual.statSync),
  };
});

const nl = "\n";
const rid = "test.module.route.handler";
const sh = shortHash(rid);
const startMkr = `// @gen:start ${sh}`;
const endMkr = `// @gen:end ${sh}`;
const region: GeneratedRegion = { id: rid, content: "", language: "go" };
const tab = "\t";

describe("applyInnerMarkers", () => {
  // ── No markers in newGeneratedBody ──────────────────────────

  it("returns new body verbatim when neither body has markers", () => {
    const existing = "some existing code";
    const newBody = "entirely new code";
    expect(applyInnerMarkers(region, existing, newBody)).toBe("entirely new code");
  });

  it("preserves content after legacy @gen:end when new body has no markers", () => {
    const existing = `old code${nl}${tab}${endMkr}${nl}user addition`;
    const newBody = "new generated";
    expect(applyInnerMarkers(region, existing, newBody)).toBe(`new generated${nl}user addition`);
  });

  it("preserves content before legacy @gen:start when new body has no markers", () => {
    const existing = `user code${nl}${tab}${startMkr}${nl}old generated`;
    const newBody = "new generated content";
    expect(applyInnerMarkers(region, existing, newBody)).toBe(
      `user code${nl}${tab}${startMkr}${nl}new generated content`,
    );
  });

  // ── 1 pair in new, no markers in existing ──────────────────

  it("uses default inner content when existing has no markers", () => {
    const existing = "no markers here at all";
    const newBody = `outer${nl}${startMkr}${nl}default inner${nl}${endMkr}${nl}after`;
    expect(applyInnerMarkers(region, existing, newBody)).toBe(newBody);
  });

  // ── 1 pair in both — user edits preserved ──────────────────

  it("preserves user edits between markers", () => {
    const existing = `outer${nl}${startMkr}${nl}USER EDITED INNER${nl}${endMkr}${nl}after`;
    const newBody = `outer${nl}${startMkr}${nl}default inner${nl}${endMkr}${nl}after`;
    const expected = `outer${nl}${startMkr}${nl}USER EDITED INNER${nl}${endMkr}${nl}after`;
    expect(applyInnerMarkers(region, existing, newBody)).toBe(expected);
  });

  it("refreshes outer content while preserving user inner edits", () => {
    const existing = `OLD outer${nl}${startMkr}${nl}USER EDITED${nl}${endMkr}${nl}OLD after`;
    const newBody = `NEW outer${nl}${startMkr}${nl}default inner${nl}${endMkr}${nl}NEW after`;
    // Content before first marker is preserved from existing: "OLD outer"
    // Content after last marker is preserved from existing: "OLD after"
    // Inner content is preserved from existing: "USER EDITED"
    const expected = `OLD outer${nl}${startMkr}${nl}USER EDITED${nl}${endMkr}${nl}OLD after`;
    expect(applyInnerMarkers(region, existing, newBody)).toBe(expected);
  });

  // ── Content after last marker ──────────────────────────────

  it("preserves user additions after last @gen:end", () => {
    const existing = `${startMkr}${nl}inner${nl}${endMkr}${nl}USER ADDED AFTER`;
    const newBody = `${startMkr}${nl}default inner${nl}${endMkr}`;
    const expected = `${startMkr}${nl}inner${nl}${endMkr}${nl}USER ADDED AFTER`;
    expect(applyInnerMarkers(region, existing, newBody)).toBe(expected);
  });

  // ── User code before first marker ──────────────────────────

  it("preserves user code before first @gen:start", () => {
    const existing = `USER CODE AT TOP${nl}${startMkr}${nl}inner${nl}${endMkr}`;
    const newBody = `${startMkr}${nl}default inner${nl}${endMkr}`;
    const expected = `USER CODE AT TOP${nl}${startMkr}${nl}inner${nl}${endMkr}${nl}`;
    expect(applyInnerMarkers(region, existing, newBody)).toBe(expected);
  });

  it("does not add stray newline when no user code before first marker", () => {
    const existing = `${startMkr}${nl}inner${nl}${endMkr}`;
    const newBody = `${startMkr}${nl}default inner${nl}${endMkr}`;
    const expected = `${startMkr}${nl}inner${nl}${endMkr}${nl}`;
    expect(applyInnerMarkers(region, existing, newBody)).toBe(expected);
  });

  it("preserves user code before and after simultaneously", () => {
    const existing = `TOP${nl}${startMkr}${nl}inner${nl}${endMkr}${nl}BOTTOM`;
    const newBody = `${startMkr}${nl}default inner${nl}${endMkr}`;
    const expected = `TOP${nl}${startMkr}${nl}inner${nl}${endMkr}${nl}BOTTOM`;
    expect(applyInnerMarkers(region, existing, newBody)).toBe(expected);
  });

  it("ignores new outer sections when user code exists before and after", () => {
    const existing = `TOP${nl}${startMkr}${nl}inner${nl}${endMkr}${nl}BOTTOM`;
    const newBody = `NEW TOP${nl}${startMkr}${nl}default inner${nl}${endMkr}${nl}NEW BOTTOM`;
    const expected = `TOP${nl}${startMkr}${nl}inner${nl}${endMkr}${nl}BOTTOM`;
    expect(applyInnerMarkers(region, existing, newBody)).toBe(expected);
  });

  // ── Extra / unmatched marker pairs ─────────────────────────

  it("preserves extra existing marker pairs at end", () => {
    const existing = `${startMkr}${nl}user pair1${nl}${endMkr}${nl}${startMkr}${nl}user pair2${nl}${endMkr}`;
    const newBody = `${startMkr}${nl}default pair1${nl}${endMkr}`;
    const expected = `${startMkr}${nl}user pair1${nl}${endMkr}${nl}${startMkr}${nl}user pair2${nl}${endMkr}${nl}`;
    expect(applyInnerMarkers(region, existing, newBody)).toBe(expected);
  });

  it("uses default for unmatched new pairs when existing has fewer", () => {
    const existing = `${startMkr}${nl}user pair1${nl}${endMkr}`;
    const newBody = `${startMkr}${nl}default pair1${nl}${endMkr}${nl}${startMkr}${nl}default pair2${nl}${endMkr}`;
    const expected = `${startMkr}${nl}user pair1${nl}${endMkr}${nl}${startMkr}${nl}default pair2${nl}${endMkr}${nl}`;
    expect(applyInnerMarkers(region, existing, newBody)).toBe(expected);
  });

  it("preserves user code before first marker alongside extra existing pairs", () => {
    const existing = `TOP${nl}${startMkr}${nl}p1${nl}${endMkr}${nl}${startMkr}${nl}p2${nl}${endMkr}${nl}BOTTOM`;
    const newBody = `${startMkr}${nl}def1${nl}${endMkr}`;
    const expected = `TOP${nl}${startMkr}${nl}p1${nl}${endMkr}${nl}${startMkr}${nl}p2${nl}${endMkr}${nl}BOTTOM`;
    expect(applyInnerMarkers(region, existing, newBody)).toBe(expected);
  });

  // ── Multiple pairs — full refresh ──────────────────────────

  it("handles 2 matched pairs: preserves outer and inner from existing", () => {
    const existing = [
      `OLD before`,
      `${startMkr}`,
      `user inner 1`,
      `${endMkr}`,
      `OLD between`,
      `${startMkr}`,
      `user inner 2`,
      `${endMkr}`,
      `OLD after`,
    ].join(nl);
    const newBody = [
      `NEW before`,
      `${startMkr}`,
      `default 1`,
      `${endMkr}`,
      `NEW between`,
      `${startMkr}`,
      `default 2`,
      `${endMkr}`,
      `NEW after`,
    ].join(nl);
    // Content before first marker preserved: "OLD before"
    // Content between pair1 end and pair2 start: refreshed from new body "NEW between"
    // Content after last marker preserved: "OLD after"
    // Inner of pair1: user inner 1
    // Inner of pair2: user inner 2
    const expected = [
      `OLD before`,
      `${startMkr}`,
      `user inner 1`,
      `${endMkr}`,
      `NEW between`,
      `${startMkr}`,
      `user inner 2`,
      `${endMkr}`,
      `OLD after`,
    ].join(nl);
    expect(applyInnerMarkers(region, existing, newBody)).toBe(expected);
  });

  // ── Edge cases ─────────────────────────────────────────────

  it("preserves empty inner content (user cleared it)", () => {
    const existing = `${startMkr}${nl}${endMkr}`;
    const newBody = `${startMkr}${nl}default${nl}${endMkr}`;
    const expected = `${startMkr}${nl}${endMkr}${nl}`;
    expect(applyInnerMarkers(region, existing, newBody)).toBe(expected);
  });

  it("preserves indented inner content as-is", () => {
    const existing = `${startMkr}${nl}  indented user${nl}  code  ${nl}${endMkr}${nl}after`;
    const newBody = `${startMkr}${nl}default${nl}${endMkr}${nl}after`;
    const expected = `${startMkr}${nl}  indented user${nl}  code  ${nl}${endMkr}${nl}after`;
    expect(applyInnerMarkers(region, existing, newBody)).toBe(expected);
  });

  it("preserves trailing whitespace after last marker", () => {
    const existing = `${startMkr}${nl}${endMkr}${nl}   ${nl}`;
    const newBody = `${startMkr}${nl}default${nl}${endMkr}`;
    const expected = `${startMkr}${nl}${endMkr}${nl}   ${nl}`;
    expect(applyInnerMarkers(region, existing, newBody)).toBe(expected);
  });
});

describe("atomic write + rollback", () => {
  it("writes files atomically via temp file", async () => {
    const cwd = join(tmpdir(), `schemago-phase2-${Date.now()}`);
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
    const cwd = join(tmpdir(), `schemago-phase2-mk-${Date.now()}`);

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
    const cwd = join(tmpdir(), `schemago-phase2-sk-${Date.now()}`);

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
    const cwd = join(tmpdir(), `schemago-phase2-rollback-${Date.now()}`);
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

  it("rolls back previously written files on write-failed", () => {
    const cwd = join(tmpdir(), `schemago-phase2-wf-${Date.now()}`);
    mkdirSync(join(cwd, "internal/user"), { recursive: true });

    const originalA = "package user\n\n// @gen:start r1\noriginal\n// @gen:end r1\n";
    const originalB = "package user\n\n// @gen:start r2\noriginal\n// @gen:end r2\n";

    writeFileSync(join(cwd, "internal/user/a.go"), originalA);
    writeFileSync(join(cwd, "internal/user/b.go"), originalB);

    // Make writeAtomic fail for b.go by placing a directory at the temp path
    mkdirSync(join(cwd, "internal/user/b.go.gen.tmp"));

    const patches: GeneratedFilePatch[] = [
      {
        path: "internal/user/a.go",
        regions: [{ id: "r1", content: "type Foo struct{}", language: "go" }],
      },
      {
        path: "internal/user/b.go",
        regions: [{ id: "r2", content: "type Bar struct{}", language: "go" }],
      },
    ];

    const diagnostics: Diagnostic[] = [];
    atomicWritePatches(patches, cwd, "skeleton", diagnostics);

    expect(readFileSync(join(cwd, "internal/user/a.go"), "utf8")).toBe(originalA);
    expect(readFileSync(join(cwd, "internal/user/b.go"), "utf8")).toBe(originalB);
    expect(diagnostics.some((d) => d.code === "write-failed")).toBe(true);
  });

  it("rolls back previously written files on concurrent edit", () => {
    const cwd = join(tmpdir(), `schemago-phase2-ce-${Date.now()}`);
    mkdirSync(join(cwd, "internal/user"), { recursive: true });

    const originalA = "package user\n\n// @gen:start r1\noriginal\n// @gen:end r1\n";
    const originalB = "package user\n\n// @gen:start r2\noriginal\n// @gen:end r2\n";

    writeFileSync(join(cwd, "internal/user/a.go"), originalA);
    writeFileSync(join(cwd, "internal/user/b.go"), originalB);

    const patches: GeneratedFilePatch[] = [
      {
        path: "internal/user/a.go",
        regions: [{ id: "r1", content: "type Foo struct{}", language: "go" }],
      },
      {
        path: "internal/user/b.go",
        regions: [{ id: "r2", content: "type Bar struct{}", language: "go" }],
      },
    ];

    const statCallCount = new Map<string, number>();
    const statMock = vi.mocked(statSync);
    statMock.mockImplementation((path: unknown) => {
      const key = (path as import("node:fs").PathLike).toString();
      const count = (statCallCount.get(key) ?? 0) + 1;
      statCallCount.set(key, count);
      if (key.endsWith("a.go")) {
        return { mtimeMs: 1000, size: 100 } as import("node:fs").Stats;
      }
      if (key.endsWith("b.go")) {
        return count === 1
          ? ({ mtimeMs: 2000, size: 200 } as import("node:fs").Stats)
          : ({ mtimeMs: 3000, size: 300 } as import("node:fs").Stats);
      }
      return { mtimeMs: 0, size: 0 } as import("node:fs").Stats;
    });

    const diagnostics: Diagnostic[] = [];
    atomicWritePatches(patches, cwd, "skeleton", diagnostics);

    expect(readFileSync(join(cwd, "internal/user/a.go"), "utf8")).toBe(originalA);
    expect(readFileSync(join(cwd, "internal/user/b.go"), "utf8")).toBe(originalB);
    expect(diagnostics.some((d) => d.code === "concurrent-edit")).toBe(true);
  });
  it("rolls back deletes newly created files on write-failed", () => {
    const cwd = join(tmpdir(), `schemago-phase2-rm-${Date.now()}`);
    mkdirSync(join(cwd, "internal/user"), { recursive: true });

    const originalA = "package user\n\n// @gen:start r1\noriginal\n// @gen:end r1\n";

    writeFileSync(join(cwd, "internal/user/a.go"), originalA);

    // Make writeAtomic fail for b.go by placing a directory at the temp path
    mkdirSync(join(cwd, "internal/user/b.go.gen.tmp"));

    const patches: GeneratedFilePatch[] = [
      {
        path: "internal/user/b.go",
        regions: [{ id: "r1", content: "type Bar struct{}", language: "go" }],
      },
      {
        path: "internal/user/a.go",
        regions: [{ id: "r2", content: "type Foo struct{}", language: "go" }],
      },
    ];

    const diagnostics: Diagnostic[] = [];
    atomicWritePatches(patches, cwd, "skeleton", diagnostics);

    expect(readFileSync(join(cwd, "internal/user/a.go"), "utf8")).toBe(originalA);
    expect(existsSync(join(cwd, "internal/user/b.go"))).toBe(false);
    expect(diagnostics.some((d) => d.code === "write-failed")).toBe(true);
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

describe("injectContent", () => {
  it("injects content with stable hash markers", () => {
    const fileText = [
      "package test",
      "",
      "// @gen:start test.region",
      "// @gen:end test.region",
      "",
    ].join("\n");

    const result = injectContent(
      fileText,
      [
        {
          id: "test.region",
          content: "type Foo struct{}",
          stableHash: "abc123",
          owner: "gin",
          language: "go",
        },
      ],
      [],
    );

    expect(result).toContain("// @gen:start test.region hash:abc123");
    expect(result).toContain("// @gen:end test.region");
    expect(result).toContain("type Foo struct{}");
  });
});

describe("detectDrift", () => {
  it("detects region drift", () => {
    const fileText = [
      "// @gen:start test.region",
      "manual content",
      "// @gen:end test.region",
    ].join("\n");

    const generatedHash = contentHash("generated content");
    const diagnostics: Diagnostic[] = [];
    const cache: Record<string, { contentHash: string }> = {
      "test.region": { contentHash: generatedHash },
    };

    const hasDrift = detectDrift(
      fileText,
      [{ id: "test.region", content: "generated content", contentHash: generatedHash }],
      cache,
      diagnostics,
      "test.go",
    );

    expect(hasDrift).toBe(true);
    expect(diagnostics.some((d) => d.code === "region-drift")).toBe(true);
  });

  it("skips drift detection with force region", () => {
    const fileText = [
      "// @gen:start test.region",
      "manual content",
      "// @gen:end test.region",
    ].join("\n");

    const generatedHash = contentHash("generated content");
    const diagnostics: Diagnostic[] = [];
    const cache: Record<string, { contentHash: string }> = {
      "test.region": { contentHash: generatedHash },
    };

    const hasDrift = detectDrift(
      fileText,
      [{ id: "test.region", content: "generated content", contentHash: generatedHash }],
      cache,
      diagnostics,
      "test.go",
      ["test.region"],
    );

    expect(hasDrift).toBe(false);
    expect(diagnostics.some((d) => d.code === "region-drift")).toBe(false);
  });
});
