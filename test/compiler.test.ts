import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  compile,
  createSerializedRunner,
  defineApp,
  defineModule,
  defineRoute,
  defineRouter,
  defineService,
  defineServiceExtension,
  defineResponseFormat,
  mergeEntityIntoWrapper,
  hasEntityPlaceholder,
  isEntityPlaceholder,
  z,
} from "../src/index.js";

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
      ["package user", "", "// @gen:start user.domain", "// @gen:end user.domain", ""].join("\n"),
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
      "internal/httperr/errors.go",
      "internal/httperr/resolve.go",
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

  it("does not generate pointer-to-array types for optional/nullable arrays", async () => {
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
              body: z.object({
                tags: z.array(z.string()).optional(),
                scores: z.nullable(z.array(z.number())),
                codes: z.optional(z.nullable(z.array(z.string()))),
                note: z.string().optional(),
              }),
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

    const content = typesRegion!.content;

    // Array fields should NOT be pointers
    expect(content).toMatch(/Tags\s+\[\]string/);
    expect(content).toMatch(/Scores\s+\[\]float64/);
    expect(content).toMatch(/Codes\s+\[\]string/);

    // Optional non-array fields should still be pointers
    expect(content).toMatch(/Note\s+\*string/);

    // Confirm no pointer-to-array patterns exist
    expect(content).not.toMatch(/\*\[\]/);
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
      expect(content).not.toContain("import (");
      expect(content).not.toContain("gorm.io/gorm");
      expect(content).not.toContain("staffRepositoryImpl");
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
      expect(content).not.toContain("busRepositoryImpl");
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
      expect(content).toContain("type ItemRepository interface");
      expect(content).not.toContain("itemRepositoryImpl");
      const interfaceMatch = content.match(/interface \{[\s\S]*?\n\}/);
      expect(interfaceMatch).toBeDefined();
      const findAllInInterface = interfaceMatch![0].match(/FindAll/g);
      expect(findAllInInterface).toEqual(["FindAll"]);
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
      expect(content).toContain("type AuthRepository interface");
      expect(content).toContain(
        "// Add developer-owned persistence methods outside generated regions as needed.",
      );
      expect(content).not.toContain("Login");
      expect(content).not.toContain("Logout");
      expect(content).not.toContain("authRepositoryImpl");
    });
  });

  describe("gorm repository integration", () => {
    it("wires repo constructor via dbProvider service accessor and generates GORM impl", async () => {
      const gorm = defineServiceExtension({
        name: "gorm",
        service: {
          provides: "database",
          optionsSchema: z.object({
            driver: z.enum(["mysql", "postgres", "sqlite"]),
          }),
          dbAccessor: "DB",
          dbType: "*gorm.DB",
          dbTypePkg: "gorm.io/gorm",
        },
      });

      const app = defineApp({
        architecture: "clean",
        router: defineRouter({ adapter: "gin" }),
        extensions: [gorm],
        services: {
          mygorm: gorm({ driver: "mysql", close: true }),
          db: defineService({ close: true }),
        },
        modules: [
          defineModule({
            name: "ticket",
            services: ["db", "mygorm"],
            routes: [
              defineRoute({ id: "list", method: "GET", path: "", handler: "ListTicket" }),
              defineRoute({ id: "get", method: "GET", path: "/:id", handler: "GetTicket" }),
              defineRoute({
                id: "create",
                method: "POST",
                path: "/create",
                handler: "CreateTicket",
              }),
            ],
          }),
        ],
      });

      const result = await compile({ app, dryRun: true });
      expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

      const routeFile = result.generation.files.find((f) => f.path.endsWith("ticket_routes.go"));
      expect(routeFile).toBeDefined();

      const routeRegion = routeFile!.regions.find((r) => r.id.startsWith("routes.register"));
      expect(routeRegion).toBeDefined();

      const content = routeRegion!.content;
      expect(content).toContain(
        "func registerTicketRoutes(api *gin.RouterGroup, mygormSvc service.MygormService, dbSvc service.DbService)",
      );
      expect(content).not.toContain("nil /*repo TODO*/");
      expect(content).toContain("ticket.NewTicketRepository(mygormSvc.DB())");

      const repoFile = result.generation.files.find((f) => f.path.endsWith("ticket/repo.go"));
      expect(repoFile).toBeDefined();
      const importsRegion = repoFile!.regions.find((r) => r.id === "ticket.repository.0imports");
      expect(importsRegion).toBeDefined();
      expect(importsRegion!.content).toContain("import");
      expect(importsRegion!.content).toContain('"context"');
      expect(importsRegion!.content).toContain('"gorm.io/gorm"');
      const structRegion = repoFile!.regions.find((r) => r.id === "ticket.repository.1struct");
      expect(structRegion).toBeDefined();
      expect(structRegion!.content).toContain("type ticketRepositoryImpl struct");
      const ctorRegion = repoFile!.regions.find((r) => r.id === "ticket.repository.2ctor");
      expect(ctorRegion).toBeDefined();
      expect(ctorRegion!.signature).toBe(
        "func NewTicketRepository(db *gorm.DB) *ticketRepositoryImpl",
      );

      const svcFile = result.generation.files.find((f) => f.path.endsWith("service/mygorm.go"));
      expect(svcFile).toBeDefined();
      const importRegion = svcFile!.regions.find((r) => r.id === "service.mygorm.0imports");
      expect(importRegion).toBeDefined();
      expect(importRegion!.content).toContain('import "gorm.io/gorm"');
      const ifaceRegion = svcFile!.regions.find((r) => r.id === "service.mygorm");
      expect(ifaceRegion).toBeDefined();
      expect(ifaceRegion!.content).toContain("DB() *gorm.DB");
      const dbMethodRegion = svcFile!.regions.find((r) => r.id === "service.mygorm.3DB");
      expect(dbMethodRegion).toBeDefined();
      expect(dbMethodRegion!.content).toContain("// TODO: return initialized");
    });

    it("keeps nil /*repo TODO*/ when module has no DB provider", async () => {
      const app = defineApp({
        architecture: "clean",
        router: defineRouter({ adapter: "gin" }),
        services: { db: defineService({ close: true }) },
        modules: [
          defineModule({
            name: "ticket",
            services: ["db"],
            routes: [defineRoute({ id: "list", method: "GET", path: "", handler: "ListTicket" })],
          }),
        ],
      });

      const result = await compile({ app, dryRun: true });
      expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

      const routeFile = result.generation.files.find((f) => f.path.endsWith("ticket_routes.go"));
      expect(routeFile).toBeDefined();
      const routeRegion = routeFile!.regions.find((r) => r.id.startsWith("routes.register"));
      expect(routeRegion).toBeDefined();
      expect(routeRegion!.content).toContain("nil /*repo TODO*/");

      const repoFile = result.generation.files.find((f) => f.path.endsWith("ticket/repo.go"));
      expect(repoFile).toBeDefined();
      const repoContent = repoFile!.regions.find((r) => r.id === "ticket.repository")!.content;
      expect(repoContent).not.toContain("ticketRepositoryImpl");
    });
  });

  it("generates usecase scaffold implementations by default in same usecase file", async () => {
    const gorm = defineServiceExtension({
      name: "gorm",
      service: {
        provides: "database",
        optionsSchema: z.object({ driver: z.enum(["mysql", "postgres", "sqlite"]) }),
        dbAccessor: "DB",
        dbType: "*gorm.DB",
        dbTypePkg: "gorm.io/gorm",
      },
    });

    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      extensions: [gorm],
      services: { mygorm: gorm({ driver: "sqlite", close: true }) },
      modules: [
        defineModule({
          name: "user",
          services: ["mygorm"],
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

    const structRegion = usecaseFile!.regions.find(
      (r) =>
        r.id.endsWith(".usecase.impl") && !r.id.includes(".ctor") && !r.id.includes(".execute"),
    );
    const ctorRegion = usecaseFile!.regions.find((r) => r.id.endsWith(".usecase.impl.ctor"));
    const execRegion = usecaseFile!.regions.find((r) => r.id.endsWith(".usecase.impl.execute"));
    expect(structRegion).toBeDefined();
    expect(ctorRegion).toBeDefined();
    expect(execRegion).toBeDefined();

    expect(structRegion!.content).toContain("type createUserUsecaseImpl struct");
    expect(structRegion!.content).toContain("repo UserRepository");
    expect(ctorRegion!.signature).toBe(
      "func NewCreateUserUsecase(repo UserRepository) *createUserUsecaseImpl",
    );
    expect(execRegion!.content).toContain("created, err := uc.repo.Create(ctx, entity)");
    expect(execRegion!.content).toContain("return resp, nil");
  });

  it("generates usecase scaffold with repo dependency in clean architecture", async () => {
    const gorm = defineServiceExtension({
      name: "gorm",
      service: {
        provides: "database",
        optionsSchema: z.object({ driver: z.enum(["mysql", "postgres", "sqlite"]) }),
        dbAccessor: "DB",
        dbType: "*gorm.DB",
        dbTypePkg: "gorm.io/gorm",
      },
    });

    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      extensions: [gorm],
      services: { mygorm: gorm({ driver: "sqlite", close: true }) },
      modules: [
        defineModule({
          name: "auth",
          services: ["mygorm"],
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

    const structRegion = usecaseFile!.regions.find(
      (r) =>
        r.id.endsWith(".usecase.impl") && !r.id.includes(".ctor") && !r.id.includes(".execute"),
    );
    const ctorRegion = usecaseFile!.regions.find((r) => r.id.endsWith(".usecase.impl.ctor"));
    const execRegion = usecaseFile!.regions.find((r) => r.id.endsWith(".usecase.impl.execute"));
    expect(structRegion).toBeDefined();
    expect(ctorRegion).toBeDefined();
    expect(execRegion).toBeDefined();

    expect(structRegion!.content).toContain("type loginUsecaseImpl struct");
    expect(structRegion!.content).toContain("repo AuthRepository");
    expect(ctorRegion!.signature).toBe(
      "func NewLoginUsecase(repo AuthRepository) *loginUsecaseImpl",
    );
    expect(execRegion!.content).toContain("// TODO: implement LoginUsecase");
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

    const structRegion = usecaseFile!.regions.find(
      (r) =>
        r.id.endsWith(".usecase.impl") && !r.id.includes(".ctor") && !r.id.includes(".execute"),
    );
    const ctorRegion = usecaseFile!.regions.find((r) => r.id.endsWith(".usecase.impl.ctor"));
    const execRegion = usecaseFile!.regions.find((r) => r.id.endsWith(".usecase.impl.execute"));
    expect(structRegion).toBeDefined();
    expect(ctorRegion).toBeDefined();
    expect(execRegion).toBeDefined();

    expect(structRegion!.content).toContain("type loginUsecaseImpl struct");
    expect(structRegion!.content).not.toContain("Repository");
    expect(ctorRegion!.signature).toBe("func NewLoginUsecase() *loginUsecaseImpl");
    expect(execRegion!.content).toContain("// TODO: implement LoginUsecase");
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

    const scaffoldRegions = usecaseFile!.regions.filter((r) => r.id.includes(".usecase.impl"));
    expect(scaffoldRegions.length).toBe(0);
  });

  it("handles concurrent compile calls without error", async () => {
    const route = defineRoute({
      id: "create",
      method: "POST",
      path: "/users",
      body: z.object({ name: z.string() }),
      response: z.object({ id: z.string() }),
      handler: "CreateUser",
    });

    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin", prefix: "/api" }),
      modules: [defineModule({ name: "user", routes: [route] })],
    });

    const results = await Promise.all([
      compile({ app, dryRun: true }),
      compile({ app, dryRun: true }),
      compile({ app, dryRun: true }),
    ]);

    for (const result of results) {
      expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);
    }

    expect(results[0].generation).toEqual(results[1].generation);
    expect(results[1].generation).toEqual(results[2].generation);
  });

  it("merges runtime code generation into output files", async () => {
    const route = defineRoute({
      id: "create",
      method: "POST",
      path: "/users",
      handler: "CreateUser",
    });

    const app = defineApp({
      architecture: "clean",
      runtime: { enabled: true },
      modules: [defineModule({ name: "user", routes: [route] })],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const runtimeFiles = result.generation.files.filter((f) => f.path.startsWith("pkg/runtime/"));
    expect(runtimeFiles.length).toBeGreaterThan(0);
    expect(runtimeFiles.some((f) => f.path.endsWith("context.go"))).toBe(true);
  });
});

describe("multi-architecture", () => {
  it("composes layers from multiple architectures in append mode", async () => {
    const route = defineRoute({
      id: "create",
      method: "POST",
      path: "/users",
      handler: "CreateUser",
    });

    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "user",
          architecture: { mode: "append", refs: ["atomic"] },
          routes: [route],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    const expansion = result.architecture?.routes[0];
    const layerKinds = expansion?.layers.map((l) => `${l.kind}:${l.owner}`) ?? [];

    expect(layerKinds.some((k) => k.startsWith("entity:"))).toBe(true);
    expect(layerKinds.some((k) => k.startsWith("handler:"))).toBe(true);
    const dupSymbols = result.diagnostics.filter((d) => d.code === "duplicate-symbol");
    expect(dupSymbols.length).toBeGreaterThanOrEqual(1);
    const dupRegionIds = result.diagnostics.filter((d) => d.code === "duplicate-region-id");
    expect(dupRegionIds.length).toBeGreaterThanOrEqual(1);
  });

  it("detects duplicate symbols across architectures", async () => {
    const route = defineRoute({
      id: "create",
      method: "POST",
      path: "/users",
      handler: "CreateUser",
    });

    const app = defineApp({
      architecture: "minimal",
      modules: [
        defineModule({
          name: "user",
          architecture: { mode: "append", refs: ["layered"] },
          routes: [route],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    const hasDupSymbol = result.diagnostics.some((d) => d.code === "duplicate-symbol");
    expect(hasDupSymbol).toBe(true);
  });
});

describe("multi-adapter", () => {
  it("handles multiple adapters per route", async () => {
    const route = defineRoute({
      id: "get",
      method: "GET",
      path: "/users/:id",
      handler: "GetUser",
    });

    const app = defineApp({
      architecture: "clean",
      adapters: ["gin"],
      modules: [defineModule({ name: "user", routes: [route] })],
    });

    const result = await compile({ app, dryRun: true });
    const regionIds = result.generation.files.flatMap((f) => f.regions.map((r) => r.id));

    expect(regionIds.some((id) => id.includes("handler"))).toBe(true);
    expect(regionIds.some((id) => id.includes("route"))).toBe(true);
  });
});

describe("pipeline integration", () => {
  it("runs full pipeline without errors", async () => {
    const route = defineRoute({
      id: "list",
      method: "GET",
      path: "/items",
      handler: "ListItems",
    });

    const app = defineApp({
      architecture: "clean",
      modules: [defineModule({ name: "items", routes: [route] })],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.ast).toBeDefined();
    expect(result.architecture).toBeDefined();
    expect(result.generation).toBeDefined();
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);
  });

  it("generates deterministic output across runs", async () => {
    const route = defineRoute({
      id: "get",
      method: "GET",
      path: "/items/:id",
      handler: "GetItem",
    });

    const app = defineApp({
      architecture: "clean",
      modules: [defineModule({ name: "items", routes: [route] })],
    });

    const first = await compile({ app, dryRun: true });
    const second = await compile({ app, dryRun: true });

    expect(first.generation).toEqual(second.generation);
  });
});

describe("responseFormat", () => {
  it("defineResponseFormat creates a ResponseFormat with a wrapper", () => {
    const wrapper = z.object({ data: z.entity(), meta: z.object({ page: z.number() }) });
    const rf = defineResponseFormat({ wrapper });
    expect(rf.kind).toBe("ResponseFormat");
    expect(rf.wrapper).toBe(wrapper);
  });

  it("isEntityPlaceholder detects z.entity()", () => {
    const entity = z.entity();
    expect(isEntityPlaceholder(entity)).toBe(true);
    expect(isEntityPlaceholder(z.string())).toBe(false);
    expect(isEntityPlaceholder(z.object({}))).toBe(false);
  });

  it("hasEntityPlaceholder recursively detects z.entity()", () => {
    const withEntity = z.object({ data: z.entity() });
    expect(hasEntityPlaceholder(withEntity)).toBe(true);
    expect(hasEntityPlaceholder(z.object({ name: z.string() }))).toBe(false);
    expect(hasEntityPlaceholder(z.object({ nested: z.object({ inner: z.entity() }) }))).toBe(true);
    expect(hasEntityPlaceholder(z.array(z.entity()))).toBe(true);
    expect(hasEntityPlaceholder(z.array(z.object({ x: z.entity() })))).toBe(true);
    expect(hasEntityPlaceholder(z.string().optional())).toBe(false);
    expect(hasEntityPlaceholder(z.entity().optional())).toBe(true);
    expect(hasEntityPlaceholder(z.string())).toBe(false);
  });

  it("mergeEntityIntoWrapper replaces z.entity() with response schema", () => {
    const wrapper = z.object({ data: z.entity(), meta: z.object({ page: z.number() }) });
    const response = z.object({ id: z.string(), name: z.string() });
    const merged = mergeEntityIntoWrapper(wrapper, response);
    expect(hasEntityPlaceholder(merged)).toBe(false);
    expect(merged).not.toBe(wrapper);
  });

  it("mergeEntityIntoWrapper replaces nested z.entity() in arrays", () => {
    const wrapper = z.object({ items: z.array(z.entity()) });
    const response = z.object({ id: z.string() });
    const merged = mergeEntityIntoWrapper(wrapper, response);
    expect(hasEntityPlaceholder(merged)).toBe(false);
    expect(merged).not.toBe(wrapper);
  });

  it("mergeEntityIntoWrapper returns result with no entity when no entity present", () => {
    const wrapper = z.object({ data: z.string() });
    const response = z.object({ id: z.string() });
    const merged = mergeEntityIntoWrapper(wrapper, response);
    expect(hasEntityPlaceholder(merged)).toBe(false);
  });

  it("responseFormat wraps response in generated Go types (entity layer)", async () => {
    const rf = defineResponseFormat({
      wrapper: z.object({ result: z.entity() }),
    });
    const route = defineRoute({
      id: "get",
      method: "GET",
      path: "/users/:id",
      response: z.object({ id: z.string(), name: z.string() }),
      responseFormat: rf,
      handler: "GetUser",
    });
    const app = defineApp({
      architecture: "clean",
      modules: [defineModule({ name: "user", routes: [route] })],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const entityRegion = result.generation.files
      .flatMap((f) => f.regions)
      .find((r) => r.id === "user.get.entity");
    expect(entityRegion).toBeDefined();

    const content = entityRegion!.content;
    expect(content).toContain("type GetUserResponse struct");
    expect(content).toContain("Result");
    expect(content).toContain("GetUserResponseResult");
  });

  it("responseFormat with no response still generates wrapped response (no entity structs)", async () => {
    const rf = defineResponseFormat({
      wrapper: z.object({ data: z.entity() }),
    });
    const route = defineRoute({
      id: "get",
      method: "GET",
      path: "/users/:id",
      responseFormat: rf,
      handler: "GetUser",
    });
    const app = defineApp({
      architecture: "clean",
      modules: [defineModule({ name: "user", routes: [route] })],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const diagCodes = result.diagnostics.map((d) => d.code);
    expect(diagCodes).toContain("response-format-no-response");

    const entityRegion = result.generation.files
      .flatMap((f) => f.regions)
      .find((r) => r.id === "user.get.entity");
    expect(entityRegion).toBeDefined();
    expect(entityRegion!.content).toContain("type GetUserResponse struct");

    const domainRegion = result.generation.files
      .flatMap((f) => f.regions)
      .find((r) => r.id === "user.domain");
    expect(domainRegion).toBeDefined();
    expect(domainRegion!.content).not.toContain("type User struct");
    expect(domainRegion!.content).not.toContain("type UserGet struct");
  });

  it("responseFormat wrapper without z.entity() emits diagnostic warning", async () => {
    const rf = defineResponseFormat({
      wrapper: z.object({ data: z.string() }),
    });
    const route = defineRoute({
      id: "get",
      method: "GET",
      path: "/users/:id",
      response: z.object({ id: z.string() }),
      responseFormat: rf,
      handler: "GetUser",
    });
    const app = defineApp({
      architecture: "clean",
      modules: [defineModule({ name: "user", routes: [route] })],
    });

    const result = await compile({ app, dryRun: true });
    const diagCodes = result.diagnostics.map((d) => d.code);
    expect(diagCodes).toContain("response-format-no-entity");
  });

  it("responseFormat inherits from module to route", async () => {
    const rf = defineResponseFormat({
      wrapper: z.object({ data: z.entity() }),
    });
    const route = defineRoute({
      id: "get",
      method: "GET",
      path: "/users/:id",
      response: z.object({ id: z.string() }),
      handler: "GetUser",
    });
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "user",
          responseFormat: rf,
          routes: [route],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const entityRegion = result.generation.files
      .flatMap((f) => f.regions)
      .find((r) => r.id === "user.get.entity");
    expect(entityRegion).toBeDefined();
    expect(entityRegion!.content).toContain("type GetUserResponse struct");
    expect(entityRegion!.content).toContain("Data");
    expect(entityRegion!.content).toContain("GetUserResponseData");
  });

  it("route-level responseFormat overrides module-level", async () => {
    const moduleRf = defineResponseFormat({
      wrapper: z.object({ moduleWrap: z.entity() }),
    });
    const routeRf = defineResponseFormat({
      wrapper: z.object({ routeWrap: z.entity() }),
    });
    const route = defineRoute({
      id: "get",
      method: "GET",
      path: "/users/:id",
      response: z.object({ id: z.string() }),
      responseFormat: routeRf,
      handler: "GetUser",
    });
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "user",
          responseFormat: moduleRf,
          routes: [route],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const entityRegion = result.generation.files
      .flatMap((f) => f.regions)
      .find((r) => r.id === "user.get.entity");
    expect(entityRegion).toBeDefined();
    expect(entityRegion!.content).toContain("RouteWrap");
    expect(entityRegion!.content).not.toContain("ModuleWrap");
  });

  it("generates domain entity structs when responseFormat and response are present", async () => {
    const rf = defineResponseFormat({
      wrapper: z.object({ data: z.entity() }),
    });
    const route = defineRoute({
      id: "get",
      method: "GET",
      path: "/users/:id",
      response: z.object({ id: z.string(), name: z.string() }),
      responseFormat: rf,
      handler: "GetUser",
    });
    const app = defineApp({
      architecture: "clean",
      modules: [defineModule({ name: "user", routes: [route] })],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const domainRegion = result.generation.files
      .flatMap((f) => f.regions)
      .find((r) => r.id === "user.domain");
    expect(domainRegion).toBeDefined();
    expect(domainRegion!.content).toContain("type User struct");
    expect(domainRegion!.content).toContain("ID string");
    expect(domainRegion!.content).toContain("Name string");
  });

  it("generates correct OpenAPI spec with responseFormat", async () => {
    const rf = defineResponseFormat({
      wrapper: z.object({ result: z.entity() }),
    });
    const route = defineRoute({
      id: "get",
      method: "GET",
      path: "/users/:id",
      response: z.object({ id: z.string(), name: z.string() }),
      responseFormat: rf,
      handler: "GetUser",
    });
    const app = defineApp({
      architecture: "clean",
      options: { targets: ["openapi"] },
      modules: [defineModule({ name: "user", routes: [route] })],
    });

    const result = await compile({ app, dryRun: true });
    const specFile = result.generation.files.find((f) => f.path.endsWith("openapi.json"));
    expect(specFile).toBeDefined();
    const specRegion = specFile!.regions.find((r) => r.id === "openapi.spec");
    expect(specRegion).toBeDefined();
    const spec = JSON.parse(specRegion!.content);

    const getPath = spec.paths["/users/:id"];
    expect(getPath).toBeDefined();
    const responseSchema = getPath.get.responses["200"].content["application/json"].schema;
    expect(responseSchema["$ref"]).toContain("GetUserResponse");
    const resolvedSchema = spec.components.schemas[responseSchema["$ref"].split("/").pop()!];
    expect(resolvedSchema).toBeDefined();
    expect(resolvedSchema.properties.result).toBeDefined();
    expect(resolvedSchema.properties.result.properties.id).toEqual({ type: "string" });
  });

  it("generates correct TS client types with responseFormat", async () => {
    const rf = defineResponseFormat({
      wrapper: z.object({ result: z.entity() }),
    });
    const route = defineRoute({
      id: "get",
      method: "GET",
      path: "/users/:id",
      response: z.object({ id: z.string(), name: z.string() }),
      responseFormat: rf,
      handler: "GetUser",
    });
    const app = defineApp({
      architecture: "clean",
      options: { targets: ["ts-client"] },
      modules: [defineModule({ name: "user", routes: [route] })],
    });

    const result = await compile({ app, dryRun: true });
    const typesFile = result.generation.files.find((f) => f.path.endsWith("clients/types.ts"));
    expect(typesFile).toBeDefined();
    const responseRegion = typesFile!.regions.find((r) => r.id.endsWith("user.get.response"));
    expect(responseRegion).toBeDefined();
    expect(responseRegion!.content).toContain("result: {");
    expect(responseRegion!.content).toContain("id: string;");
    expect(responseRegion!.content).toContain("name: string");
  });

  it("app-level responseFormat propagates through module to routes", async () => {
    const rf = defineResponseFormat({
      wrapper: z.object({ appData: z.entity() }),
    });
    const route = defineRoute({
      id: "list",
      method: "GET",
      path: "/items",
      response: z.object({ title: z.string() }),
      handler: "ListItems",
    });
    const app = defineApp({
      architecture: "clean",
      options: { responseFormat: rf },
      modules: [defineModule({ name: "items", routes: [route] })],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const entityRegion = result.generation.files
      .flatMap((f) => f.regions)
      .find((r) => r.id === "items.list.entity");
    expect(entityRegion).toBeDefined();
    expect(entityRegion!.content).toContain("AppData");
    expect(entityRegion!.content).toContain("ListItemsResponseAppData");
  });
});

describe("createSerializedRunner", () => {
  it("executes the wrapped function", async () => {
    const log: string[] = [];
    const runner = createSerializedRunner(
      async () => {
        log.push("run");
      },
      (fn) => fn(),
    );

    runner();
    expect(log).toEqual(["run"]);
  });

  it("serializes concurrent calls", async () => {
    const log: number[] = [];
    const releases: (() => void)[] = [];

    const runner = createSerializedRunner(
      async () => {
        log.push(1);
        await new Promise<void>((resolve) => {
          releases.push(resolve);
        });
        log.push(2);
      },
      (fn) => fn(),
    );

    runner();
    expect(log).toEqual([1]);

    runner();
    expect(log).toEqual([1]);

    releases[0]();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(log).toEqual([1, 2, 1]);

    releases[1]();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(log).toEqual([1, 2, 1, 2]);
  });

  it("does not re-run if no pending request", async () => {
    const log: string[] = [];
    const runner = createSerializedRunner(
      async () => {
        log.push("run");
      },
      (fn) => fn(),
    );

    runner();
    expect(log).toEqual(["run"]);
  });
});
