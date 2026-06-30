import { describe, expect, it } from "vitest";
import {
  pascalCase,
  lowerIdent,
  snakeCase,
  featuresPath,
  routeTypeName,
  defaultFileForLayer,
  defaultRegionId,
  joinPath,
  resolveUsecaseOrg,
  resolveUsecaseGroupKey,
  extractPathParams,
  serviceFilePath,
  serviceTypeName,
  serviceImplName,
  serviceConstructorName,
  serviceRegionId,
  fileForUsecaseGroup,
  regionIdForUsecase,
  fileForModuleRoutes,
  regionIdForUsecaseImports,
  regionIdForUsecaseImpl,
} from "../src/utils/naming.js";
import type { RouteAst, UsecaseOrganization } from "../src/types/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockRoute(overrides: Partial<RouteAst> = {}): RouteAst {
  return {
    kind: "Route",
    id: "create",
    stableId: "create",
    annotations: {},
    pluginData: {},
    moduleName: "user",
    method: "POST",
    path: "/users",
    fullPath: "/api/users",
    handlerName: "CreateUser",
    resolvedArchitectures: [],
    resolvedAdapters: [],
    middleware: [],
    errors: [],
    metadata: {},
    ...overrides,
  } as RouteAst;
}

// ---------------------------------------------------------------------------
// pascalCase
// ---------------------------------------------------------------------------

describe("pascalCase", () => {
  it("converts a simple word", () => {
    expect(pascalCase("hello")).toBe("Hello");
  });

  it("converts snake_case to PascalCase", () => {
    expect(pascalCase("hello_world")).toBe("HelloWorld");
  });

  it("leaves already PascalCase text unchanged", () => {
    expect(pascalCase("HelloWorld")).toBe("HelloWorld");
  });

  it("returns empty string for empty input", () => {
    expect(pascalCase("")).toBe("");
  });

  it("handles mixed separators (hyphens and underscores)", () => {
    expect(pascalCase("hello-world_test")).toBe("HelloWorldTest");
  });

  it("handles single character", () => {
    expect(pascalCase("a")).toBe("A");
  });

  it("strips leading and trailing separators", () => {
    expect(pascalCase("_hello_")).toBe("Hello");
  });
});

// ---------------------------------------------------------------------------
// lowerIdent
// ---------------------------------------------------------------------------

