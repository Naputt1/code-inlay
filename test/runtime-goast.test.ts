import { describe, it, expect } from "vitest";
import { generateRuntimeCode, generateRuntimeConfigCode } from "../src/runtime/index-goast.js";
import type { AppAst, RuntimeConfig } from "../src/index.js";

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
      adapter: "gin" as const,
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

describe("generateRuntimeCode (go-ast)", () => {
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

  it("generates HTTPError and StatusError", () => {
    const ast = minimalAst();
    const config: RuntimeConfig = { enabled: true };
    const patches = generateRuntimeCode(ast, config);
    const err = patches.find((p) => p.path.endsWith("errors.go"));
    expect(err).toBeDefined();
    const content = err!.regions[0].content;
    expect(content).toContain("type HTTPError interface");
    expect(content).toContain("type StatusError struct");
    expect(content).toContain("func NewStatusError");
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

  it("generates request context middleware for gin adapter", () => {
    const ast = minimalAst();
    const config: RuntimeConfig = {
      enabled: true,
      logger: { provider: "slog", level: "info", format: "json" },
    };
    const patches = generateRuntimeCode(ast, config);
    const rc = patches.find((p) => p.path.endsWith("request_context.go"));
    expect(rc).toBeDefined();
    const content = rc!.regions[0].content;
    expect(content).toContain("RequestContextMiddleware");
    expect(content).toContain("generateRequestID");
    expect(content).toContain("crypto/rand");
  });

  it("generates logger and runtime context when logger config is set", () => {
    const ast = minimalAst();
    const config: RuntimeConfig = {
      enabled: true,
      logger: { provider: "slog", level: "info", format: "json" },
    };
    const patches = generateRuntimeCode(ast, config);
    const loggerPatch = patches.find((p) => p.path.endsWith("logger.go"));
    expect(loggerPatch).toBeDefined();
    const ctxPatch = patches.find((p) => p.path.endsWith("runtime_context.go"));
    expect(ctxPatch).toBeDefined();
    expect(ctxPatch!.regions[0].content).toContain("runtimeContext");
    expect(ctxPatch!.regions[0].content).toContain("NewContext");
    expect(ctxPatch!.regions[0].content).toContain("func (c *runtimeContext) Logger() Logger");
  });

  it("does not generate logger when no logger config", () => {
    const ast = minimalAst();
    const config: RuntimeConfig = { enabled: true };
    const patches = generateRuntimeCode(ast, config);
    const loggerPatch = patches.find((p) => p.path.endsWith("logger.go"));
    expect(loggerPatch).toBeUndefined();
  });
});

describe("generateRuntimeConfigCode (go-ast)", () => {
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
