import { describe, it, expect } from "vitest";
import type { RouteAst } from "../src/types/index.js";
import {
  generateUsecaseInterface,
  generateUsecaseScaffold,
} from "../src/generators/usecase.js";

// Import legacy versions for comparison
import {
  generateUsecaseInterfaceLegacy,
  generateUsecaseScaffoldLegacy,
} from "../src/generators/usecase.js";

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

function compareInterface(route: RouteAst, hasDomain?: boolean) {
  const old_ = generateUsecaseInterfaceLegacy(route, hasDomain);
  const new_ = generateUsecaseInterface(route, hasDomain);
  expect(new_).toBe(old_);
}

function compareScaffold(
  route: RouteAst,
  moduleName: string,
  hasRepository: boolean,
  serviceTypes: string[],
  hasDomain?: boolean,
) {
  const old_ = generateUsecaseScaffoldLegacy(
    route,
    moduleName,
    hasRepository,
    serviceTypes,
    hasDomain,
  );
  const new_ = generateUsecaseScaffold(
    route,
    moduleName,
    hasRepository,
    serviceTypes,
    hasDomain,
  );
  expect(new_.length).toBe(old_.length);
  for (let i = 0; i < old_.length; i++) {
    expect(new_[i].kind).toBe(old_[i].kind);
    expect(new_[i].symbolName).toBe(old_[i].symbolName);
    expect(new_[i].content).toBe(old_[i].content);
    expect(new_[i].expectsUserCode).toBe(old_[i].expectsUserCode);
    expect(new_[i].isStub).toBe(old_[i].isStub);
    if (new_[i].signature !== undefined || old_[i].signature !== undefined) {
      expect(new_[i].signature).toBe(old_[i].signature);
    }
    if (new_[i].receiver !== undefined || old_[i].receiver !== undefined) {
      expect(new_[i].receiver).toBe(old_[i].receiver);
    }
  }
}

describe("go-ast usecase interface generation", () => {
  it("1. without domain", () => {
    const route = mockRoute({});
    compareInterface(route);
  });

  it("2. with domain (Get verb — id param)", () => {
    const route = mockRoute({ handlerName: "GetUser" });
    compareInterface(route, true);
  });

  it("3. with domain and entity context", () => {
    const route = mockRoute({
      id: "adminGet",
      handlerName: "GetUser",
    });
    compareInterface(route, true);
  });

  it("4. without domain, List verb (no params)", () => {
    const route = mockRoute({
      handlerName: "ListUser",
      id: "list",
      query: undefined,
      body: undefined,
      path: "/users",
    });
    compareInterface(route);
  });

  it("5. with domain, List verb (no params)", () => {
    const route = mockRoute({
      handlerName: "ListUser",
      id: "list",
      query: undefined,
      body: undefined,
      path: "/users",
    });
    compareInterface(route, true);
  });

  it("6. with domain, Create verb", () => {
    const route = mockRoute({ handlerName: "CreateUser", id: "create" });
    compareInterface(route, true);
  });

  it("7. with domain, Update verb", () => {
    const route = mockRoute({ handlerName: "UpdateUser", id: "update" });
    compareInterface(route, true);
  });

  it("8. with domain, Delete verb", () => {
    const route = mockRoute({ handlerName: "DeleteUser", id: "delete" });
    compareInterface(route, true);
  });

  it("9. with domain, Set verb", () => {
    const route = mockRoute({ handlerName: "SetField", id: "set" });
    compareInterface(route, true);
  });

  it("10. with domain but no verb match (falls back to input RequestType)", () => {
    const route = mockRoute({ handlerName: "CustomOp", id: "custom" });
    compareInterface(route, true);
  });
});

describe("go-ast usecase scaffold generation", () => {
  it("1. no repository, no services", () => {
    const route = mockRoute({});
    compareScaffold(route, "user", false, []);
  });

  it("2. with repository only", () => {
    const route = mockRoute({});
    compareScaffold(route, "user", true, []);
  });

  it("3. with services only", () => {
    const route = mockRoute({});
    compareScaffold(route, "user", false, ["FooService", "BarService"]);
  });

  it("4. with repository and services", () => {
    const route = mockRoute({});
    compareScaffold(route, "user", true, ["FooService"]);
  });

  it("5. with domain + repository + Get verb", () => {
    const route = mockRoute({ handlerName: "GetUser" });
    compareScaffold(route, "user", true, [], true);
  });

  it("6. with domain + repository + Create verb", () => {
    const route = mockRoute({ handlerName: "CreateUser", id: "create" });
    compareScaffold(route, "user", true, [], true);
  });

  it("7. with domain + repository + List verb", () => {
    const route = mockRoute({
      handlerName: "ListUser",
      id: "list",
      query: undefined,
      body: undefined,
      path: "/users",
    });
    compareScaffold(route, "user", true, [], true);
  });

  it("8. with domain + repository + Delete verb", () => {
    const route = mockRoute({ handlerName: "DeleteUser", id: "delete" });
    compareScaffold(route, "user", true, [], true);
  });

  it("9. with domain + repository + Update verb", () => {
    const route = mockRoute({ handlerName: "UpdateUser", id: "update" });
    compareScaffold(route, "user", true, [], true);
  });

  it("10. with domain + repository + Set verb", () => {
    const route = mockRoute({ handlerName: "SetField", id: "set" });
    compareScaffold(route, "user", true, [], true);
  });

  it("11. with domain + no repo (falls back to input RequestType)", () => {
    const route = mockRoute({});
    compareScaffold(route, "user", false, [], true);
  });

  it("12. with domain + repo + services + Get verb", () => {
    const route = mockRoute({ handlerName: "GetUser" });
    compareScaffold(route, "user", true, ["FooService"], true);
  });
});
