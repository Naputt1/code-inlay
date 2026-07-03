import { describe, expect, it } from "vitest";
import {
  defineApp,
  defineRoute,
  defineRouteGroup,
  defineMiddleware,
  defineResponseFormat,
  defineArchitecture,
  defineAdapter,
  defineTransformer,
  defineTarget,
  defineRuntime,
  defineTesting,
  defineMetadata,
  definePlugin,
  defineValidationError,
} from "../src/index.js";

describe("defineApp defaults", () => {
  it("sets fileCreation default to skeleton", () => {
    const app = defineApp({ modules: [] });
    expect(app.options.fileCreation).toBe("skeleton");
  });

  it("sets targets default to go-server", () => {
    const app = defineApp({ modules: [] });
    expect(app.options.targets).toEqual(["go-server"]);
  });

  it("disables runtime by default", () => {
    const app = defineApp({ modules: [] });
    expect(app.options.runtime).toEqual({ enabled: false });
  });

  it("disables testing by default", () => {
    const app = defineApp({ modules: [] });
    expect(app.options.testing).toEqual({
      mocks: false,
      scaffolds: false,
      contracts: false,
    });
  });

  it("disables metadata by default", () => {
    const app = defineApp({ modules: [] });
    expect(app.options.metadata).toEqual({
      enabled: false,
      routeRegistry: false,
      schemaReflection: false,
    });
  });
});

describe("defineRouteGroup", () => {
  it("prefixes route paths", () => {
    const routes = defineRouteGroup({
      prefix: "/api",
      routes: [
        defineRoute({
          method: "GET",
          path: "/items",
          handler: "ListItems",
        }),
      ],
    });
    expect(routes[0].path).toBe("/api/items");
  });

  it("merges middleware from group", () => {
    const routes = defineRouteGroup({
      prefix: "/admin",
      middleware: [{ name: "auth", kind: "MiddlewareDefinition", handler: "AuthMiddleware" }],
      routes: [
        defineRoute({
          method: "DELETE",
          path: "/users/:id",
          handler: "DeleteUser",
          middleware: [{ name: "audit", kind: "MiddlewareDefinition" }],
        }),
      ],
    });
    expect(routes[0].middleware).toHaveLength(2);
    expect(routes[0].middleware[0].name).toBe("auth");
    expect(routes[0].middleware[1].name).toBe("audit");
  });

  it("handles empty prefix", () => {
    const routes = defineRouteGroup({
      prefix: "",
      routes: [
        defineRoute({
          method: "GET",
          path: "/items",
          handler: "ListItems",
        }),
      ],
    });
    expect(routes[0].path).toBe("/items");
  });
});

describe("identity functions", () => {
  it("defineResponseFormat returns input", () => {
    const fmt = defineResponseFormat({ wrapper: "anything" as never });
    expect(fmt.wrapper).toBe("anything");
  });

  it("defineArchitecture returns input", () => {
    const arch = defineArchitecture({ name: "custom" } as never);
    expect(arch.name).toBe("custom");
  });

  it("defineAdapter returns input", () => {
    const adp = defineAdapter({ name: "custom" } as never);
    expect(adp.name).toBe("custom");
  });

  it("defineTransformer returns input", () => {
    const tf = defineTransformer({ name: "custom" } as never);
    expect(tf.name).toBe("custom");
  });

  it("defineTarget returns input", () => {
    const tgt = defineTarget({ name: "custom", stage: "postTransform", generate: () => [] });
    expect(tgt.name).toBe("custom");
  });

  it("defineRuntime returns input", () => {
    const rt = defineRuntime({ enabled: true });
    expect(rt.enabled).toBe(true);
  });

  it("defineTesting returns input", () => {
    const t = defineTesting({ mocks: true, scaffolds: false, contracts: false });
    expect(t.mocks).toBe(true);
  });

  it("defineMetadata returns input", () => {
    const m = defineMetadata({ enabled: true, routeRegistry: true, schemaReflection: false });
    expect(m.enabled).toBe(true);
  });

  it("definePlugin returns input with compatibility", () => {
    const p = definePlugin({
      name: "test",
      version: "1.0.0",
      apiVersion: "2",
      transformers: [],
      compatibility: { astVersion: "2.0", coreVersion: ">=0.1.0" },
    });
    expect(p.name).toBe("test");
  });

  it("defineMiddleware returns MiddlewareDefinition", () => {
    const mw = defineMiddleware({ name: "auth", handler: "AuthMiddleware" });
    expect(mw.kind).toBe("MiddlewareDefinition");
    expect(mw.name).toBe("auth");
    expect(mw.handler).toBe("AuthMiddleware");
  });

  it("defineMiddleware omits handler when not provided", () => {
    const mw = defineMiddleware({ name: "audit" });
    expect(mw.kind).toBe("MiddlewareDefinition");
    expect(mw.name).toBe("audit");
    expect(mw.handler).toBeUndefined();
  });
});

describe("defineValidationError", () => {
  it("creates config with httpStatus and body", () => {
    const cfg = defineValidationError({
      httpStatus: 422,
      body: (vz) => vz.object({ field: vz.field(), tag: vz.tag() }),
    });
    expect(cfg.httpStatus).toBe(422);
    expect(cfg.body).toBeDefined();
  });

  it("defaults httpStatus when not provided", () => {
    const cfg = defineValidationError({
      body: (vz) => vz.object({ msg: vz.literal("err") }),
    });
    expect(cfg.httpStatus).toBeUndefined();
    expect(cfg.body).toBeDefined();
  });
});
