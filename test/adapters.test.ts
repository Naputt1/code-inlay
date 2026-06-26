import { describe, expect, it } from "vitest";
import { z } from "zod";
import { compile, defineApp, defineModule, defineRoute } from "../src/index.js";

function hasErrors(result: { diagnostics: Array<{ level: string }> }): boolean {
  return result.diagnostics.some((d) => d.level === "error");
}

describe("compile with adapter variants", () => {
  it("handles PUT method route", async () => {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "item",
          routes: [
            defineRoute({
              id: "update",
              method: "PUT",
              path: "/items/:id",
              handler: "UpdateItem",
              body: z.object({ name: z.string() }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    expect(hasErrors(result)).toBe(false);
  });

  it("handles PATCH method route", async () => {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "item",
          routes: [
            defineRoute({
              id: "patch",
              method: "PATCH",
              path: "/items/:id",
              handler: "PatchItem",
              body: z.object({ name: z.string() }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    expect(hasErrors(result)).toBe(false);
  });

  it("handles route with path params only (domain, non-verb handler)", async () => {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              id: "fetchByID",
              method: "GET",
              path: "/users/:id",
              handler: "FetchUserByID",
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    expect(hasErrors(result)).toBe(false);
  });

  it("handles route with path params but no query or body (minimal)", async () => {
    const app = defineApp({
      architecture: "minimal",
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
    expect(hasErrors(result)).toBe(false);
  });

  it("handles domain generic path with query and body and path params", async () => {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "item",
          routes: [
            defineRoute({
              id: "update",
              method: "PUT",
              path: "/items/:id",
              handler: "UpdateItem",
              query: z.object({ version: z.number() }),
              body: z.object({ name: z.string() }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    expect(hasErrors(result)).toBe(false);
  });

  it("handles non-domain path with query and body", async () => {
    const app = defineApp({
      architecture: "minimal",
      modules: [
        defineModule({
          name: "item",
          routes: [
            defineRoute({
              id: "create",
              method: "POST",
              path: "/items",
              handler: "CreateItem",
              query: z.object({ ref: z.string() }),
              body: z.object({ name: z.string() }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    expect(hasErrors(result)).toBe(false);
  });

  it("handles domain generic path with query only", async () => {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "search",
          routes: [
            defineRoute({
              id: "search",
              method: "GET",
              path: "/search",
              handler: "SearchItems",
              query: z.object({ q: z.string() }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    expect(hasErrors(result)).toBe(false);
  });

  it("handles domain generic path with body only", async () => {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "data",
          routes: [
            defineRoute({
              id: "submit",
              method: "POST",
              path: "/data",
              handler: "SubmitData",
              body: z.object({ value: z.number() }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    expect(hasErrors(result)).toBe(false);
  });

  it("handles route with query only and no body (minimal)", async () => {
    const app = defineApp({
      architecture: "minimal",
      modules: [
        defineModule({
          name: "search",
          routes: [
            defineRoute({
              id: "search",
              method: "GET",
              path: "/search",
              handler: "Search",
              query: z.object({ q: z.string() }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    expect(hasErrors(result)).toBe(false);
  });

  it("handles route with body only and no query (minimal)", async () => {
    const app = defineApp({
      architecture: "minimal",
      modules: [
        defineModule({
          name: "data",
          routes: [
            defineRoute({
              id: "submit",
              method: "POST",
              path: "/data",
              handler: "SubmitData",
              body: z.object({ value: z.number() }),
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    expect(hasErrors(result)).toBe(false);
  });

  it("handles non-standard HTTP method", async () => {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "test",
          routes: [
            defineRoute({
              id: "head",
              method: "HEAD" as never,
              path: "/test",
              handler: "HeadTest",
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    expect(hasErrors(result)).toBe(false);
  });
});
