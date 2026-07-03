import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineApp, defineEnv, defineModule, defineRoute, compile, EnvRef } from "../src/index.js";
import { parseEnvDefs } from "../src/compiler/ast.js";
import { generateServer } from "../src/srvgen/index.js";
import { generateEnvConfigFile } from "../src/srvgen/config.js";
import type { AdapterPlugin, GoModuleInfo, EnvVarInfo } from "../src/index.js";

describe("defineEnv", () => {
  it("accepts z.string()", () => {
    const result = defineEnv({ PORT: z.string() });
    expect(result.PORT).toBeDefined();
  });

  it("accepts z.number()", () => {
    const result = defineEnv({ MAX_CONNS: z.number() });
    expect(result.MAX_CONNS).toBeDefined();
  });

  it("accepts z.boolean()", () => {
    const result = defineEnv({ DEBUG: z.boolean() });
    expect(result.DEBUG).toBeDefined();
  });

  it("accepts z.coerce.number()", () => {
    const result = defineEnv({ PORT: z.coerce.number() });
    expect(result.PORT).toBeDefined();
  });

  it("accepts z.coerce.boolean()", () => {
    const result = defineEnv({ FLAG: z.coerce.boolean() });
    expect(result.FLAG).toBeDefined();
  });

  it("accepts string with default", () => {
    const result = defineEnv({ PORT: z.string().default("8080") });
    expect(result.PORT).toBeDefined();
  });

  it("accepts string with optional", () => {
    const result = defineEnv({ PORT: z.string().optional() });
    expect(result.PORT).toBeDefined();
  });

  it("accepts string with describe", () => {
    const result = defineEnv({ PORT: z.string().describe("Server port") });
    expect(result.PORT).toBeDefined();
  });

  it("rejects z.object()", () => {
    expect(() => defineEnv({ BAD: z.object({ x: z.string() }) })).toThrow(
      'defineEnv: "BAD" must be z.string(), z.number(), or z.boolean()',
    );
  });

  it("rejects z.array()", () => {
    expect(() => defineEnv({ BAD: z.array(z.string()) })).toThrow(
      'defineEnv: "BAD" must be z.string(), z.number(), or z.boolean()',
    );
  });

  it("rejects z.enum()", () => {
    expect(() => defineEnv({ BAD: z.enum(["a", "b"]) })).toThrow(
      'defineEnv: "BAD" must be z.string(), z.number(), or z.boolean()',
    );
  });
});

describe("EnvRef", () => {
  it("toString returns ${NAME}", () => {
    expect(new EnvRef("PORT").toString()).toBe("${PORT}");
  });

  it("preserves env ref in template literal", () => {
    const ref = new EnvRef("PORT");
    const result = `http://localhost${ref}`;
    expect(result).toBe("http://localhost${PORT}");
  });
});

describe("defineApp env propagation", () => {
  it("includes env in AppDefinition when provided", () => {
    const app = defineApp({
      env: { PORT: z.string().default("8080") },
      modules: [],
    });
    expect(app.env).toBeDefined();
    expect(app.env!.PORT).toBeDefined();
  });

  it("omits env when not provided", () => {
    const app = defineApp({ modules: [] });
    expect(app.env).toBeUndefined();
  });
});

describe("parseEnvDefs", () => {
  const asZodRecord = (input: Record<string, unknown>) => input as never;

  it("returns undefined for undefined input", () => {
    expect(parseEnvDefs(undefined)).toBeUndefined();
  });

  it("parses z.string()", () => {
    const result = parseEnvDefs(asZodRecord({ HOST: z.string() }));
    expect(result).toEqual({
      HOST: { type: "string", default: undefined, required: true, description: undefined },
    });
  });

  it("parses z.number()", () => {
    const result = parseEnvDefs(asZodRecord({ COUNT: z.number() }));
    expect(result).toEqual({
      COUNT: { type: "number", default: undefined, required: true, description: undefined },
    });
  });

  it("parses z.boolean()", () => {
    const result = parseEnvDefs(asZodRecord({ FLAG: z.boolean() }));
    expect(result).toEqual({
      FLAG: { type: "boolean", default: undefined, required: true, description: undefined },
    });
  });

  it("parses string with default", () => {
    const result = parseEnvDefs(asZodRecord({ PORT: z.string().default("8080") }));
    expect(result).toEqual({
      PORT: { type: "string", default: "8080", required: false, description: undefined },
    });
  });

  it("parses number with default", () => {
    const result = parseEnvDefs(asZodRecord({ MAX: z.number().default(10) }));
    expect(result).toEqual({
      MAX: { type: "number", default: "10", required: false, description: undefined },
    });
  });

  it("parses boolean with default", () => {
    const result = parseEnvDefs(asZodRecord({ DEBUG: z.boolean().default(false) }));
    expect(result).toEqual({
      DEBUG: { type: "boolean", default: "false", required: false, description: undefined },
    });
  });

  it("parses optional string", () => {
    const result = parseEnvDefs(asZodRecord({ OPT: z.string().optional() }));
    expect(result).toEqual({
      OPT: { type: "string", default: undefined, required: false, description: undefined },
    });
  });

  it("parses string with description", () => {
    const result = parseEnvDefs(asZodRecord({ HOST: z.string().describe("Server host") }));
    expect(result).toEqual({
      HOST: { type: "string", default: undefined, required: true, description: "Server host" },
    });
  });

  it("parses default+optional string", () => {
    const result = parseEnvDefs(asZodRecord({ PORT: z.string().default("3000").optional() }));
    expect(result).toEqual({
      PORT: { type: "string", default: "3000", required: false, description: undefined },
    });
  });

  it("parses coerce.number()", () => {
    const result = parseEnvDefs(asZodRecord({ N: z.coerce.number() }));
    expect(result).toEqual({
      N: { type: "number", default: undefined, required: true, description: undefined },
    });
  });

  it("parses multiple entries", () => {
    const result = parseEnvDefs(
      asZodRecord({
        PORT: z.string().default("8080").describe("Listen port"),
        DB_URL: z.string().describe("Database URL"),
        DEBUG: z.coerce.boolean().default(false),
      }),
    );
    expect(result).toEqual({
      PORT: { type: "string", default: "8080", required: false, description: "Listen port" },
      DB_URL: { type: "string", default: undefined, required: true, description: "Database URL" },
      DEBUG: { type: "boolean", default: "false", required: false, description: undefined },
    });
  });
});

