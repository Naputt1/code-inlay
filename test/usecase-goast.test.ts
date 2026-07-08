import { describe, it, expect } from "vitest";
import type { RouteAst } from "../src/types/index.js";
import { generateUsecaseInterface, generateUsecaseScaffold } from "../src/generators/usecase.js";

function mockRoute(overrides: Partial<RouteAst>): RouteAst {
  return {
    kind: "Route",
    id: "test",
    stableId: "test-stable",
    moduleName: "user",
    handlerName: "GetUser",
    method: "GET",
    path: "/users/:id",
    fullPath: "/api/users/:id",
    query: undefined,
    body: undefined,
    response: undefined,
    errors: [],
    annotations: {},
    pluginData: {},
    resolvedArchitectures: [],
    resolvedAdapters: [],
    middleware: [],
    metadata: {},
    ...overrides,
  } as RouteAst;
}

function ifaceResult(route: RouteAst, hasDomain?: boolean): string {
  return generateUsecaseInterface(route, hasDomain);
}

describe("goast usecase interface generation", () => {
  it("1. without domain", () => {
    const route = mockRoute({});
    const result = ifaceResult(route);
    expect(result).toContain("type GetUserUsecase interface");
    expect(result).toContain("Execute(ctx context.Context, input");
  });

  it("2. with domain (Get verb — id param)", () => {
    const route = mockRoute({ handlerName: "GetUser" });
    const result = ifaceResult(route, true);
    expect(result).toContain("id UserID");
  });

  it("3. with domain and entity context", () => {
    const route = mockRoute({ id: "adminGet", handlerName: "GetUser" });
    const result = ifaceResult(route, true);
    expect(result).toContain("id UserID");
  });

  it("4. without domain, List verb (no params)", () => {
    const route = mockRoute({ handlerName: "ListUser", id: "list", path: "/users" });
    const result = ifaceResult(route);
    expect(result).toContain("type ListUserUsecase interface");
    expect(result).toContain("Execute(ctx context.Context, input");
  });

  it("5. with domain, List verb (no params)", () => {
    const route = mockRoute({ handlerName: "ListUser", id: "list", path: "/users" });
    const result = ifaceResult(route, true);
    expect(result).toContain("Execute(ctx context.Context)");
  });

  it("6. with domain, Create verb", () => {
    const route = mockRoute({ handlerName: "CreateUser", id: "create" });
    const result = ifaceResult(route, true);
    expect(result).toContain("entity User");
  });

  it("7. with domain, Update verb", () => {
    const route = mockRoute({ handlerName: "UpdateUser", id: "update" });
    const result = ifaceResult(route, true);
    expect(result).toContain("id UserID, entity User");
  });

  it("8. with domain, Delete verb", () => {
    const route = mockRoute({ handlerName: "DeleteUser", id: "delete" });
    const result = ifaceResult(route, true);
    expect(result).toContain("id UserID");
  });

  it("9. with domain, Set verb", () => {
    const route = mockRoute({ handlerName: "SetField", id: "set" });
    const result = ifaceResult(route, true);
    expect(result).toContain("id UserID");
  });

  it("10. with domain but no verb match (falls back to input RequestType)", () => {
    const route = mockRoute({ handlerName: "CustomOp", id: "custom" });
    const result = ifaceResult(route, true);
    expect(result).toContain("type CustomOpUsecase interface");
    expect(result).toContain("Execute(ctx context.Context,");
  });
});

function scaffoldResult(
  route: RouteAst,
  moduleName: string,
  hasRepository: boolean,
  serviceTypes: string[],
  hasDomain?: boolean,
) {
  return generateUsecaseScaffold(route, moduleName, hasRepository, serviceTypes, hasDomain);
}

describe("goast usecase scaffold generation", () => {
  it("1. no repository, no services", () => {
    const result = scaffoldResult(mockRoute({}), "user", false, []);
    expect(result.length).toBe(3);
  });

  it("2. with repository only", () => {
    const result = scaffoldResult(mockRoute({}), "user", true, []);
    expect(result.length).toBe(3);
    expect(result[0].content).toContain("repo UserRepository");
  });

  it("3. with services only", () => {
    const result = scaffoldResult(mockRoute({}), "user", false, ["FooService", "BarService"]);
    expect(result.length).toBe(3);
    const allContent = result.map((p) => p.content).join("");
    expect(allContent).toContain("fooSvc");
    expect(allContent).toContain("barSvc");
  });

  it("4. with repository and services", () => {
    const result = scaffoldResult(mockRoute({}), "user", true, ["FooService"]);
    expect(result.length).toBe(3);
    expect(result[0].content).toContain("repo UserRepository");
    expect(result[0].content).toContain("fooSvc");
  });

  it("5. with domain + repository + Get verb", () => {
    const route = mockRoute({ handlerName: "GetUser" });
    const result = scaffoldResult(route, "user", true, [], true);
    expect(result[2].content).toContain(".FindByID(ctx, id)");
  });

  it("6. with domain + repository + Create verb", () => {
    const route = mockRoute({ handlerName: "CreateUser", id: "create" });
    const result = scaffoldResult(route, "user", true, [], true);
    expect(result[2].content).toContain(".Create(ctx, entity)");
  });

  it("7. with domain + repository + List verb", () => {
    const route = mockRoute({ handlerName: "ListUser", id: "list", path: "/users" });
    const result = scaffoldResult(route, "user", true, [], true);
    expect(result[2].content).toContain(".FindAll(ctx)");
  });

  it("8. with domain + repository + Delete verb", () => {
    const route = mockRoute({ handlerName: "DeleteUser", id: "delete" });
    const result = scaffoldResult(route, "user", true, [], true);
    expect(result[2].content).toContain(".Delete(ctx, id)");
  });

  it("9. with domain + repository + Update verb", () => {
    const route = mockRoute({ handlerName: "UpdateUser", id: "update" });
    const result = scaffoldResult(route, "user", true, [], true);
    expect(result[2].content).toContain(".Update(ctx, id, entity)");
  });

  it("10. with domain + repository + Set verb", () => {
    const route = mockRoute({ handlerName: "SetField", id: "set" });
    const result = scaffoldResult(route, "user", true, [], true);
    expect(result[2].content).toContain(".SetField(ctx, id)");
  });

  it("11. with domain + no repo (falls back to input RequestType)", () => {
    const route = mockRoute({});
    const result = scaffoldResult(route, "user", false, [], true);
    expect(result.length).toBe(3);
    expect(result[2].content).toContain("// TODO: implement");
  });

  it("12. with domain + repo + services + Get verb", () => {
    const route = mockRoute({ handlerName: "GetUser" });
    const result = scaffoldResult(route, "user", true, ["FooService"], true);
    expect(result.length).toBe(3);
    expect(result[0].content).toContain("fooSvc");
  });
});
