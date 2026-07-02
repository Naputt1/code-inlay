import { describe, expect, it } from "vitest";
import { generateRuntimeCode, generateRuntimeConfigCode } from "../src/runtime/index.js";
import { generateLoggerCode, getLoggerGoModules } from "../src/runtime/loggers.js";
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

describe("generateLoggerCode", () => {
  it("generates runtime/logger.go patch", () => {
    const patches = generateLoggerCode({ provider: "slog", level: "info", format: "json" });
    expect(patches).toHaveLength(1);
    expect(patches[0].path).toBe("runtime/logger.go");
    expect(patches[0].regions).toHaveLength(1);
  });

  it("generates LoggerConfig struct with SetDefaultLogger and L()", () => {
    const patches = generateLoggerCode({ provider: "slog" });
    const content = patches[0].regions[0].content;
    expect(content).toContain("package runtime");
    expect(content).toContain("type LoggerConfig struct");
    expect(content).toContain("func SetDefaultLogger");
    expect(content).toContain("func L() Logger");
  });

  it("generates slog implementation", () => {
    const patches = generateLoggerCode({ provider: "slog", level: "debug", format: "text" });
    const content = patches[0].regions[0].content;
    expect(content).toContain("type slogLogger struct");
    expect(content).toContain("NewLogger");
    expect(content).toContain("log/slog");
    expect(content).toContain("slog.NewTextHandler");
  });

  it("generates zerolog implementation", () => {
    const patches = generateLoggerCode({ provider: "zerolog" });
    const content = patches[0].regions[0].content;
    expect(content).toContain("type zerologLogger struct");
    expect(content).toContain("NewLogger");
    expect(content).toContain("github.com/rs/zerolog");
  });

  it("generates logrus implementation", () => {
    const patches = generateLoggerCode({ provider: "logrus" });
    const content = patches[0].regions[0].content;
    expect(content).toContain("type logrusLogger struct");
    expect(content).toContain("NewLogger");
    expect(content).toContain("github.com/sirupsen/logrus");
  });

  it("generates noop implementation", () => {
    const patches = generateLoggerCode({ provider: "none" });
    const content = patches[0].regions[0].content;
    expect(content).toContain("type noopLogger struct");
    expect(content).toContain("NewLogger");
    expect(content).toContain("func (l *noopLogger) Info");
    expect(content).toContain("func (l *noopLogger) Error");
    expect(content).toContain("func (l *noopLogger) With");
  });
});

describe("getLoggerGoModules", () => {
  it("returns no modules for slog", () => {
    expect(getLoggerGoModules({ provider: "slog" })).toEqual([]);
  });

  it("returns zerolog module", () => {
    expect(getLoggerGoModules({ provider: "zerolog" })).toEqual(["github.com/rs/zerolog"]);
  });

  it("returns logrus module", () => {
    expect(getLoggerGoModules({ provider: "logrus" })).toEqual(["github.com/sirupsen/logrus"]);
  });

  it("returns no modules for none", () => {
    expect(getLoggerGoModules({ provider: "none" })).toEqual([]);
  });
});

describe("generateRuntimeCode with logger", () => {
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
  });

  it("does not generate logger when no logger config", () => {
    const ast = minimalAst();
    const config: RuntimeConfig = { enabled: true };
    const patches = generateRuntimeCode(ast, config);
    const loggerPatch = patches.find((p) => p.path.endsWith("logger.go"));
    expect(loggerPatch).toBeUndefined();
  });
});
