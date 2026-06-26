import { describe, expect, it } from "vitest";
import { z } from "zod";
import { compile, defineApp, defineModule, defineRoute, generateApiDocs } from "../src/index.js";

describe("generateApiDocs", () => {
  it("handles enum schemas in body", async () => {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "pet",
          routes: [
            defineRoute({
              id: "create",
              method: "POST",
              path: "/pets",
              handler: "CreatePet",
              body: z.object({ type: z.enum(["dog", "cat"]) }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const docs = generateApiDocs(result.ast!, result.architecture!, "markdown");
    expect(docs).toContain("#### Request Body");
    expect(docs).toContain('"type"');
  });

  it("handles unhandled schema types gracefully", async () => {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "test",
          routes: [
            defineRoute({
              id: "any",
              method: "POST",
              path: "/any",
              handler: "AnyHandler",
              body: z.object({ val: z.any() }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const docs = generateApiDocs(result.ast!, result.architecture!, "markdown");
    expect(docs).toContain("## Route Details");
    expect(docs).toContain("POST `/any`");
  });

  it("handles top-level enum schema as body", async () => {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "status",
          routes: [
            defineRoute({
              id: "set",
              method: "POST",
              path: "/status",
              handler: "SetStatus",
              body: z.enum(["active", "inactive"]) as never,
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const docs = generateApiDocs(result.ast!, result.architecture!, "markdown");
    expect(docs).toContain("#### Request Body");
    expect(docs).toContain("active");
  });

  it("handles top-level unknown schema type as body", async () => {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "test",
          routes: [
            defineRoute({
              id: "raw",
              method: "POST",
              path: "/raw",
              handler: "RawHandler",
              body: z.any() as never,
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const docs = generateApiDocs(result.ast!, result.architecture!, "markdown");
    expect(docs).toContain("#### Request Body");
    expect(docs).toContain("null");
  });

  it("generates markdown with route table", async () => {
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
            defineRoute({
              id: "create",
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
    const docs = generateApiDocs(result.ast!, result.architecture!, "markdown");
    expect(docs).toContain("# API Reference");
    expect(docs).toContain("| GET |");
    expect(docs).toContain("| POST |");
    expect(docs).toContain("User");
    expect(docs).toContain("ListUsers");
    expect(docs).toContain("CreateUser");
  });

  it("includes route details section", async () => {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              id: "get",
              method: "GET",
              path: "/users/:id",
              handler: "GetUser",
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const docs = generateApiDocs(result.ast!, result.architecture!, "markdown");
    expect(docs).toContain("## Route Details");
    expect(docs).toContain("GET `/users/:id`");
  });

  it("shows JSON schema samples for body and query", async () => {
    const app = defineApp({
      architecture: "clean",
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
              query: z.object({ page: z.number().optional() }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const docs = generateApiDocs(result.ast!, result.architecture!, "markdown");
    expect(docs).toContain("#### Request Body");
    expect(docs).toContain("#### Query Parameters");
    expect(docs).toContain('"title"');
    expect(docs).toContain('"page"');
  });

  it("renders mermaid diagram", async () => {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              id: "get",
              method: "GET",
              path: "/users/:id",
              handler: "GetUser",
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const docs = generateApiDocs(result.ast!, result.architecture!, "mermaid");
    expect(docs).toContain("```mermaid");
    expect(docs).toContain("graph LR");
    expect(docs).toContain('Client["Client"]');
    expect(docs).toContain("ModUser");
  });

  it("shows response body in details when present", async () => {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "item",
          routes: [
            defineRoute({
              id: "get",
              method: "GET",
              path: "/items/:id",
              handler: "GetItem",
              response: z.object({ id: z.string(), price: z.number() }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const docs = generateApiDocs(result.ast!, result.architecture!, "markdown");
    expect(docs).toContain("#### Response Body");
    expect(docs).toContain('"id"');
    expect(docs).toContain('"price"');
  });
});
