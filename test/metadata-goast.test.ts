import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { generateRegistryGo, generateSchemaReflection } from "../src/metadata/metadata-goast.js";
import type { AppAst, RouteAst, RouteLikeAst, ModuleAst } from "../src/types/index.js";

function makeRouteAst(overrides: Partial<RouteAst> & { kind?: "Route" }): RouteAst {
  return {
    kind: "Route",
    id: "test",
    stableId: "test",
    moduleName: "test",
    method: "GET",
    path: "/test",
    fullPath: "/test",
    handlerName: "TestHandler",
    annotations: {},
    pluginData: {},
    resolvedArchitectures: [],
    resolvedAdapters: [],
    errors: [],
    middleware: [],
    metadata: {},
    ...overrides,
  } as RouteAst;
}

function makeModuleAst(name: string, routes: RouteLikeAst[]): ModuleAst {
  return {
    kind: "Module",
    id: name,
    stableId: name,
    name,
    routes,
    services: [],
    middleware: [],
    annotations: {},
    pluginData: {},
  } as ModuleAst;
}

function makeAppAst(modules: ModuleAst[], version?: string): AppAst {
  return {
    kind: "App",
    id: "app",
    stableId: "app",
    modules,
    annotations: {},
    pluginData: {},
    options: {
      fileCreation: "replace",
      targetOptions: version ? { metadata: { version } } : undefined,
    },
    usecases: [],
    services: [],
    repositories: [],
    handlers: [],
    middleware: [],
    adapters: [],
    transports: [],
  } as unknown as AppAst;
}

