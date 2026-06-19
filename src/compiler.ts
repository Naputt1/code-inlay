import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
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
import { applyPatches } from "./region.js";
import { formatGoSnippet } from "./format.js";
import { checkGoEnvironment } from "./env.js";

export async function compile(options: CompileOptions): Promise<CompileResult> {
  const cwd = options.cwd ?? process.cwd();
  const diagnostics: Diagnostic[] = [];
  const app = options.app ?? (await loadConfig(options.configFile, cwd, diagnostics));

  if (!app) {
    return emptyResult(diagnostics);
  }

  const ast = buildAst(app, diagnostics);
  const filteredAst = filterAst(ast, options.module, options.route);
  const architecture = applyArchitecture(filteredAst, diagnostics);

  let moduleInfo: ReturnType<typeof checkGoEnvironment>;
  if (options.configFile !== undefined) {
    const adapterName = typeof ast.router.adapter === "string" ? ast.router.adapter : undefined;
    moduleInfo = checkGoEnvironment(cwd, diagnostics, adapterName);
  }

  const generation = formatGeneration(generateCode(filteredAst, architecture, diagnostics, moduleInfo), diagnostics);

  if (options.dryRun || hasErrors(diagnostics)) {
    return {
      ast: filteredAst,
      architecture,
      generation,
      diagnostics,
      changedFiles: [],
      diffs: [],
    };
  }

  const injected = applyPatches({
    cwd,
    patches: generation.files,
    diagnostics,
    write: !options.dryRun && !options.check,
  });

  return {
    ast: filteredAst,
    architecture,
    generation,
    diagnostics,
    changedFiles: injected.changedFiles,
    diffs: injected.diffs,
  };
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

function formatGeneration(
  generation: { files: GeneratedFilePatch[] },
  diagnostics: Diagnostic[],
): { files: GeneratedFilePatch[] } {
  return {
    files: generation.files.map((file) => ({
      ...file,
      regions: file.regions.map((region) => ({
        ...region,
        content: region.language === "go" ? formatGoSnippet(region.content, diagnostics, region.id) : region.content,
      })),
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
