import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  compile,
  defineApp,
  defineModule,
  defineRoute,
  buildDependencyGraph,
  readCache,
  writeCache,
  validateCache,
} from "../src/index.js";
import type { CompilerCache } from "../src/index.js";

describe("cache + dependency graph", () => {
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
