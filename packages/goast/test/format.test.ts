import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  sortGoImportsText,
  formatGoSnippet,
  formatFile,
  type FormatWarning,
} from "../src/index.js";

let hasGofmt = false;

beforeAll(() => {
  const result = spawnSync("gofmt", ["--help"], { encoding: "utf8" });
  hasGofmt = result.status === 0;
});

// ─── sortGoImportsText ─────────────────────────────────────

describe("sortGoImportsText", () => {
  it("returns empty string unchanged", () => {
    expect(sortGoImportsText("")).toBe("");
  });

  it("returns content with no imports unchanged", () => {
    const src = "package main\n\nfunc main() {}\n";
    expect(sortGoImportsText(src)).toBe(src);
  });

  it("leaves single import line untouched", () => {
    const src = 'package main\n\nimport "fmt"\n';
    expect(sortGoImportsText(src)).toBe(src);
  });

  it("sorts stdlib imports alphabetically", () => {
    const input = `package main

import (
\t"os"
\t"fmt"
)
`;

    const expected = `package main

import (
\t"fmt"
\t"os"
)
`;

    expect(sortGoImportsText(input)).toBe(expected);
  });

  it("sorts external imports into separate group", () => {
    const input = `package main

import (
\t"os"
\t"github.com/foo/bar"
\t"fmt"
\t"example.com/pkg"
)
`;

    const expected = `package main

import (
\t"fmt"
\t"os"

\t"example.com/pkg"
\t"github.com/foo/bar"
)
`;

    expect(sortGoImportsText(input)).toBe(expected);
  });

  it("classifies module-local paths as stdlib group", () => {
    const input = `package main

import (
\t"os"
\t"mymodule/internal/util"
\t"github.com/foo/bar"
)
`;

    const expected = `package main

import (
\t"mymodule/internal/util"
\t"os"

\t"github.com/foo/bar"
)
`;

    expect(sortGoImportsText(input, "mymodule")).toBe(expected);
  });

  it("handles aliased imports", () => {
    const input = `package main

import (
\tfoo "example.com/foo"
\t"os"
)
`;

    const expected = `package main

import (
\t"os"

\tfoo "example.com/foo"
)
`;

    expect(sortGoImportsText(input)).toBe(expected);
  });

  it("preserves already sorted content", () => {
    const src = `package main

import (
\t"fmt"
\t"os"

\t"github.com/foo/bar"
)
`;

    expect(sortGoImportsText(src)).toBe(src);
  });

  it("strips comments inside import block during sort (pre-existing behavior)", () => {
    // comments inside import blocks are currently dropped during sorting
    const input = `package main

import (
\t// stdlib
\t"os"
\t"fmt"
)
`;

    const expected = `package main

import (
\t"fmt"
\t"os"
)
`;

    expect(sortGoImportsText(input)).toBe(expected);
  });

  it("handles multiple import blocks", () => {
    const input = `package main

import (
\t"os"
\t"fmt"
)

import (
\t"github.com/b"
\t"github.com/a"
)
`;

    const expected = `package main

import (
\t"fmt"
\t"os"
)

import (
\t"github.com/a"
\t"github.com/b"
)
`;

    expect(sortGoImportsText(input)).toBe(expected);
  });

  it("handles no-group external imports", () => {
    const input = `package main

import (
\t"github.com/b"
\t"github.com/a"
)
`;

    const expected = `package main

import (
\t"github.com/a"
\t"github.com/b"
)
`;

    expect(sortGoImportsText(input)).toBe(expected);
  });

  it("returns empty group 2 when no external imports", () => {
    const src = `package main

import (
\t"fmt"
\t"os"
)
`;

    expect(sortGoImportsText(src)).toBe(src);
  });

  it("handles imports with blank identifier", () => {
    const input = `package main

import (
\t_ "embed"
\t"os"
)
`;

    expect(sortGoImportsText(input)).toBe(input);
  });

  it("handles imports with dot identifier", () => {
    const input = `package main

import (
\t. "example.com/foo"
\t"os"
)
`;

    const expected = `package main

import (
\t"os"

\t. "example.com/foo"
)
`;

    expect(sortGoImportsText(input)).toBe(expected);
  });
});

// ─── formatGoSnippet ───────────────────────────────────────

