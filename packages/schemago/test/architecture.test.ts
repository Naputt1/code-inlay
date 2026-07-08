import { describe, expect, it } from "vitest";
import { resolveArchitecture } from "../src/architecture/index.js";
import type { Diagnostic, ArchitectureRef } from "../src/index.js";

describe("resolveArchitecture", () => {
  it("returns empty array for no refs", () => {
    const diagnostics: Diagnostic[] = [];
    const plugins = resolveArchitecture({ mode: "replace", refs: [] }, diagnostics);
    expect(plugins).toEqual([]);
    expect(diagnostics).toHaveLength(0);
  });

  it("adds diagnostic for unknown architecture name", () => {
    const diagnostics: Diagnostic[] = [];
    const plugins = resolveArchitecture(
      { mode: "replace", refs: ["nonexistent" as ArchitectureRef] },
      diagnostics,
    );
    expect(plugins).toEqual([]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe("unknown-architecture");
  });

  it("passes through inline ArchitecturePlugin objects", () => {
    const diagnostics: Diagnostic[] = [];
    const customArch = {
      name: "custom",
      version: "1.0.0",
      apiVersion: "2" as const,
      transform: () => ({ nodes: [], routes: [] }) as never,
    };
    const plugins = resolveArchitecture({ mode: "replace", refs: [customArch] }, diagnostics);
    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe("custom");
    expect(diagnostics).toHaveLength(0);
  });
});
