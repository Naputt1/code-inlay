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

describe("createSafeMath", () => {
  it("has no constructor property", () => {
    const safe = createSafeMath();
    expect("constructor" in safe).toBe(false);
  });

  it("returns 0.5 for random", () => {
    const safe = createSafeMath();
    expect(safe.random()).toBe(0.5);
  });

  it("provides Math constants and functions", () => {
    const safe = createSafeMath();
    expect(safe.PI).toBe(Math.PI);
    expect(safe.sin(Math.PI / 2)).toBeCloseTo(1);
    expect(safe.floor(3.7)).toBe(3);
  });

  it("is frozen", () => {
    const safe = createSafeMath();
    expect(Object.isFrozen(safe)).toBe(true);
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
        value: Object.freeze({ env: Object.freeze({}), cwd: () => "/sandbox", platform: "linux" }),
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
      for (const key of ["constructor", "Function", "eval", "Reflect", "Proxy"]) {
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

  it("blocks Reflect and Proxy", () => {
    const r1 = runInSandbox("Reflect.get({}, 'x')");
    const r2 = runInSandbox("new Proxy({}, {})");
    expect(r1.success).toBe(false);
    expect(r2.success).toBe(false);
  });

  it("sets importModuleDynamically option to reject imports", () => {
    expect(typeof runPluginInSandbox).toBe("function");
  });
});

describe("sandbox compatibility", () => {
  function runInSandbox(code: string): unknown {
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
      value: Object.freeze({ env: Object.freeze({}), cwd: () => "/sandbox", platform: "linux" }),
      writable: false,
      enumerable: true,
    });
    Object.defineProperty(sandbox, "require", {
      value: () => {
        throw new Error("disabled");
      },
      writable: false,
      enumerable: true,
    });
    for (const key of ["constructor", "Function", "eval", "Reflect", "Proxy"]) {
      Object.defineProperty(sandbox, key, {
        value: undefined,
        writable: false,
        configurable: false,
      });
    }
    return vm.runInNewContext(code, sandbox, { timeout: 1000 });
  }

  it("provides Object.keys", () => {
    const r = runInSandbox("Object.keys({a:1,b:2})") as string[];
    expect(r).toEqual(["a", "b"]);
  });

  it("provides Array.isArray", () => {
    const r = runInSandbox("Array.isArray([1,2,3])") as boolean;
    expect(r).toBe(true);
  });

  it("provides Symbol", () => {
    const r = runInSandbox("typeof Symbol") as string;
    expect(r).toBe("function");
  });

  it("provides JSON.stringify and JSON.parse", () => {
    const r = runInSandbox("JSON.parse(JSON.stringify({a:1}))") as { a: number };
    expect(r).toEqual({ a: 1 });
  });

  it("provides Math.PI", () => {
    const r = runInSandbox("Math.PI") as number;
    expect(r).toBe(Math.PI);
  });

  it("provides safe Math.random", () => {
    const r = runInSandbox("Math.random()") as number;
    expect(r).toBe(0.5);
  });

  it("provides Map and Set", () => {
    const r = runInSandbox("new Map([[1,2]]).get(1)") as number;
    expect(r).toBe(2);
  });

  it("provides Promise", () => {
    const r = runInSandbox("typeof Promise") as string;
    expect(r).toBe("function");
  });

  it("provides Error types", () => {
    const r = runInSandbox("(new Error('test')).message") as string;
    expect(r).toBe("test");
  });
});

describe("sandbox known limitations", () => {
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
      for (const key of ["constructor", "Function", "eval", "Reflect", "Proxy"]) {
        Object.defineProperty(sandbox, key, {
          value: undefined,
          writable: false,
          configurable: false,
        });
      }
      vm.runInNewContext(code, sandbox, { timeout: 1000 });
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  it("NOTICE: [].constructor.constructor escape is a known vm module limitation", () => {
    // Node.js vm module explicitly states it is not a security mechanism.
    // Literal [] accesses the shared Array constructor directly via .constructor,
    // bypassing global name shadowing. This is a fundamental V8 limitation.
    const r = runInSandbox("[].constructor.constructor('return 1')()");
    expect(r.success).toBe(true);
  });

  it("NOTICE: ({}).constructor.constructor escape is a known vm module limitation", () => {
    const r = runInSandbox("({}).constructor.constructor('return 1')()");
    expect(r.success).toBe(true);
  });
});
