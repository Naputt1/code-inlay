import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkPluginCompatibility,
  resolvePluginPackage,
  savePluginLock,
  readPluginLock,
} from "../src/plugins/resolver.js";
import type { PluginPackage, Diagnostic } from "../src/index.js";

describe("checkPluginCompatibility", () => {
  const compatible: PluginPackage = {
    name: "test-plugin",
    version: "1.0.0",
    type: "adapter",
    compatibility: { astVersion: "2.0", coreVersion: ">=0.1.0" },
    manifestHash: "abc",
  };

  it("returns true for compatible plugin", () => {
    const diagnostics: Diagnostic[] = [];
    expect(checkPluginCompatibility(compatible, diagnostics)).toBe(true);
    expect(diagnostics).toHaveLength(0);
  });

  it("returns false for incompatible ast version", () => {
    const incompatible: PluginPackage = {
      ...compatible,
      compatibility: { astVersion: "99.0", coreVersion: ">=0.1.0" },
    };
    const diagnostics: Diagnostic[] = [];
    expect(checkPluginCompatibility(incompatible, diagnostics)).toBe(false);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].code).toBe("plugin-incompatible");
  });

  it("returns false for incompatible core version", () => {
    const incompatible: PluginPackage = {
      ...compatible,
      compatibility: { astVersion: "2.0", coreVersion: ">=99.0.0" },
    };
    const diagnostics: Diagnostic[] = [];
    expect(checkPluginCompatibility(incompatible, diagnostics)).toBe(false);
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it("handles caret range in core version", () => {
    const pkg: PluginPackage = {
      ...compatible,
      compatibility: { astVersion: "2.0", coreVersion: "^0.2.0" },
    };
    const diagnostics: Diagnostic[] = [];
    expect(checkPluginCompatibility(pkg, diagnostics)).toBe(true);
  });

  it("handles tilde range in core version", () => {
    const pkg: PluginPackage = {
      ...compatible,
      compatibility: { astVersion: "2.0", coreVersion: "~0.2" },
    };
    const diagnostics: Diagnostic[] = [];
    expect(checkPluginCompatibility(pkg, diagnostics)).toBe(true);
  });

  it("handles wildcard range in core version", () => {
    const pkg: PluginPackage = {
      ...compatible,
      compatibility: { astVersion: "2.0", coreVersion: "*" },
    };
    const diagnostics: Diagnostic[] = [];
    expect(checkPluginCompatibility(pkg, diagnostics)).toBe(true);
  });

  it("handles x-range in ast version", () => {
    const pkg: PluginPackage = {
      ...compatible,
      compatibility: { astVersion: "2.x", coreVersion: ">=0.1.0" },
    };
    const diagnostics: Diagnostic[] = [];
    expect(checkPluginCompatibility(pkg, diagnostics)).toBe(true);
  });

  it("handles trailing whitespace in version strings", () => {
    const pkg: PluginPackage = {
      ...compatible,
      version: "1.0.0 ",
      compatibility: { astVersion: "2.0 ", coreVersion: ">=0.1.0 " },
    };
    const diagnostics: Diagnostic[] = [];
    expect(checkPluginCompatibility(pkg, diagnostics)).toBe(true);
  });

  it("handles leading whitespace in version strings", () => {
    const pkg: PluginPackage = {
      ...compatible,
      version: " 1.0.0",
      compatibility: { astVersion: " 2.0", coreVersion: " >=0.1.0" },
    };
    const diagnostics: Diagnostic[] = [];
    expect(checkPluginCompatibility(pkg, diagnostics)).toBe(true);
  });
});

