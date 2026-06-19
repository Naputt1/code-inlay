import type {
  AppAst,
  ArchitectureAst,
  ArchitectureContext,
  ArchitecturePlugin,
  BuiltInArchitectureName,
  Diagnostic,
  GeneratedLayer,
  RouteAst,
} from "./types.js";
import { defaultFileForLayer, defaultRegionId, pascalCase } from "./naming.js";

const cleanLayers = ["types", "domain", "repository", "usecase", "handler"] as const;

export const cleanArchitecture: ArchitecturePlugin = {
  name: "clean",
  transform(ctx, ast) {
    return {
      routes: ast.modules.flatMap((module) =>
        module.routes.map((route) => ({
          route,
          layers: cleanLayers.map((layer): GeneratedLayer => ({
            kind: layer,
            symbolName: `${pascalCase(route.id)}${pascalCase(route.moduleName)}${pascalCase(layer)}`,
            file: ctx.fileForLayer(route, layer),
            regionId: ctx.regionId(route, layer),
          })),
        })),
      ),
    };
  },
};

export const architectureRegistry: Record<BuiltInArchitectureName, ArchitecturePlugin> = {
  clean: cleanArchitecture,
  minimal: stubArchitecture("minimal", ["types", "handler"]),
  atomic: stubArchitecture("atomic", ["types", "handler", "service", "store"]),
  layered: stubArchitecture("layered", ["types", "controller", "service", "repository", "model"]),
};

export function resolveArchitecture(
  ref: AppAst["architecture"],
  diagnostics: Diagnostic[],
): ArchitecturePlugin | undefined {
  if (typeof ref === "string") {
    const architecture = architectureRegistry[ref];
    if (!architecture) {
      diagnostics.push({
        level: "error",
        code: "unknown-architecture",
        message: `Unknown architecture "${ref}".`,
      });
    }
    return architecture;
  }
  return ref;
}

export function applyArchitecture(ast: AppAst, diagnostics: Diagnostic[]): ArchitectureAst {
  const architecture = resolveArchitecture(ast.architecture, diagnostics);
  if (!architecture) {
    return { routes: [] };
  }

  const ctx: ArchitectureContext = {
    diagnostics,
    fileForLayer: defaultFileForLayer,
    regionId: defaultRegionId,
  };

  return architecture.transform(ctx, ast);
}

function stubArchitecture(name: BuiltInArchitectureName, layers: string[]): ArchitecturePlugin {
  return {
    name,
    transform(ctx, ast) {
      ctx.diagnostics.push({
        level: "warning",
        code: "architecture-stub",
        message: `Architecture "${name}" is registered as an MVP stub; generated layer names are provisional.`,
      });

      return {
        routes: ast.modules.flatMap((module) =>
          module.routes.map((route: RouteAst) => ({
            route,
            layers: layers.map((layer) => ({
              kind: layer,
              symbolName: `${pascalCase(route.id)}${pascalCase(route.moduleName)}${pascalCase(layer)}`,
              file: ctx.fileForLayer(route, layer),
              regionId: ctx.regionId(route, layer),
            })),
          })),
        ),
      };
    },
  };
}
