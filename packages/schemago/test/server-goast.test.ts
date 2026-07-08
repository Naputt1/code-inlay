/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import { compile, defineApp, defineModule, defineRoute, defineCors } from "../src/index.js";
import { generateServer } from "../src/srvgen/server-goast.js";
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

describe("generateServer — goast", () => {
  it("minimal (gin, no services, no config, no logger, no CORS)", async () => {
    const result = await buildBase();
    const patch = generateServer(result.ast!, result.architecture!, moduleInfo, mockAdapter);
    expect(patch.path).toBe("cmd/server/main.go");
    expect(patch.regions.length).toBe(2);
  });

  it("with config", async () => {
    const result = await buildBase();
    const ast = {
      ...result.ast!,
      env: { PORT: { type: "string" as const, required: false } },
    };
    const patch = generateServer(ast, result.architecture!, moduleInfo, mockAdapter);
    expect(patch.regions[1].content).toContain("config.Load()");
  });

  it("with services (single, with Close)", async () => {
    const result = await buildBase();
    const ast = {
      ...result.ast!,
      services: [{ name: "UserService", close: true, typeName: "*userSvc" }],
    };
    const patch = generateServer(ast, result.architecture!, moduleInfo, mockAdapter);
    expect(patch.regions[1].content).toContain("UserService");
    expect(patch.regions[1].content).toContain(".Close()");
  });

  it("with services (single, no Close)", async () => {
    const result = await buildBase();
    const ast = {
      ...result.ast!,
      services: [{ name: "UserService", typeName: "*userSvc" }],
    };
    const patch = generateServer(ast, result.architecture!, moduleInfo, mockAdapter);
    expect(patch.regions[1].content).toContain("UserService");
    expect(patch.regions[1].content).not.toContain(".Close()");
  });

  it("with services and config", async () => {
    const result = await buildBase();
    const ast = {
      ...result.ast!,
      env: { PORT: { type: "string" as const, required: false } },
      services: [{ name: "UserService", close: true, typeName: "*userSvc", env: ["PORT"] }],
    };
    const patch = generateServer(ast, result.architecture!, moduleInfo, mockAdapter);
    expect(patch.regions[1].content).toContain("cfg");
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
    const patch = generateServer(ast, result.architecture!, moduleInfo, mockAdapter);
    expect(patch.regions[1].content).toContain("NewLogger");
  });

  it("with logger (text format)", async () => {
    const result = await buildBase();
    const ast = {
      ...result.ast!,
      options: {
        ...result.ast!.options,
        runtime: {
          enabled: true,
          logger: {
            provider: "zerolog" as const,
            level: "debug" as const,
            format: "text" as const,
          },
        },
      },
    };
    const patch = generateServer(ast, result.architecture!, moduleInfo, mockAdapter);
    expect(patch.regions[1].content).toContain("NewLogger");
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
    const patch = generateServer(ast, result.architecture!, moduleInfo, mockAdapter);
    expect(patch.regions[1].content).toContain("cors.New");
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
    const patch = generateServer(ast, result.architecture!, moduleInfo, mockAdapter);
    expect(patch.regions[1].content).toContain("cors.New");
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
    const patch = generateServer(ast, result.architecture!, moduleInfo, mockAdapter);
    expect(patch.regions[1].content).toContain("/healthz");
    expect(patch.regions[1].content).toContain("/readyz");
  });

  it("without config (inline PORT detection)", async () => {
    const result = await buildBase();
    const patch = generateServer(result.ast!, result.architecture!, moduleInfo, mockAdapter);
    expect(patch.regions[1].content).toContain(`os.Getenv("PORT")`);
  });

  it("without adapter still generates gin-based server", async () => {
    const result = await buildBase();
    const patch = generateServer(result.ast!, result.architecture!, moduleInfo, undefined);
    expect(patch.path).toBe("cmd/server/main.go");
    expect(patch.regions.length).toBe(2);
  });
});
