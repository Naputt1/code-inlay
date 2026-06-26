import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { PluginPackage } from "../types/index.js";
import {
  resolvePluginPackage,
  checkPluginCompatibility,
  savePluginLock,
  readPluginLock,
} from "../plugins/resolver.js";
import type { ParsedArgs } from "./index.js";

export async function pluginCommand(parsed: ParsedArgs): Promise<void> {
  const subcommand = parsed.subcommand ?? "list";
  const cwd = (parsed.flags.cwd as string) ?? process.cwd();

  switch (subcommand) {
    case "add":
      return pluginAdd(parsed.args, cwd);
    case "remove":
      return pluginRemove(parsed.args, cwd);
    case "list":
      return pluginList(cwd);
    case "update":
      return pluginUpdate(cwd);
    default:
      console.error(`Unknown plugin subcommand "${subcommand}".`);
      console.log(`Usage: backend-gen plugin <add|remove|list|update> [name]`);
      process.exitCode = 1;
  }
}

async function pluginAdd(args: string[], cwd: string): Promise<void> {
  const packageName = args[0];
  if (!packageName) {
    console.error("Usage: backend-gen plugin add <package-name>");
    process.exitCode = 1;
    return;
  }

  console.log(`Installing plugin: ${packageName}...`);

  try {
    execSync(`npm install ${packageName}`, { cwd, stdio: "pipe" });
  } catch {
    try {
      execSync(`pnpm add ${packageName}`, { cwd, stdio: "pipe" });
    } catch {
      try {
        execSync(`yarn add ${packageName}`, { cwd, stdio: "pipe" });
      } catch {
        console.error(`Failed to install "${packageName}". Ensure npm/pnpm/yarn is available.`);
        process.exitCode = 1;
        return;
      }
    }
  }

  const diagnostics: Array<{ level: string; code: string; message: string }> = [];
  const manifest = resolvePluginPackage(packageName, cwd, diagnostics as never);

  if (!manifest) {
    console.error(`Plugin "${packageName}" has no valid plugin.json or code-inlay metadata.`);
    process.exitCode = 1;
    return;
  }

  if (!checkPluginCompatibility(manifest, diagnostics as never)) {
    console.error(`Plugin "${packageName}" is incompatible with current compiler version.`);
    for (const d of diagnostics) {
      console.error(`  - ${d.message}`);
    }
    process.exitCode = 1;
    return;
  }

  const existing = readPluginLock(cwd) ?? [];
  existing.push({
    name: manifest.name,
    version: manifest.version,
    type: manifest.type,
    manifestHash: manifest.manifestHash,
  });

  savePluginLock([manifest], cwd);

  console.log(`Plugin "${packageName}@${manifest.version}" installed successfully.`);
  console.log(`Type: ${manifest.type}`);
  console.log(`Add to backend.config.ts:`);
  console.log(`  import ${manifest.name.replace(/[^a-zA-Z0-9_$]/g, "_")} from "${packageName}";`);
  console.log(`  plugins: [${manifest.name.replace(/[^a-zA-Z0-9_$]/g, "_")}]`);
}

async function pluginRemove(args: string[], cwd: string): Promise<void> {
  const packageName = args[0];
  if (!packageName) {
    console.error("Usage: backend-gen plugin remove <package-name>");
    process.exitCode = 1;
    return;
  }

  try {
    execSync(`npm uninstall ${packageName}`, { cwd, stdio: "pipe" });
  } catch {
    try {
      execSync(`pnpm remove ${packageName}`, { cwd, stdio: "pipe" });
    } catch {
      // ignore uninstall errors
    }
  }

  const existing = readPluginLock(cwd) ?? [];
  const filtered = existing.filter((p) => p.name !== packageName);

  if (filtered.length !== existing.length) {
    const manifest = resolvePluginPackage(packageName, cwd, []);
    if (manifest) {
      savePluginLock([manifest], cwd);
    }
    console.log(`Plugin "${packageName}" removed.`);
  } else {
    console.log(`Plugin "${packageName}" not found in lock file.`);
  }
}

async function pluginList(cwd: string): Promise<void> {
  const lockPath = resolve(cwd, ".backend-gen", "plugins.lock.json");
  if (!existsSync(lockPath)) {
    console.log("No plugins installed.");
    return;
  }

  const plugins = readPluginLock(cwd) ?? [];
  if (plugins.length === 0) {
    console.log("No plugins installed.");
    return;
  }

  console.log("Installed plugins:");
  for (const plugin of plugins) {
    const compat = plugin.manifestHash ? "[verified]" : "[unverified]";
    console.log(`  ${plugin.name}@${plugin.version} (${plugin.type}) ${compat}`);
  }
}

async function pluginUpdate(cwd: string): Promise<void> {
  const existing = readPluginLock(cwd) ?? [];
  if (existing.length === 0) {
    console.log("No plugins to update.");
    return;
  }

  const updatedPlugins: Array<{
    name: string;
    version: string;
    type: string;
    manifestHash: string;
  }> = [];

  for (const plugin of existing) {
    console.log(`Checking ${plugin.name}...`);
    try {
      execSync(`npm update ${plugin.name}`, { cwd, stdio: "pipe" });
    } catch {
      // ignore
    }

    const diagnostics: Array<{ level: string; code: string; message: string }> = [];
    const manifest = resolvePluginPackage(plugin.name, cwd, diagnostics as never);
    if (manifest) {
      updatedPlugins.push({
        name: manifest.name,
        version: manifest.version,
        type: manifest.type,
        manifestHash: manifest.manifestHash,
      });

      if (manifest.version !== plugin.version) {
        console.log(`  Updated: ${plugin.version} -> ${manifest.version}`);
      } else {
        console.log(`  Up to date (${manifest.version})`);
      }
    } else {
      updatedPlugins.push(plugin);
    }
  }

  savePluginLock(
    updatedPlugins.map((p) => ({
      name: p.name,
      version: p.version,
      type: p.type as PluginPackage["type"],
      compatibility: { astVersion: "1.x", coreVersion: ">=1.0.0" },
      manifestHash: p.manifestHash,
      capabilities: [],
    })),
    cwd,
  );
}
