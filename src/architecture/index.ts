import type {
  AppAst,
  ArchitectureAst,
  ArchitectureContext,
  ArchitecturePlugin,
  ArchitectureSelection,
  BuiltInArchitectureName,
  Diagnostic,
  GeneratedLayer,
  RouteAst,
} from "../types/index.js";
import {
  defaultFileForLayer,
  defaultRegionId,
  fileForUsecaseGroup,
  regionIdForUsecase,
  resolveUsecaseGroupKey,
  resolveUsecaseOrg,
} from "../utils/naming.js";
import { stableHash } from "../utils/hash.js";

function buildArchitecture(name: string, layerKinds: readonly string[]): ArchitecturePlugin {
  return {
    name,
    transform(ctx, ast) {
      return {
        nodes: [],
        routes: ast.modules.flatMap((module) =>
          module.routes.map((route) => ({
            route,
            layers: layerKinds.map(
              (layer): GeneratedLayer => ({
                kind: layer,
                symbolName: `${pascalCase(route.id)}${pascalCase(route.moduleName)}${pascalCase(layer)}`,
                file: ctx.fileForLayer(route, layer),
                regionId: ctx.regionId(route, layer),
              }),
            ),
          })),
        ),
      };
    },
  };
}

const cleanLayers = ["entity", "domain", "repository", "usecase", "handler"] as const;
const minimalLayers = ["entity", "usecase", "handler"] as const;
const atomicLayers = ["entity", "handler", "service", "store"] as const;
const layeredLayers = ["entity", "controller", "service", "repository", "model"] as const;

export const cleanArchitecture = buildArchitecture("clean", cleanLayers);
export const minimalArchitecture = buildArchitecture("minimal", minimalLayers);
export const atomicArchitecture = buildArchitecture("atomic", atomicLayers);
export const layeredArchitecture = buildArchitecture("layered", layeredLayers);

export const architectureRegistry: Record<BuiltInArchitectureName, ArchitecturePlugin> = {
  clean: cleanArchitecture,
  minimal: minimalArchitecture,
  atomic: atomicArchitecture,
  layered: layeredArchitecture,
};

export function resolveArchitecture(
  selection: ArchitectureSelection,
  diagnostics: Diagnostic[],
): ArchitecturePlugin[] {
  const plugins: ArchitecturePlugin[] = [];
  for (const ref of selection.refs) {
    if (typeof ref === "string") {
      const architecture = architectureRegistry[ref];
      if (architecture) {
        plugins.push(architecture);
      } else {
        diagnostics.push({
          level: "error",
          code: "unknown-architecture",
          message: `Unknown architecture "${ref}".`,
        });
      }
    } else {
      plugins.push(ref);
    }
  }
  return plugins;
}

