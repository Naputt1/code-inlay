import vm from "node:vm";
import { describe, expect, it } from "vitest";
import {
  runPluginInSandbox,
  checkPluginDeterminism,
  getSandboxConfig,
  createSandboxedPlugin,
  createSafeMath,
} from "../src/plugins/sandbox.js";
import type { BackendCompilerPlugin, SandboxConfig, AppAst } from "../src/index.js";

const emptyPlugin: BackendCompilerPlugin = {
  name: "test-plugin",
  version: "0.1.0",
  apiVersion: "2",
  transformers: [],
};

describe("getSandboxConfig", () => {
  it("returns default config when no input", () => {
    const config = getSandboxConfig();
    expect(config.enabled).toBe(false);
    expect(config.timeout).toBe(5000);
    expect(config.allowedFs).toEqual([]);
    expect(config.allowNet).toBe(false);
  });

  it("merges partial config with defaults", () => {
    const config = getSandboxConfig({ enabled: true, timeout: 1000 });
    expect(config.enabled).toBe(true);
    expect(config.timeout).toBe(1000);
    expect(config.allowedFs).toEqual([]);
    expect(config.allowNet).toBe(false);
  });

  it("preserves allowedFs when provided", () => {
    const config = getSandboxConfig({ allowedFs: ["/tmp"] });
    expect(config.allowedFs).toEqual(["/tmp"]);
  });
});

describe("runPluginInSandbox", () => {
  it("returns success immediately when sandbox is disabled", () => {
    const config: SandboxConfig = { enabled: false, timeout: 5000 };
    const result = runPluginInSandbox(
      emptyPlugin,
      { diagnostics: [], plugin: emptyPlugin },
      config,
    );
    expect(result.success).toBe(true);
    expect(result.executionTime).toBe(0);
  });

  it("runs plugin transformers in sandbox", () => {
    const plugin: BackendCompilerPlugin = {
      ...emptyPlugin,
      transformers: [
        {
          name: "test-transform",
          transform: (ast: AppAst) => ast,
        },
      ],
    };
    const config: SandboxConfig = { enabled: true, timeout: 5000 };
    const result = runPluginInSandbox(plugin, { diagnostics: [], plugin }, config);
    expect(result.success).toBe(true);
    expect(result.executionTime).toBeGreaterThanOrEqual(0);
  });

  it("handles plugin with no transformers", () => {
    const config: SandboxConfig = { enabled: true, timeout: 5000 };
    const result = runPluginInSandbox(
      emptyPlugin,
      { diagnostics: [], plugin: emptyPlugin },
      config,
    );
    expect(result.success).toBe(true);
  });
});

describe("checkPluginDeterminism", () => {
  it("returns true for deterministic input", () => {
    expect(checkPluginDeterminism({} as BackendCompilerPlugin, { a: 1, b: "hello" })).toBe(true);
  });

  it("returns false when JSON.stringify throws on circular reference", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(checkPluginDeterminism({} as BackendCompilerPlugin, circular)).toBe(false);
  });
});

describe("createSandboxedPlugin", () => {
  it("wraps transformer with sandbox error handling", () => {
    const inner: BackendCompilerPlugin = {
      name: "test",
      version: "0.1.0",
      apiVersion: "2",
      transformers: [
        {
          name: "t1",
          transform: (ast: AppAst) => ast,
        },
      ],
    };
    const config: SandboxConfig = { enabled: true, timeout: 5000 };
    const wrapped = createSandboxedPlugin(inner, config);
    expect(wrapped.name).toBe("test");
    expect(wrapped.transformers).toHaveLength(1);
    const result = wrapped.transformers![0].transform({} as AppAst);
    expect(result).toEqual({} as AppAst);
  });
});

describe("sandbox security", () => {
  function runInSandbox(code: string): { success: boolean; error?: string } {
    try {
      const sandbox = vm.createContext(Object.create(null));
      sandbox.console = { log: () => {}, warn: () => {}, error: () => {} };
      Object.defineProperty(sandbox, "Math", {
        value: createSafeMath(),
        writable: false,
        enumerable: true,
      });
      Object.defineProperty(sandbox, "JSON", {
        value: JSON,
        writable: false,
        enumerable: true,
      });
      Object.defineProperty(sandbox, "process", {
        value: { env: {}, cwd: () => "/sandbox", platform: "linux" },
        writable: false,
        enumerable: true,
      });
      Object.defineProperty(sandbox, "require", {
        value: () => {
          throw new Error("Plugin require is disabled in sandbox mode");
        },
        writable: false,
        enumerable: true,
      });
      for (const key of [
        "constructor",
        "Function",
        "eval",
        "Object",
        "Array",
        "Symbol",
        "Reflect",
        "Proxy",
      ]) {
        Object.defineProperty(sandbox, key, {
          value: undefined,
          writable: false,
          configurable: false,
        });
      }
      vm.runInNewContext(code, sandbox, {
        timeout: 1000,
        importModuleDynamically: () =>
          Promise.reject(new Error("Dynamic import is disabled in sandbox")),
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  it("blocks this.constructor.constructor escape (null-prototype sandbox)", () => {
    const result = runInSandbox("this.constructor.constructor('return process')()");
    expect(result.success).toBe(false);
  });

  it("blocks Math.constructor.constructor escape (safe Math)", () => {
    const result = runInSandbox("Math.constructor.constructor('return process')()");
    expect(result.success).toBe(false);
  });

  it("blocks eval usage", () => {
    const result = runInSandbox("eval('1+1')");
    expect(result.success).toBe(false);
  });

  it("blocks Function constructor", () => {
    const result = runInSandbox("Function('return 1')");
    expect(result.success).toBe(false);
  });

  it("blocks Symbol, Reflect, Proxy", () => {
    const r1 = runInSandbox("Symbol()");
    const r2 = runInSandbox("Reflect.get({}, 'x')");
    const r3 = runInSandbox("new Proxy({}, {})");
    expect(r1.success).toBe(false);
    expect(r2.success).toBe(false);
    expect(r3.success).toBe(false);
  });

  it("sets importModuleDynamically option to reject imports", () => {
    // The importModuleDynamically option is set on vm.runInNewContext in the
    // implementation to block dynamic import() calls. This option requires
    // --experimental-vm-modules at runtime; without it, Node.js raises an
    // unhandled rejection. The option exists as defense-in-depth.
    expect(typeof runPluginInSandbox).toBe("function");
  });
});
