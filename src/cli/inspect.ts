import type { AppDefinition } from "../types/index.js";
import { compile } from "../compiler/compiler.js";
import { renderGraph, renderPluginExecutionOrder } from "../cache/graph.js";
import type { ParsedArgs } from "./index.js";
import type { GraphFormat } from "../cache/graph.js";
import { basename, dirname, resolve } from "node:path";

export async function inspectCommand(parsed: ParsedArgs): Promise<void> {
  const subcommand = parsed.subcommand ?? "ast";
  const configFlag = parsed.flags.config as string | undefined;
  const cwdFlag = parsed.flags.cwd as string | undefined;

  let cwd: string;
  let configFile: string;

  if (cwdFlag) {
    cwd = cwdFlag;
    configFile = configFlag ?? "backend.config.ts";
  } else if (configFlag) {
    cwd = resolve(process.cwd(), dirname(configFlag));
    configFile = basename(configFlag);
  } else {
    cwd = process.cwd();
    configFile = "backend.config.ts";
  }
  const format = (parsed.flags.format as string) ?? "tree";

  switch (subcommand) {
    case "ast":
      return inspectAst(configFile, cwd, format as GraphFormat);
    case "route":
      return inspectRoute(configFile, cwd, parsed.args[0]);
    case "graph":
      return inspectGraph(configFile, cwd, format as GraphFormat);
    case "plugins":
      return inspectPlugins(configFile, cwd);
    case "regions":
      return inspectRegions(configFile, cwd);
    default:
      console.error(`Unknown inspect subcommand "${subcommand}".`);
      console.log(
        `Usage: backend-gen inspect <ast|route|graph|plugins|regions> [id] [--format tree|json|mermaid]`,
      );
      process.exitCode = 1;
  }
}

async function inspectAst(configFile: string, cwd: string, format: string): Promise<void> {
  const result = await compile({ configFile, cwd, dryRun: true });

  if (!result.ast || !result.architecture) {
    console.error("Failed to compile. Check diagnostics above.");
    if (result.diagnostics.length > 0) {
      for (const d of result.diagnostics) {
        console.error(`  ${d.level}: ${d.message}`);
      }
    }
    process.exitCode = 1;
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(result.ast, null, 2));
    return;
  }

  console.log(
    renderGraph(result.ast, result.architecture, result.generation, format as GraphFormat),
  );
}

async function inspectRoute(
  configFile: string,
  cwd: string,
  routeId: string | undefined,
): Promise<void> {
  if (!routeId) {
    console.error("Usage: backend-gen inspect route <route-id>");
    process.exitCode = 1;
    return;
  }

  const result = await compile({ configFile, cwd, dryRun: true });

  if (!result.ast || !result.architecture) {
    console.error("Failed to compile.");
    process.exitCode = 1;
    return;
  }

  const routeParts = routeId.split(".");
  const moduleName = routeParts.length > 1 ? routeParts[0] : undefined;
  const routeName = routeParts.length > 1 ? routeParts.slice(1).join(".") : routeId;

  for (const module of result.ast.modules) {
    if (moduleName && module.name !== moduleName) continue;
    for (const route of module.routes) {
      if (route.id !== routeName) continue;

      console.log(`Route: ${module.name}.${route.id}`);
      console.log(`  Method: ${route.method}`);
      console.log(`  Path: ${route.fullPath}`);
      console.log(`  Handler: ${route.handlerName}`);
      console.log(`  Query: ${route.query ? "yes" : "no"}`);
      console.log(`  Body: ${route.body ? "yes" : "no"}`);
      console.log(`  Response: ${route.response ? "yes" : "no"}`);

      const expansion = result.architecture.routes.find(
        (e) => e.route.id === route.id && e.route.moduleName === module.name,
      );

      if (expansion) {
        console.log(`  Architecture Layers:`);
        for (const layer of expansion.layers) {
          const drift = result.generation.files
            .flatMap((f) => f.regions)
            .find((r) => r.id === layer.regionId);
          const driftStatus = drift?.stableHash ? "[cached]" : "[new]";
          console.log(`    ${layer.kind}: ${layer.file} #${layer.regionId} ${driftStatus}`);
        }
      }

      const regions = result.generation.files.flatMap((f) =>
        f.regions.filter((r) => r.id.includes(route.id)),
      );
      if (regions.length > 0) {
        console.log(`  Generated Regions:`);
        for (const region of regions) {
          console.log(`    ${region.id} (${region.language}) [${region.owner ?? "unknown"}]`);
        }
      }

      return;
    }
  }

  console.error(`Route "${routeId}" not found.`);
  process.exitCode = 1;
}

