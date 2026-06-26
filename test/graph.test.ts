import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  compile,
  defineApp,
  defineModule,
  defineRoute,
  renderGraph,
  renderPluginExecutionOrder,
} from "../src/index.js";
import type { PluginRegistry } from "../src/index.js";

describe("renderGraph", () => {
  async function buildBase() {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              id: "list",
              method: "GET",
              path: "/users",
              handler: "ListUsers",
            }),
            defineRoute({
              id: "create",
              method: "POST",
              path: "/users",
              handler: "CreateUser",
              body: z.object({ name: z.string() }),
              response: z.object({ id: z.number() }),
            }),
          ],
        }),
      ],
    });
    return compile({ app, dryRun: true });
  }

  it("renders tree format", async () => {
    const result = await buildBase();
    const output = renderGraph(result.ast!, result.architecture!, { files: [] }, "tree");
    expect(output).toContain("App:");
    expect(output).toContain("Module: user");
    expect(output).toContain("GET /users");
    expect(output).toContain("POST /users");
    expect(output).toContain("Body:");
    expect(output).toContain("Response:");
  });

  it("renders mermaid format", async () => {
    const result = await buildBase();
    const output = renderGraph(result.ast!, result.architecture!, { files: [] }, "mermaid");
    expect(output).toContain("graph TD");
    expect(output).toContain("Module: user");
    expect(output).toContain("APP");
  });

  it("renders json format", async () => {
    const result = await buildBase();
    const output = renderGraph(result.ast!, result.architecture!, { files: [] }, "json");
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty("nodes");
    expect(parsed).toHaveProperty("edges");
  });

  it("includes plugins in tree output", async () => {
    const app = defineApp({
      architecture: "clean",
      plugins: [{
        name: "test-plugin",
        version: "1.0.0",
        apiVersion: "2" as const,
        transformers: [],
      }],
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              id: "list",
              method: "GET",
              path: "/users",
              handler: "ListUsers",
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const output = renderGraph(result.ast!, result.architecture!, { files: [] }, "tree");
    expect(output).toContain("test-plugin@1.0.0");
  });
});

describe("renderPluginExecutionOrder", () => {
  it("renders stages with hooks", () => {
    const registry: PluginRegistry = {
      plugins: [],
      architectures: new Map(),
      adapters: new Map(),
      transformers: [
        {
          name: "t1",
          version: "0.1.0",
          hooks: [{ stage: "preTransform", order: 1, run: () => ({}) as never }],
          transform: (ast) => ast,
        },
      ],
      validators: [],
      targets: new Map(),
      packages: new Map(),
      manifestHash: "abc",
    };
    const output = renderPluginExecutionOrder(registry);
    expect(output).toContain("Plugin Execution Order:");
    expect(output).toContain("Stage: preTransform");
    expect(output).toContain("t1 (order: 1)");
  });

  it("shows no hooks for empty stages", () => {
    const registry: PluginRegistry = {
      plugins: [],
      architectures: new Map(),
      adapters: new Map(),
      transformers: [],
      validators: [],
      targets: new Map(),
      packages: new Map(),
      manifestHash: "abc",
    };
    const output = renderPluginExecutionOrder(registry);
    expect(output).toContain("(no hooks)");
  });

  it("sorts hooks by name when order is the same", () => {
    const registry: PluginRegistry = {
      plugins: [],
      architectures: new Map(),
      adapters: new Map(),
      transformers: [
        {
          name: "zeta",
          version: "1.0.0",
          hooks: [{ stage: "preTransform", order: 1, run: () => ({}) as never }],
          transform: (ast) => ast,
        },
        {
          name: "alpha",
          version: "1.0.0",
          hooks: [{ stage: "preTransform", order: 1, run: () => ({}) as never }],
          transform: (ast) => ast,
        },
      ],
      validators: [],
      targets: new Map(),
      packages: new Map(),
      manifestHash: "abc",
    };
    const output = renderPluginExecutionOrder(registry);
    const alphaIdx = output.indexOf("alpha");
    const zetaIdx = output.indexOf("zeta");
    expect(alphaIdx).toBeGreaterThan(0);
    expect(zetaIdx).toBeGreaterThan(alphaIdx);
  });
});
