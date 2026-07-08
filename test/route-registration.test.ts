/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import {
  generateHandlerInitLines,
  generateRegisterModuleRoutes,
  generateCombinedRegisterRoutes,
} from "../src/generators/route-registration-goast.js";
import type { AppServiceDef, ModuleAst, RouteExpansionAst } from "../src/types/index.js";
import type { GoModuleInfo } from "../src/utils/env.js";

function mockRouteExpansion(
  handlerName: string,
  layers: string[],
  moduleName = "users",
): RouteExpansionAst {
  return {
    route: { moduleName, handlerName, kind: "Route" } as any,
    layers: layers.map((kind) => ({ kind }) as any),
  };
}

function mockModule(name: string): ModuleAst {
  return {
    kind: "Module",
    id: name,
    stableId: name,
    name,
    annotations: {},
    pluginData: {},
    services: [],
    routes: [],
    middleware: [],
  } as ModuleAst;
}

const moduleInfo: GoModuleInfo = { modulePath: "github.com/example/myapp", dependencies: [] };

describe("generateHandlerInitLines", () => {
  it("returns empty when no handler/usecase layers", () => {
    const mod = mockModule("users");
    const routes = [mockRouteExpansion("List", ["entity", "domain"])];
    const result = generateHandlerInitLines(mod, [], routes, undefined, undefined, new Set());
    expect(result.moduleImports).toEqual([]);
    expect(result.handlerInitLines).toEqual([]);
  });

  it("generates init lines for a single route with handler layer", () => {
    const mod = mockModule("users");
    const routes = [mockRouteExpansion("List", ["handler", "usecase"])];
    const result = generateHandlerInitLines(mod, [], routes, moduleInfo, undefined, new Set());
    expect(result.moduleImports).toContain('"github.com/example/myapp/internal/users"');
    expect(result.handlerInitLines.some((l) => l.includes("ListUsecase"))).toBe(true);
  });

  it("generates init lines for multiple routes", () => {
    const mod = mockModule("users");
    const routes = [
      mockRouteExpansion("List", ["handler", "usecase"]),
      mockRouteExpansion("Create", ["handler", "usecase"]),
    ];
    const result = generateHandlerInitLines(mod, [], routes, moduleInfo, undefined, new Set());
    expect(result.handlerInitLines.some((l) => l.includes("ListUsecase"))).toBe(true);
    expect(result.handlerInitLines.some((l) => l.includes("CreateUsecase"))).toBe(true);
  });

  it("includes nil checks when services are present", () => {
    const mod = mockModule("users");
    const svc: AppServiceDef = { name: "svc", typeName: "MyService" };
    const routes = [mockRouteExpansion("List", ["handler", "usecase"])];
    const result = generateHandlerInitLines(mod, [svc], routes, moduleInfo, undefined, new Set());
    expect(result.handlerInitLines.some((l) => l.includes("svcSvc == nil"))).toBe(true);
  });

  it("generates repository init for repository modules", () => {
    const mod = mockModule("users");
    const dbSvc: AppServiceDef = { name: "gorm", typeName: "GormService", dbAccessor: "DB" };
    const routes = [mockRouteExpansion("List", ["handler", "usecase"])];
    const result = generateHandlerInitLines(
      mod,
      [dbSvc],
      routes,
      moduleInfo,
      undefined,
      new Set(["users"]),
    );
    expect(result.handlerInitLines.some((l) => l.includes("usersRepo :="))).toBe(true);
  });
});

