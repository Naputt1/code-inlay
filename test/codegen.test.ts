import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  compile,
  defineApp,
  defineModule,
  defineRoute,
  defineMiddleware,
} from "../src/index.js";

describe("middleware file generation", () => {
  it("generates middleware files when routes have middleware", async () => {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "api",
          routes: [
            defineRoute({
              id: "list",
              method: "GET",
              path: "/items",
              handler: "ListItems",
              middleware: [defineMiddleware({ name: "auth" })],
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const middlewareFile = result.generation?.files.find((f) =>
      f.path.includes("middleware/auth.go"),
    );
    expect(middlewareFile).toBeDefined();
    expect(middlewareFile!.regions.length).toBeGreaterThanOrEqual(1);
    expect(middlewareFile!.path).toContain("middleware/auth.go");
  });

  it("handles handler name with unknown verb in scaffold", async () => {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "process",
          routes: [
            defineRoute({
              id: "run",
              method: "POST",
              path: "/process",
              handler: "ProcessItem",
              body: z.object({ data: z.string() }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
  });

  it("generates middleware files from module-level middleware", async () => {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "api",
          middleware: [defineMiddleware({ name: "ratelimit" })],
          routes: [
            defineRoute({
              id: "list",
              method: "GET",
              path: "/items",
              handler: "ListItems",
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const mwFile = result.generation?.files.find((f) =>
      f.path.includes("middleware/ratelimit.go"),
    );
    expect(mwFile).toBeDefined();
  });
});