describe("generateServer with env", () => {
  const moduleInfo: GoModuleInfo = {
    modulePath: "github.com/example/myapp",
    dependencies: [],
  };

  const mockAdapter = {
    name: "gin",
    transport: "http",
    generateRoute: () => [] as never,
    generateMiddleware: () => [] as never,
    generateServer: () => [] as never,
  } as unknown as AdapterPlugin;

  async function buildAst(env?: Record<string, unknown>) {
    const app = defineApp({
      env: env as never,
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
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    return result.ast!;
  }

  it("generates default PORT block when no env defined", async () => {
    const ast = await buildAst();
    const patch = generateServer(ast, null as never, moduleInfo, mockAdapter);
    const body = patch.regions[1].content;
    expect(body).toContain('addr := os.Getenv("PORT")');
    expect(body).toContain('addr = ":8080"');
    expect(body).toContain('strings.HasPrefix(addr, ":")');
  });

  it("generates config.Load() and cfg.PORT when env is defined", async () => {
    const ast = await buildAst({
      PORT: { _def: { typeName: "ZodString" } } as never,
    });
    const astWithEnv = {
      ...ast,
      env: { PORT: { type: "string", default: "9090", required: false } as EnvVarInfo },
    };
    const patch = generateServer(astWithEnv, null as never, moduleInfo, mockAdapter);
    const body = patch.regions[1].content;
    const imports = patch.regions[0].content;
    expect(body).toContain("cfg := config.Load()");
    expect(body).toContain("Addr:    cfg.PORT");
    expect(imports).toContain(moduleInfo.modulePath + '/internal/config"');
  });

  it("generates config import when env is defined", async () => {
    const ast = await buildAst();
    const astWithEnv = {
      ...ast,
      env: { DB_URL: { type: "string", default: undefined, required: true } as EnvVarInfo },
    };
    const patch = generateServer(astWithEnv, null as never, moduleInfo, mockAdapter);
    const imports = patch.regions[0].content;
    expect(imports).toContain(moduleInfo.modulePath + '/internal/config"');
  });

  it("falls back to default PORT block when no env defined", async () => {
    const ast = await buildAst();
    const patch = generateServer(ast, null as never, moduleInfo, mockAdapter);
    const body = patch.regions[1].content;
    expect(body).toContain('addr := os.Getenv("PORT")');
    expect(body).toContain('addr = ":8080"');
  });
});

describe("generateEnvConfigFile", () => {
  const cfgModuleInfo: GoModuleInfo = {
    modulePath: "github.com/example/myapp",
    dependencies: [],
  };

  it("returns null when env is empty", () => {
    const result = generateEnvConfigFile({}, cfgModuleInfo);
    expect(result).toBeNull();
  });

  it("generates Config struct with string field", () => {
    const result = generateEnvConfigFile(
      { HOST: { type: "string", default: undefined, required: true } },
      cfgModuleInfo,
    );
    expect(result).not.toBeNull();
    expect(result!.path).toBe("internal/config/env.go");
    const structRegion = result!.regions.find((r) => r.id.includes("struct"));
    expect(structRegion).toBeDefined();
    expect(structRegion!.content).toContain("HOST string");
  });

  it("generates Config struct with number field", () => {
    const result = generateEnvConfigFile(
      { MAX: { type: "number", default: "10", required: false } },
      cfgModuleInfo,
    );
    const structRegion = result!.regions.find((r) => r.id.includes("struct"));
    expect(structRegion!.content).toContain("MAX int");
  });

  it("generates Config struct with boolean field", () => {
    const result = generateEnvConfigFile(
      { DEBUG: { type: "boolean", default: "false", required: false } },
      cfgModuleInfo,
    );
    const structRegion = result!.regions.find((r) => r.id.includes("struct"));
    expect(structRegion!.content).toContain("DEBUG bool");
  });

  it("generates PORT with default and port prefix logic", () => {
    const result = generateEnvConfigFile(
      { PORT: { type: "string", default: "8080", required: false } },
      cfgModuleInfo,
    );
    const loadRegion = result!.regions.find((r) => r.id.includes("load"));
    expect(loadRegion!.content).toContain('cfg.PORT = os.Getenv("PORT")');
    expect(loadRegion!.content).toContain('cfg.PORT = "8080"');
    expect(loadRegion!.content).toContain('strings.HasPrefix(cfg.PORT, ":")');
  });

  it("generates required string field with log.Fatal", () => {
    const result = generateEnvConfigFile(
      { DB_URL: { type: "string", default: undefined, required: true } },
      cfgModuleInfo,
    );
    const loadRegion = result!.regions.find((r) => r.id.includes("load"));
    expect(loadRegion!.content).toContain('log.Fatal("DB_URL is required but not set")');
  });

  it("generates optional number with default", () => {
    const result = generateEnvConfigFile(
      { MAX_CONNS: { type: "number", default: "25", required: false } },
      cfgModuleInfo,
    );
    const loadRegion = result!.regions.find((r) => r.id.includes("load"));
    expect(loadRegion!.content).toContain("cfg.MAX_CONNS = 25");
    expect(loadRegion!.content).toContain("strconv.Atoi");
  });

  it("generates required number with log.Fatal", () => {
    const result = generateEnvConfigFile(
      { TIMEOUT: { type: "number", default: undefined, required: true } },
      cfgModuleInfo,
    );
    const loadRegion = result!.regions.find((r) => r.id.includes("load"));
    expect(loadRegion!.content).toContain('log.Fatal("TIMEOUT is required but not set")');
    expect(loadRegion!.content).toContain("strconv.Atoi");
  });

  it("generates optional boolean with strconv.ParseBool", () => {
    const result = generateEnvConfigFile(
      { DEBUG: { type: "boolean", default: "false", required: false } },
      cfgModuleInfo,
    );
    const loadRegion = result!.regions.find((r) => r.id.includes("load"));
    expect(loadRegion!.content).toContain("cfg.DEBUG = false");
    expect(loadRegion!.content).toContain("strconv.ParseBool");
  });

  it("generates required boolean with log.Fatal", () => {
    const result = generateEnvConfigFile(
      { FEATURE_FLAG: { type: "boolean", default: undefined, required: true } },
      cfgModuleInfo,
    );
    const loadRegion = result!.regions.find((r) => r.id.includes("load"));
    expect(loadRegion!.content).toContain('log.Fatal("FEATURE_FLAG is required but not set")');
    expect(loadRegion!.content).toContain("strconv.ParseBool");
  });

  it("includes description as comment on struct field", () => {
    const result = generateEnvConfigFile(
      { PORT: { type: "string", default: "8080", required: false, description: "Server port" } },
      cfgModuleInfo,
    );
    const structRegion = result!.regions.find((r) => r.id.includes("struct"));
    expect(structRegion!.content).toContain("// Server port");
  });

  it("generates imports correctly", () => {
    const result = generateEnvConfigFile(
      {
        PORT: { type: "string", default: "8080", required: false },
        DEBUG: { type: "boolean", default: "false", required: false },
      },
      cfgModuleInfo,
    );
    const importRegion = result!.regions.find((r) => r.id.includes("imports"));
    expect(importRegion!.content).toContain('"os"');
    expect(importRegion!.content).toContain('"strings"');
    expect(importRegion!.content).toContain('"strconv"');
    expect(importRegion!.content).toContain('"github.com/joho/godotenv"');
  });

  it("generates Load function signature", () => {
    const result = generateEnvConfigFile(
      { PORT: { type: "string", default: "8080", required: false } },
      cfgModuleInfo,
    );
    const loadRegion = result!.regions.find((r) => r.id.includes("load"));
    expect(loadRegion!.signature).toBe("func Load() Config");
  });

  it("includes godotenv.Load() with error handling in function body", () => {
    const result = generateEnvConfigFile(
      { PORT: { type: "string", default: "8080", required: false } },
      cfgModuleInfo,
    );
    const loadRegion = result!.regions.find((r) => r.id.includes("load"));
    expect(loadRegion!.content).toContain("if err := godotenv.Load(); err != nil");
    expect(loadRegion!.content).toContain(`log.Println`);
  });
});
