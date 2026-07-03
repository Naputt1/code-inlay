import { describe, expect, it } from "vitest";
import { validationZ } from "../src/schema/extras.js";
import { doesSchemaNeedFmt } from "../src/generators/validation.js";
import {
  defineValidationError,
  compile,
  defineApp,
  defineModule,
  defineRoute,
  z,
} from "../src/index.js";

describe("doesSchemaNeedFmt", () => {
  it("returns true when schema uses z.value()", () => {
    const schema = validationZ.object({ val: validationZ.value() });
    expect(doesSchemaNeedFmt(schema)).toBe(true);
  });

  it("returns false when schema has no z.value()", () => {
    const schema = validationZ.object({ field: validationZ.field(), tag: validationZ.tag() });
    expect(doesSchemaNeedFmt(schema)).toBe(false);
  });

  it("returns false for undefined schema", () => {
    expect(doesSchemaNeedFmt(undefined)).toBe(false);
  });

  it("detects z.value() inside nested arrays", () => {
    const schema = validationZ.object({
      items: validationZ.array(validationZ.object({ val: validationZ.value() })),
    });
    expect(doesSchemaNeedFmt(schema)).toBe(true);
  });

  it("detects z.value() inside optional", () => {
    const schema = validationZ.object({
      opt: validationZ.optional(validationZ.value()),
    });
    expect(doesSchemaNeedFmt(schema)).toBe(true);
  });
});

describe("validation error pipeline", () => {
  it("generates internal/httperr/resolve.go with validationError config", async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: "test",
          routes: [
            defineRoute({
              method: "POST",
              path: "/test",
              body: z.object({ name: z.string() }),
              handler: "CreateTest",
            }),
          ],
        }),
      ],
      options: {
        validationError: defineValidationError({
          httpStatus: 422,
          body: (vz) => vz.object({ message: vz.literal("validation failed") }),
        }),
      },
    });

    const r = await compile({ app, cwd: "/tmp", dryRun: true });
    expect(r.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const resolveFile = r.generation.files.find((f) => f.path === "internal/httperr/resolve.go");
    expect(resolveFile).toBeDefined();
    expect(
      resolveFile!.regions.some((reg) => reg.content.includes("func ResolveBindingError")),
    ).toBe(true);
  });

  it("handler code always calls httperr.ResolveBindingError", async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: "test",
          routes: [
            defineRoute({
              method: "POST",
              path: "/test",
              body: z.object({ name: z.string() }),
              handler: "CreateTest",
            }),
          ],
        }),
      ],
      options: {
        validationError: defineValidationError({
          httpStatus: 400,
          body: (vz) => vz.object({ msg: vz.literal("bad") }),
        }),
      },
    });

    const r = await compile({ app, cwd: "/tmp", dryRun: true });
    expect(r.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const handlerFile = r.generation.files.find((f) => f.path === "internal/test/handler.go");
    expect(handlerFile).toBeDefined();

    const handlerContent = handlerFile!.regions.map((reg) => reg.content).join("\n");
    expect(handlerContent).toContain("httperr.ResolveBindingError");
  });

  it("generates resolve.go with default implementation when no validationError config", async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: "test",
          routes: [
            defineRoute({
              method: "POST",
              path: "/test",
              body: z.object({ name: z.string() }),
              handler: "CreateTest",
            }),
          ],
        }),
      ],
    });

    const r = await compile({ app, cwd: "/tmp", dryRun: true });
    expect(r.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const resolveFile = r.generation.files.find((f) => f.path === "internal/httperr/resolve.go");
    expect(resolveFile).toBeDefined();
    const content = resolveFile!.regions.map((reg) => reg.content).join("\n");
    expect(content).toContain("func ResolveBindingError");
    expect(content).toContain("http.StatusBadRequest, gin.H");
    expect(content).not.toContain("validator.ValidationErrors");
  });

  it("sets correct httpStatus in resolve function", async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: "test",
          routes: [
            defineRoute({
              method: "POST",
              path: "/test",
              body: z.object({ name: z.string() }),
              handler: "CreateTest",
            }),
          ],
        }),
      ],
      options: {
        validationError: defineValidationError({
          httpStatus: 422,
          body: (vz) => vz.object({ msg: vz.literal("err") }),
        }),
      },
    });

    const r = await compile({ app, cwd: "/tmp", dryRun: true });
    const resolveFile = r.generation.files.find((f) => f.path === "internal/httperr/resolve.go");
    const content = resolveFile!.regions.map((reg) => reg.content).join("\n");
    expect(content).toContain("http.StatusUnprocessableEntity");
  });

  it("defaults fallback to 400 when no body schema", async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: "test",
          routes: [
            defineRoute({
              method: "POST",
              path: "/test",
              body: z.object({ name: z.string() }),
              handler: "CreateTest",
            }),
          ],
        }),
      ],
      options: {
        validationError: defineValidationError({
          httpStatus: 422,
          body: (vz) => vz.object({ msg: vz.literal("err") }),
        }),
      },
    });

    const r = await compile({ app, cwd: "/tmp", dryRun: true });
    const resolveFile = r.generation.files.find((f) => f.path === "internal/httperr/resolve.go");
    const content = resolveFile!.regions.map((reg) => reg.content).join("\n");
    expect(content).toContain("func ResolveBindingError");
    expect(content).toContain("http.StatusBadRequest");
  });
});
