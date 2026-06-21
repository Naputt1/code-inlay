import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { watch } from "node:fs";
import type {
  AppDefinition,
  CompileOptions,
  CompileResult,
  Diagnostic,
  GeneratedFilePatch,
} from "./types.js";
import { buildAst } from "./ast.js";
import { applyArchitecture } from "./architecture.js";
import { generateCode } from "./codegen.js";
import { applyPatches, detectDrift } from "./region.js";
import { formatGoSnippet } from "./format.js";
import { checkGoEnvironment } from "./env.js";
import { createPluginRegistry, runTransformerStage, runTargets, runValidators } from "./plugins.js";
import {
  buildDependencyGraph,
  readCache,
  writeCache,
  validateCache,
  invalidateChanged,
} from "./cache.js";
import { atomicWritePatches, removeOrphanedRegions, validateBeforeWrite } from "./writer.js";

export async function compile(options: CompileOptions): Promise<CompileResult> {
  const cwd = options.cwd ?? process.cwd();
  const diagnostics: Diagnostic[] = [];
  const app = options.app ?? (await loadConfig(options.configFile, cwd, diagnostics));

  if (!app) {
    return emptyResult(diagnostics);
  }

  const registry = createPluginRegistry(app, diagnostics);

  let ast = buildAst(app, diagnostics);
  const filteredAst = filterAst(ast, options.module, options.route);
  ast = filteredAst;

  ast = await runTransformerStage("preTransform", ast, registry, diagnostics);

  const architecture = applyArchitecture(ast, diagnostics);
  ast = await runTransformerStage("architecture", ast, registry, diagnostics);

  ast = await runTransformerStage("adapter", ast, registry, diagnostics);

  let moduleInfo: ReturnType<typeof checkGoEnvironment>;
  if (options.configFile !== undefined) {
    const adapterName = typeof ast.router.adapter === "string" ? ast.router.adapter : undefined;
    moduleInfo = checkGoEnvironment(cwd, diagnostics, adapterName);
  }

  let generation = generateCode(ast, architecture, diagnostics, moduleInfo);
  ast = await runTransformerStage("codegen", ast, registry, diagnostics);
  ast = await runTransformerStage("postTransform", ast, registry, diagnostics);

  const targetPatches = await runTargets(
    ast,
    architecture,
    registry,
    diagnostics,
    cwd,
    app.options,
  );

  generation = {
    files: [...generation.files, ...targetPatches]
      .reduce((acc, file) => {
        const existing = acc.find((f) => f.path === file.path);
        if (existing) {
          existing.regions.push(...file.regions);
        } else {
          acc.push({ ...file, regions: [...file.regions] });
        }
        return acc;
      }, [] as GeneratedFilePatch[])
      .map((file) => ({
        ...file,
        regions: file.regions.map((region) => ({
          ...region,
          content:
            region.language === "go"
              ? formatGoSnippet(region.content, diagnostics, region.id)
              : region.content,
        })),
      })),
  };

  await runValidators(ast, registry, diagnostics);

  if (!validateBeforeWrite(generation.files, diagnostics)) {
    return {
      ast,
      architecture,
      generation,
      diagnostics,
      changedFiles: [],
      diffs: [],
    };
  }

  const cache = readCache(cwd);
  if (cache) {
    for (const file of generation.files) {
      for (const region of file.regions) {
        if (region.stableHash && cache.regions[region.stableHash]) {
          detectDrift(
            "",
            [region],
            { [region.stableHash]: cache.regions[region.stableHash] },
            diagnostics,
            file.path,
            options.forceRegions ?? (options.forceRegion ? [options.forceRegion] : undefined),
          );
        }
      }
    }
  }

  if (options.dryRun || hasErrors(diagnostics)) {
    return {
      ast,
      architecture,
      generation,
      diagnostics,
      changedFiles: [],
      diffs: [],
    };
  }

  if (options.check) {
    const dryInjected = applyPatches({
      cwd,
      patches: generation.files,
      diagnostics,
      write: false,
      fileCreation: app.options.fileCreation,
    });
    return {
      ast,
      architecture,
      generation,
      diagnostics,
      changedFiles: dryInjected.changedFiles,
      diffs: dryInjected.diffs,
    };
  }

  const oldCache = readCache(cwd);

  const injected = atomicWritePatches(generation.files, cwd, app.options.fileCreation, diagnostics);

  const currentPatchFiles = new Set(generation.files.map((f) => f.path));
  const currentRegionIds = new Set(generation.files.flatMap((f) => f.regions.map((r) => r.id)));

  if (!hasErrors(diagnostics)) {
    const internalDir = resolve(cwd, "internal");
    if (existsSync(internalDir)) {
      const scanDir = (dir: string): void => {
        let entries: string[];
        try {
          entries = readdirSync(dir);
        } catch {
          return;
        }
        for (const entry of entries) {
          const abs = resolve(dir, entry);
          try {
            const st = statSync(abs);
            if (st.isDirectory()) {
              scanDir(abs);
            } else if (
              st.isFile() &&
              entry.endsWith(".go") &&
              !currentPatchFiles.has(abs.replace(resolve(cwd), "").replace(/^\//, ""))
            ) {
              const relPath = abs.replace(resolve(cwd) + "/", "");
              if (currentPatchFiles.has(relPath)) continue;
              const content = readFileSync(abs, "utf8");
              if (!content.includes("// @gen:start")) continue;
              const after = removeOrphanedRegions(content, currentRegionIds, diagnostics, relPath);
              if (content !== after) {
                writeFileSync(abs, after, "utf8");
                injected.changedFiles.push(relPath);
              }
            }
          } catch {
            // skip unreadable entries
          }
        }
      };
      scanDir(internalDir);
    }
  }

  if (!hasErrors(diagnostics)) {
    const dependencyGraph = buildDependencyGraph(ast, architecture, generation);
    const pluginManifestHash = registry.manifestHash;
    const regions: Record<
      string,
      {
        id: string;
        stableHash: string;
        contentHash: string;
        file: string;
        owner?: string;
        groupKey?: string;
      }
    > = {};
    const files: Record<string, { regions: string[] }> = {};

    for (const file of generation.files) {
      files[file.path] = {
        regions: file.regions.map((r) => r.stableHash ?? r.id),
      };
      for (const region of file.regions) {
        const key = region.stableHash ?? region.id;
        regions[key] = {
          id: region.id,
          stableHash: region.stableHash ?? region.id,
          contentHash: region.contentHash ?? "",
          file: file.path,
          owner: region.owner,
          groupKey: region.groupKey,
        };
      }
    }

    writeCache(cwd, {
      compilerVersion: "0.2.0",
      astVersion: "2.0",
      pluginManifestHash,
      dependencyGraph,
      regions,
      files,
    });
  }

  return {
    ast,
    architecture,
    generation,
    diagnostics,
    changedFiles: injected.changedFiles,
    diffs: injected.diffs,
    dependencyGraph: buildDependencyGraph(ast, architecture, generation),
  };
}

export async function compileIncremental(options: CompileOptions): Promise<CompileResult> {
  const cwd = options.cwd ?? process.cwd();
  const diagnostics: Diagnostic[] = [];

  const cache = readCache(cwd);

  if (cache && validateCache(cache, "0.2.0", "2.0", "")) {
    if (options.changedFiles && options.changedFiles.length > 0) {
      const invalidated = invalidateChanged(cache, cache.dependencyGraph, options.changedFiles);
      if (invalidated.size === 0 && !options.watch) {
        return {
          generation: { files: [] },
          diagnostics: [],
          changedFiles: [],
          diffs: [],
        };
      }
    }
  }

  return compile(options);
}

export async function compileWithWatch(options: CompileOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const runCompile = async () => {
    const result = await compileIncremental(options);
    printDiagnostics(result.diagnostics);

    if (result.diagnostics.some((d) => d.level === "error")) {
      return;
    }

    if (result.changedFiles.length > 0) {
      console.log(`Updated ${result.changedFiles.length} file(s):`);
      for (const file of result.changedFiles) {
        console.log(`  - ${file}`);
      }
    }
  };

  const configPath = options.configFile ? resolve(cwd, options.configFile) : undefined;

  const debouncedRun = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runCompile, 300);
  };

  if (configPath) {
    watch(configPath, debouncedRun);
  }

  watch(resolve(cwd, "internal"), { recursive: true }, debouncedRun);
  watch(resolve(cwd, "cmd"), { recursive: true }, debouncedRun);

  console.log("Watching for changes... (Ctrl+C to stop)");
  await runCompile();

  await new Promise<void>(() => {});
}

