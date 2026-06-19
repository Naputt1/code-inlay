import type {
  AppAst,
  ArchitectureAst,
  Diagnostic,
  GeneratedFilePatch,
  GeneratedRegion,
  GenerationAst,
  RouteAst,
} from "./types.js";
import type { GoModuleInfo } from "./env.js";
import { defaultFileForLayer, defaultRegionId, pascalCase } from "./naming.js";
import { generateRouteTypes, requestType, responseType } from "./schema.js";
import { generateGinHandler, resolveAdapter } from "./adapters.js";
import { generateServer, serverFilePath } from "./srvgen.js";

export function generateCode(
  ast: AppAst,
  architecture: ArchitectureAst,
  diagnostics: Diagnostic[],
  moduleInfo?: GoModuleInfo,
): GenerationAst {
  const files = new Map<string, GeneratedRegion[]>();
  const adapter = resolveAdapter(ast.router.adapter, diagnostics);

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
          language: "go",
          content,
        });
      }
    }

    if (adapter) {
      const ctx = { diagnostics, route, architecture };

      if (adapter.name === "gin") {
        add(defaultFileForLayer(route, "handler"), generateGinHandler(ctx));
      }
    }
  }

  for (const { file, regionId, content } of generateHandlerStructs(architecture)) {
    add(file, { id: regionId, language: "go", content });
  }

  if (moduleInfo && adapter) {
    const serverPatch = generateServer(ast, architecture, moduleInfo);
    for (const region of serverPatch.regions) {
      add(serverPatch.path, region);
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
