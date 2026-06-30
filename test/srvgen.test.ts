import { describe, expect, it } from "vitest";
import { compile, defineApp, defineModule, defineRoute, generateServer } from "../src/index.js";
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
              id: "list",
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
});
