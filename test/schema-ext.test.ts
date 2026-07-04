import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  compile,
  defineApp,
  defineModule,
  defineRoute,
  extractEntityContext,
  generateEntityStructs,
} from "../src/index.js";
import type { Diagnostic, RouteAst } from "../src/index.js";
import type { ResponseFormat } from "../src/types/index.js";

describe("extractEntityContext", () => {
  it("strips 'get' suffix", () => {
    expect(extractEntityContext("petGet")).toBe("pet");
  });

  it("strips 'create' suffix", () => {
    expect(extractEntityContext("userCreate")).toBe("user");
  });

  it("strips 'list' suffix", () => {
    expect(extractEntityContext("itemList")).toBe("item");
  });

  it("strips 'update' suffix", () => {
    expect(extractEntityContext("postUpdate")).toBe("post");
  });

  it("returns empty for handler-only route id", () => {
    expect(extractEntityContext("handler")).toBe("");
  });
});

describe("generateEntityStructs", () => {
  it("returns empty for routes without responseFormat", async () => {
    const route = defineRoute({
      method: "GET",
      path: "/pets/:id",
      handler: "GetPet",
      response: z.object({ id: z.number(), name: z.string() }),
    });
    const app = defineApp({
      architecture: "clean",
      modules: [defineModule({ name: "pet", routes: [route] })],
    });
    const result = await compile({ app, dryRun: true });
    const routeAst = result.ast!.modules[0].routes[0];
    const diagnostics: Diagnostic[] = [];
    const output = generateEntityStructs("pet", [routeAst] as RouteAst[], diagnostics);
    expect(output).toBe("");
  });

  it("generates structs from routes with response and responseFormat", async () => {
    const wrapper: ResponseFormat = {
      kind: "ResponseFormat",
      wrapper: z.object({ data: z.string() }),
    };
    const route = defineRoute({
      method: "GET",
      path: "/pets/:id",
      handler: "GetPet",
      response: z.object({ id: z.number(), name: z.string() }),
      responseFormat: wrapper,
    });
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "pet",
          routes: [route],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const routeAst = result.ast!.modules[0].routes[0];
    const diagnostics: Diagnostic[] = [];
    const output = generateEntityStructs("pet", [routeAst] as RouteAst[], diagnostics);
    expect(output).not.toBe("");
    expect(output).toContain("Pet");
  });
});
