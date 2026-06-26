import { describe, expect, it } from "vitest";
import {
  runPluginInSandbox,
  checkPluginDeterminism,
  getSandboxConfig,
  createSandboxedPlugin,
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
