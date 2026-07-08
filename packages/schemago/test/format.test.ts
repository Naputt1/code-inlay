import { describe, expect, it } from "vitest";
import { formatGoSnippet } from "../src/utils/format.js";
import type { Diagnostic } from "../src/index.js";

describe("formatGoSnippet", () => {
  it("returns empty string for empty content", () => {
    const diagnostics: Diagnostic[] = [];
    expect(formatGoSnippet("", diagnostics, "test")).toBe("");
    expect(formatGoSnippet("   ", diagnostics, "test")).toBe("");
  });

  it("returns trimmed content for incomplete snippet", () => {
    const diagnostics: Diagnostic[] = [];
    const result = formatGoSnippet("func foo(", diagnostics, "test");
    expect(result).toBe("func foo(");
  });

  it("returns trimmed content for incomplete snippet with braces", () => {
    const diagnostics: Diagnostic[] = [];
    const result = formatGoSnippet("func foo() {", diagnostics, "test");
    expect(result).toBe("func foo() {");
  });

  it("formats valid Go declaration", () => {
    const diagnostics: Diagnostic[] = [];
    const result = formatGoSnippet('var x = "hello"', diagnostics, "test");
    expect(result).toContain('var x = "hello"');
  });

  it("formats statement-mode snippet", () => {
    const diagnostics: Diagnostic[] = [];
    const result = formatGoSnippet("return nil", diagnostics, "test");
    expect(result).toContain("return nil");
  });
});
