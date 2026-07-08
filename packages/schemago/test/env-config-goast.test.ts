/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import type { EnvVarInfo, GoModuleInfo } from "../src/index.js";
import { generateEnvConfigFile as original } from "../src/srvgen/config-goast.js";
import { generateEnvConfigFile as goast } from "../src/srvgen/config-goast.js";

const cfgModuleInfo: GoModuleInfo = {
  modulePath: "github.com/example/myapp",
  dependencies: [],
};

function testMatch(env: Record<string, EnvVarInfo>) {
  const orig = original(env, cfgModuleInfo);
  const goastResult = goast(env, cfgModuleInfo);
  if (orig === null) {
    expect(goastResult).toBeNull();
    return;
  }
  expect(goastResult).not.toBeNull();
  expect(goastResult!.path).toBe(orig!.path);
  expect(goastResult!.regions.length).toBe(orig!.regions.length);
  for (let i = 0; i < orig!.regions.length; i++) {
    const o = orig!.regions[i];
    const g = goastResult!.regions[i];
    expect(g.id).toBe(o.id);
    expect(g.stableHash).toBe(o.stableHash);
    expect(g.content).toBe(o.content);
    if ("imports" in o || "imports" in g) {
      expect((g as any).imports).toEqual((o as any).imports);
    }
    expect(g.symbolName).toBe(o.symbolName);
    expect(g.kind).toBe(o.kind);
    expect(g.signature).toBe(o.signature);
  }
}

describe("generateEnvConfigFile goast matches original", () => {
  it("empty env returns null", () => {
    testMatch({});
  });

  it("single required string field", () => {
    testMatch({ HOST: { type: "string", default: undefined, required: true } });
  });

  it("single string with default", () => {
    testMatch({ HOST: { type: "string", default: "localhost", required: false } });
  });

  it("single optional string without default", () => {
    testMatch({ HOST: { type: "string", default: undefined, required: false } });
  });

  it("single required number field", () => {
    testMatch({ MAX: { type: "number", default: undefined, required: true } });
  });

  it("single number with default", () => {
    testMatch({ MAX: { type: "number", default: "25", required: false } });
  });

  it("single required boolean field", () => {
    testMatch({ DEBUG: { type: "boolean", default: undefined, required: true } });
  });

  it("single boolean with default", () => {
    testMatch({ DEBUG: { type: "boolean", default: "true", required: false } });
  });

  it("PORT with default", () => {
    testMatch({ PORT: { type: "string", default: "8080", required: false } });
  });

  it("PORT required (no default)", () => {
    testMatch({ PORT: { type: "string", default: undefined, required: true } });
  });

  it("string field with description", () => {
    testMatch({
      PORT: { type: "string", default: "8080", required: false, description: "Server port" },
    });
  });

  it("mixed fields", () => {
    testMatch({
      PORT: { type: "string", default: "8080", required: false, description: "Server port" },
      DB_URL: { type: "string", default: undefined, required: true, description: "Database URL" },
      DEBUG: { type: "boolean", default: "false", required: false },
      MAX_CONNS: { type: "number", default: "100", required: false },
      TIMEOUT: { type: "number", default: undefined, required: true },
    });
  });

  it("all field types without defaults", () => {
    testMatch({
      HOST: { type: "string", default: undefined, required: true },
      PORT: { type: "string", default: undefined, required: true },
      COUNT: { type: "number", default: undefined, required: true },
      FLAG: { type: "boolean", default: undefined, required: true },
    });
  });

  it("all field types with defaults", () => {
    testMatch({
      HOST: { type: "string", default: "0.0.0.0", required: false },
      PORT: { type: "string", default: "9090", required: false },
      MAX: { type: "number", default: "50", required: false },
      DEBUG: { type: "boolean", default: "true", required: false },
    });
  });

  it("multiple descriptions", () => {
    testMatch({
      HOST: { type: "string", default: "0.0.0.0", required: false, description: "Bind address" },
      PORT: { type: "string", default: "8080", required: false, description: "Listen port" },
      DEBUG: {
        type: "boolean",
        default: "false",
        required: false,
        description: "Enable debug mode",
      },
    });
  });

  it("optional string without default", () => {
    testMatch({
      OPTIONAL_STR: { type: "string", default: undefined, required: false },
    });
  });
});
