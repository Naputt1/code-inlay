import { describe, expect, it } from "vitest";
import {
  compile,
  defineApp,
  defineModule,
  defineRoute,
  defineCors,
  generateServer,
} from "../src/index.js";
import type { AdapterPlugin, GoModuleInfo } from "../src/index.js";

describe("generateServer", () => {
  async function buildBase() {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              method: "GET",
              path: "/users",
              handler: "ListUsers",
            }),
          ],
        }),
      ],
    });
    return compile({ app, dryRun: true });
  }

  const moduleInfo: GoModuleInfo = {
    modulePath: "github.com/example/myapp",
    dependencies: [],
  };

  it("generates main.go with gin adapter", async () => {
    const result = await buildBase();
    const patch = generateServer(result.ast!, result.architecture!, moduleInfo, {
      name: "gin",
      transport: "http",
      generateRoute: () => "",
      generateMiddleware: () => "",
      generateServer: () => "",
    } as unknown as AdapterPlugin);
    expect(patch.path).toBe("cmd/server/main.go");
    expect(patch.regions).toHaveLength(2);
    expect(patch.regions[0].id).toContain("imports");
    expect(patch.regions[1].id).toContain("main");

    const importsContent = patch.regions[0].content;
    expect(importsContent).toContain('"reflect"');
    expect(importsContent).toContain('"strings"');
    expect(importsContent).toContain('"github.com/gin-gonic/gin"');
    expect(importsContent).toContain('"github.com/gin-gonic/gin/binding"');
    expect(importsContent).toContain('"github.com/go-playground/validator/v10"');
    expect(importsContent).toContain('genroutes "github.com/example/myapp/internal/http"');
  });

  it("generates service initialization when services present", async () => {
    const result = await buildBase();
    const appWithServices = {
      ...result.ast!,
      services: [{ name: "UserService", close: true, typeName: "*userSvc" }],
    };
    const patch = generateServer(appWithServices, result.architecture!, moduleInfo, {
      name: "gin",
      transport: "http",
      generateRoute: () => "",
      generateMiddleware: () => "",
      generateServer: () => "",
    } as unknown as AdapterPlugin);
    const mainContent = patch.regions[1].content;
    expect(mainContent).toContain("userServiceSvc");
    expect(mainContent).toContain("defer userServiceSvc.Close()");
    expect(mainContent).toContain("service.NewUserService");
  });

  it("generates main body with gin.Default and RegisterRoutes", async () => {
    const result = await buildBase();
    const patch = generateServer(result.ast!, result.architecture!, moduleInfo, {
      name: "gin",
      transport: "http",
      generateRoute: () => "",
      generateMiddleware: () => "",
      generateServer: () => "",
    } as unknown as AdapterPlugin);
    const mainContent = patch.regions[1].content;
    expect(mainContent).toContain("binding.Validator.Engine()");
    expect(mainContent).toContain("RegisterTagNameFunc");
    expect(mainContent).toContain('strings.SplitN(fld.Tag.Get("json"), ",", 2)[0]');
    expect(mainContent).toContain("gin.Default()");
    expect(mainContent).toContain("RegisterRoutes");
    expect(mainContent).toContain(`r.Group("${result.ast!.router.prefix}")`);
  });

  it("includes cors import when cors is configured", async () => {
    const result = await buildBase();
    const astWithCors = {
      ...result.ast!,
      router: {
        ...result.ast!.router,
        cors: defineCors({
          allowOrigins: ["http://localhost:3000"],
          allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
          allowHeaders: ["Origin", "Content-Type", "Authorization"],
          allowCredentials: true,
          maxAge: 86400,
        }),
      },
    };
    const patch = generateServer(astWithCors, result.architecture!, moduleInfo, {
      name: "gin",
      transport: "http",
      generateRoute: () => "",
      generateMiddleware: () => "",
      generateServer: () => "",
    } as unknown as AdapterPlugin);
    const importsContent = patch.regions[0].content;
    expect(importsContent).toContain('cors "github.com/gin-contrib/cors"');
  });

  it("generates cors middleware in main body when cors is configured", async () => {
    const result = await buildBase();
    const astWithCors = {
      ...result.ast!,
      router: {
        ...result.ast!.router,
        cors: defineCors({
          allowOrigins: ["http://localhost:3000"],
          allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
          allowHeaders: ["Origin", "Content-Type", "Authorization"],
          allowCredentials: true,
          maxAge: 86400,
        }),
      },
    };
    const patch = generateServer(astWithCors, result.architecture!, moduleInfo, {
      name: "gin",
      transport: "http",
      generateRoute: () => "",
      generateMiddleware: () => "",
      generateServer: () => "",
    } as unknown as AdapterPlugin);
    const mainContent = patch.regions[1].content;
    expect(mainContent).toContain("cors.New(cors.Config{");
    expect(mainContent).toContain(`AllowOrigins:     []string{"http://localhost:3000"}`);
    expect(mainContent).toContain(
      `AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}`,
    );
    expect(mainContent).toContain(
      `AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"}`,
    );
    expect(mainContent).toContain("AllowCredentials: true,");
    expect(mainContent).toContain("MaxAge:           86400,");
  });

  it("generates cors middleware without optional fields when not set", async () => {
    const result = await buildBase();
    const astWithCors = {
      ...result.ast!,
      router: {
        ...result.ast!.router,
        cors: defineCors({
          allowOrigins: ["*"],
          allowMethods: ["GET"],
          allowHeaders: ["Content-Type"],
        }),
      },
    };
    const patch = generateServer(astWithCors, result.architecture!, moduleInfo, {
      name: "gin",
      transport: "http",
      generateRoute: () => "",
      generateMiddleware: () => "",
      generateServer: () => "",
    } as unknown as AdapterPlugin);
    const mainContent = patch.regions[1].content;
    expect(mainContent).toContain("cors.New(cors.Config{");
    expect(mainContent).not.toContain("AllowCredentials");
    expect(mainContent).not.toContain("MaxAge:");
    expect(mainContent).not.toContain("ExposeHeaders");
  });

  it("generates cors with exposeHeaders when configured", async () => {
    const result = await buildBase();
    const astWithCors = {
      ...result.ast!,
      router: {
        ...result.ast!.router,
        cors: defineCors({
          allowOrigins: ["*"],
          allowMethods: ["GET"],
          allowHeaders: ["Content-Type"],
          exposeHeaders: ["X-Custom-Header"],
        }),
      },
    };
    const patch = generateServer(astWithCors, result.architecture!, moduleInfo, {
      name: "gin",
      transport: "http",
      generateRoute: () => "",
      generateMiddleware: () => "",
      generateServer: () => "",
    } as unknown as AdapterPlugin);
    const mainContent = patch.regions[1].content;
    expect(mainContent).toContain(`ExposeHeaders:    []string{"X-Custom-Header"}`);
  });

  it("renders cfg.PORT when allowOrigins contains ${PORT} and env has PORT", async () => {
    const result = await buildBase();
    const astWithCorsAndEnv = {
      ...result.ast!,
      env: { PORT: { type: "string" as const, required: false } },
      router: {
        ...result.ast!.router,
        cors: defineCors({
          allowOrigins: ["http://localhost${PORT}"],
          allowMethods: ["GET"],
          allowHeaders: ["Content-Type"],
        }),
      },
    };
    const patch = generateServer(astWithCorsAndEnv, result.architecture!, moduleInfo, {
      name: "gin",
      transport: "http",
      generateRoute: () => "",
      generateMiddleware: () => "",
      generateServer: () => "",
    } as unknown as AdapterPlugin);
    const mainContent = patch.regions[1].content;
    expect(mainContent).toContain(`AllowOrigins:     []string{"http://localhost" + cfg.PORT}`);
    expect(mainContent).toContain(`AllowMethods:     []string{"GET"}`);
  });

  it("passes ${PORT} through as literal when no env defined", async () => {
    const result = await buildBase();
    const astWithCors = {
      ...result.ast!,
      router: {
        ...result.ast!.router,
        cors: defineCors({
          allowOrigins: ["http://localhost${PORT}"],
          allowMethods: ["GET"],
          allowHeaders: ["Content-Type"],
        }),
      },
    };
    const patch = generateServer(astWithCors, result.architecture!, moduleInfo, {
      name: "gin",
      transport: "http",
      generateRoute: () => "",
      generateMiddleware: () => "",
      generateServer: () => "",
    } as unknown as AdapterPlugin);
    const mainContent = patch.regions[1].content;
    expect(mainContent).toContain(`AllowOrigins:     []string{"http://localhost\${PORT}"}`);
  });

  it("passes unknown env ref through as literal string", async () => {
    const result = await buildBase();
    const astWithCorsAndEnv = {
      ...result.ast!,
      env: { PORT: { type: "string" as const, required: false } },
      router: {
        ...result.ast!.router,
        cors: defineCors({
          allowOrigins: ["${UNKNOWN}"],
          allowMethods: ["GET"],
          allowHeaders: ["Content-Type"],
        }),
      },
    };
    const patch = generateServer(astWithCorsAndEnv, result.architecture!, moduleInfo, {
      name: "gin",
      transport: "http",
      generateRoute: () => "",
      generateMiddleware: () => "",
      generateServer: () => "",
    } as unknown as AdapterPlugin);
    const mainContent = patch.regions[1].content;
    expect(mainContent).toContain(`AllowOrigins:     []string{"\${UNKNOWN}"}`);
  });

  it("renders multiple env refs with concatenation", async () => {
    const result = await buildBase();
    const astWithCorsAndEnv = {
      ...result.ast!,
      env: {
        HOST: { type: "string" as const, required: false },
        PORT: { type: "string" as const, required: false },
      },
      router: {
        ...result.ast!.router,
        cors: defineCors({
          allowOrigins: ["${HOST}:${PORT}"],
          allowMethods: ["GET"],
          allowHeaders: ["Content-Type"],
        }),
      },
    };
    const patch = generateServer(astWithCorsAndEnv, result.architecture!, moduleInfo, {
      name: "gin",
      transport: "http",
      generateRoute: () => "",
      generateMiddleware: () => "",
      generateServer: () => "",
    } as unknown as AdapterPlugin);
    const mainContent = patch.regions[1].content;
    expect(mainContent).toContain(`AllowOrigins:     []string{cfg.HOST + ":" + cfg.PORT}`);
  });

  it("renders env refs in AllowHeaders and AllowMethods fields", async () => {
    const result = await buildBase();
    const astWithCorsAndEnv = {
      ...result.ast!,
      env: {
        CUSTOM_HEADER: { type: "string" as const, required: false },
        ALLOWED_METHOD: { type: "string" as const, required: false },
      },
      router: {
        ...result.ast!.router,
        cors: defineCors({
          allowOrigins: ["*"],
          allowMethods: ["${ALLOWED_METHOD}"],
          allowHeaders: ["X-${CUSTOM_HEADER}"],
        }),
      },
    };
    const patch = generateServer(astWithCorsAndEnv, result.architecture!, moduleInfo, {
      name: "gin",
      transport: "http",
      generateRoute: () => "",
      generateMiddleware: () => "",
      generateServer: () => "",
    } as unknown as AdapterPlugin);
    const mainContent = patch.regions[1].content;
    expect(mainContent).toContain(`AllowMethods:     []string{cfg.ALLOWED_METHOD}`);
    expect(mainContent).toContain(`AllowHeaders:     []string{"X-" + cfg.CUSTOM_HEADER}`);
  });
});
