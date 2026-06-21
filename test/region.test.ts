import { describe, expect, it } from "vitest";
import { injectRegions } from "../src/region.js";
import type { Diagnostic } from "../src/types.js";

describe("region injection", () => {
  it("replaces only content inside markers and is idempotent", () => {
    const diagnostics: Diagnostic[] = [];
    const input = [
      "package user",
      "",
      "func Manual() {}",
      "",
      "// @gen:start user.create.types",
      "old",
      "// @gen:end user.create.types",
      "",
      "func StillManual() {}",
      "",
    ].join("\n");

    const output = injectRegions(
      input,
      [{ id: "user.create.types", content: "type CreateUserRequest struct{}" }],
      diagnostics,
    );
    const second = injectRegions(
      output,
      [{ id: "user.create.types", content: "type CreateUserRequest struct{}" }],
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