describe("resolvePluginPackage", () => {
  it("returns undefined when plugin not found", () => {
    const cwd = join(tmpdir(), `plugin-resolve-${Date.now()}`);
    const diagnostics: Diagnostic[] = [];
    const result = resolvePluginPackage("nonexistent-plugin", cwd, diagnostics);
    expect(result).toBeUndefined();
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].code).toBe("plugin-not-found");
  });

  it("reads manifest from plugin.json", () => {
    const cwd = join(tmpdir(), `plugin-resolve-${Date.now()}`);
    mkdirSync(join(cwd, "node_modules", "my-plugin"), { recursive: true });
    writeFileSync(
      join(cwd, "node_modules", "my-plugin", "plugin.json"),
      JSON.stringify({
        name: "my-plugin",
        version: "0.2.0",
        type: "transformer",
        compatibility: { astVersion: "2.0", coreVersion: ">=0.1.0" },
      }),
      "utf8",
    );
    const diagnostics: Diagnostic[] = [];
    const result = resolvePluginPackage("my-plugin", cwd, diagnostics);
    expect(result).toBeDefined();
    expect(result!.name).toBe("my-plugin");
    expect(result!.version).toBe("0.2.0");
  });

  it("reads manifest from package.json schemago metadata", () => {
    const cwd = join(tmpdir(), `plugin-resolve-${Date.now()}`);
    mkdirSync(join(cwd, "node_modules", "other-plugin"), { recursive: true });
    writeFileSync(
      join(cwd, "node_modules", "other-plugin", "package.json"),
      JSON.stringify({
        name: "other-plugin",
        version: "1.0.0",
        schemago: {
          type: "adapter",
          compatibility: { astVersion: "1.x", coreVersion: ">=0.1.0" },
        },
      }),
      "utf8",
    );
    const diagnostics: Diagnostic[] = [];
    const result = resolvePluginPackage("other-plugin", cwd, diagnostics);
    expect(result).toBeDefined();
    expect(result!.name).toBe("other-plugin");
    expect(result!.type).toBe("adapter");
  });

  it("returns undefined when package has no schemago metadata", () => {
    const cwd = join(tmpdir(), `plugin-resolve-${Date.now()}`);
    mkdirSync(join(cwd, "node_modules", "no-meta"), { recursive: true });
    writeFileSync(
      join(cwd, "node_modules", "no-meta", "package.json"),
      JSON.stringify({ name: "no-meta", version: "1.0.0" }),
      "utf8",
    );
    const diagnostics: Diagnostic[] = [];
    const result = resolvePluginPackage("no-meta", cwd, diagnostics);
    expect(result).toBeUndefined();
    expect(diagnostics[0].code).toBe("plugin-no-meta");
  });

  it("handles invalid plugin.json gracefully", () => {
    const cwd = join(tmpdir(), `plugin-resolve-invalid-${Date.now()}`);
    mkdirSync(join(cwd, "node_modules", "bad"), { recursive: true });
    writeFileSync(join(cwd, "node_modules", "bad", "plugin.json"), "not valid json", "utf8");
    const diagnostics: Diagnostic[] = [];
    const result = resolvePluginPackage("bad", cwd, diagnostics);
    expect(result).toBeUndefined();
  });

  it("handles invalid package.json gracefully", () => {
    const cwd = join(tmpdir(), `plugin-resolve-badpkg-${Date.now()}`);
    mkdirSync(join(cwd, "node_modules", "bad"), { recursive: true });
    writeFileSync(join(cwd, "node_modules", "bad", "package.json"), "not valid json", "utf8");
    const diagnostics: Diagnostic[] = [];
    const result = resolvePluginPackage("bad", cwd, diagnostics);
    expect(result).toBeUndefined();
  });
});

describe("savePluginLock / readPluginLock", () => {
  it("roundtrips plugin lock file", () => {
    const cwd = join(tmpdir(), `plugin-lock-${Date.now()}`);
    const plugins: PluginPackage[] = [
      {
        name: "p1",
        version: "1.0.0",
        type: "adapter",
        compatibility: { astVersion: "2.0", coreVersion: ">=0.1.0" },
        manifestHash: "hash1",
      },
      {
        name: "p2",
        version: "2.0.0",
        type: "transformer",
        compatibility: { astVersion: "2.0", coreVersion: ">=0.1.0" },
        manifestHash: "hash2",
      },
    ];
    savePluginLock(plugins, cwd);
    const loaded = readPluginLock(cwd);
    expect(loaded).toBeDefined();
    expect(loaded).toHaveLength(2);
    expect(loaded![0].name).toBe("p1");
    expect(loaded![1].name).toBe("p2");
  });

  it("returns undefined when no lock file exists", () => {
    const cwd = join(tmpdir(), `plugin-lock-none-${Date.now()}`);
    const loaded = readPluginLock(cwd);
    expect(loaded).toBeUndefined();
  });

  it("returns undefined for corrupt lock file", () => {
    const cwd = join(tmpdir(), `plugin-lock-corrupt-${Date.now()}`);
    mkdirSync(join(cwd, ".schemago"), { recursive: true });
    writeFileSync(join(cwd, ".schemago", "plugins.lock.json"), "not valid json", "utf8");
    const loaded = readPluginLock(cwd);
    expect(loaded).toBeUndefined();
  });
});