async function loadConfig(
  configFile: string | undefined,
  cwd: string,
  diagnostics: Diagnostic[],
): Promise<AppDefinition | undefined> {
  if (!configFile) {
    diagnostics.push({
      level: "error",
      code: "missing-config",
      message: "A config file is required when no app definition is passed.",
    });
    return undefined;
  }

  try {
    const absolutePath = resolve(cwd, configFile);
    if (absolutePath.endsWith(".ts") || absolutePath.endsWith(".tsx")) {
      const { register } = await import("tsx/esm/api");
      const unregister = register();
      try {
        const module = await import(`${pathToFileURL(absolutePath).href}?t=${Date.now()}`);
        return readDefaultApp(module, configFile, diagnostics);
      } finally {
        unregister();
      }
    }

    const module = await import(`${pathToFileURL(absolutePath).href}?t=${Date.now()}`);
    return readDefaultApp(module, configFile, diagnostics);
  } catch (error) {
    diagnostics.push({
      level: "error",
      code: "config-load-failed",
      message: error instanceof Error ? error.message : String(error),
      file: configFile,
    });
    return undefined;
  }
}

function readDefaultApp(
  module: { default?: unknown },
  configFile: string | undefined,
  diagnostics: Diagnostic[],
): AppDefinition | undefined {
  const value = module.default;
  const app = isAppDefinition(value)
    ? value
    : isModuleWithDefault(value) && isAppDefinition(value.default)
      ? value.default
      : undefined;

  if (!app) {
    diagnostics.push({
      level: "error",
      code: "invalid-config-export",
      message: "Config file must default export a value returned by defineApp().",
      file: configFile,
    });
  }

  return app;
}

