/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import type { AppServiceDef, BackendExtension } from "../src/types/index.js";
import { generateServiceFile } from "../src/generators/service-goast.js";

describe("goast service generation", () => {
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

  it("7. extension splits multi-declaration content into separate parts", () => {
    const svc: AppServiceDef = svcBase({
      extension: "jwt",
    });
    const ext: BackendExtension = {
      name: "jwt",
      service: {
        optionsSchema: {} as any,
        generateFile: () => `type MyService interface {
\tGenerateToken() (string, error)
}

type myServiceImpl struct {
\tsecret string
}

func NewMyService() (*myServiceImpl, error) {
\treturn &myServiceImpl{secret: "default"}, nil
}`,
      },
    };
    const result = generateServiceFile(svc, [ext]);
    expect(result.length).toBe(3);

    const iface = result.find((p) => p.symbolName === "MyService");
    expect(iface).toBeDefined();
    expect(iface!.kind).toBe("interface");
    expect(iface!.expectsUserCode).toBe(false);
    expect(iface!.isStub).toBe(false);

    const struct_ = result.find((p) => p.symbolName === "myServiceImpl");
    expect(struct_).toBeDefined();
    expect(struct_!.kind).toBe("struct");
    expect(struct_!.expectsUserCode).toBe(true);
    expect(struct_!.isStub).toBe(false);

    const ctor = result.find((p) => p.symbolName === "NewMyService");
    expect(ctor).toBeDefined();
    expect(ctor!.kind).toBe("function");
    expect(ctor!.expectsUserCode).toBe(true);
    expect(ctor!.isStub).toBe(true);
    expect(ctor!.content).toContain('return &myServiceImpl{secret: "default"}, nil');
  });

  it("8. extension content with single declaration returns one part", () => {
    const svc: AppServiceDef = svcBase({
      extension: "simple",
    });
    const ext: BackendExtension = {
      name: "simple",
      service: {
        optionsSchema: {} as any,
        generateFile: () => `type SimpleService interface {
\tDoSomething() error
}`,
      },
    };
    const result = generateServiceFile(svc, [ext]);
    expect(result.length).toBe(1);
    expect(result[0].kind).toBe("interface");
    expect(result[0].symbolName).toBe("MyService");
  });
});