export function applyArchitecture(ast: AppAst, diagnostics: Diagnostic[]): ArchitectureAst {
  const allNodes: ArchitectureAst["nodes"] = [];
  const routeMap = new Map<string, { route: RouteAst; layers: GeneratedLayer[] }>();
  const featuresDir = ast.options.featuresDir;

  const baseCtx: ArchitectureContext = {
    diagnostics,
    fileForLayer: (route, layer) => defaultFileForLayer(route, layer, featuresDir),
    regionId: defaultRegionId,
    owner: "code-inlay",
  };

  for (const module of ast.modules) {
    const moduleSelection = module.architecture ?? ast.architecture;
    const modulePlugins = resolveArchitecture(moduleSelection, diagnostics);

    for (const route of module.routes) {
      const routeSelection = route.architecture ?? moduleSelection;
      const routePlugins = resolveArchitecture(routeSelection, diagnostics);
      const effectivePlugins = routePlugins.length > 0 ? routePlugins : modulePlugins;

      const ctxUsecaseFileForLayer = (r: RouteAst, layer: string): string => {
        if (layer === "usecase") {
          const org = resolveUsecaseOrg(
            r,
            module.usecaseOrganization,
            ast.options.usecaseOrganization,
          );
          const gk = resolveUsecaseGroupKey(r, org);
          return fileForUsecaseGroup(r.moduleName, gk, featuresDir);
        }
        return defaultFileForLayer(r, layer, featuresDir);
      };

      const ctxUsecaseRegionId = (r: RouteAst, layer: string): string => {
        if (layer === "usecase") {
          const org = resolveUsecaseOrg(
            r,
            module.usecaseOrganization,
            ast.options.usecaseOrganization,
          );
          const gk = resolveUsecaseGroupKey(r, org);
          return regionIdForUsecase(r, gk);
        }
        return defaultRegionId(r, layer);
      };

      for (const plugin of effectivePlugins) {
        const pluginAst: AppAst = {
          ...ast,
          modules: [{ ...module, routes: [route] }],
        };
        const ctx: ArchitectureContext = {
          ...baseCtx,
          fileForLayer: ctxUsecaseFileForLayer,
          regionId: ctxUsecaseRegionId,
          owner: plugin.name,
        };
        const result = plugin.transform(ctx, pluginAst);

        for (const expansion of result.routes) {
          const key = `${route.moduleName}.${route.id}`;
          if (!routeMap.has(key)) {
            routeMap.set(key, { route: expansion.route, layers: [] });
          }
          const entry = routeMap.get(key)!;

          for (const layer of expansion.layers) {
            const stableId = `${layer.kind}:${plugin.name}:${route.stableId}:${stableHash(layer.symbolName, 8)}`;
            const ownedLayer: GeneratedLayer = {
              ...layer,
              id: layer.id ?? `${route.moduleName}.${route.id}.${layer.kind}.${plugin.name}`,
              stableId,
              owner: plugin.name,
            };
            entry.layers.push(ownedLayer);
          }
        }

        allNodes.push(...result.nodes);
      }
    }
  }

  const routes = [...routeMap.values()];
  checkDuplicateSymbols(routes, diagnostics);
  checkDuplicateRegionIds(routes, diagnostics);

  return { nodes: allNodes, routes };
}

function pascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function checkDuplicateSymbols(
  expansions: Array<{ route: RouteAst; layers: GeneratedLayer[] }>,
  diagnostics: Diagnostic[],
): void {
  const symbolMap = new Map<string, GeneratedLayer[]>();

  for (const expansion of expansions) {
    for (const layer of expansion.layers) {
      const existing = symbolMap.get(layer.symbolName) ?? [];
      existing.push(layer);
      symbolMap.set(layer.symbolName, existing);
    }
  }

  for (const [symbolName, layers] of symbolMap) {
    if (layers.length <= 1) continue;

    const mergeKeys = new Set(layers.map((l) => l.mergeKey).filter(Boolean));
    if (mergeKeys.size === 1 && layers.length === mergeKeys.size) continue;

    const uniqueOwners = new Set(layers.map((l) => l.owner));
    if (uniqueOwners.size > 1 && mergeKeys.size !== 1) {
      diagnostics.push({
        level: "error",
        code: "duplicate-symbol",
        message: `Symbol "${symbolName}" is generated by multiple architectures (${[...uniqueOwners].join(", ")}) without a shared merge key.`,
        nodeId: symbolName,
      });
    }
  }
}

function checkDuplicateRegionIds(
  expansions: Array<{ route: RouteAst; layers: GeneratedLayer[] }>,
  diagnostics: Diagnostic[],
): void {
  const regionMap = new Map<string, GeneratedLayer[]>();

  for (const expansion of expansions) {
    for (const layer of expansion.layers) {
      if (!layer.regionId) continue;
      const existing = regionMap.get(layer.regionId) ?? [];
      existing.push(layer);
      regionMap.set(layer.regionId, existing);
    }
  }

  for (const [regionId, layers] of regionMap) {
    if (layers.length > 1) {
      const owners = [...new Set(layers.map((l) => l.owner))];
      diagnostics.push({
        level: "error",
        code: "duplicate-region-id",
        message: `Region id "${regionId}" is claimed by multiple architecture layers (${owners.join(", ")}).`,
        regionId,
      });
    }
  }
}