async function inspectGraph(configFile: string, cwd: string, format: string): Promise<void> {
  const result = await compile({ configFile, cwd, dryRun: true });

  if (!result.ast || !result.architecture) {
    console.error("Failed to compile.");
    process.exitCode = 1;
    return;
  }

  console.log(
    renderGraph(result.ast, result.architecture, result.generation, format as GraphFormat),
  );
}

async function inspectPlugins(configFile: string, cwd: string): Promise<void> {
  const { compile: compileInternal, printDiagnostics } = await import("../compiler/compiler.js");
  const result = await compileInternal({ configFile, cwd, dryRun: true });

  printDiagnostics(result.diagnostics);

  if (!result.ast) {
    console.error("Failed to compile.");
    process.exitCode = 1;
    return;
  }

  const { createPluginRegistry } = await import("../plugins/registry.js");

  const appDef = await loadAppConfig(configFile, cwd);
  if (!appDef) {
    console.error("Failed to load config.");
    process.exitCode = 1;
    return;
  }

  const diagnostics: Array<{ level: string; code: string; message: string }> = [];
  const registry = createPluginRegistry(appDef, diagnostics as never);

  console.log(`Plugins: ${registry.plugins.length}`);
  for (const plugin of registry.plugins) {
    const archCount = plugin.architectures?.length ?? 0;
    const adapterCount = plugin.adapters?.length ?? 0;
    const transformerCount = plugin.transformers?.length ?? 0;
    const validatorCount = plugin.validators?.length ?? 0;
    console.log(`  ${plugin.name}@${plugin.version} (apiVersion: ${plugin.apiVersion})`);
    if (archCount > 0) console.log(`    Architectures: ${archCount}`);
    if (adapterCount > 0) console.log(`    Adapters: ${adapterCount}`);
    if (transformerCount > 0) console.log(`    Transformers: ${transformerCount}`);
    if (validatorCount > 0) console.log(`    Validators: ${validatorCount}`);
  }

  console.log("");
  console.log(renderPluginExecutionOrder(registry));
}

async function inspectRegions(configFile: string, cwd: string): Promise<void> {
  const result = await compile({ configFile, cwd, dryRun: true });

  if (!result.generation) {
    console.error("Failed to compile.");
    process.exitCode = 1;
    return;
  }

  let totalRegions = 0;
  for (const file of result.generation.files) {
    console.log(`File: ${file.path} (${file.regions.length} regions)`);
    for (const region of file.regions) {
      const status = region.stableHash ? `[cached: ${region.stableHash.slice(0, 8)}]` : "[new]";
      console.log(
        `  ${region.id} ${status} owner:${region.owner ?? "unknown"} lang:${region.language}`,
      );
      totalRegions++;
    }
  }

  console.log(`\nTotal: ${result.generation.files.length} files, ${totalRegions} regions`);
}

async function loadAppConfig(configFile: string, cwd: string): Promise<AppDefinition | undefined> {
  const { pathToFileURL } = await import("node:url");
  const { resolve } = await import("node:path");

  const absolutePath = resolve(cwd, configFile);
  if (absolutePath.endsWith(".ts")) {
    const { register } = await import("tsx/esm/api");
    const unregister = register();
    try {
      const module = await import(`${pathToFileURL(absolutePath).href}?t=${Date.now()}`);
      return module.default as AppDefinition | undefined;
    } finally {
      unregister();
    }
  }

  const module = await import(`${pathToFileURL(absolutePath).href}?t=${Date.now()}`);
  return module.default as AppDefinition | undefined;
}