function isModuleWithDefault(value: unknown): value is { default: unknown } {
  return typeof value === "object" && value !== null && "default" in value;
}

function isAppDefinition(value: unknown): value is AppDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    (value as { kind?: unknown }).kind === "AppDefinition"
  );
}

function filterAst<T extends { modules: { name: string; routes: { id: string }[] }[] }>(
  ast: T,
  moduleName?: string,
  routeId?: string,
): T {
  return {
    ...ast,
    modules: ast.modules
      .filter((module) => !moduleName || module.name === moduleName)
      .map((module) => ({
        ...module,
        routes: module.routes.filter((route) => !routeId || route.id === routeId),
      })),
  };
}

function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.level === "error");
}

function emptyResult(diagnostics: Diagnostic[]): CompileResult {
  return {
    generation: { files: [] },
    diagnostics,
    changedFiles: [],
    diffs: [],
  };
}

export function printDiagnostics(diagnostics: Diagnostic[]): void {
  for (const diagnostic of diagnostics) {
    const prefix = diagnostic.level === "error" ? "error" : "warning";
    const location = diagnostic.file ? ` ${diagnostic.file}` : "";
    const region = diagnostic.regionId ? ` [${diagnostic.regionId}]` : "";
    console.error(`${prefix} ${diagnostic.code}${location}${region}: ${diagnostic.message}`);
  }
}
