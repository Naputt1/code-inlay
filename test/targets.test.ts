import { describe, expect, it } from "vitest";
import { z } from "zod";
import { compile, defineApp, defineModule, defineRoute } from "../src/index.js";

describe("openapi target", () => {
  it("generates OpenAPI spec for basic routes", async () => {
    const app = defineApp({
      architecture: "clean",
      options: { targets: ["openapi"] },
      modules: [
        defineModule({
          name: "pet",
          routes: [
            defineRoute({
              id: "getPet",
              method: "GET",
              path: "/pets/:id",
              handler: "GetPet",
              response: z.object({ id: z.number(), name: z.string() }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const specFile = result.generation?.files.find((f) => f.path.endsWith("openapi.json"));
    expect(specFile).toBeDefined();
    const content = JSON.parse(specFile!.regions[0].content);
    expect(content.openapi).toBeDefined();
    expect(content.paths["/pets/:id"].get).toBeDefined();
    expect(content.components.schemas).toBeDefined();
  });

  it("handles routes with body, query, and response", async () => {
    const app = defineApp({
      architecture: "clean",
      options: { targets: ["openapi"] },
      modules: [
        defineModule({
          name: "todo",
          routes: [
            defineRoute({
              id: "create",
              method: "POST",
              path: "/todos",
              handler: "CreateTodo",
              body: z.object({ title: z.string(), completed: z.boolean() }),
              query: z.object({ source: z.string().optional() }),
              response: z.object({ id: z.number() }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const specFile = result.generation?.files.find((f) => f.path.endsWith("openapi.json"));
    expect(specFile).toBeDefined();
    const content = JSON.parse(specFile!.regions[0].content);
    expect(content.paths["/todos"].post).toBeDefined();
    expect(content.paths["/todos"].post.requestBody).toBeDefined();
    expect(content.paths["/todos"].post.parameters).toBeDefined();
  });

  it("handles route with enum schema", async () => {
    const app = defineApp({
      architecture: "clean",
      options: { targets: ["openapi"] },
      modules: [
        defineModule({
          name: "pet",
          routes: [
            defineRoute({
              id: "create",
              method: "POST",
              path: "/pets",
              handler: "CreatePet",
              body: z.object({ type: z.enum(["dog", "cat", "fish"]) }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const specFile = result.generation?.files.find((f) => f.path.endsWith("openapi.json"));
    expect(specFile).toBeDefined();
    const content = JSON.parse(specFile!.regions[0].content);
    const bodyRef = content.paths["/pets"].post.requestBody.content["application/json"].schema.$ref;
    const schemaName = bodyRef.split("/").pop();
    expect(content.components.schemas[schemaName].properties.type.enum).toEqual([
      "dog",
      "cat",
      "fish",
    ]);
  });

  it("handles optional and nullable schemas", async () => {
    const app = defineApp({
      architecture: "clean",
      options: { targets: ["openapi"] },
      modules: [
        defineModule({
          name: "profile",
          routes: [
            defineRoute({
              id: "update",
              method: "PUT",
              path: "/profile",
              handler: "UpdateProfile",
              body: z.object({
                nickname: z.string().optional(),
                bio: z.nullable(z.string()),
              }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const specFile = result.generation?.files.find((f) => f.path.endsWith("openapi.json"));
    expect(specFile).toBeDefined();
    const content = JSON.parse(specFile!.regions[0].content);
    expect(content.components.schemas).toBeDefined();
  });

  it("handles unsupported schema type with empty fallback", async () => {
    const app = defineApp({
      architecture: "clean",
      options: { targets: ["openapi"] },
      modules: [
        defineModule({
          name: "raw",
          routes: [
            defineRoute({
              id: "store",
              method: "POST",
              path: "/raw",
              handler: "StoreRaw",
              body: z.object({ val: z.any() }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const specFile = result.generation?.files.find((f) => f.path.endsWith("openapi.json"));
    expect(specFile).toBeDefined();
    const content = JSON.parse(specFile!.regions[0].content);
    expect(content.components.schemas).toBeDefined();
  });

  it("handles array schemas", async () => {
    const app = defineApp({
      architecture: "clean",
      options: { targets: ["openapi"] },
      modules: [
        defineModule({
          name: "cart",
          routes: [
            defineRoute({
              id: "add",
              method: "POST",
              path: "/cart",
              handler: "AddToCart",
              body: z.object({ items: z.array(z.string()) }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const specFile = result.generation?.files.find((f) => f.path.endsWith("openapi.json"));
    expect(specFile).toBeDefined();
    const content = JSON.parse(specFile!.regions[0].content);
    expect(content.components.schemas).toBeDefined();
  });

  it("handles responseFormat without response schema", async () => {
    const app = defineApp({
      architecture: "clean",
      options: { targets: ["openapi"] },
      modules: [
        defineModule({
          name: "ping",
          routes: [
            defineRoute({
              id: "ping",
              method: "GET",
              path: "/ping",
              handler: "Ping",
              responseFormat: { kind: "ResponseFormat", wrapper: z.object({ result: z.string() }) },
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const specFile = result.generation?.files.find((f) => f.path.endsWith("openapi.json"));
    expect(specFile).toBeDefined();
    const content = JSON.parse(specFile!.regions[0].content);
    expect(content.paths["/ping"].get.responses).toBeDefined();
  });
});

describe("ts-client target", () => {
  it("generates TypeScript client for basic routes", async () => {
    const app = defineApp({
      architecture: "clean",
      options: { targets: ["ts-client"] },
      modules: [
        defineModule({
          name: "pet",
          routes: [
            defineRoute({
              id: "getPet",
              method: "GET",
              path: "/pets/:id",
              handler: "GetPet",
              response: z.object({ id: z.number(), name: z.string() }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const files = result.generation?.files ?? [];
    expect(files.some((f) => f.path.endsWith("types.ts"))).toBe(true);
    expect(files.some((f) => f.path.endsWith("base.ts"))).toBe(true);
    expect(files.some((f) => f.path.endsWith("pet.ts"))).toBe(true);
    expect(files.some((f) => f.path.endsWith("index.ts"))).toBe(true);
  });

  it("generates interface with optional fields", async () => {
    const app = defineApp({
      architecture: "clean",
      options: { targets: ["ts-client"] },
      modules: [
        defineModule({
          name: "item",
          routes: [
            defineRoute({
              id: "update",
              method: "PUT",
              path: "/items/:id",
              handler: "UpdateItem",
              body: z.object({ name: z.string().optional(), price: z.number() }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const typesFile = result.generation?.files.find((f) => f.path.endsWith("types.ts"));
    expect(typesFile).toBeDefined();
    const content = typesFile!.regions[0].content;
    expect(content).toContain("name?");
    expect(content).toContain("price");
  });

  it("handles route with no body or response", async () => {
    const app = defineApp({
      architecture: "clean",
      options: { targets: ["ts-client"] },
      modules: [
        defineModule({
          name: "health",
          routes: [
            defineRoute({
              id: "ping",
              method: "GET",
              path: "/ping",
              handler: "Ping",
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    expect(result.diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
  });

  it("handles route with query only (no body)", async () => {
    const app = defineApp({
      architecture: "clean",
      options: { targets: ["ts-client"] },
      modules: [
        defineModule({
          name: "search",
          routes: [
            defineRoute({
              id: "find",
              method: "GET",
              path: "/search",
              handler: "FindItems",
              query: z.object({ q: z.string(), page: z.number().optional() }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const searchFile = result.generation?.files.find((f) => f.path.endsWith("search.ts"));
    expect(searchFile).toBeDefined();
    const content = searchFile!.regions[0].content;
    expect(content).toContain("encodeURIComponent");
    expect(content).toContain("query");
  });

  it("handles route with path params only", async () => {
    const app = defineApp({
      architecture: "clean",
      options: { targets: ["ts-client"] },
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              id: "getById",
              method: "GET",
              path: "/users/:id",
              handler: "GetUserById",
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const userFile = result.generation?.files.find((f) => f.path.endsWith("user.ts"));
    expect(userFile).toBeDefined();
    const content = userFile!.regions[0].content;
    expect(content).toContain("params");
    expect(content).toContain("id: string");
  });
});
