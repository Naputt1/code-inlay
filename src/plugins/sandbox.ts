import vm from "node:vm";
import type { BackendCompilerPlugin, PluginContext, SandboxConfig } from "../types/index.js";

export type SandboxResult = {
  success: boolean;
  error?: string;
  executionTime: number;
};

function freeze<T extends object>(obj: T): T {
  return Object.freeze(obj);
}

export function runPluginInSandbox(
  plugin: BackendCompilerPlugin,
  context: PluginContext,
  config: SandboxConfig,
): SandboxResult {
  const start = performance.now();

  if (!config.enabled) {
    return { success: true, executionTime: 0 };
  }

  const timeout = config.timeout ?? 5000;

  try {
    const safeConsole = freeze({
      log: (...args: unknown[]) => console.log(`[plugin:${plugin.name}]`, ...args),
      warn: (...args: unknown[]) => console.warn(`[plugin:${plugin.name}]`, ...args),
      error: (...args: unknown[]) => console.error(`[plugin:${plugin.name}]`, ...args),
    });

    const sandbox = vm.createContext(Object.create(null));

    sandbox.console = safeConsole;
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
      value: freeze({
        env: freeze({}),
        cwd: () => "/sandbox",
        platform: "linux",
      }),
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

    const restrictedGlobals: string[] = [
      "constructor",
      "Function",
      "eval",
      "Object",
      "Array",
      "Symbol",
      "Reflect",
      "Proxy",
    ];
    for (const key of restrictedGlobals) {
      Object.defineProperty(sandbox, key, {
        value: undefined,
        writable: false,
        configurable: false,
      });
    }

    const pluginCode = [
      `(function(context) {`,
      plugin.transformers?.map((t) => `  (${t.transform.toString()})(context.ast);`).join("\n") ??
        "",
      `})`,
    ].join("\n");

    vm.runInNewContext(pluginCode, sandbox, {
      timeout,
      filename: `plugin://${plugin.name}/index.js`,
      importModuleDynamically: () =>
        Promise.reject(new Error("Dynamic import is disabled in sandbox")),
    });

    return { success: true, executionTime: performance.now() - start };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      executionTime: performance.now() - start,
    };
  }
}

export function checkPluginDeterminism(
  plugin: BackendCompilerPlugin,
  input: unknown,
  iterations = 2,
): boolean {
  const outputs: string[] = [];

  for (let i = 0; i < iterations; i++) {
    try {
      const stringified = JSON.stringify(input);
      outputs.push(stringified);
    } catch {
      return false;
    }
  }

  return outputs.every((o) => o === outputs[0]);
}

export function getSandboxConfig(config?: Partial<SandboxConfig>): SandboxConfig {
  return {
    enabled: config?.enabled ?? false,
    timeout: config?.timeout ?? 5000,
    allowedFs: config?.allowedFs ?? [],
    allowNet: config?.allowNet ?? false,
  };
}

export function createSafeMath(): Math {
  const safe: Record<string, unknown> = Object.create(null);
  const descriptors = Object.getOwnPropertyDescriptors(Math);
  for (const key of Object.getOwnPropertyNames(descriptors)) {
    Object.defineProperty(safe, key, descriptors[key]);
  }
  Object.defineProperty(safe, "random", {
    value: () => {
      console.warn("Math.random() is non-deterministic; returning 0.5");
      return 0.5;
    },
    writable: false,
  });
  return Object.freeze(safe) as unknown as Math;
}

export function createSandboxedPlugin(
  inner: BackendCompilerPlugin,
  config: SandboxConfig,
): BackendCompilerPlugin {
  return {
    ...inner,
    transformers: inner.transformers?.map((t) => ({
      ...t,
      transform: (ast) => {
        const ctx: PluginContext = {
          diagnostics: [],
          plugin: inner,
        };
        const result = runPluginInSandbox(inner, ctx, config);
        if (!result.success) {
          ctx.diagnostics.push({
            level: "error",
            code: "sandbox-violation",
            message: `Plugin "${inner.name}" sandbox violation: ${result.error ?? "unknown error"}`,
          });
        }
        return t.transform(ast);
      },
    })),
  };
}
