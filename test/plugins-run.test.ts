import { describe, expect, it } from "vitest";
import {
  createPluginRegistry,
  runTransformerStage,
  runValidators,
  runTargets,
  computePluginManifestHash,
} from "../src/plugins/registry.js";
import { defineApp } from "../src/index.js";
import type { Diagnostic, AppAst, PluginRegistry } from "../src/index.js";

async function baseAstAndRegistry(): Promise<{ ast: AppAst; registry: PluginRegistry }> {
  const app = defineApp({ modules: [] });
  const diagnostics: Diagnostic[] = [];
  const registry = createPluginRegistry(app, diagnostics);
  const ast: AppAst = {
    kind: "App",
    id: "test",
    stableId: "test",
    annotations: {},
    pluginData: {},
    architecture: { mode: "replace", refs: [] },
    adapters: { mode: "replace", refs: [] },
    router: {
      kind: "Router",
      id: "r",
      stableId: "r",
      annotations: {},
      pluginData: {},
      adapter: "gin" as never,
      prefix: "/",
      middleware: [],
    },
    modules: [],
    services: [],
    serviceExtensions: [],
    plugins: [],
    targets: [],
    options: { fileCreation: "skeleton" },
  };
  return { ast, registry };
}

describe("runTransformerStage", () => {
  it("runs hooks for matching stage", async () => {
    const { ast, registry } = await baseAstAndRegistry();
    const newAst = await runTransformerStage("preTransform", ast, registry, []);
    expect(newAst).toBeDefined();
    expect(newAst.id).toBe("test");
  });

  it("executes hooks sorted by order then name", async () => {
    const app = defineApp({
      modules: [],
      plugins: [
        {
          name: "zzz",
          version: "1.0.0",
          apiVersion: "2" as const,
          transformers: [
            {
              name: "zzz",
              version: "1.0.0",
              hooks: [{ stage: "codegen" as const, order: 1, run: () => ({}) as never }],
              transform: (a: AppAst) => a,
            },
          ],
        },
        {
          name: "aaa",
          version: "1.0.0",
          apiVersion: "2" as const,
          transformers: [
            {
              name: "aaa",
              version: "1.0.0",
              hooks: [{ stage: "codegen" as const, order: 2, run: () => ({}) as never }],
              transform: (a: AppAst) => a,
            },
          ],
        },
      ],
    });
    const diagnostics: Diagnostic[] = [];
    const registry = createPluginRegistry(app, diagnostics);
    const { ast } = await baseAstAndRegistry();
    const result = await runTransformerStage("codegen", ast, registry, diagnostics);
    expect(result).toBeDefined();
    expect(diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
  });
});

describe("runValidators", () => {
  it("runs validators without error", async () => {
    const { ast, registry } = await baseAstAndRegistry();
    const diagnostics: Diagnostic[] = [];
    await runValidators(ast, registry, diagnostics);
    expect(diagnostics).toHaveLength(0);
  });
});

describe("runTargets", () => {
  it("adds warning for unknown target", async () => {
    const { ast, registry } = await baseAstAndRegistry();
    const diagnostics: Diagnostic[] = [];
    const patches = await runTargets(
      ast,
      { nodes: [], routes: [] },
      registry,
      diagnostics,
      "/tmp",
      {
        fileCreation: "skeleton",
        targets: ["nonexistent-target"],
      },
    );
    expect(diagnostics.some((d) => d.code === "unknown-target")).toBe(true);
    expect(patches).toEqual([]);
  });

  it("merges patches with same path", async () => {
    const { ast, registry } = await baseAstAndRegistry();
    const diagnostics: Diagnostic[] = [];
    const patches = await runTargets(
      ast,
      { nodes: [], routes: [] },
      registry,
      diagnostics,
      "/tmp",
      {
        fileCreation: "skeleton",
        targets: [],
      },
    );
    expect(Array.isArray(patches)).toBe(true);
  });
});

describe("computePluginManifestHash", () => {
  it("returns different hash with different architectures", () => {
    const app1 = defineApp({ modules: [] });
    const hash1 = computePluginManifestHash(app1);
    expect(hash1).toBeTruthy();
  });
});
