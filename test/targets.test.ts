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
