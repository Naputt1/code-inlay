import { describe, expect, it } from "vitest";
import { generateRuntimeCode, generateRuntimeConfigCode } from "../src/runtime/index.js";
import type { AdapterRef, AppAst, RuntimeConfig } from "../src/index.js";

function minimalAst(overrides?: Partial<AppAst>): AppAst {
  return {
    kind: "App",
    id: "test-app",
    stableId: "test-app",
    annotations: {},
    pluginData: {},
    architecture: { mode: "replace", refs: [] },
    adapters: { mode: "replace", refs: [] },
    router: {
      kind: "Router",
      id: "router",
      stableId: "router",
      annotations: {},
      pluginData: {},
      adapter: "gin" as AdapterRef,
      prefix: "/api",
      middleware: [],
    },
    modules: [],
    services: [],
    serviceExtensions: [],
    plugins: [],
    targets: [],
    errors: [],
    options: { fileCreation: "skeleton" },
    ...overrides,
  };
}

describe("generateRuntimeCode", () => {
  it("returns empty array when runtime is disabled", () => {
    const ast = minimalAst();
    const config: RuntimeConfig = { enabled: false };
    const patches = generateRuntimeCode(ast, config);
    expect(patches).toEqual([]);
  });

  it("generates context types", () => {
    const ast = minimalAst();
    const config: RuntimeConfig = { enabled: true };
    const patches = generateRuntimeCode(ast, config);
    const ctx = patches.find((p) => p.path.endsWith("context.go"));
    expect(ctx).toBeDefined();
    const content = ctx!.regions[0].content;
    expect(content).toContain("package runtime");
    expect(content).toContain("type Context interface");
    expect(content).toContain("type Logger interface");
    expect(content).toContain("type Middleware func");
    expect(content).toContain("type Handler[Req, Res any]");
  });

  it("generates middleware chain when middleware names provided", () => {
    const ast = minimalAst();
    const config: RuntimeConfig = { enabled: true, middleware: ["auth", "logging"] };
    const patches = generateRuntimeCode(ast, config);
    const mw = patches.find((p) => p.path.endsWith("middleware.go"));
    expect(mw).toBeDefined();
    expect(mw!.regions[0].content).toContain("ChainMiddleware");
  });

  it("skips middleware chain when no middleware names", () => {
    const ast = minimalAst();
    const config: RuntimeConfig = { enabled: true };
    const patches = generateRuntimeCode(ast, config);
    const mw = patches.find((p) => p.path.endsWith("middleware.go"));
    expect(mw).toBeUndefined();
  });
});

describe("generateRuntimeConfigCode", () => {
  it("generates wire inject code when di is wire", () => {
    const code = generateRuntimeConfigCode({ enabled: true, di: "wire" });
    expect(code).toContain("wireinject");
    expect(code).toContain("wire.Build");
  });

  it("returns empty for manual di", () => {
    const code = generateRuntimeConfigCode({ enabled: true, di: "manual" });
    expect(code).toBe("");
  });

  it("returns empty when no di specified", () => {
    const code = generateRuntimeConfigCode({ enabled: true });
    expect(code).toBe("");
  });
});