describe("generateRegisterModuleRoutes", () => {
  it("produces valid Go function for empty routes", () => {
    const result = generateRegisterModuleRoutes(
      "users",
      [],
      [],
      "api *gin.RouterGroup",
      [],
      new Map(),
    );
    const output = result.join("\n");
    expect(output).toContain("import (");
    expect(output).toContain('"github.com/gin-gonic/gin"');
    expect(output).toContain("func registerUsersRoutes(api *gin.RouterGroup) {");
    expect(output).toContain("}");
  });

  it("includes a single route registration call", () => {
    const lines = [{ content: 'api.GET("/users", usersHandler.ListUsers)', group: "" }];
    const result = generateRegisterModuleRoutes(
      "users",
      [],
      [],
      "api *gin.RouterGroup",
      lines,
      new Map(),
    );
    expect(result.join("\n")).toContain('api.GET("/users", usersHandler.ListUsers)');
  });

  it("includes multiple route registration calls", () => {
    const lines = [
      { content: 'api.GET("/users", usersHandler.ListUsers)', group: "" },
      { content: 'api.POST("/users", usersHandler.CreateUser)', group: "" },
    ];
    const result = generateRegisterModuleRoutes(
      "users",
      [],
      [],
      "api *gin.RouterGroup",
      lines,
      new Map(),
    );
    const output = result.join("\n");
    expect(output).toContain('api.GET("/users", usersHandler.ListUsers)');
    expect(output).toContain('api.POST("/users", usersHandler.CreateUser)');
  });

  it("groups routes under a prefix", () => {
    const lines = [{ content: 'api.GET("/", usersHandler.ListUsers)', group: "/api/v1" }];
    const groupMw = new Map([["/api/v1", new Set(["Auth"])]]);
    const result = generateRegisterModuleRoutes(
      "users",
      [],
      [],
      "api *gin.RouterGroup",
      lines,
      groupMw,
    );
    const output = result.join("\n");
    expect(output).toContain('api_v1 := api.Group("/api/v1", middleware.Auth)');
    expect(output).toContain("api_v1.GET(");
  });

  it("includes module imports in sorted order", () => {
    const result = generateRegisterModuleRoutes(
      "users",
      ['"github.com/example/myapp/internal/users"', '"github.com/example/myapp/internal/service"'],
      [],
      "api *gin.RouterGroup",
      [],
      new Map(),
    );
    const output = result.join("\n");
    expect(output).toContain('"github.com/example/myapp/internal/service"');
    expect(output).toContain('"github.com/example/myapp/internal/users"');
  });

  it("includes handler init lines before route registrations", () => {
    const initLines = ["usersHandler := &users.Handler{ListUsecase: users.NewListUsecase()}"];
    const result = generateRegisterModuleRoutes(
      "users",
      [],
      initLines,
      "api *gin.RouterGroup",
      [],
      new Map(),
    );
    const output = result.join("\n");
    expect(output).toContain("usersHandler := &users.Handler{ListUsecase: users.NewListUsecase()}");
  });
});

describe("generateCombinedRegisterRoutes", () => {
  it("generates empty RegisterRoutes for no modules", () => {
    const result = generateCombinedRegisterRoutes([], [], undefined, () => []);
    const output = result.join("\n");
    expect(output).toContain("func RegisterRoutes(api *gin.RouterGroup) {");
    expect(output).toContain("}");
    expect(output).not.toContain("register");
  });

  it("calls single module register function", () => {
    const result = generateCombinedRegisterRoutes(["users"], [], moduleInfo, () => []);
    const output = result.join("\n");
    expect(output).toContain("registerUsersRoutes(api)");
  });

  it("calls multiple module register functions in order", () => {
    const result = generateCombinedRegisterRoutes(["users", "orders"], [], moduleInfo, () => []);
    const output = result.join("\n");
    const usersIdx = output.indexOf("registerUsersRoutes(api)");
    const ordersIdx = output.indexOf("registerOrdersRoutes(api)");
    expect(usersIdx).toBeGreaterThan(-1);
    expect(ordersIdx).toBeGreaterThan(-1);
  });

  it("passes service params to register calls", () => {
    const svc: AppServiceDef = { name: "users", typeName: "UsersService" };
    const getServices = (name: string) => (name === "users" ? [svc] : []);
    const result = generateCombinedRegisterRoutes(
      ["users", "orders"],
      [svc],
      moduleInfo,
      getServices,
    );
    const output = result.join("\n");
    expect(output).toContain("registerUsersRoutes(api, usersSvc)");
    expect(output).toContain("registerOrdersRoutes(api)");
    expect(output).toContain("usersSvc service.UsersService");
  });

  it("includes gin import and service import with moduleInfo", () => {
    const svc: AppServiceDef = { name: "users", typeName: "UsersService" };
    const result = generateCombinedRegisterRoutes(["users"], [svc], moduleInfo, () => [svc]);
    const output = result.join("\n");
    expect(output).toContain('"github.com/gin-gonic/gin"');
    expect(output).toContain('"github.com/example/myapp/internal/service"');
  });

  it("omits service import when moduleInfo is undefined", () => {
    const svc: AppServiceDef = { name: "users", typeName: "UsersService" };
    const result = generateCombinedRegisterRoutes(["users"], [svc], undefined, () => [svc]);
    const output = result.join("\n");
    expect(output).toContain('"github.com/gin-gonic/gin"');
    expect(output).not.toContain("internal/service");
  });
});
