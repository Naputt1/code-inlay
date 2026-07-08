import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { Diagnostic } from "../types/index.js";

export type GoModuleInfo = {
  modulePath: string;
  dependencies: string[];
};

export function checkGoEnvironment(
  cwd: string,
  diagnostics: Diagnostic[],
  adapterName?: string,
): GoModuleInfo | undefined {
  const goModPath = resolve(cwd, "go.mod");
  const needsModInit = !existsSync(goModPath);

  if (needsModInit) {
    const name = basename(cwd);
    const result = spawnSync("go", ["mod", "init", name], {
      cwd,
      stdio: "pipe",
      encoding: "utf8",
    });
    if (result.status !== 0) {
      diagnostics.push({
        level: "error",
        code: "go-mod-init-failed",
        message: `Failed to run "go mod init ${name}": ${(result.stderr || result.stdout || "unknown error").trim()}`,
      });
      return undefined;
    }
  }

  const content = readFileSync(goModPath, "utf8");
  const modulePath = parseModulePath(content);
  if (!modulePath) {
    diagnostics.push({
      level: "error",
      code: "invalid-go-mod",
      message: `Could not parse module path from go.mod at "${goModPath}".`,
    });
    return undefined;
  }

  const dependencies = parseDependencies(content);
  const info: GoModuleInfo = { modulePath, dependencies };

  if (adapterName) {
    const dep = adapterDependencies[adapterName];
    if (dep && !info.dependencies.includes(dep)) {
      const result = spawnSync("go", ["get", dep], {
        cwd,
        stdio: "pipe",
        encoding: "utf8",
      });
      if (result.status !== 0) {
        diagnostics.push({
          level: "error",
          code: "go-get-failed",
          message: `Failed to run "go get ${dep}": ${(result.stderr || result.stdout || "unknown error").trim()}`,
        });
        return undefined;
      }
      const updatedContent = readFileSync(goModPath, "utf8");
      info.dependencies = parseDependencies(updatedContent);
    }
  }

  return info;
}

export const adapterDependencies: Record<string, string> = {
  gin: "github.com/gin-gonic/gin",
};

function parseModulePath(content: string): string | undefined {
  const match = content.match(/^module\s+(\S+)/m);
  return match?.[1];
}

function parseDependencies(content: string): string[] {
  const deps: string[] = [];
  const inRequire = content.match(/require\s*\(([^)]*)\)/s);
  if (inRequire) {
    for (const line of inRequire[1].split("\n")) {
      const match = line.match(/^\s*(\S+)/);
      if (match) deps.push(match[1]);
    }
  }
  const single = content.match(/^require\s+(\S+)/m);
  if (single) deps.push(single[1]);
  return deps;
}
