import { describe, it, beforeAll } from "vitest";
import * as go from "../src/index.js";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const TEST_BINARY = join(import.meta.dirname, "..", "tools", "decl-parser", "decl-parser");
const GOROOT = "/usr/lib/go-1.19";
const PKGS = ["fmt", "strings", "time", "encoding/json", "net/http", "net", "runtime"];

const parser = go.createParser(existsSync(TEST_BINARY) ? TEST_BINARY : undefined);
const hasParser = parser.hasParser();

function skipIfNoParser() {
  if (!hasParser) {
    console.warn("Skipping: decl-parser binary not found");
  }
  return !hasParser;
}

function validateGo(source: string): boolean {
  const r = spawnSync("gofmt", { input: source, encoding: "utf8" });
  return r.status === 0;
}

function collectGoFiles(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isFile() && entry.endsWith(".go") && !entry.endsWith("_test.go")) {
      results.push(full);
    }
  }
  return results;
}

for (const pkg of PKGS) {
  describe(`stdlib round-trip: ${pkg}`, () => {
    const files: string[] = [];
    let passed = 0;
    let failed = 0;
    const failures: Array<{ file: string; error: string }> = [];

    beforeAll(() => {
      const dir = join(GOROOT, "src", pkg);
      files.push(...collectGoFiles(dir));
    });

    it(`parses, prints, and gofmt-validates ${files.length} files in ${pkg}`, () => {
      if (skipIfNoParser()) return;

      for (const filePath of files) {
        const source = readFileSync(filePath, "utf8");
        const result = parser.parse(source);

        if (result.kind === "ParseError") {
          failed++;
          failures.push({ file: filePath, error: result.message });
          continue;
        }

        const printed = go.printFile(result.file);
        if (!validateGo(printed)) {
          failed++;
          failures.push({ file: filePath, error: "gofmt validation failed" });
          continue;
        }

        passed++;
      }

      const total = files.length;
      console.log(`  ${pkg}: ${passed}/${total} passed, ${failed} failed`);
      if (failures.length > 0) {
        for (const f of failures.slice(0, 5)) {
          console.log(`    FAIL: ${f.file}: ${f.error}`);
        }
        if (failures.length > 5) {
          console.log(`    ... and ${failures.length - 5} more failures`);
        }
      }
    });
  });
}
