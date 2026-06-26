import { describe, expect, it } from "vitest";
import {
  computePluginManifestHash,
  createPluginRegistry,
} from "../src/plugins.js";
import {
  defineApp,
} from "../src/index.js";
import type { Diagnostic } from "../src/index.js";

describe("computePluginManifestHash", () => {
  it("returns a deterministic hash string", () => {
    const app = defineApp({ modules: [] });
    const hash = computePluginManifestHash(app);
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
  });

  it("returns different hash for different plugins", () => {
    const app1 = defineApp({ modules: [] });
    const app2 = defineApp({ modules: [], plugins: [{ name: "extra", version: "1.0.0", apiVersion: "2" as const, transformers: [] }] });
    const hash1 = computePluginManifestHash(app1);
    const hash2 = computePluginManifestHash(app2);
    expect(hash1).not.toBe(hash2);
  });
});

describe("createPluginRegistry", () => {
  it("registers built-in targets", () => {
    const app = defineApp({ modules: [] });
    const diagnostics: Diagnostic[] = [];
    const registry = createPluginRegistry(app, diagnostics);
    expect(registry.targets.has("ts-client")).toBe(true);
    expect(registry.targets.has("openapi")).toBe(true);
  });

  it("adds diagnostic for duplicate plugin name", () => {
    const app = defineApp({
      modules: [],
      plugins: [
        { name: "dup", version: "1.0.0", apiVersion: "2" as const, transformers: [] },
        { name: "dup", version: "2.0.0", apiVersion: "2" as const, transformers: [] },
      ],
    });
    const diagnostics: Diagnostic[] = [];
    createPluginRegistry(app, diagnostics);
    expect(diagnostics.some((d) => d.code === "duplicate-plugin")).toBe(true);
  });

  it("adds diagnostic for unsupported api version", () => {
    const app = defineApp({
      modules: [],
      plugins: [
        { name: "bad", version: "1.0.0", apiVersion: "1" as never, transformers: [] },
      ],
    });
    const diagnostics: Diagnostic[] = [];
    createPluginRegistry(app, diagnostics);
    expect(diagnostics.some((d) => d.code === "unsupported-plugin-api")).toBe(true);
  });

  it("adds warning for duplicate target name", () => {
    const app = defineApp({
      modules: [],
      targets: [
        { name: "ts-client", version: "0.1.0", stage: "postTransform" as const, generate: () => [] },
      ],
    });
    const diagnostics: Diagnostic[] = [];
    createPluginRegistry(app, diagnostics);
    expect(diagnostics.some((d) => d.code === "duplicate-target")).toBe(true);
  });

  it("skips targets without name property", () => {
    const app = defineApp({
      modules: [],
      targets: [{} as never],
    });
    const diagnostics: Diagnostic[] = [];
    createPluginRegistry(app, diagnostics);
    expect(diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
  });
});
