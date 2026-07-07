import { describe, it, expect } from "vitest";
import type { ArchitectureAst, RouteExpansionAst } from "../src/types/index.js";
import { generateHandlerStructsLegacy } from "../src/generators/handler.js";
import { generateHandlerStructs } from "../src/generators/handler-goast.js";

function compare(architecture: ArchitectureAst, featuresDir?: string) {
  const old_ = generateHandlerStructsLegacy(architecture, featuresDir);
  const new_ = generateHandlerStructs(architecture, featuresDir);
  expect(new_.length).toBe(old_.length);
  for (let i = 0; i < old_.length; i++) {
    expect(new_[i].file).toBe(old_[i].file);
    expect(new_[i].regionId).toBe(old_[i].regionId);
    expect(new_[i].content).toBe(old_[i].content);
  }
}

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
    compare(arch);
  });

  it("2. single module, single route", () => {
    const arch: ArchitectureAst = { nodes: [], routes: [route("Get", ["handler", "usecase"])] };
    compare(arch);
  });

  it("3. single module, two routes", () => {
    const arch: ArchitectureAst = {
      nodes: [],
      routes: [
        route("Get", ["handler", "usecase"]),
        route("Create", ["handler", "usecase"]),
      ],
    };
    compare(arch);
  });

  it("4. two modules, one route each", () => {
    const arch: ArchitectureAst = {
      nodes: [],
      routes: [
        routeModule("users", "Get", ["handler", "usecase"]),
        routeModule("orders", "List", ["handler", "usecase"]),
      ],
    };
    compare(arch);
  });

  it("5. route with handler but no usecase layer is skipped", () => {
    const arch: ArchitectureAst = {
      nodes: [],
      routes: [
        route("Get", ["handler"]),
      ],
    };
    compare(arch);
  });

  it("6. route with usecase layer only is included", () => {
    const arch: ArchitectureAst = {
      nodes: [],
      routes: [
        route("Get", ["usecase"]),
      ],
    };
    compare(arch);
  });

  it("7. mixed: one included, one skipped", () => {
    const arch: ArchitectureAst = {
      nodes: [],
      routes: [
        route("Get", ["handler", "usecase"]),
        route("Delete", ["handler"]),
      ],
    };
    compare(arch);
  });

  it("8. with featuresDir", () => {
    const arch: ArchitectureAst = {
      nodes: [],
      routes: [route("Get", ["handler", "usecase"])],
    };
    compare(arch, "v1");
  });
});