describe("generateRegistryGo (goast)", () => {
  it("generates struct types and registry declaration", () => {
    const route = makeRouteAst({
      id: "get-user",
      moduleName: "user",
      method: "GET",
      fullPath: "/users/:id",
      handlerName: "GetUser",
    });
    const module = makeModuleAst("user", [route]);
    const ast = makeAppAst([module]);

    const result = generateRegistryGo(ast, new Map());

    expect(result).toContain("package metadata");
    expect(result).toContain("type RouteInfo struct");
    expect(result).toContain('ID string `json:"id"`');
    expect(result).toContain('Method string `json:"method"`');
    expect(result).toContain('Path string `json:"path"`');
    expect(result).toContain('Handler string `json:"handler"`');
    expect(result).toContain('Module string `json:"module"`');
    expect(result).toContain('Input string `json:"input,omitempty"`');
    expect(result).toContain('Response string `json:"response,omitempty"`');
    expect(result).toContain("type ModuleInfo struct");
    expect(result).toContain("var Registry = struct");
    expect(result).toContain('Modules []ModuleInfo `json:"modules"`');
    expect(result).toContain('Version string `json:"version"`');
    expect(result).toContain('GeneratedAt string `json:"generatedAt"`');
    expect(result).toContain(`Version: "1.0.0"`);
    expect(result).toContain("GeneratedAt:");
    expect(result).toContain("get-user");
    expect(result).toContain('"GET"');
    expect(result).toContain("/users/:id");
    expect(result).toContain("GetUser");
    expect(result).toContain('"user"');
  });

  it("includes Input field when route has query or body", () => {
    const route = makeRouteAst({
      id: "create-user",
      moduleName: "user",
      method: "POST",
      fullPath: "/users",
      handlerName: "CreateUser",
      body: z.object({ name: z.string() }),
    });
    const module = makeModuleAst("user", [route]);
    const ast = makeAppAst([module]);
    const result = generateRegistryGo(ast, new Map());

    expect(result).toContain("CreateUserUserRequest");
  });

  it("includes Response field when route has response", () => {
    const route = makeRouteAst({
      id: "get-user",
      moduleName: "user",
      method: "GET",
      fullPath: "/users/:id",
      handlerName: "GetUser",
      response: z.object({ id: z.number(), name: z.string() }),
    });
    const module = makeModuleAst("user", [route]);
    const ast = makeAppAst([module]);
    const result = generateRegistryGo(ast, new Map());

    expect(result).toContain("GetUserUserResponse");
  });

  it("handles multiple routes in one module", () => {
    const route1 = makeRouteAst({
      id: "list-users",
      moduleName: "user",
      method: "GET",
      fullPath: "/users",
      handlerName: "ListUsers",
    });
    const route2 = makeRouteAst({
      id: "create-user",
      moduleName: "user",
      method: "POST",
      fullPath: "/users",
      handlerName: "CreateUser",
      body: z.object({ name: z.string() }),
    });
    const module = makeModuleAst("user", [route1, route2]);
    const ast = makeAppAst([module]);
    const result = generateRegistryGo(ast, new Map());

    expect(result).toContain("list-users");
    expect(result).toContain("create-user");
    expect(result).toContain("ListUsers");
    expect(result).toContain("CreateUser");
    expect(result).toContain("CreateUserUserRequest");
  });

  it("handles multiple modules", () => {
    const route1 = makeRouteAst({
      id: "get-user",
      moduleName: "user",
      method: "GET",
      fullPath: "/users/:id",
      handlerName: "GetUser",
    });
    const route2 = makeRouteAst({
      id: "list-items",
      moduleName: "item",
      method: "GET",
      fullPath: "/items",
      handlerName: "ListItems",
    });
    const module1 = makeModuleAst("user", [route1]);
    const module2 = makeModuleAst("item", [route2]);
    const ast = makeAppAst([module1, module2]);
    const result = generateRegistryGo(ast, new Map());

    expect(result).toContain('"user"');
    expect(result).toContain('"item"');
  });

  it("uses custom version from targetOptions", () => {
    const route = makeRouteAst({
      id: "get-user",
      moduleName: "user",
      method: "GET",
      fullPath: "/users/:id",
      handlerName: "GetUser",
    });
    const module = makeModuleAst("user", [route]);
    const ast = makeAppAst([module], "2.0.0");
    const result = generateRegistryGo(ast, new Map());

    expect(result).toContain(`Version: "2.0.0"`);
  });

  it("handles SSE and WS route types", () => {
    const sseRoute = {
      kind: "SSE" as const,
      id: "events",
      stableId: "events",
      moduleName: "notify",
      path: "/events",
      fullPath: "/events",
      handlerName: "HandleSSE",
      annotations: {},
      pluginData: {},
      middleware: [],
      metadata: {},
      resolvedArchitectures: [],
      resolvedAdapters: [],
      events: z.string(),
    } as unknown as RouteLikeAst;
    const wsRoute = {
      kind: "WS" as const,
      id: "chat",
      stableId: "chat",
      moduleName: "notify",
      path: "/chat",
      fullPath: "/chat",
      handlerName: "HandleWS",
      annotations: {},
      pluginData: {},
      middleware: [],
      metadata: {},
      resolvedArchitectures: [],
      resolvedAdapters: [],
      message: z.string(),
    } as unknown as RouteLikeAst;
    const module = makeModuleAst("notify", [sseRoute, wsRoute]);
    const ast = makeAppAst([module]);
    const result = generateRegistryGo(ast, new Map());

    expect(result).toContain('Method: "SSE"');
    expect(result).toContain('Method: "WS"');
    expect(result).toContain("events");
    expect(result).toContain("chat");
    expect(result).toContain("HandleSSE");
    expect(result).toContain("HandleWS");
  });

  it("empty modules produces empty Modules slice", () => {
    const ast = makeAppAst([]);
    const result = generateRegistryGo(ast, new Map());

    expect(result).toContain("Modules:");
    expect(result).toContain("[]ModuleInfo{}");
  });
});

