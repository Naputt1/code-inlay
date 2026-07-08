/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import type { AppServiceDef, BackendExtension, RouteAst } from "../src/types/index.js";
import { generateRepository } from "../src/generators/repository-goast.js";

function mockRoute(overrides: Partial<RouteAst> = {}): RouteAst {
  return {
    kind: "Route",
    id: "list",
    stableId: "list",
    annotations: {},
    pluginData: {},
    moduleName: "user",
    method: "GET",
    path: "/users",
    fullPath: "/api/users",
    handlerName: "ListUsers",
    resolvedArchitectures: [],
    resolvedAdapters: [],
    middleware: [],
    errors: [],
    metadata: {},
    ...overrides,
  } as RouteAst;
}

describe("goast repository generation", () => {
  it("1. empty repo — no routes, no db", () => {
    const result = generateRepository([], "user", undefined, []);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].kind).toBe("interface");
  });

  it("2. empty repo — no routes, with db", () => {
    const dbProvider: AppServiceDef = {
      name: "gorm",
      typeName: "GormService",
      dbType: "*gorm.DB",
      dbTypePkg: "gorm.io/gorm",
    };
    const result = generateRepository([], "user", dbProvider, []);
    expect(result.length).toBe(4);
  });

  it("3. with db provider and List method", () => {
    const dbProvider: AppServiceDef = {
      name: "gorm",
      typeName: "GormService",
      dbType: "*gorm.DB",
      dbTypePkg: "gorm.io/gorm",
    };
    const routes = [mockRoute()];
    const result = generateRepository(routes, "user", dbProvider, []);
    expect(result.length).toBe(5);
    expect(result[0].kind).toBe("imports");
    expect(result[1].kind).toBe("interface");
    expect(result[2].kind).toBe("struct");
    expect(result[3].kind).toBe("function");
  });

  it("4. with Get method (has path params)", () => {
    const dbProvider: AppServiceDef = {
      name: "gorm",
      typeName: "GormService",
      dbType: "*gorm.DB",
      dbTypePkg: "gorm.io/gorm",
    };
    const routes = [
      mockRoute({
        id: "get",
        stableId: "get",
        path: "/users/:id",
        handlerName: "GetUser",
      }),
    ];
    const result = generateRepository(routes, "user", dbProvider, []);
    expect(result.length).toBe(5);
    expect(result[4].symbolName).toContain("FindByID");
  });

  it("5. with multiple methods", () => {
    const dbProvider: AppServiceDef = {
      name: "gorm",
      typeName: "GormService",
      dbType: "*gorm.DB",
      dbTypePkg: "gorm.io/gorm",
    };
    const routes = [
      mockRoute(),
      mockRoute({
        id: "get",
        stableId: "get",
        path: "/users/:id",
        handlerName: "GetUser",
      }),
      mockRoute({
        id: "create",
        stableId: "create",
        path: "/users",
        handlerName: "CreateUser",
      }),
    ];
    const result = generateRepository(routes, "user", dbProvider, []);
    expect(result.filter((p) => p.kind === "method").length).toBe(3);
  });

  it("6. with dialect extension", () => {
    const dbProvider: AppServiceDef = {
      name: "my-ext",
      typeName: "MyExt",
      extension: "my-ext",
      extensionOptions: { foo: "bar" },
      dbType: "*gorm.DB",
      dbTypePkg: "gorm.io/gorm",
    };
    const ext: BackendExtension = {
      name: "my-ext",
      service: {
        optionsSchema: {} as any,
        generateDialectMethod: (ctx) => {
          expect(ctx.method.name).toBe("FindAll");
          expect(ctx.method.params).toBe("ctx context.Context");
          expect(ctx.method.results).toBe("([]User, error)");
          expect(ctx.method.entityName).toBe("User");
          expect(ctx.baseEntity).toBe("User");
          expect(ctx.implName).toBe("userRepositoryImpl");
          expect(ctx.options).toEqual({ foo: "bar" });
          return "// extension generated dialect method";
        },
      },
    };
    const routes = [mockRoute()];
    const result = generateRepository(routes, "user", dbProvider, [ext]);
    expect(result.length).toBe(5);
    expect(result[4].content).toBe("// extension generated dialect method");
  });

  it("7. with dbTypePkg — verify imports", () => {
    const dbProvider: AppServiceDef = {
      name: "gorm",
      typeName: "GormService",
      dbType: "*gorm.DB",
      dbTypePkg: "gorm.io/gorm",
    };
    const routes = [mockRoute()];
    const result = generateRepository(routes, "user", dbProvider, []);
    expect(result[0].content).toContain("gorm.io/gorm");
  });

  it("8. no db provider but with methods — only interface returned", () => {
    const routes = [mockRoute()];
    const result = generateRepository(routes, "user", undefined, []);
    expect(result.length).toBe(1);
    expect(result[0].kind).toBe("interface");
    expect(result[0].symbolName).toBe("UserRepository");
  });

  it("9. Set method without path param", () => {
    const dbProvider: AppServiceDef = {
      name: "gorm",
      typeName: "GormService",
      dbType: "*gorm.DB",
      dbTypePkg: "gorm.io/gorm",
    };
    const routes = [
      mockRoute({
        id: "set",
        stableId: "set",
        path: "/users/activate",
        handlerName: "SetActivate",
      }),
    ];
    const result = generateRepository(routes, "user", dbProvider, []);
    expect(result.length).toBe(5);
    expect(result[4].symbolName).toContain("SetActivate");
  });

  it("10. Delete method", () => {
    const dbProvider: AppServiceDef = {
      name: "gorm",
      typeName: "GormService",
      dbType: "*gorm.DB",
    };
    const routes = [
      mockRoute({
        id: "delete",
        stableId: "delete",
        path: "/users/:id",
        handlerName: "DeleteUser",
      }),
    ];
    const result = generateRepository(routes, "user", dbProvider, []);
    expect(result.length).toBe(5);
    expect(result[4].symbolName).toContain("Delete");
  });

  it("11. different module name — pet", () => {
    const dbProvider: AppServiceDef = {
      name: "gorm",
      typeName: "GormService",
      dbType: "*gorm.DB",
    };
    const routes = [
      mockRoute({
        moduleName: "pet",
        handlerName: "ListPets",
      }),
    ];
    const result = generateRepository(routes, "pet", dbProvider, []);
    expect(result[1].symbolName).toBe("PetRepository");
  });
});
