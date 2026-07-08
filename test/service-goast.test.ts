import { describe, it, expect } from "vitest";
import type { AppServiceDef, BackendExtension } from "../src/types/index.js";
import { generateServiceFile } from "../src/generators/service.js";

describe("go-ast service generation", () => {
  const svcBase = (overrides: Partial<AppServiceDef>): AppServiceDef => ({
    name: "my",
    typeName: "MyService",
    ...overrides,
  });

  it("1. bare service — no config, no db, no close", () => {
    const result = generateServiceFile(svcBase({}));
    expect(result.length).toBe(3);
  });

  it("2. service with config only", () => {
    const result = generateServiceFile(svcBase({ env: ["DATABASE_URL"] }), undefined, "myapp");
    expect(result.length).toBe(3);
  });

  it("3. service with db accessor only", () => {
    const result = generateServiceFile(
      svcBase({ dbAccessor: "DB", dbType: "*sql.DB", dbTypePkg: "database/sql" }),
    );
    expect(result.some((p) => p.kind === "struct")).toBe(true);
    expect(result.some((p) => p.kind === "interface")).toBe(true);
  });

  it("4. service with close method only", () => {
    const result = generateServiceFile(svcBase({ close: true }));
    expect(result.length).toBe(4);
  });

  it("5. service with config + db + close", () => {
    const result = generateServiceFile(
      svcBase({
        env: ["DATABASE_URL"],
        close: true,
        dbAccessor: "DB",
        dbType: "*sql.DB",
        dbTypePkg: "database/sql",
      }),
      undefined,
      "myapp",
    );
    expect(result.length).toBe(5);
  });

  it("6. extension-based service passthrough", () => {
    const svc: AppServiceDef = svcBase({
      extension: "my-ext",
      extensionOptions: { foo: "bar" },
      close: true,
    });
    const ext: BackendExtension = {
      name: "my-ext",
      service: {
        optionsSchema: {} as any,
        generateFile: (ctx) => {
          expect(ctx.name).toBe("my");
          expect(ctx.close).toBe(true);
          expect(ctx.options).toEqual({ foo: "bar" });
          return "// extension generated code";
        },
      },
    };
    const result = generateServiceFile(svc, [ext]);
    expect(result.length).toBe(1);
    expect(result[0].kind).toBe("interface");
    expect(result[0].content).toBe("// extension generated code");
  });
});
