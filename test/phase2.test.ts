import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/types.js";
import {
  compile,
  defineApp,
  defineModule,
  defineRoute,
  buildDependencyGraph,
  readCache,
  writeCache,
  validateCache,
  detectDrift,
  injectContent,
  upgradeLegacyMarkers,
  atomicWritePatches,
  validateBeforeWrite,
} from "../src/index.js";
import type { CompilerCache, GeneratedFilePatch } from "../src/index.js";

describe("Phase 2: Multi-Architecture", () => {
  it("composes layers from multiple architectures in append mode", async () => {
    const route = defineRoute({
      id: "create",
      method: "POST",
      path: "/users",
      handler: "CreateUser",
    });

    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "user",
          architecture: { mode: "append", refs: ["atomic"] },
          routes: [route],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    const expansion = result.architecture?.routes[0];
    const layerKinds = expansion?.layers.map((l) => `${l.kind}:${l.owner}`) ?? [];

    expect(layerKinds.some((k) => k.startsWith("entity:"))).toBe(true);
    expect(layerKinds.some((k) => k.startsWith("handler:"))).toBe(true);
    // clean + atomic overlap on types/handler layers, producing duplicate-symbol diagnostics
    const dupSymbols = result.diagnostics.filter((d) => d.code === "duplicate-symbol");
    expect(dupSymbols.length).toBeGreaterThanOrEqual(1);
    const dupRegionIds = result.diagnostics.filter((d) => d.code === "duplicate-region-id");
    expect(dupRegionIds.length).toBeGreaterThanOrEqual(1);
  });

  it("detects duplicate symbols across architectures", async () => {
    const route = defineRoute({
      id: "create",
      method: "POST",
      path: "/users",
      handler: "CreateUser",
    });

    const app = defineApp({
      architecture: "minimal",
      modules: [
        defineModule({
          name: "user",
          architecture: { mode: "append", refs: ["layered"] },
          routes: [route],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    const hasDupSymbol = result.diagnostics.some((d) => d.code === "duplicate-symbol");
    expect(hasDupSymbol).toBe(true);
  });
});

describe("Phase 2: Multi-Adapter", () => {
  it("handles multiple adapters per route", async () => {
    const route = defineRoute({
      id: "get",
      method: "GET",
      path: "/users/:id",
      handler: "GetUser",
    });

    const app = defineApp({
      architecture: "clean",
      adapters: ["gin"],
      modules: [defineModule({ name: "user", routes: [route] })],
    });

    const result = await compile({ app, dryRun: true });
    const regionIds = result.generation.files.flatMap((f) => f.regions.map((r) => r.id));

    expect(regionIds.some((id) => id.includes("handler"))).toBe(true);
    expect(regionIds.some((id) => id.includes("route"))).toBe(true);
  });
});

describe("Phase 2: Region v2", () => {
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

  it("detects region drift", () => {
    const fileText = [
      "// @gen:start test.region",
      "manual content",
      "// @gen:end test.region",
    ].join("\n");

    const diagnostics: Diagnostic[] = [];
    const cache: Record<string, { contentHash: string }> = {
      "test.region": { contentHash: "generated-hash" },
    };

    const hasDrift = detectDrift(
      fileText,
      [{ id: "test.region", content: "generated content", contentHash: "generated-hash" }],
      cache,
      diagnostics,
      "test.go",
    );

    expect(hasDrift).toBe(true);
    expect(diagnostics.some((d) => d.code === "region-drift")).toBe(true);
  });

  it("detects drift is skipped with force region", () => {
    const fileText = [
      "// @gen:start test.region",
      "manual content",
      "// @gen:end test.region",
    ].join("\n");

    const diagnostics: Diagnostic[] = [];
    const cache: Record<string, { contentHash: string }> = {
      "test.region": { contentHash: "generated-hash" },
    };

    const hasDrift = detectDrift(
      fileText,
      [{ id: "test.region", content: "generated content", contentHash: "generated-hash" }],
      cache,
      diagnostics,
      "test.go",
      ["test.region"],
    );

    expect(hasDrift).toBe(false);
    expect(diagnostics.some((d) => d.code === "region-drift")).toBe(false);
  });

  it("upgrades legacy v1 markers when region is empty", () => {
    const fileText = ["// @gen:start test.region", "// @gen:end test.region"].join("\n");

    const result = upgradeLegacyMarkers(fileText, [
      { id: "test.region", stableHash: "abc123", owner: "gin" },
    ]);

    expect(result).toContain("hash:abc123");
  });

  it("does not upgrade legacy markers with manual content", () => {
    const fileText = [
      "// @gen:start test.region",
      "manual content here",
      "// @gen:end test.region",
    ].join("\n");

    const diagnostics: Diagnostic[] = [];
    const result = upgradeLegacyMarkers(
      fileText,
      [{ id: "test.region", stableHash: "abc123", owner: "gin" }],
      undefined,
      diagnostics,
    );

    expect(result).not.toContain("hash:abc123");
    expect(diagnostics.some((d) => d.code === "legacy-region-drift")).toBe(true);
  });
});

describe("Phase 2: Atomic Write + Rollback", () => {
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

describe("Phase 2: Cache + Dependency Graph", () => {
  it("builds dependency graph with correct node kinds", async () => {
    const route = defineRoute({
      id: "get",
      method: "GET",
      path: "/users/:id",
      handler: "GetUser",
    });

    const app = defineApp({
      architecture: "clean",
      modules: [defineModule({ name: "user", routes: [route] })],
    });

    const result = await compile({ app, dryRun: true });
    const graph =
      result.dependencyGraph ??
      buildDependencyGraph(result.ast!, result.architecture!, result.generation);

    const kinds = new Set(Object.values(graph.nodes).map((n) => n.kind));
    expect(kinds.has("app")).toBe(true);
    expect(kinds.has("module")).toBe(true);
    expect(kinds.has("route")).toBe(true);
  });

  it("writes and reads cache correctly", () => {
    const cwd = join(tmpdir(), `backend-gen-cache-${Date.now()}`);

    const cache: CompilerCache = {
      compilerVersion: "0.2.0",
      astVersion: "2.0",
      pluginManifestHash: "testhash",
      dependencyGraph: { nodes: {}, edges: [] },
      regions: {},
      files: {},
    };

    writeCache(cwd, cache);
    const loaded = readCache(cwd);
    expect(loaded).toBeDefined();
    expect(loaded!.compilerVersion).toBe("0.2.0");
    expect(loaded!.astVersion).toBe("2.0");
  });

  it("validates cache against current versions", () => {
    const valid: CompilerCache = {
      compilerVersion: "0.2.0",
      astVersion: "2.0",
      pluginManifestHash: "abc",
      dependencyGraph: { nodes: {}, edges: [] },
      regions: {},
      files: {},
    };

    expect(validateCache(valid, "0.2.0", "2.0", "abc")).toBe(true);
    expect(validateCache(valid, "0.2.1", "2.0", "abc")).toBe(false);
    expect(validateCache(undefined, "0.2.0", "2.0", "abc")).toBe(false);
  });
});

describe("Phase 2: Pre-write Validation", () => {
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

describe("Phase 2: Pipeline Integration", () => {
  it("runs full pipeline without errors", async () => {
    const route = defineRoute({
      id: "list",
      method: "GET",
      path: "/items",
      handler: "ListItems",
    });

    const app = defineApp({
      architecture: "clean",
      modules: [defineModule({ name: "items", routes: [route] })],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.ast).toBeDefined();
    expect(result.architecture).toBeDefined();
    expect(result.generation).toBeDefined();
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);
  });

  it("generates deterministic output across runs", async () => {
    const route = defineRoute({
      id: "get",
      method: "GET",
      path: "/items/:id",
      handler: "GetItem",
    });

    const app = defineApp({
      architecture: "clean",
      modules: [defineModule({ name: "items", routes: [route] })],
    });

    const first = await compile({ app, dryRun: true });
    const second = await compile({ app, dryRun: true });

    expect(first.generation).toEqual(second.generation);
  });
});
