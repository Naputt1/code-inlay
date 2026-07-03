import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  compile,
  defineApp,
  defineModule,
  defineRoute,
  buildDependencyGraph,
  invalidateChanged,
  readCache,
  writeCache,
  validateCache,
} from "../src/index.js";
import type { CompilerCache, DependencyGraph, DependencyNode } from "../src/index.js";

describe("cache + dependency graph", () => {
  it("builds dependency graph with correct node kinds", async () => {
    const route = defineRoute({
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

  it("includes schema nodes for routes with query and body", async () => {
    const route = defineRoute({
      method: "POST",
      path: "/search",
      handler: "Search",
      query: z.object({ q: z.string() }),
      body: z.object({ filter: z.string() }),
      response: z.object({ results: z.array(z.string()) }),
    });

    const app = defineApp({
      architecture: "clean",
      modules: [defineModule({ name: "search", routes: [route] })],
    });

    const result = await compile({ app, dryRun: true });
    const graph: DependencyGraph =
      result.dependencyGraph ??
      buildDependencyGraph(result.ast!, result.architecture!, result.generation);

    const schemaNodes = Object.values(graph.nodes).filter((n) => n.kind === "schema");
    expect(schemaNodes.length).toBeGreaterThanOrEqual(3);
    const schemaEdgeReasons = graph.edges
      .filter((e) => e.reason.startsWith("has-"))
      .map((e) => e.reason);
    expect(schemaEdgeReasons).toContain("has-query-schema");
    expect(schemaEdgeReasons).toContain("has-body-schema");
    expect(schemaEdgeReasons).toContain("has-response-schema");
  });

  it("writes and reads cache correctly", () => {
    const cwd = join(tmpdir(), `backend-gen-cache-${Date.now()}`);

    const cache: CompilerCache = {
      compilerVersion: "0.2.0",
      astVersion: "2.0",
      pluginManifestHash: "testhash",
      dependencyGraph: { nodes: {}, edges: [] },
      regions: {},
      symbols: {},
      symbolsByFile: {},
      files: {},
    };

    writeCache(cwd, cache);
    const loaded = readCache(cwd);
    expect(loaded).toBeDefined();
    expect(loaded!.compilerVersion).toBe("0.2.0");
    expect(loaded!.astVersion).toBe("2.0");
  });

  it("returns undefined for corrupt cache file", () => {
    const cwd = join(tmpdir(), `backend-gen-corrupt-${Date.now()}`);
    mkdirSync(join(cwd, ".backend-gen"), { recursive: true });
    writeFileSync(join(cwd, ".backend-gen", "cache.json"), "not valid json{", "utf8");
    const loaded = readCache(cwd);
    expect(loaded).toBeUndefined();
  });

  it("migrates cache by adding missing symbols field to files", () => {
    const cwd = join(tmpdir(), `cache-migrate-${Date.now()}`);
    const cache: CompilerCache = {
      compilerVersion: "0.2.0",
      astVersion: "2.0",
      pluginManifestHash: "testhash",
      dependencyGraph: { nodes: {}, edges: [] },
      regions: {},
      symbols: {},
      symbolsByFile: {},
      files: { "src/main.go": { hash: "abc", regions: [], symbolsList: [] } as never },
    };
    writeCache(cwd, cache);
    const loaded = readCache(cwd);
    expect(loaded).toBeDefined();
    expect(loaded!.files?.["src/main.go"]?.symbols).toBeDefined();
  });

  it("validates cache against current versions", () => {
    const valid: CompilerCache = {
      compilerVersion: "0.2.0",
      astVersion: "2.0",
      pluginManifestHash: "abc",
      dependencyGraph: { nodes: {}, edges: [] },
      regions: {},
      symbols: {},
      symbolsByFile: {},
      files: {},
    };

    expect(validateCache(valid, "0.2.0", "2.0", "abc")).toBe(true);
    expect(validateCache(valid, "0.2.1", "2.0", "abc")).toBe(false);
    expect(validateCache(undefined, "0.2.0", "2.0", "abc")).toBe(false);
  });
});

describe("invalidateChanged", () => {
  const makeGraph = (
    nodes: Record<string, { kind: string; hash: string }>,
    edges?: Array<{ from: string; to: string }>,
  ): DependencyGraph => ({
    nodes: Object.fromEntries(
      Object.entries(nodes).map(([id, { kind, hash }]) => [
        id,
        { id, kind: kind as DependencyNode["kind"], hash },
      ]),
    ),
    edges: (edges ?? []).map((e) => ({ ...e, reason: "test" })),
  });

  it("detects new nodes", () => {
    const prev = makeGraph({ a: { kind: "app", hash: "hash1" } });
    const current = makeGraph({
      a: { kind: "app", hash: "hash1" },
      b: { kind: "app", hash: "hash2" },
    });
    const invalid = invalidateChanged({ dependencyGraph: prev } as CompilerCache, current);
    expect(invalid.has("b")).toBe(true);
  });

  it("detects changed nodes by hash", () => {
    const prev = makeGraph({ a: { kind: "app", hash: "hash1" } });
    const current = makeGraph({ a: { kind: "app", hash: "hash2" } });
    const invalid = invalidateChanged({ dependencyGraph: prev } as CompilerCache, current);
    expect(invalid.has("a")).toBe(true);
  });

  it("propagates invalidation through edges", () => {
    const prev = makeGraph(
      { a: { kind: "app", hash: "hash1" }, b: { kind: "app", hash: "hash1" } },
      [{ from: "a", to: "b" }],
    );
    const current = makeGraph(
      { a: { kind: "app", hash: "hash2" }, b: { kind: "app", hash: "hash1" } },
      [{ from: "a", to: "b" }],
    );
    const invalid = invalidateChanged({ dependencyGraph: prev } as CompilerCache, current);
    expect(invalid.has("a")).toBe(true);
    expect(invalid.has("b")).toBe(true);
  });

  it("handles changed files with edge propagation", () => {
    const prev = makeGraph(
      {
        "file:src/main.go": { kind: "file", hash: "hash1" },
        "region:main": { kind: "generated-region", hash: "hash1" },
      },
      [{ from: "file:src/main.go", to: "region:main" }],
    );
    const current = makeGraph(
      {
        "file:src/main.go": { kind: "file", hash: "hash1" },
        "region:main": { kind: "generated-region", hash: "hash1" },
      },
      [{ from: "file:src/main.go", to: "region:main" }],
    );
    const invalid = invalidateChanged({ dependencyGraph: prev } as CompilerCache, current, [
      "src/main.go",
    ]);
    expect(invalid.has("file:src/main.go")).toBe(true);
    expect(invalid.has("region:main")).toBe(true);
  });

  it("detects removed nodes (present in prev but not in current)", () => {
    const prev = makeGraph({
      a: { kind: "app", hash: "hash1" },
      b: { kind: "app", hash: "hash1" },
    });
    const current = makeGraph({ a: { kind: "app", hash: "hash1" } });
    const invalid = invalidateChanged({ dependencyGraph: prev } as CompilerCache, current);
    expect(invalid.has("b")).toBe(true);
  });

  it("returns empty set when nothing changed", () => {
    const graph = makeGraph({
      a: { kind: "app", hash: "hash1" },
      b: { kind: "app", hash: "hash1" },
    });
    const prev: CompilerCache = { dependencyGraph: graph } as CompilerCache;
    const invalid = invalidateChanged(prev, graph);
    expect(invalid.size).toBe(0);
  });
});