describe("lowerIdent", () => {
  it("lowercases the first character of PascalCase", () => {
    expect(lowerIdent("HelloWorld")).toBe("helloWorld");
  });

  it("works on a single word", () => {
    expect(lowerIdent("Hello")).toBe("hello");
  });

  it("handles single character", () => {
    expect(lowerIdent("A")).toBe("a");
  });

  it("returns empty string for empty input", () => {
    expect(lowerIdent("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// snakeCase
// ---------------------------------------------------------------------------

describe("snakeCase", () => {
  it("converts PascalCase to snake_case", () => {
    expect(snakeCase("HelloWorld")).toBe("hello_world");
  });

  it("leaves already snake_case unchanged", () => {
    expect(snakeCase("hello_world")).toBe("hello_world");
  });

  it("converts camelCase to snake_case", () => {
    expect(snakeCase("helloWorld")).toBe("hello_world");
  });

  it("splits consecutive uppercase letters individually", () => {
    expect(snakeCase("HTTPServer")).toBe("h_t_t_p_server");
  });

  it("returns empty string for empty input", () => {
    expect(snakeCase("")).toBe("");
  });

  it("handles leading uppercase followed by lowercase", () => {
    expect(snakeCase("User")).toBe("user");
  });
});

// ---------------------------------------------------------------------------
// featuresPath
// ---------------------------------------------------------------------------

describe("featuresPath", () => {
  it("returns the path unchanged when featuresDir is undefined", () => {
    expect(featuresPath("internal/user/entity.go")).toBe("internal/user/entity.go");
  });

  it("returns the path unchanged when featuresDir is empty", () => {
    expect(featuresPath("internal/user/entity.go", "")).toBe("internal/user/entity.go");
  });

  it("prepends featuresDir after internal/", () => {
    expect(featuresPath("internal/user/entity.go", "features")).toBe(
      "internal/features/user/entity.go",
    );
  });

  it("handles a nested featuresDir", () => {
    expect(featuresPath("internal/user/entity.go", "sub/dir")).toBe(
      "internal/sub/dir/user/entity.go",
    );
  });

  it("does not modify paths that do not start with internal/", () => {
    expect(featuresPath("other/path.go", "features")).toBe("other/path.go");
  });

  it("only replaces internal/ at the start of the path", () => {
    expect(featuresPath("something/internal/foo.go", "features")).toBe("something/internal/foo.go");
  });
});

// ---------------------------------------------------------------------------
// routeTypeName
// ---------------------------------------------------------------------------

describe("routeTypeName", () => {
  it("combines id, moduleName and suffix", () => {
    const route = mockRoute({ id: "create", moduleName: "user" });
    expect(routeTypeName(route, "Request")).toBe("CreateUserRequest");
  });

  it("handles hyphenated route id", () => {
    const route = mockRoute({ id: "get-user", moduleName: "admin" });
    expect(routeTypeName(route, "Response")).toBe("GetUserAdminResponse");
  });
});

// ---------------------------------------------------------------------------
// defaultFileForLayer
// ---------------------------------------------------------------------------

describe("defaultFileForLayer", () => {
  const route = mockRoute({ moduleName: "user" });

  describe("without featuresDir", () => {
    it("returns entity file path", () => {
      expect(defaultFileForLayer(route, "entity")).toBe("internal/user/entity.go");
    });

    it("returns domain file path", () => {
      expect(defaultFileForLayer(route, "domain")).toBe("internal/user/domain.go");
    });

    it("returns handler file path", () => {
      expect(defaultFileForLayer(route, "handler")).toBe("internal/user/handler.go");
    });

    it("returns usecase file path via fileForUsecaseGroup", () => {
      expect(defaultFileForLayer(route, "usecase")).toBe("internal/user/usecase.go");
    });

    it("returns repository file path", () => {
      expect(defaultFileForLayer(route, "repository")).toBe("internal/user/repo.go");
    });

    it("returns route file path", () => {
      expect(defaultFileForLayer(route, "route")).toBe("internal/http/routes.go");
    });

    it("returns server file path", () => {
      expect(defaultFileForLayer(route, "server")).toBe("internal/http/routes.go");
    });

    it("falls back to moduleName/layer.go for unknown layers", () => {
      expect(defaultFileForLayer(route, "custom")).toBe("internal/user/custom.go");
    });
  });

  describe("with featuresDir", () => {
    it("nests entity file under featuresDir", () => {
      expect(defaultFileForLayer(route, "entity", "features")).toBe(
        "internal/features/user/entity.go",
      );
    });

    it("nests domain file under featuresDir", () => {
      expect(defaultFileForLayer(route, "domain", "features")).toBe(
        "internal/features/user/domain.go",
      );
    });

    it("nests handler file under featuresDir", () => {
      expect(defaultFileForLayer(route, "handler", "features")).toBe(
        "internal/features/user/handler.go",
      );
    });

    it("nests usecase file under featuresDir", () => {
      expect(defaultFileForLayer(route, "usecase", "features")).toBe(
        "internal/features/user/usecase.go",
      );
    });

    it("nests repository file under featuresDir", () => {
      expect(defaultFileForLayer(route, "repository", "features")).toBe(
        "internal/features/user/repo.go",
      );
    });

    it("nests route file under featuresDir", () => {
      expect(defaultFileForLayer(route, "route", "features")).toBe(
        "internal/features/http/routes.go",
      );
    });

    it("nests custom layer file under featuresDir", () => {
      expect(defaultFileForLayer(route, "custom", "features")).toBe(
        "internal/features/user/custom.go",
      );
    });
  });
});

// ---------------------------------------------------------------------------
// defaultRegionId
// ---------------------------------------------------------------------------

describe("defaultRegionId", () => {
  it("formats as moduleName.id.layer", () => {
    const route = mockRoute({ moduleName: "user", id: "create" });
    expect(defaultRegionId(route, "entity")).toBe("user.create.entity");
  });
});

// ---------------------------------------------------------------------------
// joinPath
// ---------------------------------------------------------------------------

describe("joinPath", () => {
  it("joins a prefix and path with a single slash", () => {
    expect(joinPath("/api", "users")).toBe("/api/users");
  });

  it("strips trailing slash from prefix", () => {
    expect(joinPath("/api/", "users")).toBe("/api/users");
  });

  it("strips leading slash from path", () => {
    expect(joinPath("/api", "/users")).toBe("/api/users");
  });

  it("returns just the prefix when path is empty", () => {
    expect(joinPath("/api", "")).toBe("/api");
  });

  it("returns empty string when both are empty", () => {
    expect(joinPath("", "")).toBe("");
  });

  it("handles empty prefix", () => {
    expect(joinPath("", "users")).toBe("/users");
  });
});

// ---------------------------------------------------------------------------
// resolveUsecaseOrg
// ---------------------------------------------------------------------------

describe("resolveUsecaseOrg", () => {
  const route = mockRoute();

  it("returns moduleOrg when provided", () => {
    const moduleOrg: UsecaseOrganization = { strategy: "single" };
    const appOrg: UsecaseOrganization = { strategy: "merged" };
    expect(resolveUsecaseOrg(route, moduleOrg, appOrg)).toBe(moduleOrg);
  });

  it("falls back to appOrg when moduleOrg is not provided", () => {
    const appOrg: UsecaseOrganization = { strategy: "merged" };
    expect(resolveUsecaseOrg(route, undefined, appOrg)).toEqual(appOrg);
  });

  it("returns default merged strategy when neither is provided", () => {
    const result = resolveUsecaseOrg(route, undefined, undefined);
    expect(result).toEqual({ strategy: "merged", scaffold: undefined });
  });

  it("returns moduleOrg with grouped strategy", () => {
    const moduleOrg: UsecaseOrganization = { strategy: "grouped", groupBy: "path" };
    expect(resolveUsecaseOrg(route, moduleOrg)).toMatchObject({ strategy: "grouped" });
  });
});

// ---------------------------------------------------------------------------
// resolveUsecaseGroupKey
// ---------------------------------------------------------------------------

describe("resolveUsecaseGroupKey", () => {
  it("returns route.usecaseGroup when set", () => {
    const route = mockRoute({ usecaseGroup: "my-group" });
    const org: UsecaseOrganization = { strategy: "merged" };
    expect(resolveUsecaseGroupKey(route, org)).toBe("my-group");
  });

  it("returns 'default' for merged strategy", () => {
    const route = mockRoute();
    const org: UsecaseOrganization = { strategy: "merged" };
    expect(resolveUsecaseGroupKey(route, org)).toBe("default");
  });

  it("returns route.id for single strategy", () => {
    const route = mockRoute({ id: "get-users" });
    const org: UsecaseOrganization = { strategy: "single" };
    expect(resolveUsecaseGroupKey(route, org)).toBe("get-users");
  });

  describe("grouped strategy with path groupBy", () => {
    it("returns the first path segment", () => {
      const route = mockRoute({ path: "/users" });
      const org: UsecaseOrganization = { strategy: "grouped", groupBy: "path" };
      expect(resolveUsecaseGroupKey(route, org)).toBe("users");
    });

    it("skips param segments", () => {
      const route = mockRoute({ path: "/:id/posts" });
      const org: UsecaseOrganization = { strategy: "grouped", groupBy: "path" };
      expect(resolveUsecaseGroupKey(route, org)).toBe("posts");
    });

    it("returns 'default' when all segments are params", () => {
      const route = mockRoute({ path: "/:id" });
      const org: UsecaseOrganization = { strategy: "grouped", groupBy: "path" };
      expect(resolveUsecaseGroupKey(route, org)).toBe("default");
    });

    it("returns 'default' for root path", () => {
      const route = mockRoute({ path: "/" });
      const org: UsecaseOrganization = { strategy: "grouped", groupBy: "path" };
      expect(resolveUsecaseGroupKey(route, org)).toBe("default");
    });

    it("respects metadata._group as base path", () => {
      const route = mockRoute({
        path: "/api/v1/users/create",
        metadata: { _group: "/api/v1" },
      });
      const org: UsecaseOrganization = { strategy: "grouped", groupBy: "path" };
      expect(resolveUsecaseGroupKey(route, org)).toBe("users");
    });
  });

  describe("grouped strategy with operation groupBy", () => {
    it("returns 'read' for GET", () => {
      const route = mockRoute({ method: "GET" });
      const org: UsecaseOrganization = { strategy: "grouped", groupBy: "operation" };
      expect(resolveUsecaseGroupKey(route, org)).toBe("read");
    });

    it("returns 'write' for POST", () => {
      const route = mockRoute({ method: "POST" });
      const org: UsecaseOrganization = { strategy: "grouped", groupBy: "operation" };
      expect(resolveUsecaseGroupKey(route, org)).toBe("write");
    });

    it("returns 'write' for PUT", () => {
      expect(
        resolveUsecaseGroupKey(mockRoute({ method: "PUT" }), {
          strategy: "grouped",
          groupBy: "operation",
        }),
      ).toBe("write");
    });

    it("returns 'write' for DELETE", () => {
      expect(
        resolveUsecaseGroupKey(mockRoute({ method: "DELETE" }), {
          strategy: "grouped",
          groupBy: "operation",
        }),
      ).toBe("write");
    });
  });

  describe("grouped strategy with handler groupBy", () => {
    it("returns the first word of handler name lowercased", () => {
      const route = mockRoute({ handlerName: "CreateUser" });
      const org: UsecaseOrganization = { strategy: "grouped", groupBy: "handler" };
      expect(resolveUsecaseGroupKey(route, org)).toBe("create");
    });

    it("returns 'default' for empty handler name", () => {
      const route = mockRoute({ handlerName: "" });
      const org: UsecaseOrganization = { strategy: "grouped", groupBy: "handler" };
      expect(resolveUsecaseGroupKey(route, org)).toBe("default");
    });
  });

  describe("grouped strategy with module groupBy", () => {
    it("returns the module name", () => {
      const route = mockRoute({ moduleName: "user" });
      const org: UsecaseOrganization = { strategy: "grouped", groupBy: "module" };
      expect(resolveUsecaseGroupKey(route, org)).toBe("user");
    });
  });

  describe("grouped strategy with function groupBy", () => {
    it("calls the function and returns its result", () => {
      const route = mockRoute();
      const org: UsecaseOrganization = {
        strategy: "grouped",
        groupBy: () => "custom-group",
      };
      expect(resolveUsecaseGroupKey(route, org)).toBe("custom-group");
    });

    it("falls back to 'default' when function returns empty string", () => {
      const route = mockRoute();
      const org: UsecaseOrganization = {
        strategy: "grouped",
        groupBy: () => "",
      };
      expect(resolveUsecaseGroupKey(route, org)).toBe("default");
    });
  });

  describe("grouped strategy with default groupBy", () => {
    it("defaults to path when groupBy is not specified", () => {
      const route = mockRoute({ path: "/users" });
      const org: UsecaseOrganization = { strategy: "grouped" };
      expect(resolveUsecaseGroupKey(route, org)).toBe("users");
    });
  });

  it("falls back to 'default' for unknown groupBy value", () => {
    const route = mockRoute();
    const org: UsecaseOrganization = {
      strategy: "grouped",
      groupBy: "unknown" as never,
    };
    expect(resolveUsecaseGroupKey(route, org)).toBe("default");
  });
});

// ---------------------------------------------------------------------------
// extractPathParams
// ---------------------------------------------------------------------------

describe("extractPathParams", () => {
  it("extracts a single path parameter", () => {
    expect(extractPathParams("/users/:id")).toEqual(["id"]);
  });

  it("extracts multiple path parameters", () => {
    expect(extractPathParams("/users/:id/posts/:postId")).toEqual(["id", "postId"]);
  });

  it("returns an empty array when there are no parameters", () => {
    expect(extractPathParams("/users/create")).toEqual([]);
  });

  it("ignores colons not followed by a valid identifier", () => {
    expect(extractPathParams("/users/:123")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Service helpers
// ---------------------------------------------------------------------------

describe("serviceFilePath", () => {
  it("returns the correct file path", () => {
    expect(serviceFilePath("user")).toBe("internal/service/user.go");
  });

  it("snake_cases the name", () => {
    expect(serviceFilePath("UserAuth")).toBe("internal/service/user_auth.go");
  });
});

describe("serviceTypeName", () => {
  it("appends Service suffix", () => {
    expect(serviceTypeName("user")).toBe("UserService");
  });
});

describe("serviceImplName", () => {
  it("lower idents and appends Impl suffix", () => {
    expect(serviceImplName("user")).toBe("userServiceImpl");
  });
});

describe("serviceConstructorName", () => {
  it("prepends New and appends Service", () => {
    expect(serviceConstructorName("user")).toBe("NewUserService");
  });
});

describe("serviceRegionId", () => {
  it("formats as service.name", () => {
    expect(serviceRegionId("user")).toBe("service.user");
  });
});

// ---------------------------------------------------------------------------
// fileForUsecaseGroup
// ---------------------------------------------------------------------------

describe("fileForUsecaseGroup", () => {
  describe("without featuresDir", () => {
    it("returns usecase.go for default group key", () => {
      expect(fileForUsecaseGroup("user", "default")).toBe("internal/user/usecase.go");
    });

    it("returns usecase.go when groupKey matches moduleName", () => {
      expect(fileForUsecaseGroup("user", "user")).toBe("internal/user/usecase.go");
    });

    it("returns groupKey_usecase.go for other group keys", () => {
      expect(fileForUsecaseGroup("user", "admin")).toBe("internal/user/admin_usecase.go");
    });

    it("snake_cases the group key in the filename", () => {
      expect(fileForUsecaseGroup("user", "AdminPanel")).toBe(
        "internal/user/admin_panel_usecase.go",
      );
    });
  });

  describe("with featuresDir", () => {
    it("nests default group file under featuresDir", () => {
      expect(fileForUsecaseGroup("user", "default", "features")).toBe(
        "internal/features/user/usecase.go",
      );
    });

    it("nests group file under featuresDir", () => {
      expect(fileForUsecaseGroup("user", "admin", "features")).toBe(
        "internal/features/user/admin_usecase.go",
      );
    });
  });
});

// ---------------------------------------------------------------------------
// regionIdForUsecase
// ---------------------------------------------------------------------------

describe("regionIdForUsecase", () => {
  it("returns default region id when groupKey is default", () => {
    const route = mockRoute({ moduleName: "user", id: "create" });
    expect(regionIdForUsecase(route, "default")).toBe("user.create.usecase");
  });

  it("includes groupKey when groupKey is not default", () => {
    const route = mockRoute({ moduleName: "user", id: "create" });
    expect(regionIdForUsecase(route, "admin")).toBe("user.admin.create.usecase");
  });
});

// ---------------------------------------------------------------------------
// fileForModuleRoutes
// ---------------------------------------------------------------------------

describe("fileForModuleRoutes", () => {
  it("returns the correct file path", () => {
    expect(fileForModuleRoutes("user")).toBe("internal/http/user_routes.go");
  });
});

// ---------------------------------------------------------------------------
// regionIdForUsecaseImports
// ---------------------------------------------------------------------------

describe("regionIdForUsecaseImports", () => {
  it("formats with 0 prefix when groupKey is default", () => {
    expect(regionIdForUsecaseImports("user", "default")).toBe("user.0usecase.imports");
  });

  it("includes groupKey when not default", () => {
    expect(regionIdForUsecaseImports("user", "admin")).toBe("user.admin.0usecase.imports");
  });
});

// ---------------------------------------------------------------------------
// regionIdForUsecaseImpl
// ---------------------------------------------------------------------------

describe("regionIdForUsecaseImpl", () => {
  it("formats with id when groupKey is default", () => {
    const route = mockRoute({ moduleName: "user", id: "create" });
    expect(regionIdForUsecaseImpl(route, "default")).toBe("user.create.usecase.impl");
  });

  it("includes groupKey when not default", () => {
    const route = mockRoute({ moduleName: "user", id: "create" });
    expect(regionIdForUsecaseImpl(route, "admin")).toBe("user.admin.create.usecase.impl");
  });
});
