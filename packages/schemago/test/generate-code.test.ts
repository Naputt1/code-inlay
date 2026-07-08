import { describe, expect, it } from "vitest";
import { compile, defineApp, defineModule, defineRoute, defineRouter } from "../src/index.js";
import { generateCode } from "../src/generators/index.js";

describe("generateCode", () => {
  it("generates patches for a minimal app config", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin", prefix: "/api" }),
      modules: [
        defineModule({
          name: "user",
          routes: [defineRoute({ method: "GET", path: "/users", handler: "ListUsers" })],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const gen = generateCode(result.ast!, result.architecture!, result.diagnostics);
    expect(gen.files.length).toBeGreaterThan(0);
    expect(gen.files.some((f) => f.path === "internal/http/routes.go")).toBe(true);
  });

  it("routes are dispatched to appropriate generators", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin", prefix: "/api" }),
      modules: [
        defineModule({
          name: "user",
          routes: [defineRoute({ method: "GET", path: "/users", handler: "ListUsers" })],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const gen = generateCode(result.ast!, result.architecture!, result.diagnostics);
    const moduleRoutesFile = gen.files.find((f) => f.path === "internal/http/user_routes.go");
    expect(moduleRoutesFile).toBeDefined();
    expect(moduleRoutesFile!.regions.some((r) => r.content.includes("registerUserRoutes"))).toBe(
      true,
    );
  });

  it("architecture-based code generation creates usecase and handler files", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin", prefix: "/api" }),
      modules: [
        defineModule({
          name: "user",
          routes: [defineRoute({ method: "GET", path: "/users", handler: "ListUsers" })],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const gen = generateCode(result.ast!, result.architecture!, result.diagnostics);
    expect(gen.files.some((f) => f.path.includes("usecase.go"))).toBe(true);
    expect(gen.files.some((f) => f.path.includes("handler.go"))).toBe(true);
  });

  it("multiple modules produce all route registration files", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin", prefix: "/api" }),
      modules: [
        defineModule({
          name: "user",
          routes: [defineRoute({ method: "GET", path: "/users", handler: "ListUsers" })],
        }),
        defineModule({
          name: "order",
          routes: [defineRoute({ method: "POST", path: "/orders", handler: "CreateOrder" })],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const gen = generateCode(result.ast!, result.architecture!, result.diagnostics);
    const routesGo = gen.files.find((f) => f.path === "internal/http/routes.go");
    expect(routesGo).toBeDefined();
    expect(routesGo!.regions[0].content).toContain("registerUserRoutes");
    expect(routesGo!.regions[0].content).toContain("registerOrderRoutes");
  });

  it("returns only error/resolve files for empty app", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin", prefix: "/api" }),
      modules: [],
    });
    const result = await compile({ app, dryRun: true });
    const gen = generateCode(result.ast!, result.architecture!, result.diagnostics);
    expect(gen.files.every((f) => f.path.startsWith("internal/httperr/"))).toBe(true);
  });
});
