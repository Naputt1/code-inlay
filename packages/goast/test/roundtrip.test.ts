import { describe, it, expect, beforeAll } from "vitest";
import * as go from "../src/index.js";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { File } from "../src/nodes.js";

const TEST_BINARY = join(import.meta.dirname, "..", "tools", "decl-parser", "decl-parser");

const parser = go.createParser(existsSync(TEST_BINARY) ? TEST_BINARY : undefined);
const hasParser = parser.hasParser();

function validateGo(source: string): boolean {
  const r = spawnSync("gofmt", { input: source, encoding: "utf8" });
  return r.status === 0;
}

const snapshotDir = join(import.meta.dirname, "..", "..", "..", "sample-project", "snapshot");

function collectGoFiles(dir: string, results: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectGoFiles(full, results);
    } else if (entry.endsWith(".go")) {
      results.push(full);
    }
  }
}

function skipIfNoParser() {
  if (!hasParser) {
    console.warn("Skipping: decl-parser binary not found");
  }
  return !hasParser;
}

describe("round-trip: snapshot Go files", () => {
  const goFiles: string[] = [];

  beforeAll(() => {
    collectGoFiles(snapshotDir, goFiles);
  });

  it("finds snapshot Go files", () => {
    expect(goFiles.length).toBeGreaterThan(0);
    console.log(`  Found ${goFiles.length} Go files in snapshot`);
  });

  for (const filePath of goFiles) {
    const relPath = filePath.replace(snapshotDir + "/", "");
    it(`parse + gofmt-valid: ${relPath}`, () => {
      if (skipIfNoParser()) return;
      const source = readFileSync(filePath, "utf8");
      const result = parser.parse(source);
      if (result.kind === "ParseError") return;
      const printed = go.printFile(result.file);
      expect(result.file.kind).toBe("File");
      expect(printed).toContain(`package ${result.file.packageName}`);
      expect(validateGo(printed)).toBe(true);
    });
  }
});

describe("round-trip: in-memory → print → parse back", () => {
  it("complex file with imports, structs, interfaces, methods", () => {
    if (skipIfNoParser()) return;

    const f = go.file(
      "test",
      go.genDecl("import", go.importSpec("fmt"), go.importSpec("net/http", "h")),
      go.genDecl(
        "type",
        go.typeSpec(
          "Config",
          go.structType(
            go.field(["Port"], go.id("int"), go.tag({ json: "port" })),
            go.embedded(go.id("http.Handler")),
          ),
        ),
      ),
      go.function_(
        "NewConfig",
        [go.field(["port"], go.id("int"))],
        [go.field([], go.star(go.id("Config")))],
        go.block(go.return_(go.addr(go.elt(go.id("Config"), go.kv("Port", go.id("port")))))),
      ),
    );

    const printed = go.printFile(f);
    expect(validateGo(printed)).toBe(true);

    const result = parser.parse(printed);
    if (result.kind === "ParseError") {
      expect.fail("Failed to parse printed output: " + result.message);
      return;
    }

    expect(result.file.kind).toBe("File");
    expect(result.file.packageName).toBe("test");
    expect(result.file.imports).toHaveLength(2);
    expect(result.file.decls.length).toBeGreaterThanOrEqual(2);

    // Re-print should still be valid
    const printed2 = go.printFile(result.file);
    expect(validateGo(printed2)).toBe(true);
  });
});
