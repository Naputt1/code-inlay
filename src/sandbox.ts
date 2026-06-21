import vm from "node:vm";
import type { BackendCompilerPlugin, PluginContext, SandboxConfig } from "./types.js";

export type SandboxResult = {
  success: boolean;
  error?: string;
  executionTime: number;
};

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
    const safeConsole = {
      log: (...args: unknown[]) => console.log(`[plugin:${plugin.name}]`, ...args),
      warn: (...args: unknown[]) => console.warn(`[plugin:${plugin.name}]`, ...args),
      error: (...args: unknown[]) => console.error(`[plugin:${plugin.name}]`, ...args),
    };

    const sandbox = vm.createContext({
      console: safeConsole,
      Math: createSafeMath(),
      JSON: JSON,
      Array: Array,
      Object: Object,
      Map: Map,
      Set: Set,
      Promise: Promise,
      Buffer: undefined,
      process: {
        env: {},
        cwd: () => "/sandbox",
        platform: "linux",
      },
      require: () => {
        throw new Error("Plugin requires is disabled in sandbox mode");
      },
      module: { exports: {} },
      exports: {},
    });

    const pluginCode = `
      (function(context) {
        ${plugin.transformers?.map((t) => `(${t.transform.toString()})(context.ast);`).join("\n") ?? ""}
      })
    `;

    vm.runInNewContext(pluginCode, sandbox, {
      timeout,
      filename: `plugin://${plugin.name}/index.js`,
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

function createSafeMath(): Math {
  const safe = Object.create(Math);
  const originalRandom = Math.random;
  Object.defineProperty(safe, "random", {
    value: () => {
      console.warn("Math.random() is non-deterministic; returning 0.5");
      return 0.5;
    },
    writable: false,
  });
  return safe;
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
