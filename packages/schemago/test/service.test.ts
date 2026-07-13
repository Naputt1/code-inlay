import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  compile,
  defineApp,
  defineMiddleware,
  defineModule,
  defineRoute,
  defineRouter,
  defineService,
  defineServiceExtension,
} from "../src/index.js";
import { z } from "zod";

describe("service layer", () => {
  it("generates a service interface and implementation file", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      services: { payment: defineService({ close: true }) },
      modules: [
        defineModule({
          name: "payment",
          routes: [
            defineRoute({
              method: "POST",
              path: "/payments",
              body: z.object({ amount: z.number() }),
              response: z.object({ id: z.string() }),
              handler: "ProcessPayment",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const serviceFile = result.generation.files.find((f) =>
      f.path.endsWith("internal/service/payment.go"),
    );
    expect(serviceFile).toBeDefined();
    expect(serviceFile!.regions.length).toBeGreaterThan(0);

    const ifaceRegion = serviceFile!.regions.find((r) => r.id === "service.payment");
    expect(ifaceRegion).toBeDefined();
    expect(ifaceRegion!.content).toContain("type PaymentService interface");
    expect(ifaceRegion!.content).toContain("Close() error");
    const structRegion = serviceFile!.regions.find((r) => r.id === "service.payment.1struct");
    expect(structRegion).toBeDefined();
    expect(structRegion!.content).toContain("type paymentServiceImpl struct");
    const ctorRegion = serviceFile!.regions.find((r) => r.id === "service.payment.2ctor");
    expect(ctorRegion).toBeDefined();
    expect(ctorRegion!.signature).toBe("func NewPaymentService() (*paymentServiceImpl, error)");
    const closeRegion = serviceFile!.regions.find((r) => r.id === "service.payment.3Close");
    expect(closeRegion).toBeDefined();
    expect(closeRegion!.content).toContain("return nil");
  });

  it("generates service without Close when close is false", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      services: { search: defineService({ close: false }) },
      modules: [
        defineModule({
          name: "search",
          routes: [
            defineRoute({
              method: "GET",
              path: "/search",
              handler: "QuerySearch",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const serviceFile = result.generation.files.find((f) =>
      f.path.endsWith("internal/service/search.go"),
    );
    expect(serviceFile).toBeDefined();

    const ifaceRegion = serviceFile!.regions.find((r) => r.id === "service.search");
    expect(ifaceRegion).toBeDefined();
    expect(ifaceRegion!.content).toContain("type SearchService interface");
    expect(ifaceRegion!.content).not.toContain("Close()");
    const structRegion = serviceFile!.regions.find((r) => r.id === "service.search.1struct");
    expect(structRegion).toBeDefined();
    expect(structRegion!.content).toContain("type searchServiceImpl struct");
    const ctorRegion = serviceFile!.regions.find((r) => r.id === "service.search.2ctor");
    expect(ctorRegion).toBeDefined();
    expect(ctorRegion!.signature).toBe("func NewSearchService() (*searchServiceImpl, error)");
  });

  it("injects service into usecase scaffold constructor", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      services: { payment: defineService({ close: true }) },
      modules: [
        defineModule({
          name: "payment",
          routes: [
            defineRoute({
              method: "POST",
              path: "/payments",
              body: z.object({ amount: z.number() }),
              handler: "ProcessPayment",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const usecaseFile = result.generation.files.find((f) => f.path.endsWith("payment/usecase.go"));
    expect(usecaseFile).toBeDefined();

    const structRegion = usecaseFile!.regions.find(
      (r) =>
        r.id.endsWith(".usecase.impl") && !r.id.includes(".ctor") && !r.id.includes(".execute"),
    );
    const ctorRegion = usecaseFile!.regions.find((r) => r.id.endsWith(".usecase.impl.ctor"));
    expect(structRegion).toBeDefined();
    expect(ctorRegion).toBeDefined();
    expect(structRegion!.content).toContain("paymentSvc service.PaymentService");
    expect(ctorRegion!.signature).toBe(
      "func NewProcessPaymentUsecase(repo PaymentRepository, paymentSvc service.PaymentService) *processPaymentUsecaseImpl",
    );
    expect(ctorRegion!.content).toContain("return &processPaymentUsecaseImpl{");
    expect(ctorRegion!.content).toContain("paymentSvc: paymentSvc,");
  });

  it("route registration uses service-prefixed types for service params", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      services: { payment: defineService({ close: true }) },
      modules: [
        defineModule({
          name: "payment",
          routes: [
            defineRoute({
              method: "POST",
              path: "/payments",
              handler: "ProcessPayment",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const routeFile = result.generation.files.find((f) => f.path.endsWith("payment_routes.go"));
    expect(routeFile).toBeDefined();

    const routeRegion = routeFile!.regions.find((r) => r.id.startsWith("routes.register"));
    expect(routeRegion).toBeDefined();
    expect(routeRegion!.content).toContain(
      "func registerPaymentRoutes(api *gin.RouterGroup, paymentSvc service.PaymentService)",
    );
  });

  it("passes service param through route registration to usecase constructors", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      services: { payment: defineService({ close: true }) },
      modules: [
        defineModule({
          name: "payment",
          routes: [
            defineRoute({
              method: "POST",
              path: "/payments",
              handler: "ProcessPayment",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const routeFile = result.generation.files.find((f) => f.path.endsWith("payment_routes.go"));
    expect(routeFile).toBeDefined();

    const routeRegion = routeFile!.regions.find((r) => r.id.startsWith("routes.register"));
    expect(routeRegion).toBeDefined();
    expect(routeRegion!.content).toContain(
      "func registerPaymentRoutes(api *gin.RouterGroup, paymentSvc service.PaymentService)",
    );
    expect(routeRegion!.content).toContain(
      "ProcessPaymentUsecase: payment.NewProcessPaymentUsecase(nil /*repo TODO*/, paymentSvc),",
    );
  });

  it("combined RegisterRoutes accepts all services and forwards them", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      services: {
        payment: defineService({ close: true }),
        notification: defineService({ close: false }),
      },
      modules: [
        defineModule({
          name: "payment",
          routes: [
            defineRoute({
              method: "POST",
              path: "/payments",
              handler: "ProcessPayment",
            }),
          ],
        }),
        defineModule({
          name: "notification",
          routes: [
            defineRoute({
              method: "POST",
              path: "/notifications",
              handler: "SendNotification",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const routesFile = result.generation.files.find((f) =>
      f.path.endsWith("internal/http/routes.go"),
    );
    expect(routesFile).toBeDefined();

    const region = routesFile!.regions.find((r) => r.id === "routes.register");
    expect(region).toBeDefined();
    expect(region!.content).toContain(
      "func RegisterRoutes(api *gin.RouterGroup, paymentSvc service.PaymentService, notificationSvc service.NotificationService)",
    );
    expect(region!.content).toContain("registerPaymentRoutes(api, paymentSvc)");
    expect(region!.content).toContain("registerNotificationRoutes(api, notificationSvc)");
  });

  it("does not inject service when module name does not match service name", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      services: { payment: defineService({ close: true }) },
      modules: [
        defineModule({
          name: "auth",
          routes: [
            defineRoute({
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

    const serviceFile = result.generation.files.find((f) =>
      f.path.endsWith("internal/service/payment.go"),
    );
    expect(serviceFile).toBeDefined(); // service file still generated

    const usecaseFile = result.generation.files.find((f) => f.path.endsWith("auth/usecase.go"));
    expect(usecaseFile).toBeDefined();

    const ctorRegion = usecaseFile!.regions.find((r) => r.id.endsWith(".usecase.impl.ctor"));
    expect(ctorRegion).toBeDefined();
    expect(ctorRegion!.content).not.toContain("svc");
    expect(ctorRegion!.signature).toBe(
      "func NewLoginUsecase(repo AuthRepository) *loginUsecaseImpl",
    ); // has repo but no service param
  });

  it("generates service without usecase layer (no injection)", async () => {
    const app = defineApp({
      architecture: "minimal",
      router: defineRouter({ adapter: "gin" }),
      services: { search: defineService({ close: true }) },
      modules: [
        defineModule({
          name: "search",
          routes: [
            defineRoute({
              method: "GET",
              path: "/search",
              handler: "QuerySearch",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const serviceFile = result.generation.files.find((f) =>
      f.path.endsWith("internal/service/search.go"),
    );
    expect(serviceFile).toBeDefined();
  });

  it("generates usecase with service import when Go module info is available", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      services: { payment: defineService({ close: true }) },
      modules: [
        defineModule({
          name: "payment",
          routes: [
            defineRoute({
              method: "POST",
              path: "/payments",
              body: z.object({ amount: z.number() }),
              response: z.object({ id: z.string() }),
              handler: "ProcessPayment",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });

    const noWarning = result.diagnostics.find((d) => d.code === "missing-module-info");
    expect(noWarning).toBeUndefined();

    const usecaseFile = result.generation.files.find((f) => f.path.endsWith("payment/usecase.go"));
    expect(usecaseFile).toBeDefined();
    const importRegion = usecaseFile!.regions.find((r) => r.id.endsWith(".0usecase.imports"));
    expect(importRegion).toBeDefined();
    expect(importRegion!.content).toContain("context");
    expect(importRegion!.content).toContain("service");
  });

  it("generates grouped service import when Go module info is available", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      services: { payment: defineService({ close: true }) },
      modules: [
        defineModule({
          name: "payment",
          routes: [
            defineRoute({
              method: "POST",
              path: "/payments",
              body: z.object({ amount: z.number() }),
              response: z.object({ id: z.string() }),
              handler: "ProcessPayment",
            }),
          ],
        }),
      ],
    });

    const cwd = join(tmpdir(), `usecase-imports-${Date.now()}`);
    mkdirSync(cwd, { recursive: true });
    writeFileSync(
      join(cwd, "go.mod"),
      [
        "module github.com/example/test",
        "",
        "go 1.26",
        "",
        "require github.com/gin-gonic/gin v1.10.0",
        "",
      ].join("\n"),
    );

    const result = await compile({ app, configFile: "", cwd, dryRun: true });

    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const usecaseFile = result.generation.files.find((f) => f.path.endsWith("payment/usecase.go"));
    expect(usecaseFile).toBeDefined();
    const importRegion = usecaseFile!.regions.find((r) => r.id.endsWith(".0usecase.imports"));
    expect(importRegion).toBeDefined();
    expect(importRegion!.content).toContain("import (");
    expect(importRegion!.content).toContain(`"context"`);
    expect(importRegion!.content).toContain(`service "github.com/example/test/internal/service"`);
  });

  it("embeds DB imports inside interface region content (not as separate region)", async () => {
    const gorm = defineServiceExtension({
      name: "gorm",
      service: {
        provides: "database",
        optionsSchema: z.object({ driver: z.enum(["mysql", "postgres", "sqlite"]) }),
        dbAccessor: "DB",
        dbType: "*gorm.DB",
        dbTypePkg: "gorm.io/gorm",
        goModules: (opts: Record<string, unknown>) => [
          "gorm.io/gorm",
          `gorm.io/driver/${opts.driver}`,
        ],
      },
    });

    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      extensions: [gorm],
      services: { mygorm: gorm({ driver: "postgres", close: true }) },
      modules: [
        defineModule({
          name: "ticket",
          services: ["mygorm"],
          routes: [defineRoute({ method: "GET", path: "", handler: "List" })],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const svcFile = result.generation.files.find((f) => f.path.endsWith("service/mygorm.go"));
    expect(svcFile).toBeDefined();

    // Should NOT have a separate import region
    const separateImportRegion = svcFile!.regions.find((r) => r.id === "service.mygorm.0imports");
    expect(separateImportRegion).toBeUndefined();

    // Should have import block INSIDE the interface region
    const ifaceRegion = svcFile!.regions.find((r) => r.id === "service.mygorm");
    expect(ifaceRegion).toBeDefined();
    expect(ifaceRegion!.content).toContain("import (");
    expect(ifaceRegion!.content).toContain('"gorm.io/gorm"');
    expect(ifaceRegion!.content).toContain("type MygormService interface");
    expect(ifaceRegion!.content).toContain("DB() *gorm.DB");
  });

  it("handler import regions have kind=imports and imports array", async () => {
    const app = defineApp({
      architecture: "minimal",
      router: defineRouter({ adapter: "gin" }),
      services: { db: defineService({ close: true }) },
      modules: [
        defineModule({
          name: "auth",
          services: ["db"],
          routes: [
            defineRoute({
              method: "POST",
              path: "/login",
              body: z.object({ email: z.string() }),
              handler: "Login",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const handlerFile = result.generation.files.find((f) => f.path.endsWith("auth/handler.go"));
    expect(handlerFile).toBeDefined();

    const importRegion = handlerFile!.regions.find((r) => r.kind === "imports");
    expect(importRegion).toBeDefined();
    expect(importRegion!.kind).toBe("imports");
    expect(importRegion!.imports).toBeDefined();
    expect(importRegion!.imports!.length).toBeGreaterThan(0);
    expect(importRegion!.imports).toContain('"github.com/gin-gonic/gin"');
  });

  it("middleware import regions have kind=imports and imports array", async () => {
    const jwtAuth = defineMiddleware({ name: "JwtAuth" });

    const app = defineApp({
      architecture: "minimal",
      router: defineRouter({ adapter: "gin" }),
      services: { db: defineService({ close: true }) },
      modules: [
        defineModule({
          name: "user",
          services: ["db"],
          middleware: [jwtAuth],
          routes: [defineRoute({ method: "GET", path: "/me", handler: "GetMe" })],
        }),
      ],
    });

    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const mwFile = result.generation.files.find((f) => f.path.endsWith("middleware/jwt_auth.go"));
    expect(mwFile).toBeDefined();

    const importRegion = mwFile!.regions.find((r) => r.kind === "imports");
    expect(importRegion).toBeDefined();
    expect(importRegion!.kind).toBe("imports");
    expect(importRegion!.imports).toBeDefined();
    expect(importRegion!.imports).toContain('"github.com/gin-gonic/gin"');
  });
});
