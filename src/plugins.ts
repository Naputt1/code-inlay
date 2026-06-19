import type {
  AdapterPlugin,
  AppAst,
  AppDefinition,
  ArchitecturePlugin,
  AstPatch,
  BackendCompilerPlugin,
  Diagnostic,
  PipelineStage,
  TransformerPlugin,
  ValidatorPlugin,
} from "./types.js";
import { architectureRegistry } from "./architecture.js";
import { adapterRegistry } from "./adapters.js";
import { stableHash } from "./hash.js";

export type PluginRegistry = {
  plugins: BackendCompilerPlugin[];
  architectures: Map<string, ArchitecturePlugin>;
  adapters: Map<string, AdapterPlugin>;
  transformers: TransformerPlugin[];
  validators: ValidatorPlugin[];
  manifestHash: string;
};

export function createPluginRegistry(app: AppDefinition, diagnostics: Diagnostic[]): PluginRegistry {
  const builtInPlugin: BackendCompilerPlugin = {
    name: "@backend-gen/builtin",
    version: "0.2.0",
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

    if (plugin.apiVersion !== "2") {
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

  return {
    plugins,
    architectures,
    adapters,
    transformers,
    validators,
    manifestHash: stableHash(
      plugins.map((plugin) => ({
        name: plugin.name,
        version: plugin.version,
        apiVersion: plugin.apiVersion,
        architectures: plugin.architectures?.map((item) => item.name).sort(),
        adapters: plugin.adapters?.map((item) => item.name).sort(),
      })),
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
      return order !== 0 ? order : a.transformer.name.localeCompare(b.transformer.name);
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
  for (const validator of registry.validators.sort((a, b) => a.name.localeCompare(b.name))) {
    const plugin: BackendCompilerPlugin = {
      name: validator.name,
      version: validator.version,
      apiVersion: "2",
    };
    await validator.validate({ diagnostics, plugin }, ast);
  }
}

function applyAstPatches(ast: AppAst, patches: AstPatch[], diagnostics: Diagnostic[]): AppAst {
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
