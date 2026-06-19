import type {
  AppAst,
  ArchitectureAst,
  Diagnostic,
  GeneratedFilePatch,
  GeneratedRegion,
  GenerationAst,
  RouteAst,
  AdapterPlugin,
} from "./types.js";
import type { GoModuleInfo } from "./env.js";
import { defaultFileForLayer, defaultRegionId, pascalCase } from "./naming.js";
import { generateRouteTypes, requestType, responseType } from "./schema.js";
import { generateGinHandler, resolveAdapters } from "./adapters.js";
import { generateServer, serverFilePath } from "./srvgen.js";
import { stableHash } from "./hash.js";

export function generateCode(
  ast: AppAst,
  architecture: ArchitectureAst,
  diagnostics: Diagnostic[],
  moduleInfo?: GoModuleInfo,
): GenerationAst {
  const files = new Map<string, GeneratedRegion[]>();

  const add = (path: string, region: GeneratedRegion) => {
    const regions = files.get(path) ?? [];
    regions.push(region);
    files.set(path, regions);
  };

  for (const expansion of architecture.routes) {
    const route = expansion.route;

    for (const layer of expansion.layers) {
      const content = generateLayerContent(route, layer.kind, diagnostics);
      if (content !== undefined) {
        add(layer.file, {
          id: layer.regionId,
          stableHash: layer.stableId
            ? `${layer.stableId}:${layer.file}:codegen`
            : `${route.stableId}:${layer.kind}:${layer.file}`,
          owner: layer.owner ?? "code-inlay",
          language: "go",
          content,
        });
      }
    }

    const adapters = resolveAdapters(route.resolvedAdapters, diagnostics);
    for (const adapter of adapters) {
      if (adapter.name === "gin") {
        add(defaultFileForLayer(route, "handler"), {
          ...generateGinHandler(route, diagnostics, adapter.name),
          stableHash: `${route.stableId}:${adapter.name}:handler:${defaultFileForLayer(route, "handler")}`,
          owner: adapter.name,
        });
      }

      const routeCtx = { diagnostics, route, architecture };
      const routeRegions = adapter.generateRoute?.(routeCtx) ?? [];
      for (const region of routeRegions) {
        add(defaultFileForLayer(route, "route"), {
          ...region,
          stableHash: region.stableHash ?? `${route.stableId}:${adapter.name}:route:${defaultFileForLayer(route, "route")}`,
          owner: adapter.name,
        });
      }
    }
  }

  for (const { file, regionId, content } of generateHandlerStructs(architecture)) {
    add(file, { id: regionId, language: "go", content });
  }

  if (moduleInfo) {
    const adapters = resolveAdapters(ast.adapters.refs.map((ref) => {
      if (typeof ref === "string") return { name: ref, transport: ref === "gin" ? "http" : ref };
      return { name: ref.name, transport: ref.transport ?? "http" };
    }), diagnostics);

    for (const adapter of adapters) {
      const serverPatch = generateServer(ast, architecture, moduleInfo, adapter);
      for (const region of serverPatch.regions) {
        add(serverPatch.path, {
          ...region,
          stableHash: region.stableHash ?? `${adapter.name}:server:${serverFilePath}`,
          owner: adapter.name,
        });
      }
    }
  }

  return {
    files: [...files.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, regions]): GeneratedFilePatch => ({
        path,
        regions: regions.sort((a, b) => a.id.localeCompare(b.id)),
      })),
  };
}

function generateLayerContent(
  route: RouteAst,
  layer: string,
  diagnostics: Diagnostic[],
): string | undefined {
  switch (layer) {
    case "types":
      return generateRouteTypes(route, diagnostics);
    case "domain":
      return generateDomain(route);
    case "repository":
      return generateRepository(route);
    case "usecase":
      return generateUsecase(route);
    case "handler":
      return undefined;
    default:
      diagnostics.push({
        level: "warning",
        code: "unknown-layer",
        message: `No built-in generator for layer "${layer}" on route "${route.moduleName}.${route.id}".`,
        regionId: defaultRegionId(route, layer),
      });
      return "";
  }
}

function generateDomain(route: RouteAst): string {
  return `type ${pascalCase(route.moduleName)}ID string`;
}

function generateRepository(route: RouteAst): string {
  const moduleName = pascalCase(route.moduleName);
  return [
    `type ${moduleName}Repository interface {`,
    `\t// Add developer-owned persistence methods outside generated regions as needed.`,
    `}`,
  ].join("\n");
}

function generateUsecase(route: RouteAst): string {
  return [
    `type ${route.handlerName}Usecase interface {`,
    `\tExecute(ctx context.Context, input ${requestType(route)}) (${responseType(route)}, error)`,
    `}`,
  ].join("\n");
}

type HandlerStructOutput = {
  file: string;
  regionId: string;
  content: string;
};

function generateHandlerStructs(architecture: ArchitectureAst): HandlerStructOutput[] {
  const moduleFields = new Map<string, string[]>();

  for (const expansion of architecture.routes) {
    const route = expansion.route;
    const layers = new Set(expansion.layers.map((l) => l.kind));
    if (!layers.has("handler") && !layers.has("usecase")) continue;

    const fields = moduleFields.get(route.moduleName) ?? [];
    fields.push(`\t${route.handlerName}Usecase ${route.handlerName}Usecase`);
    moduleFields.set(route.moduleName, fields);
  }

  const result: HandlerStructOutput[] = [];
  for (const [moduleName, fields] of moduleFields) {
    const typeName = `${pascalCase(moduleName)}Handler`;
    result.push({
      file: `internal/${moduleName}/handler.go`,
      regionId: `${moduleName}.0handler.struct`,
      content: `type ${typeName} struct {\n${fields.join("\n")}\n}`,
    });
  }

  return result;
}
