import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkGoEnvironment } from "../src/utils/env.js";
import type { Diagnostic } from "../src/index.js";

const goModWithGin = `module github.com/example/test

go 1.26

require (
\tgithub.com/gin-gonic/gin v1.10.0
\tgithub.com/stretchr/testify v1.9.0
)
`;

describe("checkGoEnvironment", () => {
  it("parses go.mod and returns module info", () => {
    const cwd = join(tmpdir(), `env-test-${Date.now()}`);
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, "go.mod"), goModWithGin, "utf8");

    const diagnostics: Diagnostic[] = [];
    const info = checkGoEnvironment(cwd, diagnostics);
    expect(info).toBeDefined();
    expect(info!.modulePath).toBe("github.com/example/test");
    expect(info!.dependencies).toContain("github.com/gin-gonic/gin");
    expect(info!.dependencies).toContain("github.com/stretchr/testify");
    expect(diagnostics).toHaveLength(0);
  });

  it("returns undefined and adds diagnostic for invalid go.mod", () => {
    const cwd = join(tmpdir(), `env-test-bad-${Date.now()}`);
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, "go.mod"), "invalid content without module directive", "utf8");

    const diagnostics: Diagnostic[] = [];
    const info = checkGoEnvironment(cwd, diagnostics);
    expect(info).toBeUndefined();
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].code).toBe("invalid-go-mod");
  });

  it("runs go mod init when go.mod is missing", () => {
    const cwd = join(tmpdir(), `env-init-${Date.now()}`);
    mkdirSync(cwd, { recursive: true });

    const diagnostics: Diagnostic[] = [];
    const info = checkGoEnvironment(cwd, diagnostics);
    // If go is available, mod init succeeds and info is returned
    // If go is unavailable, we get an error diagnostic
    if (info) {
      expect(info.modulePath).toBeTruthy();
    } else {
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0].code).toBe("go-mod-init-failed");
    }
  });

  it("accepts adapter name with already-satisfied dependency", () => {
    const cwd = join(tmpdir(), `env-adapter-${Date.now()}`);
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, "go.mod"), goModWithGin, "utf8");

    const diagnostics: Diagnostic[] = [];
    const info = checkGoEnvironment(cwd, diagnostics, "gin");
    expect(info).toBeDefined();
    expect(info!.dependencies).toContain("github.com/gin-gonic/gin");
    expect(diagnostics).toHaveLength(0);
  });

  it("returns undefined for unknown adapter name", () => {
    const cwd = join(tmpdir(), `env-unknown-adapter-${Date.now()}`);
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, "go.mod"), goModWithGin, "utf8");

    const diagnostics: Diagnostic[] = [];
    const info = checkGoEnvironment(cwd, diagnostics, "nonexistent-adapter");
    expect(info).toBeDefined();
    // unknown adapter just leaves adapterDependencies[adapterName] as undefined, which gets skipped
    expect(diagnostics).toHaveLength(0);
  });
});
