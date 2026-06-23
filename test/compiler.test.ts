import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { compile, defineApp, defineModule, defineRoute, defineRouter } from "../src/index.js";

describe("compiler", () => {
  it("generates deterministic clean architecture patches", async () => {
    const route = defineRoute({
      id: "create",
      method: "POST",
      path: "/users",
      body: z.object({ name: z.string(), active: z.boolean().optional() }),
      response: z.object({ id: z.string() }),
      handler: "CreateUser",
    });
    const input = { name: "Ada" };

    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin", prefix: "/api" }),
      modules: [defineModule({ name: "user", routes: [route] })],
    });

    const first = await compile({ app, dryRun: true });
    const second = await compile({ app, dryRun: true });

    expect(input.name).toBe("Ada");
    expect(first.diagnostics.filter((diagnostic) => diagnostic.level === "error")).toEqual([]);
    expect(first.generation).toEqual(second.generation);
    expect(first.architecture?.routes[0]?.layers.map((layer) => layer.kind)).toEqual([
      "entity",
      "domain",
      "repository",
      "usecase",
      "handler",
    ]);
  });

  it("injects generated regions into existing files only", async () => {
    const cwd = join(tmpdir(), `backend-gen-${Date.now()}`);
    mkdirSync(join(cwd, "internal/user"), { recursive: true });
    mkdirSync(join(cwd, "internal/http"), { recursive: true });
    writeFileSync(
      join(cwd, "internal/user/entity.go"),
      [
        "package user",
        "",
        "// @gen:start user.create.entity",
        "// @gen:end user.create.entity",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(cwd, "internal/user/domain.go"),
      [
        "package user",
        "",
        "// @gen:start user.domain",
        "// @gen:end user.domain",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(cwd, "internal/user/repo.go"),
      ["package user", "", "// @gen:start user.repository", "// @gen:end user.repository", ""].join(
        "\n",
      ),
    );
    writeFileSync(
      join(cwd, "internal/user/usecase.go"),
      [
        "package user",
        "",
        "// @gen:start user.0usecase.imports",
        `import "context"`,
        "// @gen:end user.0usecase.imports",
        "// @gen:start user.create.usecase",
        "// @gen:end user.create.usecase",
        "// @gen:start user.create.usecase.impl",
        "// @gen:end user.create.usecase.impl",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(cwd, "internal/user/handler.go"),
      [
        "package user",
        "",
        "// @gen:start user.0handler.imports",
        `import (`,
        `\t"net/http"`,
        ``,
        `\t"github.com/gin-gonic/gin"`,
        `)`,
        "// @gen:end user.0handler.imports",
        "// @gen:start user.0handler.struct",
        "// @gen:end user.0handler.struct",
        "",
        "func Manual() {}",
        "",
        "// @gen:start user.create.handler",
        "// @gen:end user.create.handler",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(cwd, "internal/http/routes.go"),
      [
        "package http",
        "",
        "// @gen:start routes.register",
        "func RegisterRoutes(api *gin.RouterGroup) {",
        "",
        "}",
        "// @gen:end routes.register",
        "",
      ].join("\n"),
    );

    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin", prefix: "/api" }),
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              id: "create",
              method: "POST",
              path: "/users",
              body: z.object({ name: z.string() }),
              handler: "CreateUser",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, cwd });
    const handler = readFileSync(join(cwd, "internal/user/handler.go"), "utf8");

    expect(result.diagnostics.filter((diagnostic) => diagnostic.level === "error")).toEqual([]);
    expect(result.changedFiles.sort()).toEqual([
      "internal/http/routes.go",
      "internal/http/user_routes.go",
      "internal/user/domain.go",
      "internal/user/entity.go",
      "internal/user/handler.go",
      "internal/user/repo.go",
      "internal/user/usecase.go",
    ]);
    expect(handler).toContain("func Manual() {}");
    expect(handler).toContain("type UserHandler struct");
    expect(handler).toContain("CreateUserUsecase CreateUserUsecase");
    expect(handler).toContain("func (h *UserHandler) CreateUser(c *gin.Context)");
  });

  it("uses ShouldBindQuery for GET routes with query schema", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              id: "list",
              method: "GET",
              path: "/users",
              query: z.object({ page: z.number().optional(), limit: z.number().optional() }),
              response: z.object({ items: z.array(z.object({ id: z.string() })) }),
              handler: "ListUsers",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const handlerRegion = result.generation.files
      .flatMap((f) => f.regions)
      .find((r) => r.id === "user.list.handler");
    expect(handlerRegion).toBeDefined();
    expect(handlerRegion!.content).toContain("ShouldBindQuery");
    expect(handlerRegion!.content).not.toContain("ShouldBindJSON");
  });

  it("uses ShouldBindQuery for DELETE routes with query schema", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              id: "remove",
              method: "DELETE",
              path: "/users/:id",
              query: z.object({ reason: z.string().optional() }),
              handler: "RemoveUser",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const handlerRegion = result.generation.files
      .flatMap((f) => f.regions)
      .find((r) => r.id === "user.remove.handler");
    expect(handlerRegion).toBeDefined();
    expect(handlerRegion!.content).toContain("ShouldBindQuery");
    expect(handlerRegion!.content).not.toContain("ShouldBindJSON");
  });

  it("uses ShouldBindJSON for POST routes with body schema", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              id: "create",
              method: "POST",
              path: "/users",
              body: z.object({ name: z.string() }),
              response: z.object({ id: z.string() }),
              handler: "CreateUser",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const handlerRegion = result.generation.files
      .flatMap((f) => f.regions)
      .find((r) => r.id === "user.create.handler");
    expect(handlerRegion).toBeDefined();
    expect(handlerRegion!.content).toContain("ShouldBindJSON");
    expect(handlerRegion!.content).not.toContain("ShouldBindQuery");
  });

  it("generates form tags on struct fields for query binding", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              id: "list",
              method: "GET",
              path: "/users",
              query: z.object({ page: z.number(), q: z.string().optional() }),
              handler: "ListUsers",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const typesRegion = result.generation.files
      .flatMap((f) => f.regions)
      .find((r) => r.id === "user.list.entity");
    expect(typesRegion).toBeDefined();
    expect(typesRegion!.content).toContain(`form:"page"`);
    expect(typesRegion!.content).toContain(`form:"q"`);
    expect(typesRegion!.content).toContain(`json:"page"`);
    expect(typesRegion!.content).toContain(`json:"q,omitempty"`);
    expect(typesRegion!.content).toContain(`validate:"required"`);
    expect(
      typesRegion!.content
        .split("\n")
        .find((l) => l.includes("Q "))
        ?.includes(`validate:"required"`),
    ).toBe(false);
  });

  it("generates validate tags for string min/max", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              id: "create",
              method: "POST",
              path: "/users",
              body: z.object({ name: z.string().min(3).max(100) }),
              handler: "CreateUser",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const typesRegion = result.generation.files
      .flatMap((f) => f.regions)
      .find((r) => r.id === "user.create.entity");
    expect(typesRegion).toBeDefined();
    expect(typesRegion!.content).toContain(`validate:"required,min=3,max=100"`);
  });

  it("generates validate tags for string email", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              id: "create",
              method: "POST",
              path: "/users",
              body: z.object({ email: z.string().email() }),
              handler: "CreateUser",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const typesRegion = result.generation.files
      .flatMap((f) => f.regions)
      .find((r) => r.id === "user.create.entity");
    expect(typesRegion).toBeDefined();
    expect(typesRegion!.content).toContain(`validate:"required,email"`);
  });

  it("generates validate tags for number positive", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              id: "create",
              method: "POST",
              path: "/users",
              body: z.object({ age: z.number().positive() }),
              handler: "CreateUser",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const typesRegion = result.generation.files
      .flatMap((f) => f.regions)
      .find((r) => r.id === "user.create.entity");
    expect(typesRegion).toBeDefined();
    expect(typesRegion!.content).toContain(`validate:"required,gt=0"`);
  });

  it("generates validate tags for enum oneof", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              id: "create",
              method: "POST",
              path: "/users",
              body: z.object({ role: z.enum(["admin", "user", "moderator"]) }),
              handler: "CreateUser",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const typesRegion = result.generation.files
      .flatMap((f) => f.regions)
      .find((r) => r.id === "user.create.entity");
    expect(typesRegion).toBeDefined();
    expect(typesRegion!.content).toContain(`validate:"required,oneof=admin user moderator"`);
  });

  it("generates validate tags for optional fields with validators", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              id: "create",
              method: "POST",
              path: "/users",
              body: z.object({ email: z.string().email().optional() }),
              handler: "CreateUser",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const typesRegion = result.generation.files
      .flatMap((f) => f.regions)
      .find((r) => r.id === "user.create.entity");
    expect(typesRegion).toBeDefined();
    expect(typesRegion!.content).toContain(`validate:"email"`);
    expect(typesRegion!.content).not.toContain(`validate:"required,email"`);
  });

  it("response structs have no validate tags", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              id: "get",
              method: "GET",
              path: "/users/:id",
              response: z.object({ id: z.string(), name: z.string().min(3) }),
              handler: "GetUser",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const typesRegion = result.generation.files
      .flatMap((f) => f.regions)
      .find((r) => r.id === "user.get.entity");
    expect(typesRegion).toBeDefined();

    const responseBlock = typesRegion!.content.split("type GetUserResponse")[1] ?? "";
    expect(responseBlock).not.toContain(`validate`);
  });

  it("handles POST routes with both query and body schemas", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              id: "create",
              method: "POST",
              path: "/users",
              query: z.object({ source: z.string().optional() }),
              body: z.object({ name: z.string() }),
              response: z.object({ id: z.string() }),
              handler: "CreateUser",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const handlerRegion = result.generation.files
      .flatMap((f) => f.regions)
      .find((r) => r.id === "user.create.handler");
    expect(handlerRegion).toBeDefined();
    expect(handlerRegion!.content).toContain("ShouldBindQuery");
    expect(handlerRegion!.content).toContain("ShouldBindJSON");
    expect(handlerRegion!.content).toContain("var query ");
    expect(handlerRegion!.content).toContain("var requestBody ");

    const typesRegion = result.generation.files
      .flatMap((f) => f.regions)
      .find((r) => r.id === "user.create.entity");
    expect(typesRegion).toBeDefined();
    expect(typesRegion!.content).toContain("CreateUserQuery");
    expect(typesRegion!.content).toContain("CreateUserBody");
    expect(typesRegion!.content).toContain("CreateUserRequest");
  });

  it("filters partial generation by module and route", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({ id: "create", method: "POST", path: "/users", handler: "CreateUser" }),
            defineRoute({
              id: "delete",
              method: "DELETE",
              path: "/users/:id",
              handler: "DeleteUser",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, module: "user", route: "delete", dryRun: true });
    const regionIds = result.generation.files.flatMap((file) =>
      file.regions.map((region) => region.id),
    );

    expect(regionIds.every((id) => !id.includes("user.create"))).toBe(true);
  });

  describe("repository method inference", () => {
    it("infers CRUD methods for standard route patterns", async () => {
      const app = defineApp({
        architecture: "clean",
        router: defineRouter({ adapter: "gin" }),
        modules: [
          defineModule({
            name: "staff",
            routes: [
              defineRoute({ id: "list", method: "GET", path: "", handler: "ListStaff" }),
              defineRoute({ id: "get", method: "GET", path: "/:id", handler: "GetStaff" }),
              defineRoute({ id: "new", method: "POST", path: "/new", handler: "NewStaff" }),
              defineRoute({
                id: "update",
                method: "POST",
                path: "/:id/update",
                handler: "UpdateStaff",
              }),
              defineRoute({
                id: "delete",
                method: "POST",
                path: "/:id/delete",
                handler: "DeleteStaff",
              }),
            ],
          }),
        ],
      });

      const result = await compile({ app, dryRun: true });
      expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

      const repoRegion = result.generation.files
        .flatMap((f) => f.regions)
        .find((r) => r.id === "staff.repository");
      expect(repoRegion).toBeDefined();

      const content = repoRegion!.content;
      expect(content).toContain("type StaffRepository interface");
      expect(content).toContain("FindAll(ctx context.Context) ([]Staff, error)");
      expect(content).toContain("FindByID(ctx context.Context, id StaffID) (Staff, error)");
      expect(content).toContain("Create(ctx context.Context, entity Staff) (Staff, error)");
      expect(content).toContain(
        "Update(ctx context.Context, id StaffID, entity Staff) (Staff, error)",
      );
      expect(content).toContain("Delete(ctx context.Context, id StaffID) error");
    });

    it("infers sub-entity methods for context-prefixed route ids", async () => {
      const app = defineApp({
        architecture: "clean",
        router: defineRouter({ adapter: "gin" }),
        modules: [
          defineModule({
            name: "bus",
            routes: [
              defineRoute({ id: "list", method: "GET", path: "", handler: "ListBus" }),
              defineRoute({ id: "timeList", method: "GET", path: "/time", handler: "ListBusTime" }),
              defineRoute({
                id: "timeCreate",
                method: "POST",
                path: "/time",
                handler: "CreateBusTime",
              }),
              defineRoute({
                id: "timeUpdate",
                method: "POST",
                path: "/time/:id/update",
                handler: "UpdateBusTime",
              }),
              defineRoute({
                id: "timeDelete",
                method: "POST",
                path: "/time/:id/delete",
                handler: "DeleteBusTime",
              }),
            ],
          }),
        ],
      });

      const result = await compile({ app, dryRun: true });
      expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

      const repoRegion = result.generation.files
        .flatMap((f) => f.regions)
        .find((r) => r.id === "bus.repository");
      expect(repoRegion).toBeDefined();

      const content = repoRegion!.content;
      expect(content).toContain("type BusRepository interface");
      expect(content).toContain("FindAll(ctx context.Context) ([]Bus, error)");
      expect(content).toContain("FindAllTime(ctx context.Context) ([]BusTime, error)");
      expect(content).toContain("CreateTime(ctx context.Context, entity BusTime) (BusTime, error)");
      expect(content).toContain(
        "UpdateTime(ctx context.Context, id BusID, entity BusTime) (BusTime, error)",
      );
      expect(content).toContain("DeleteTime(ctx context.Context, id BusID) error");
    });

    it("deduplicates identical methods across routes", async () => {
      const app = defineApp({
        architecture: "clean",
        router: defineRouter({ adapter: "gin" }),
        modules: [
          defineModule({
            name: "item",
            routes: [
              defineRoute({ id: "list", method: "GET", path: "", handler: "ListItem" }),
              defineRoute({ id: "listAll", method: "GET", path: "/all", handler: "ListItem" }),
            ],
          }),
        ],
      });

      const result = await compile({ app, dryRun: true });
      expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

      const repoRegion = result.generation.files
        .flatMap((f) => f.regions)
        .find((r) => r.id === "item.repository");
      expect(repoRegion).toBeDefined();

      const content = repoRegion!.content;
      const occurrences = content.split("FindAll").length - 1;
      expect(occurrences).toBe(1);
    });

    it("skips non-CRUD handlers without generating a method", async () => {
      const app = defineApp({
        architecture: "clean",
        router: defineRouter({ adapter: "gin" }),
        modules: [
          defineModule({
            name: "auth",
            routes: [
              defineRoute({ id: "login", method: "POST", path: "/login", handler: "Login" }),
              defineRoute({ id: "logout", method: "POST", path: "/logout", handler: "Logout" }),
            ],
          }),
        ],
      });

      const result = await compile({ app, dryRun: true });
      expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

      const repoRegion = result.generation.files
        .flatMap((f) => f.regions)
        .find((r) => r.id === "auth.repository");
      expect(repoRegion).toBeDefined();

      const content = repoRegion!.content;
      expect(content).toContain(
        "// Add developer-owned persistence methods outside generated regions as needed.",
      );
      expect(content).not.toContain("Login");
      expect(content).not.toContain("Logout");
    });
  });

  it("generates usecase scaffold implementations by default in same usecase file", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              id: "create",
              method: "POST",
              path: "/users",
              body: z.object({ name: z.string() }),
              response: z.object({ id: z.string() }),
              handler: "CreateUser",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const usecaseFile = result.generation.files.find((f) => f.path.endsWith("user/usecase.go"));
    expect(usecaseFile).toBeDefined();

    const scaffoldRegion = usecaseFile!.regions.find((r) => r.id.endsWith("usecase.impl"));
    expect(scaffoldRegion).toBeDefined();

    const content = scaffoldRegion!.content;
    expect(content).toContain("type createUserUsecaseImpl struct");
    expect(content).toContain("repo UserRepository");
    expect(content).toContain("func NewCreateUserUsecase");
    expect(content).toContain('panic("UserRepository must not be nil")');
    expect(content).toContain("func (uc *createUserUsecaseImpl) Execute");
    expect(content).toContain("// TODO: implement CreateUserUsecase");
    expect(content).toContain("return CreateUserResponse{}, nil");
  });

  it("generates usecase scaffold with repo dependency in clean architecture", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      modules: [
        defineModule({
          name: "auth",
          routes: [
            defineRoute({
              id: "login",
              method: "POST",
              path: "/login",
              handler: "Login",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const usecaseFile = result.generation.files.find((f) => f.path.endsWith("auth/usecase.go"));
    expect(usecaseFile).toBeDefined();

    const scaffoldRegion = usecaseFile!.regions.find((r) => r.id.endsWith("usecase.impl"));
    expect(scaffoldRegion).toBeDefined();

    const content = scaffoldRegion!.content;
    expect(content).toContain("type loginUsecaseImpl struct");
    expect(content).toContain("repo AuthRepository");
    expect(content).toContain('panic("AuthRepository must not be nil")');
    expect(content).toContain("func NewLoginUsecase");
    expect(content).toContain("func (uc *loginUsecaseImpl) Execute");
    expect(content).toContain("// TODO: implement LoginUsecase");
  });

  it("generates usecase scaffold without repo dependency in minimal architecture", async () => {
    const app = defineApp({
      architecture: "minimal",
      router: defineRouter({ adapter: "gin" }),
      modules: [
        defineModule({
          name: "auth",
          routes: [
            defineRoute({
              id: "login",
              method: "POST",
              path: "/login",
              handler: "Login",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const usecaseFile = result.generation.files.find((f) => f.path.endsWith("auth/usecase.go"));
    expect(usecaseFile).toBeDefined();

    const scaffoldRegion = usecaseFile!.regions.find((r) => r.id.endsWith("usecase.impl"));
    expect(scaffoldRegion).toBeDefined();

    const content = scaffoldRegion!.content;
    expect(content).toContain("type loginUsecaseImpl struct{}");
    expect(content).not.toContain("Repository");
    expect(content).toContain("func NewLoginUsecase()");
    expect(content).toContain("func (uc *loginUsecaseImpl) Execute");
    expect(content).toContain("// TODO: implement LoginUsecase");
  });

  it("does not generate scaffold when scaffold is disabled", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      options: {
        usecaseOrganization: {
          strategy: "merged",
          scaffold: false,
        },
      },
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              id: "create",
              method: "POST",
              path: "/users",
              body: z.object({ name: z.string() }),
              handler: "CreateUser",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const usecaseFile = result.generation.files.find((f) => f.path.endsWith("user/usecase.go"));
    expect(usecaseFile).toBeDefined();

    const scaffoldRegions = usecaseFile!.regions.filter((r) => r.id.endsWith("usecase.impl"));
    expect(scaffoldRegions.length).toBe(0);
  });
});
