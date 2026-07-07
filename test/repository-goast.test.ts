import { describe, it, expect } from "vitest";
import type { AppServiceDef, BackendExtension, RouteAst } from "../src/types/index.js";
import {
  generateRepository,
  generateRepositoryLegacy,
} from "../src/generators/repository.js";

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

function compare(
  routes: RouteAst[],
  moduleName: string,
  dbProvider?: AppServiceDef,
  extensions: BackendExtension[] = [],
) {
  const old_ = generateRepositoryLegacy(routes, moduleName, dbProvider, extensions);
  const new_ = generateRepository(routes, moduleName, dbProvider, extensions);
  expect(new_.length).toBe(old_.length);
  for (let i = 0; i < old_.length; i++) {
    expect(new_[i].kind).toBe(old_[i].kind);
    expect(new_[i].symbolName).toBe(old_[i].symbolName);
    expect(new_[i].content).toBe(old_[i].content);
    if (new_[i].signature !== undefined || old_[i].signature !== undefined) {
      expect(new_[i].signature).toBe(old_[i].signature);
    }
    expect(new_[i].expectsUserCode).toBe(old_[i].expectsUserCode);
    expect(new_[i].isStub).toBe(old_[i].isStub);
    if (new_[i].receiver !== undefined || old_[i].receiver !== undefined) {
      expect(new_[i].receiver).toBe(old_[i].receiver);
    }
  }
}

describe("go-ast repository generation", () => {
  it("1. empty repo — no routes, no db", () => {
    compare([], "user");
  });

  it("2. empty repo — no routes, with db", () => {
    const dbProvider: AppServiceDef = {
      name: "gorm",
      typeName: "GormService",
      dbType: "*gorm.DB",
      dbTypePkg: "gorm.io/gorm",
    };
    compare([], "user", dbProvider);
  });

  it("3. with db provider and List method", () => {
    const dbProvider: AppServiceDef = {
      name: "gorm",
      typeName: "GormService",
      dbType: "*gorm.DB",
      dbTypePkg: "gorm.io/gorm",
    };
    const routes = [mockRoute()];
    compare(routes, "user", dbProvider);
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
    compare(routes, "user", dbProvider);
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
    compare(routes, "user", dbProvider);
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
    const old_ = generateRepositoryLegacy(routes, "user", dbProvider, [ext]);
    const new_ = generateRepository(routes, "user", dbProvider, [ext]);
    expect(new_.length).toBe(old_.length);
    expect(new_.length).toBe(5); // imports, interface, struct, ctor, method
    expect(new_[4].content).toBe("// extension generated dialect method");
    expect(new_[4].content).toBe(old_[4].content);
  });

  it("7. with dbTypePkg — verify imports", () => {
    const dbProvider: AppServiceDef = {
      name: "gorm",
      typeName: "GormService",
      dbType: "*gorm.DB",
      dbTypePkg: "gorm.io/gorm",
    };
    const routes = [mockRoute()];
    const old_ = generateRepositoryLegacy(routes, "user", dbProvider, []);
    const new_ = generateRepository(routes, "user", dbProvider, []);
    expect(new_[0].content).toBe(old_[0].content);
    expect(new_[0].content).toContain("gorm.io/gorm");
  });

  it("8. no db provider but with methods — only interface returned", () => {
    const routes = [mockRoute()];
    const old_ = generateRepositoryLegacy(routes, "user", undefined, []);
    const new_ = generateRepository(routes, "user", undefined, []);
    expect(new_.length).toBe(1);
    expect(new_[0].kind).toBe("interface");
    expect(new_[0].symbolName).toBe("UserRepository");
    expect(new_[0].content).toBe(old_[0].content);
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
    compare(routes, "user", dbProvider);
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
    compare(routes, "user", dbProvider);
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
    compare(routes, "pet", dbProvider);
  });
});
