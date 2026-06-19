import type {
  AdapterPlugin,
  AppAst,
  AppDefinition,
  ArchitectureAst,
  ArchitecturePlugin,
  AstPatch,
  BackendCompilerPlugin,
  CodeTarget,
  CompileSettings,
  Diagnostic,
  GeneratedFilePatch,
  PipelineStage,
  PluginPackage,
  TargetContext,
  TransformerPlugin,
  ValidatorPlugin,
} from "./types.js";
import { architectureRegistry } from "./architecture.js";
import { adapterRegistry } from "./adapters.js";
import { builtinTargets } from "./targets/index.js";
import { stableHash } from "./hash.js";

export type PluginRegistry = {
  plugins: BackendCompilerPlugin[];
  architectures: Map<string, ArchitecturePlugin>;
  adapters: Map<string, AdapterPlugin>;
  transformers: TransformerPlugin[];
  validators: ValidatorPlugin[];
  targets: Map<string, CodeTarget>;
  packages: Map<string, PluginPackage>;
  manifestHash: string;
};

export function createPluginRegistry(
  app: AppDefinition,
  diagnostics: Diagnostic[],
): PluginRegistry {
  const builtInPlugin: BackendCompilerPlugin = {
    name: "@backend-gen/builtin",
    version: "0.3.0",
    apiVersion: "2",
    architectures: Object.values(architectureRegistry),
    adapters: Object.values(adapterRegistry),
  };

  const plugins = [builtInPlugin, ...app.plugins];
  const seen = new Set<string>();
  const architectures = new Map<string, ArchitecturePlugin>();
  const adapters = new Map<string, AdapterPlugin>();
  const transformers: TransformerPlugin[] = [];
  const validators: ValidatorPlugin[] = [];
  const targets = new Map<string, CodeTarget>();
  const packages = new Map<string, PluginPackage>();

  for (const plugin of plugins) {
    if (seen.has(plugin.name)) {
      diagnostics.push({
        level: "error",
        code: "duplicate-plugin",
        message: `Plugin "${plugin.name}" is registered more than once.`,
      });
      continue;
    }
    seen.add(plugin.name);

    if (plugin.apiVersion !== "2" && plugin.apiVersion !== "3") {
      diagnostics.push({
        level: "error",
        code: "unsupported-plugin-api",
        message: `Plugin "${plugin.name}" declares unsupported apiVersion "${plugin.apiVersion}".`,
      });
      continue;
    }

    for (const architecture of plugin.architectures ?? []) {
      architectures.set(architecture.name, architecture);
    }
    for (const adapter of plugin.adapters ?? []) {
      adapters.set(adapter.name, adapter);
    }
    transformers.push(...(plugin.transformers ?? []));
    validators.push(...(plugin.validators ?? []));
  }

  for (const [name, target] of Object.entries(builtinTargets)) {
    targets.set(name, target);
  }

  for (const target of app.targets ?? []) {
    if (!target || typeof target !== "object" || !("name" in target)) continue;
    if (targets.has(target.name)) {
      diagnostics.push({
        level: "warning",
        code: "duplicate-target",
        message: `Code target "${target.name}" registered more than once. Using first.`,
      });
      continue;
    }
    targets.set(target.name, target);
  }

  return {
    plugins,
    architectures,
    adapters,
    transformers,
    validators,
    targets,
    packages,
    manifestHash: stableHash(
      [
        ...plugins.map((plugin) => ({
          name: plugin.name,
          version: plugin.version,
          apiVersion: plugin.apiVersion,
          architectures: plugin.architectures?.map((item) => item.name).sort(),
          adapters: plugin.adapters?.map((item) => item.name).sort(),
        })),
        ...(app.targets?.map((t) => ({ name: t.name, version: t.version })) ??
          []),
      ],
      16,
    ),
  };
}

export async function runTransformerStage(
  stage: PipelineStage,
  ast: AppAst,
  registry: PluginRegistry,
  diagnostics: Diagnostic[],
): Promise<AppAst> {
  let next = ast;
  const hooks = registry.transformers
    .flatMap((transformer) =>
      (transformer.hooks ?? []).map((hook) => ({
        transformer,
        hook,
      })),
    )
    .filter((entry) => entry.hook.stage === stage)
    .sort((a, b) => {
      const order = (a.hook.order ?? 0) - (b.hook.order ?? 0);
      return order !== 0
        ? order
        : a.transformer.name.localeCompare(b.transformer.name);
    });

  for (const { transformer, hook } of hooks) {
    const plugin: BackendCompilerPlugin = {
      name: transformer.name,
      version: transformer.version ?? "0.0.0",
      apiVersion: "2",
    };
    const result = await hook.run({ diagnostics, plugin }, next);
    if (Array.isArray(result)) {
      next = applyAstPatches(next, result, diagnostics);
    } else {
      next = result;
    }
  }

  return next;
}

export async function runValidators(
  ast: AppAst,
  registry: PluginRegistry,
  diagnostics: Diagnostic[],
): Promise<void> {
  for (const validator of registry.validators.sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const plugin: BackendCompilerPlugin = {
      name: validator.name,
      version: validator.version,
      apiVersion: "2",
    };
    await validator.validate({ diagnostics, plugin }, ast);
  }
}

export async function runTargets(
  ast: AppAst,
  architecture: ArchitectureAst,
  registry: PluginRegistry,
  diagnostics: Diagnostic[],
  cwd: string,
  options: CompileSettings,
): Promise<GeneratedFilePatch[]> {
  const enabledTargets = (options.targets ?? []).filter(
    (t) => t !== "go-server",
  );
  const patches: GeneratedFilePatch[] = [];
  const seenPaths = new Map<string, GeneratedFilePatch>();

  const mergePatch = (patch: GeneratedFilePatch) => {
    const existing = seenPaths.get(patch.path);
    if (existing) {
      existing.regions.push(...patch.regions);
    } else {
      seenPaths.set(patch.path, { ...patch, regions: [...patch.regions] });
      patches.push(seenPaths.get(patch.path)!);
    }
  };

  for (const targetName of enabledTargets) {
    const target = registry.targets.get(targetName);
    if (!target) {
      diagnostics.push({
        level: "warning",
        code: "unknown-target",
        message: `Code target "${targetName}" is not registered. Skipping.`,
      });
      continue;
    }

    try {
      const ctx: TargetContext = {
        diagnostics,
        ast,
        architecture,
        registry,
        cwd,
        options,
      };
      const result = await target.generate(ctx);
      for (const patch of result) {
        mergePatch(patch);
      }
    } catch (error) {
      diagnostics.push({
        level: "error",
        code: "target-failed",
        message: `Target "${targetName}" failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return patches.sort((a, b) => a.path.localeCompare(b.path));
}

function applyAstPatches(
  ast: AppAst,
  patches: AstPatch[],
  diagnostics: Diagnostic[],
): AppAst {
  let next = ast;
  for (const patch of patches) {
    if (patch.op === "replaceAst") {
      next = patch.ast;
    } else if (patch.op === "addDiagnostic") {
      diagnostics.push(patch.diagnostic);
    }
  }
  return next;
}
