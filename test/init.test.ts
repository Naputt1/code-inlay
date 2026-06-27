import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initCommand } from "../src/cli/init.js";
import type { ParsedArgs } from "../src/cli/index.js";

function makeParsedArgs(cwd: string, projectDir?: string): ParsedArgs {
  return {
    command: "init",
    args: projectDir ? [projectDir] : [],
    flags: { cwd },
  };
}

describe("initCommand", () => {
  it("creates backend.config.ts in target directory", async () => {
    const tmp = join(tmpdir(), `init-test-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });

    await initCommand(makeParsedArgs(tmp));

    expect(existsSync(join(tmp, "backend.config.ts"))).toBe(true);
  });

  it("creates go.mod when missing", async () => {
    const tmp = join(tmpdir(), `init-test-go-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });

    await initCommand(makeParsedArgs(tmp));

    const goModPath = join(tmp, "go.mod");
    if (existsSync(goModPath)) {
      const content = readFileSync(goModPath, "utf8");
      expect(content).toMatch(/^module\s+\S+/m);
    }
  });

  it("skips existing backend.config.ts", async () => {
    const tmp = join(tmpdir(), `init-test-skip-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    const configPath = join(tmp, "backend.config.ts");
    writeFileSync(configPath, "original", "utf8");

    await initCommand(makeParsedArgs(tmp));

    expect(readFileSync(configPath, "utf8")).toBe("original");
  });

  it("skips existing go.mod", async () => {
    const tmp = join(tmpdir(), `init-test-skip-go-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    const goModPath = join(tmp, "go.mod");
    writeFileSync(goModPath, "module existing\n\ngo 1.25\n", "utf8");

    await initCommand(makeParsedArgs(tmp));

    expect(readFileSync(goModPath, "utf8")).toBe("module existing\n\ngo 1.25\n");
  });

  it("creates project in specified subdirectory", async () => {
    const tmp = join(tmpdir(), `init-test-subdir-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    const projectDir = "my-app";

    await initCommand(makeParsedArgs(tmp, projectDir));

    expect(existsSync(join(tmp, projectDir, "backend.config.ts"))).toBe(true);
  });
});
