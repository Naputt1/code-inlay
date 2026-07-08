import { describe, it, expect } from "vitest";
import type { ArchitectureAst, RouteExpansionAst } from "../src/types/index.js";
import { generateHandlerStructs } from "../src/generators/handler-goast.js";

function route(name: string, layers: string[]): RouteExpansionAst {
  return {
    route: { moduleName: "users", handlerName: name } as any,
    layers: layers.map((kind) => ({ kind })) as any,
  };
}

function routeModule(moduleName: string, name: string, layers: string[]): RouteExpansionAst {
  return {
    route: { moduleName, handlerName: name } as any,
    layers: layers.map((kind) => ({ kind })) as any,
  };
}

describe("go-ast handler struct generation", () => {
  it("1. no routes returns empty array", () => {
    const arch: ArchitectureAst = { nodes: [], routes: [] };
    const result = generateHandlerStructs(arch);
    expect(result).toEqual([]);
  });

  it("2. single module, single route", () => {
    const arch: ArchitectureAst = { nodes: [], routes: [route("Get", ["handler", "usecase"])] };
    const result = generateHandlerStructs(arch);
    expect(result.length).toBe(1);
    expect(result[0].regionId).toBe("users.0handler.struct");
  });

  it("3. single module, two routes", () => {
    const arch: ArchitectureAst = {
      nodes: [],
      routes: [route("Get", ["handler", "usecase"]), route("Create", ["handler", "usecase"])],
    };
    const result = generateHandlerStructs(arch);
    expect(result.length).toBe(1);
    expect(result[0].content).toContain("GetUsecase");
    expect(result[0].content).toContain("CreateUsecase");
  });

  it("4. two modules, one route each", () => {
    const arch: ArchitectureAst = {
      nodes: [],
      routes: [
        routeModule("users", "Get", ["handler", "usecase"]),
        routeModule("orders", "List", ["handler", "usecase"]),
      ],
    };
    const result = generateHandlerStructs(arch);
    expect(result.length).toBe(2);
  });

  it("5. route with handler layer only is included", () => {
    const arch: ArchitectureAst = {
      nodes: [],
      routes: [route("Get", ["handler"])],
    };
    const result = generateHandlerStructs(arch);
    expect(result.length).toBe(1);
  });

  it("6. route with usecase layer only is included", () => {
    const arch: ArchitectureAst = {
      nodes: [],
      routes: [route("Get", ["usecase"])],
    };
    const result = generateHandlerStructs(arch);
    expect(result.length).toBe(1);
  });

  it("7. mixed: one included, one skipped", () => {
    const arch: ArchitectureAst = {
      nodes: [],
      routes: [route("Get", ["handler", "usecase"]), route("Delete", ["handler"])],
    };
    const result = generateHandlerStructs(arch);
    expect(result.length).toBe(1);
  });

  it("8. with featuresDir", () => {
    const arch: ArchitectureAst = {
      nodes: [],
      routes: [route("Get", ["handler", "usecase"])],
    };
    const result = generateHandlerStructs(arch, "v1");
    expect(result[0].file).toContain("v1");
  });
});
