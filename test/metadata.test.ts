import { describe, expect, it } from "vitest";
import { z } from "zod";
import { compile, defineApp, defineModule, defineRoute, generateMetadata } from "../src/index.js";

describe("generateMetadata", () => {
  it("returns empty array when metadata is disabled", async () => {
    const app = defineApp({
      architecture: "clean",
      metadata: { enabled: false, routeRegistry: false, schemaReflection: false },
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              method: "GET",
              path: "/users/:id",
              handler: "GetUser",
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const patches = generateMetadata(result.ast!);
    expect(patches).toEqual([]);
  });

  it("generates registry.go with route info", async () => {
    const app = defineApp({
      architecture: "clean",
      metadata: { enabled: true, routeRegistry: true, schemaReflection: false },
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              method: "GET",
              path: "/users/:id",
              handler: "GetUser",
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const patches = generateMetadata(result.ast!);
    expect(patches).toHaveLength(1);
    expect(patches[0].path).toBe("internal/metadata/registry.go");
    const content = patches[0].regions[0].content;
    expect(content).toContain("package metadata");
    expect(content).toContain("GetUser");
    expect(content).toContain('"GET"');
    expect(content).toContain("RouteInfo");
    expect(content).toContain("ModuleInfo");
    expect(content).toContain("Registry");
  });

  it("generates schema reflection when enabled", async () => {
    const app = defineApp({
      architecture: "clean",
      metadata: { enabled: true, routeRegistry: true, schemaReflection: true },
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              method: "POST",
              path: "/users",
              handler: "CreateUser",
              body: z.object({ name: z.string() }),
              response: z.object({ id: z.number() }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const patches = generateMetadata(result.ast!);
    expect(patches.length).toBeGreaterThanOrEqual(2);
    const schemaPatch = patches.find((p) => p.path.includes("schemas"));
    expect(schemaPatch).toBeDefined();
    const content = schemaPatch!.regions[0].content;
    expect(content).toContain("SchemaReflection");
    expect(content).toContain("CreateUserUserBody");
    expect(content).toContain("CreateUserUserResponse");
    expect(content).toContain('"type": "string"');
    expect(content).toContain('"type": "number"');
  });

  it("generates array schema reflection", async () => {
    const app = defineApp({
      architecture: "clean",
      metadata: { enabled: true, routeRegistry: true, schemaReflection: true },
      modules: [
        defineModule({
          name: "item",
          routes: [
            defineRoute({
              method: "GET",
              path: "/items",
              handler: "ListItem",
              response: z.object({ items: z.array(z.object({ id: z.number() })) }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const patches = generateMetadata(result.ast!);
    const schemaPatch = patches.find((p) => p.path.includes("schemas"));
    expect(schemaPatch).toBeDefined();
    const content = schemaPatch!.regions[0].content;
    expect(content).toContain('"array"');
    expect(content).toContain('"object"');
    expect(content).toContain("properties");
  });

  it("handles boolean and array types in schema map", async () => {
    const app = defineApp({
      architecture: "clean",
      metadata: { enabled: true, routeRegistry: true, schemaReflection: true },
      modules: [
        defineModule({
          name: "feature",
          routes: [
            defineRoute({
              method: "POST",
              path: "/features",
              handler: "ToggleFeature",
              body: z.object({ active: z.boolean(), scores: z.array(z.number()) }),
              query: z.object({ page: z.number() }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const patches = generateMetadata(result.ast!);
    const schemaPatch = patches.find((p) => p.path.includes("schemas"));
    expect(schemaPatch).toBeDefined();
    const content = schemaPatch!.regions[0].content;
    expect(content).toContain('"boolean"');
    expect(content).toContain('"array"');
    expect(content).toContain("Query");
    expect(content).toContain("SchemaReflection");
  });

  it("handles unknown type in schema map", async () => {
    const app = defineApp({
      architecture: "clean",
      metadata: { enabled: true, routeRegistry: true, schemaReflection: true },
      modules: [
        defineModule({
          name: "raw",
          routes: [
            defineRoute({
              method: "POST",
              path: "/raw",
              handler: "StoreRaw",
              body: z.object({ data: z.any() }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const patches = generateMetadata(result.ast!);
    const schemaPatch = patches.find((p) => p.path.includes("schemas"));
    expect(schemaPatch).toBeDefined();
    const content = schemaPatch!.regions[0].content;
    expect(content).toContain('"unknown"');
  });

  it("skips schema reflection when disabled", async () => {
    const app = defineApp({
      architecture: "clean",
      metadata: { enabled: true, routeRegistry: true, schemaReflection: false },
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              method: "POST",
              path: "/users",
              handler: "CreateUser",
              body: z.object({ name: z.string() }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const patches = generateMetadata(result.ast!);
    expect(patches).toHaveLength(1);
    expect(patches[0].path).not.toContain("schemas");
  });
});
