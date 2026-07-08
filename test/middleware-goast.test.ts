import { describe, it, expect } from "vitest";
import type { AppAst, GeneratedFilePatch } from "../src/types/index.js";
import { generateMiddlewareFiles as generateGoast } from "../src/generators/middleware-goast.js";

function generateOld(ast: AppAst): GeneratedFilePatch[] {
  const seen = new Set<string>();
  const mws: Array<{ name: string; handler?: string }> = [];
  for (const mod of ast.modules) {
    for (const mw of mod.middleware) {
      if (!seen.has(mw.name)) {
        seen.add(mw.name);
        mws.push({ name: mw.name, handler: mw.handler });
      }
    }
    for (const route of mod.routes) {
      for (const mw of route.middleware) {
        if (!seen.has(mw.name)) {
          seen.add(mw.name);
          mws.push({ name: mw.name, handler: mw.handler });
        }
      }
    }
  }
  mws.sort((a, b) => a.name.localeCompare(b.name));
  return mws.map((mw) => {
    const funcName = mw.handler ?? mw.name;
    const funcSig = `func ${funcName}(c *gin.Context)`;
    return {
      path: `internal/middleware/${mw.name
        .replace(/([A-Z])/g, "_$1")
        .toLowerCase()
        .replace(/^_/, "")
        .replace(/[^a-zA-Z0-9_]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")}.go`,
      regions: [
        {
          id: `middleware.${mw.name}.0imports`,
          stableHash: `middleware:${mw.name}:imports`,
          owner: "schemago",
          language: "go",
          kind: "imports",
          imports: ["github.com/gin-gonic/gin"],
          content: `import "github.com/gin-gonic/gin"`,
        },
        {
          id: `middleware.${mw.name}.1func`,
          stableHash: `middleware:${mw.name}:func`,
          owner: "schemago",
          language: "go",
          content: `\t// TODO: implement ${funcName}\n\tc.Next()`,
          symbolName: funcName,
          kind: "function",
          signature: funcSig,
          isStub: true,
        },
      ],
    };
  });
}

function makeAst(middleware: Array<{ name: string; handler?: string }>): AppAst {
  return {
    kind: "App",
    id: "test",
    stableId: "test",
    annotations: {},
    pluginData: {},
    env: {},
    architecture: { mode: "replace", refs: [] },
    adapters: { mode: "replace", refs: [] },
    router: {
      kind: "Router",
      id: "router",
      stableId: "router",
      annotations: {},
      pluginData: {},
      adapter: "gin",
      prefix: "/",
      middleware: [],
    },
    modules: [
      {
        kind: "Module",
        id: "api",
        stableId: "api",
        annotations: {},
        pluginData: {},
        name: "api",
        middleware: middleware.map((m) => ({
          kind: "Middleware" as const,
          id: `mw.${m.name}`,
          stableId: `mw.${m.name}`,
          annotations: {},
          pluginData: {},
          name: m.name,
          handler: m.handler,
        })),
        services: [],
        routes: [],
      },
    ],
    services: [],
    serviceExtensions: [],
    plugins: [],
    targets: [],
    errors: [],
    options: {
      fileCreation: "skeleton",
    },
  };
}

function compare(ast: AppAst) {
  const old_ = generateOld(ast);
  const new_ = generateGoast(ast);
  expect(new_).toEqual(old_);
}

describe("goast middleware generation", () => {
  it("1. single middleware with default handler name", () => {
    compare(makeAst([{ name: "RateLimit" }]));
  });

  it("2. single middleware with custom handler name", () => {
    compare(makeAst([{ name: "RateLimit", handler: "MyRateLimiter" }]));
  });

  it("3. two middleware modules", () => {
    compare(makeAst([{ name: "Auth" }, { name: "RateLimit" }]));
  });

  it("4. duplicate middleware names (deduplication)", () => {
    const ast = makeAst([{ name: "Auth" }]);
    ast.modules[0].routes.push({
      kind: "Route",
      id: "route.get-items",
      stableId: "route.get-items",
      annotations: {},
      pluginData: {},
      moduleName: "api",
      method: "GET",
      path: "/items",
      fullPath: "/items",
      handlerName: "ListItems",
      resolvedArchitectures: [],
      resolvedAdapters: [],
      errors: [],
      middleware: [
        {
          kind: "Middleware",
          id: "mw.auth",
          stableId: "mw.auth",
          annotations: {},
          pluginData: {},
          name: "Auth",
          handler: undefined,
        },
      ],
      metadata: {},
    });
    compare(ast);
  });

  it("5. empty middleware list", () => {
    compare(makeAst([]));
  });

  it("6. middleware with snake_case name", () => {
    compare(makeAst([{ name: "my_custom_middleware" }]));
  });
});
