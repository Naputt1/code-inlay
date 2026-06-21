import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { PluginPackage, PluginCompatibility, Diagnostic } from "./types.js";
import { AST_VERSION, COMPILER_VERSION } from "./types.js";
import { stableHash } from "./hash.js";

export type ResolvedPlugin = {
  package: PluginPackage;
  entry: string;
  dependencies: ResolvedPlugin[];
};

export type PluginResolutionResult = {
  resolved: ResolvedPlugin[];
  errors: string[];
  warnings: string[];
};

export function resolvePluginPackage(
  packageName: string,
  cwd: string,
  diagnostics: Diagnostic[],
): PluginPackage | undefined {
  const pluginJsonPath = resolve(cwd, "node_modules", packageName, "plugin.json");
  const packageJsonPath = resolve(cwd, "node_modules", packageName, "package.json");

  if (!existsSync(pluginJsonPath) && !existsSync(packageJsonPath)) {
    diagnostics.push({
      level: "error",
      code: "plugin-not-found",
      message: `Plugin package "${packageName}" not found in node_modules. Run \`npm install ${packageName}\` first.`,
    });
    return undefined;
  }

  try {
    if (existsSync(pluginJsonPath)) {
      const raw = readFileSync(pluginJsonPath, "utf8");
      const manifest: PluginPackage = JSON.parse(raw);
      manifest.manifestHash = stableHash(manifest, 16);
      return manifest;
    }

    const packageRaw = readFileSync(packageJsonPath, "utf8");
    const packageJson = JSON.parse(packageRaw);
    const pluginMeta = packageJson["code-inlay"] as Record<string, unknown> | undefined;

    if (!pluginMeta) {
      diagnostics.push({
        level: "error",
        code: "plugin-no-meta",
        message: `Package "${packageName}" has no "code-inlay" metadata in package.json.`,
      });
      return undefined;
    }

    const manifest: PluginPackage = {
      name: packageJson.name ?? packageName,
      version: packageJson.version ?? "0.0.0",
      type: (pluginMeta.type as PluginPackage["type"]) ?? "adapter",
      compatibility: (pluginMeta.compatibility as PluginCompatibility) ?? {
        astVersion: "1.x",
        coreVersion: ">=1.0.0",
      },
      capabilities: (pluginMeta.capabilities as string[]) ?? [],
      manifestHash: stableHash(packageJson, 16),
    };

    return manifest;
  } catch (error) {
    diagnostics.push({
      level: "error",
      code: "plugin-manifest-read-failed",
      message: `Failed to read plugin manifest for "${packageName}": ${error instanceof Error ? error.message : String(error)}`,
    });
    return undefined;
  }
}

export function checkPluginCompatibility(
  plugin: PluginPackage,
  diagnostics: Diagnostic[],
): boolean {
  const errors: string[] = [];

  const astRange = plugin.compatibility.astVersion;
  if (!satisfies(AST_VERSION, astRange)) {
    errors.push(
      `Plugin "${plugin.name}" requires astVersion "${astRange}" but current AST version is "${AST_VERSION}".`,
    );
  }

  const coreRange = plugin.compatibility.coreVersion;
  if (!satisfies(COMPILER_VERSION, coreRange)) {
    errors.push(
      `Plugin "${plugin.name}" requires coreVersion "${coreRange}" but current compiler version is "${COMPILER_VERSION}".`,
    );
  }

  for (const error of errors) {
    diagnostics.push({
      level: "error",
      code: "plugin-incompatible",
      message: error,
    });
  }

  return errors.length === 0;
}

export function savePluginLock(plugins: PluginPackage[], cwd: string): void {
  const dir = resolve(cwd, ".backend-gen");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const lock = {
    version: "1",
    plugins: plugins.map((p) => ({
      name: p.name,
      version: p.version,
      type: p.type,
      manifestHash: p.manifestHash,
    })),
  };

  writeFileSync(resolve(dir, "plugins.lock.json"), JSON.stringify(lock, null, 2));
}

export function readPluginLock(
  cwd: string,
): Array<{ name: string; version: string; type: string; manifestHash: string }> | undefined {
  const lockPath = resolve(cwd, ".backend-gen", "plugins.lock.json");
  if (!existsSync(lockPath)) return undefined;
  try {
    const raw = readFileSync(lockPath, "utf8");
    const lock = JSON.parse(raw);
    return lock.plugins as Array<{
      name: string;
      version: string;
      type: string;
      manifestHash: string;
    }>;
  } catch {
    return undefined;
  }
}

function satisfies(version: string, range: string): boolean {
  if (range === "*" || range === "x") return true;
  if (range.startsWith(">=")) {
    const min = range.slice(2);
    return compareVersions(version, min) >= 0;
  }
  if (range.startsWith("^")) {
    const min = range.slice(1);
    const parts = min.split(".");
    return version.startsWith(parts[0] + ".");
  }
  if (range.startsWith("~")) {
    const min = range.slice(1);
    const parts = min.split(".");
    return parts.length >= 2
      ? version.startsWith(parts[0] + "." + parts[1])
      : version.startsWith(parts[0]);
  }
  if (range.includes("x")) {
    const parts = range.split(".");
    const versionParts = version.split(".");
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === "x") return true;
      if (versionParts[i] === undefined) return false;
      if (parts[i] !== versionParts[i]) return false;
    }
    return true;
  }

  const [op, target] = range.split(/([<>=]+)/).filter(Boolean);
  if (op && target) {
    const cmp = compareVersions(version, target);
    switch (op) {
      case ">=":
        return cmp >= 0;
      case ">":
        return cmp > 0;
      case "<=":
        return cmp <= 0;
      case "<":
        return cmp < 0;
      case "=":
      case "==":
        return cmp === 0;
      default:
        return version === range;
    }
  }

  return version === range;
}

function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const nA = partsA[i] ?? 0;
    const nB = partsB[i] ?? 0;
    if (nA > nB) return 1;
    if (nA < nB) return -1;
  }
  return 0;
}
