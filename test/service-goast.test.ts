import { describe, it, expect } from "vitest";
import type { AppServiceDef, BackendExtension } from "../src/types/index.js";
import {
  generateServiceFile,
  generateServiceFileLegacy,
} from "../src/generators/service.js";

function compare(
  svc: AppServiceDef,
  extensions?: BackendExtension[],
  modulePath?: string,
) {
  const old_ = generateServiceFileLegacy(svc, extensions, modulePath);
  const new_ = generateServiceFile(svc, extensions, modulePath);
  expect(new_.length).toBe(old_.length);
  for (let i = 0; i < old_.length; i++) {
    expect(new_[i].kind).toBe(old_[i].kind);
    expect(new_[i].symbolName).toBe(old_[i].symbolName);
    expect(new_[i].content).toBe(old_[i].content);
    if (new_[i].signature !== undefined || old_[i].signature !== undefined) {
      expect(new_[i].signature).toBe(old_[i].signature);
    }
    expect(new_[i].expectsUserCode).toBe(old_[i].expectsUserCode);
    expect(new_[i].isStub).toBe(old_[i].isStub);
    if (new_[i].receiver !== undefined || old_[i].receiver !== undefined) {
      expect(new_[i].receiver).toBe(old_[i].receiver);
    }
  }
}

describe("go-ast service generation", () => {
  const svcBase = (overrides: Partial<AppServiceDef>): AppServiceDef => ({
    name: "my",
    typeName: "MyService",
    ...overrides,
  });

  it("1. bare service — no config, no db, no close", () => {
    compare(svcBase({}));
  });

  it("2. service with config only", () => {
    compare(svcBase({ env: ["DATABASE_URL"] }), undefined, "myapp");
  });

  it("3. service with db accessor only", () => {
    compare(
      svcBase({
        dbAccessor: "DB",
        dbType: "*sql.DB",
        dbTypePkg: "database/sql",
      }),
    );
  });

  it("4. service with close method only", () => {
    compare(svcBase({ close: true }));
  });

  it("5. service with config + db + close", () => {
    compare(
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
    const old_ = generateServiceFileLegacy(svc, [ext]);
    const new_ = generateServiceFile(svc, [ext]);
    expect(new_.length).toBe(1);
    expect(new_[0].kind).toBe("interface");
    expect(new_[0].content).toBe("// extension generated code");
    expect(new_[0].content).toBe(old_[0].content);
  });
});