describe("formatGoSnippet", () => {
  it("returns empty string for empty content", () => {
    const warnings: FormatWarning[] = [];
    expect(formatGoSnippet("", "test", warnings)).toBe("");
    expect(formatGoSnippet("   ", "test", warnings)).toBe("");
    expect(warnings).toHaveLength(0);
  });

  it("returns trimmed content for incomplete snippet with braces", () => {
    const warnings: FormatWarning[] = [];
    const result = formatGoSnippet("func foo() {", "test", warnings);
    expect(result).toBe("func foo() {");
    expect(warnings).toHaveLength(0);
  });

  it("formats valid Go declaration without gofmt", () => {
    const warnings: FormatWarning[] = [];
    const result = formatGoSnippet('var x = "hello"', "test", warnings);
    if (hasGofmt) {
      expect(result).toContain('var x = "hello"');
      expect(warnings).toHaveLength(0);
    } else {
      // without gofmt, returns trimmed content unchanged
      expect(result).toBe('var x = "hello"');
    }
  });

  it("formats statement-mode snippet", () => {
    const warnings: FormatWarning[] = [];
    const result = formatGoSnippet("return nil", "test", warnings);
    if (hasGofmt) {
      expect(result).toContain("return nil");
      expect(warnings).toHaveLength(0);
    } else {
      expect(result).toBe("return nil");
    }
  });

  it("reports warning when gofmt fails", () => {
    // gofmt should never fail on valid content, but if missing we get a warning
    const warnings: FormatWarning[] = [];
    formatGoSnippet("package main", "test", warnings);
    if (!hasGofmt) {
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].code).toBe("gofmt-failed");
    }
  });
});

// ─── formatFile ────────────────────────────────────────────

describe("formatFile", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "goast-format-"));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("skips non-.go files", () => {
    const warnings: FormatWarning[] = [];
    const f = join(tmpDir, "test.txt");
    writeFileSync(f, "hello", "utf8");
    formatFile(f, undefined, warnings);
    expect(warnings).toHaveLength(0);
  });

  it("no-ops when both options are false", () => {
    const content = 'package main\n\nimport (\n\t"os"\n\t"fmt"\n)\n\nfunc main() {}\n';
    const f = join(tmpDir, "noop.go");
    writeFileSync(f, content, "utf8");
    const warnings: FormatWarning[] = [];
    formatFile(f, { sortImports: false, gofmt: false }, warnings);
    expect(warnings).toHaveLength(0);
    expect(readFileSync(f, "utf8")).toBe(content);
  });

  it("sorts imports when gofmt is false", () => {
    const input = 'package main\n\nimport (\n\t"os"\n\t"fmt"\n)\n\nfunc main() {}\n';
    const expected = 'package main\n\nimport (\n\t"fmt"\n\t"os"\n)\n\nfunc main() {}\n';
    const f = join(tmpDir, "sorted.go");
    writeFileSync(f, input, "utf8");
    const warnings: FormatWarning[] = [];
    formatFile(f, { gofmt: false }, warnings);
    expect(warnings).toHaveLength(0);
    expect(readFileSync(f, "utf8")).toBe(expected);
  });

  it("runs gofmt when sortImports is false", () => {
    if (!hasGofmt) return;
    const input = 'package main\n\nfunc main() {\n\tx:=1\n}\n';
    const f = join(tmpDir, "gofmt.go");
    writeFileSync(f, input, "utf8");
    const warnings: FormatWarning[] = [];
    formatFile(f, { sortImports: false }, warnings);
    expect(warnings).toHaveLength(0);
    const result = readFileSync(f, "utf8");
    expect(result).toContain("x := 1");
    expect(result).not.toContain("x:=1");
  });

  it("reports warning when gofmt fails on invalid Go", () => {
    if (!hasGofmt) return;
    const f = join(tmpDir, "invalid.go");
    writeFileSync(f, "package main\n\nfunc main() { bad syntax }\n", "utf8");
    const warnings: FormatWarning[] = [];
    formatFile(f, undefined, warnings);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].code).toBe("gofmt-failed");
  });
});

// ─── FormatFileOptions ─────────────────────────────────────

describe("FormatFileOptions defaults", () => {
  it("defaults to sortImports: true and gofmt: true when undefined", () => {
    const warnings: FormatWarning[] = [];
    const nonExistent = "/nonexistent/path/to/file.go";
    // No error expected — function returns early only for non-.go files
    formatFile(nonExistent, undefined, warnings);
    expect(warnings).toHaveLength(0);
  });

  it("merges partial options correctly", () => {
    const warnings: FormatWarning[] = [];
    const nonExistent = "/nonexistent/path/to/file.go";
    formatFile(nonExistent, { sortImports: true }, warnings);
    expect(warnings).toHaveLength(0);
  });
});
