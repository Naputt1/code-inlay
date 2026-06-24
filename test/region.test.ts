import { describe, expect, it } from "vitest";
import { injectRegions } from "../src/region.js";
import { injectContent, detectDrift, upgradeLegacyMarkers } from "../src/index.js";
import type { Diagnostic } from "../src/types.js";

describe("region injection", () => {
  it("replaces only content inside markers and is idempotent", () => {
    const diagnostics: Diagnostic[] = [];
    const input = [
      "package user",
      "",
      "func Manual() {}",
      "",
      "// @gen:start user.create.entity",
      "old",
      "// @gen:end user.create.entity",
      "",
      "func StillManual() {}",
      "",
    ].join("\n");

    const output = injectRegions(
      input,
      [{ id: "user.create.entity", content: "type CreateUserRequest struct{}" }],
      diagnostics,
    );
    const second = injectRegions(
      output,
      [{ id: "user.create.entity", content: "type CreateUserRequest struct{}" }],
      diagnostics,
    );

    expect(diagnostics).toEqual([]);
    expect(output).toContain("func Manual() {}");
    expect(output).toContain("func StillManual() {}");
    expect(output).toContain("type CreateUserRequest struct{}");
    expect(second).toBe(output);
  });

  it("reports missing and duplicate regions", () => {
    const diagnostics: Diagnostic[] = [];
    injectRegions(
      ["// @gen:start a.b.c", "// @gen:end a.b.c", "// @gen:start a.b.c", "// @gen:end a.b.c"].join(
        "\n",
      ),
      [{ id: "missing.region", content: "x" }],
      diagnostics,
    );

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain("duplicate-region");
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain("missing-region");
  });
});

describe("region v2", () => {
  it("injects content with stable hash markers", () => {
    const fileText = [
      "package test",
      "",
      "// @gen:start test.region",
      "// @gen:end test.region",
      "",
    ].join("\n");

    const result = injectContent(
      fileText,
      [
        {
          id: "test.region",
          content: "type Foo struct{}",
          stableHash: "abc123",
          owner: "gin",
          language: "go",
        },
      ],
      [],
    );

    expect(result).toContain("// @gen:start test.region hash:abc123");
    expect(result).toContain("// @gen:end test.region");
    expect(result).toContain("type Foo struct{}");
  });

  it("detects region drift", () => {
    const fileText = [
      "// @gen:start test.region",
      "manual content",
      "// @gen:end test.region",
    ].join("\n");

    const diagnostics: Diagnostic[] = [];
    const cache: Record<string, { contentHash: string }> = {
      "test.region": { contentHash: "generated-hash" },
    };

    const hasDrift = detectDrift(
      fileText,
      [{ id: "test.region", content: "generated content", contentHash: "generated-hash" }],
      cache,
      diagnostics,
      "test.go",
    );

    expect(hasDrift).toBe(true);
    expect(diagnostics.some((d) => d.code === "region-drift")).toBe(true);
  });

  it("detects drift is skipped with force region", () => {
    const fileText = [
      "// @gen:start test.region",
      "manual content",
      "// @gen:end test.region",
    ].join("\n");

    const diagnostics: Diagnostic[] = [];
    const cache: Record<string, { contentHash: string }> = {
      "test.region": { contentHash: "generated-hash" },
    };

    const hasDrift = detectDrift(
      fileText,
      [{ id: "test.region", content: "generated content", contentHash: "generated-hash" }],
      cache,
      diagnostics,
      "test.go",
      ["test.region"],
    );

    expect(hasDrift).toBe(false);
    expect(diagnostics.some((d) => d.code === "region-drift")).toBe(false);
  });

  it("upgrades legacy v1 markers when region is empty", () => {
    const fileText = ["// @gen:start test.region", "// @gen:end test.region"].join("\n");

    const result = upgradeLegacyMarkers(fileText, [
      { id: "test.region", stableHash: "abc123", owner: "gin" },
    ]);

    expect(result).toContain("hash:abc123");
  });

  it("does not upgrade legacy markers with manual content", () => {
    const fileText = [
      "// @gen:start test.region",
      "manual content here",
      "// @gen:end test.region",
    ].join("\n");

    const diagnostics: Diagnostic[] = [];
    const result = upgradeLegacyMarkers(
      fileText,
      [{ id: "test.region", stableHash: "abc123", owner: "gin" }],
      undefined,
      diagnostics,
    );

    expect(result).not.toContain("hash:abc123");
    expect(diagnostics.some((d) => d.code === "legacy-region-drift")).toBe(true);
  });
});
