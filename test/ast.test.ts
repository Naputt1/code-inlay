import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  normalizeArchitectureSelection,
  normalizeAdapterSelection,
  resolveArchitectureSelection,
  resolveAdapterSelection,
  buildAst,
} from "../src/ast.js";
import {
  defineApp,
  defineModule,
  defineRoute,
} from "../src/index.js";
import type { Diagnostic, ArchitectureRef, AdapterRef, ArchitectureSelection, AdapterSelection } from "../src/index.js";

describe("normalizeArchitectureSelection", () => {
  it("passes through existing selection", () => {
    const result = normalizeArchitectureSelection({ mode: "replace", refs: ["clean"] });
    expect(result.mode).toBe("replace");
    expect(result.refs).toEqual(["clean"]);
  });

  it("wraps single string ref", () => {
    const result = normalizeArchitectureSelection("minimal" as ArchitectureRef);
    expect(result.mode).toBe("replace");
    expect(result.refs).toEqual(["minimal"]);
  });

  it("wraps array of refs", () => {
    const result = normalizeArchitectureSelection(["clean" as ArchitectureRef, "minimal" as ArchitectureRef]);
    expect(result.mode).toBe("replace");
    expect(result.refs).toEqual(["clean", "minimal"]);
  });
});

describe("normalizeAdapterSelection", () => {
  it("passes through existing selection", () => {
    const result = normalizeAdapterSelection({ mode: "replace", refs: ["gin"] });
    expect(result.mode).toBe("replace");
    expect(result.refs).toEqual(["gin"]);
  });

  it("wraps single string ref", () => {
    const result = normalizeAdapterSelection("gin" as AdapterRef);
    expect(result.mode).toBe("replace");
    expect(result.refs).toEqual(["gin"]);
  });

  it("wraps array of refs", () => {
    const result = normalizeAdapterSelection(["gin" as AdapterRef]);
    expect(result.mode).toBe("replace");
    expect(result.refs).toEqual(["gin"]);
  });
});

describe("resolveArchitectureSelection", () => {
  it("uses child when mode is replace", () => {
    const parent: ArchitectureSelection = { mode: "replace", refs: ["clean" as ArchitectureRef] };
    const child: ArchitectureSelection = { mode: "replace", refs: ["minimal" as ArchitectureRef] };
    expect(resolveArchitectureSelection(parent, child)).toBe(child);
  });

  it("merges refs when child mode is append", () => {
    const parent: ArchitectureSelection = { mode: "replace", refs: ["clean" as ArchitectureRef] };
    const child: ArchitectureSelection = { mode: "append", refs: ["minimal" as ArchitectureRef] };
    const result = resolveArchitectureSelection(parent, child);
    expect(result.refs).toEqual(["clean", "minimal"]);
  });
});

describe("resolveAdapterSelection", () => {
  it("uses child when mode is replace", () => {
    const parent: AdapterSelection = { mode: "replace", refs: ["gin" as AdapterRef] };
    const child: AdapterSelection = { mode: "replace", refs: ["gin" as AdapterRef] };
    expect(resolveAdapterSelection(parent, child)).toBe(child);
  });

  it("merges refs when child mode is append", () => {
    const parent: AdapterSelection = { mode: "replace", refs: ["gin" as AdapterRef] };
    const child: AdapterSelection = { mode: "append", refs: ["gin" as AdapterRef] };
    const result = resolveAdapterSelection(parent, child);
    expect(result.refs).toEqual(["gin", "gin"]);
  });
});

describe("buildAst validation", () => {
  it("adds diagnostic for invalid module name", () => {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "bad name!",
          routes: [],
        }),
      ],
    });
    const diagnostics: Diagnostic[] = [];
    buildAst(app, diagnostics);
    expect(diagnostics.some((d) => d.code === "invalid-module-name")).toBe(true);
  });

  it("adds diagnostic for invalid route id", () => {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              id: "bad id!",
              method: "GET",
              path: "/users",
              handler: "GetUsers",
            }),
          ],
        }),
      ],
    });
    const diagnostics: Diagnostic[] = [];
    buildAst(app, diagnostics);
    expect(diagnostics.some((d) => d.code === "invalid-route-id")).toBe(true);
  });

  it("resolves adapter selection from route adapters field", () => {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "user",
          adapters: { mode: "replace", refs: ["gin"] },
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
    const diagnostics: Diagnostic[] = [];
    const ast = buildAst(app, diagnostics);
    expect(ast.router.adapter).toBeDefined();
  });

  it("adds diagnostic for duplicate route ids across modules", () => {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({ id: "get", method: "GET", path: "/users", handler: "GetUsers" }),
          ],
        }),
        defineModule({
          name: "admin",
          routes: [
            defineRoute({ id: "get", method: "GET", path: "/admin", handler: "GetAdmin" }),
          ],
        }),
      ],
    });
    const diagnostics: Diagnostic[] = [];
    buildAst(app, diagnostics);
    expect(diagnostics.some((d) => d.code === "duplicate-route-id")).toBe(false);
  });

  it("adds diagnostic for duplicate route ids within a module", () => {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({ id: "list", method: "GET", path: "/users", handler: "ListUsers" }),
            defineRoute({ id: "list", method: "GET", path: "/users2", handler: "ListUsers2" }),
          ],
        }),
      ],
    });
    const diagnostics: Diagnostic[] = [];
    buildAst(app, diagnostics);
    expect(diagnostics.some((d) => d.code === "duplicate-route-id")).toBe(true);
  });

  it("adds warning for responseFormat without entity placeholder", () => {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "user",
          responseFormat: { kind: "ResponseFormat", wrapper: z.object({ data: z.string() }) },
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
    const diagnostics: Diagnostic[] = [];
    buildAst(app, diagnostics);
    expect(diagnostics.some((d) => d.code === "response-format-no-entity")).toBe(true);
  });

  it("adds diagnostic for body on GET route", () => {
    const app = defineApp({
      architecture: "clean",
      modules: [
        defineModule({
          name: "user",
          routes: [
            {
              kind: "RouteDefinition",
              id: "getBad",
              method: "GET",
              path: "/users",
              handler: "GetUser",
              body: z.object({ name: z.string() }),
              query: undefined,
              response: undefined,
              responseFormat: undefined,
              architecture: undefined,
              adapter: undefined,
              adapters: undefined,
              usecaseGroup: undefined,
              middleware: [],
              metadata: {},
            },
          ],
        }),
      ],
    });
    const diagnostics: Diagnostic[] = [];
    buildAst(app, diagnostics);
    expect(diagnostics.some((d) => d.code === "body-not-allowed")).toBe(true);
  });
});
