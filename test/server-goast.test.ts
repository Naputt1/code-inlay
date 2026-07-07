import { describe, it, expect } from "vitest";
import { compile, defineApp, defineModule, defineRoute, defineCors } from "../src/index.js";
import { generateServer as generateServerNew } from "../src/srvgen/server-goast.js";
import { generateServerLegacy } from "../src/srvgen/index.js";
import type { AdapterPlugin, GoModuleInfo } from "../src/index.js";

const moduleInfo: GoModuleInfo = {
  modulePath: "github.com/example/myapp",
  dependencies: [],
};

const mockAdapter: AdapterPlugin = {
  name: "gin",
  transport: "http",
  generateRoute: () => [""] as any,
  generateMiddleware: () => [""] as any,
  generateServer: () => [""] as any,
} as unknown as AdapterPlugin;

async function compare(
  ast: any,
  architecture: any,
  moduleInfo: GoModuleInfo,
  adapter?: AdapterPlugin,
) {
  const old_ = generateServerLegacy(ast, architecture, moduleInfo, adapter);
  const new_ = generateServerNew(ast, architecture, moduleInfo, adapter);
  expect(new_.path).toBe(old_.path);
  expect(new_.regions.length).toBe(old_.regions.length);
  for (let i = 0; i < old_.regions.length; i++) {
    expect(new_.regions[i].content).toBe(old_.regions[i].content);
    expect(new_.regions[i].imports?.sort()).toEqual(old_.regions[i].imports?.sort());
    expect(new_.regions[i].signature).toBe(old_.regions[i].signature);
  }
}

async function buildBase() {
  const app = defineApp({
    architecture: "clean",
    modules: [
      defineModule({
        name: "user",
        routes: [
          defineRoute({
            method: "GET",
            path: "/users",
            handler: "ListUsers",
          }),
        ],
      }),
    ],
  });
  return compile({ app, dryRun: true });
}

describe("generateServer — go-ast vs legacy", () => {
  it("minimal (gin, no services, no config, no logger, no CORS)", async () => {
    const result = await buildBase();
    await compare(result.ast!, result.architecture!, moduleInfo, mockAdapter);
  });

  it("with config", async () => {
    const result = await buildBase();
    const ast = {
      ...result.ast!,
      env: { PORT: { type: "string" as const, required: false } },
    };
    await compare(ast, result.architecture!, moduleInfo, mockAdapter);
  });

  it("with services (single, with Close)", async () => {
    const result = await buildBase();
    const ast = {
      ...result.ast!,
      services: [{ name: "UserService", close: true, typeName: "*userSvc" }],
    };
    await compare(ast, result.architecture!, moduleInfo, mockAdapter);
  });

  it("with services (single, no Close)", async () => {
    const result = await buildBase();
    const ast = {
      ...result.ast!,
      services: [{ name: "UserService", typeName: "*userSvc" }],
    };
    await compare(ast, result.architecture!, moduleInfo, mockAdapter);
  });

  it("with services and config", async () => {
    const result = await buildBase();
    const ast = {
      ...result.ast!,
      env: { PORT: { type: "string" as const, required: false } },
      services: [{ name: "UserService", close: true, typeName: "*userSvc", env: ["PORT"] }],
    };
    await compare(ast, result.architecture!, moduleInfo, mockAdapter);
  });

  it("with logger (json format)", async () => {
    const result = await buildBase();
    const ast = {
      ...result.ast!,
      options: {
        ...result.ast!.options,
        runtime: {
          enabled: true,
          logger: { provider: "zerolog" as const, level: "info" as const, format: "json" as const },
        },
      },
    };
    await compare(ast, result.architecture!, moduleInfo, mockAdapter);
  });

  it("with logger (text format)", async () => {
    const result = await buildBase();
    const ast = {
      ...result.ast!,
      options: {
        ...result.ast!.options,
        runtime: {
          enabled: true,
          logger: { provider: "zerolog" as const, level: "debug" as const, format: "text" as const },
        },
      },
    };
    await compare(ast, result.architecture!, moduleInfo, mockAdapter);
  });

  it("with CORS (all fields)", async () => {
    const result = await buildBase();
    const ast = {
      ...result.ast!,
      router: {
        ...result.ast!.router,
        cors: defineCors({
          allowOrigins: ["http://localhost:3000"],
          allowMethods: ["GET", "POST"],
          allowHeaders: ["Content-Type"],
          allowCredentials: true,
          exposeHeaders: ["X-Request-Id"],
          maxAge: 3600,
        }),
      },
    };
    await compare(ast, result.architecture!, moduleInfo, mockAdapter);
  });

  it("with CORS (no optional fields)", async () => {
    const result = await buildBase();
    const ast = {
      ...result.ast!,
      router: {
        ...result.ast!.router,
        cors: defineCors({
          allowOrigins: ["*"],
          allowMethods: ["GET"],
          allowHeaders: ["Content-Type"],
        }),
      },
    };
    await compare(ast, result.architecture!, moduleInfo, mockAdapter);
  });

  it("with all options combined", async () => {
    const result = await buildBase();
    const ast = {
      ...result.ast!,
      env: { PORT: { type: "string" as const, required: false } },
      services: [{ name: "UserService", close: true, typeName: "*userSvc" }],
      router: {
        ...result.ast!.router,
        cors: defineCors({
          allowOrigins: ["*"],
          allowMethods: ["GET"],
          allowHeaders: ["Content-Type"],
        }),
      },
      options: {
        ...result.ast!.options,
        runtime: {
          enabled: true,
          logger: { provider: "zerolog" as const, level: "info" as const, format: "json" as const },
          healthCheck: { enabled: true, livenessPath: "/healthz", readinessPath: "/readyz" },
          shutdownTimeout: 10,
        },
      },
    };
    await compare(ast, result.architecture!, moduleInfo, mockAdapter);
  });

  it("without config (inline PORT detection)", async () => {
    const result = await buildBase();
    await compare(result.ast!, result.architecture!, moduleInfo, mockAdapter);
  });

  it("without adapter (no gin)", async () => {
    const result = await buildBase();
    await compare(result.ast!, result.architecture!, moduleInfo, undefined);
  });
});