describe("generateSchemaReflection (goast)", () => {
  it("returns empty string for non-Route kinds", () => {
    const wsRoute = {
      kind: "WS" as const,
      id: "chat",
      stableId: "chat",
      moduleName: "notify",
      path: "/chat",
      fullPath: "/chat",
      handlerName: "HandleWS",
    } as unknown as RouteLikeAst;
    expect(generateSchemaReflection(wsRoute)).toBe("");
  });

  it("generates method for body schema", () => {
    const route = makeRouteAst({
      id: "create-user",
      moduleName: "user",
      method: "POST",
      fullPath: "/users",
      handlerName: "CreateUser",
      body: z.object({ name: z.string() }),
    });

    const result = generateSchemaReflection(route);
    expect(result).toContain("func (CreateUserUserBody) SchemaReflection() map[string]any {");
    expect(result).toContain('"type": "string"');
    expect(result).toContain('"name"');
    expect(result).toContain('"object"');
    expect(result).toContain("properties");
  });

  it("generates method for query schema", () => {
    const route = makeRouteAst({
      id: "list-users",
      moduleName: "user",
      method: "GET",
      fullPath: "/users",
      handlerName: "ListUsers",
      query: z.object({ page: z.number() }),
    });

    const result = generateSchemaReflection(route);
    expect(result).toContain("func (ListUsersUserQuery) SchemaReflection() map[string]any {");
    expect(result).toContain('"type": "number"');
  });

  it("generates method for response schema", () => {
    const route = makeRouteAst({
      id: "get-user",
      moduleName: "user",
      method: "GET",
      fullPath: "/users/:id",
      handlerName: "GetUser",
      response: z.object({ id: z.number(), name: z.string() }),
    });

    const result = generateSchemaReflection(route);
    expect(result).toContain("func (GetUserUserResponse) SchemaReflection() map[string]any {");
    expect(result).toContain('"type": "number"');
    expect(result).toContain('"type": "string"');
  });

  it("generates Request method when query or body present", () => {
    const route = makeRouteAst({
      id: "create-user",
      moduleName: "user",
      method: "POST",
      fullPath: "/users",
      handlerName: "CreateUser",
      body: z.object({ name: z.string() }),
    });

    const result = generateSchemaReflection(route);
    expect(result).toContain("func (CreateUserUserRequest) SchemaReflection() map[string]any {");
  });

  it("generates multiple methods for a route with body and response", () => {
    const route = makeRouteAst({
      id: "create-user",
      moduleName: "user",
      method: "POST",
      fullPath: "/users",
      handlerName: "CreateUser",
      body: z.object({ name: z.string() }),
      response: z.object({ id: z.number() }),
    });

    const result = generateSchemaReflection(route);
    expect(result).toContain("CreateUserUserBody");
    expect(result).toContain("CreateUserUserRequest");
    expect(result).toContain("CreateUserUserResponse");
  });

  it("handles array types in schema", () => {
    const route = makeRouteAst({
      id: "list-items",
      moduleName: "item",
      method: "GET",
      fullPath: "/items",
      handlerName: "ListItems",
      response: z.object({ items: z.array(z.object({ id: z.number() })) }),
    });

    const result = generateSchemaReflection(route);
    expect(result).toContain('"array"');
    expect(result).toContain('"items"');
    expect(result).toContain('"id"');
  });

  it("handles boolean types in schema", () => {
    const route = makeRouteAst({
      id: "toggle-feature",
      moduleName: "feature",
      method: "POST",
      fullPath: "/features",
      handlerName: "ToggleFeature",
      body: z.object({ active: z.boolean() }),
    });

    const result = generateSchemaReflection(route);
    expect(result).toContain('"type": "boolean"');
  });

  it("handles unknown types in schema", () => {
    const route = makeRouteAst({
      id: "store-raw",
      moduleName: "raw",
      method: "POST",
      fullPath: "/raw",
      handlerName: "StoreRaw",
      body: z.object({ data: z.any() }),
    });

    const result = generateSchemaReflection(route);
    expect(result).toContain('"type": "unknown"');
  });

  it("generates no methods when route has no schemas", () => {
    const route = makeRouteAst({
      id: "health",
      moduleName: "system",
      method: "GET",
      fullPath: "/health",
      handlerName: "HealthCheck",
    });

    const result = generateSchemaReflection(route);
    expect(result).toBe("");
  });
});
