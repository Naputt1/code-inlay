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
import { defaultFileForLayer, defaultRegionId, lowerIdent, pascalCase } from "./naming.js";
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

  const routeLinesByFile = new Map<string, string[]>();
  const modulesWithHandlers = new Map<string, string[]>();

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
        const routeFile = defaultFileForLayer(route, "route");
        const lines = routeLinesByFile.get(routeFile) ?? [];
        lines.push(region.content);
        routeLinesByFile.set(routeFile, lines);
      }
    }
  }

  for (const [routeFile, routeLines] of routeLinesByFile) {
    const moduleImports: string[] = [];
    const handlerInitLines: string[] = [];

    for (const module of ast.modules) {
      const modPkg = module.name;
      const handlerType = `${pascalCase(modPkg)}Handler`;
      const handlerVar = `${lowerIdent(modPkg)}Handler`;
      const layerKinds = new Set(architecture.routes
        .filter((r) => r.route.moduleName === modPkg)
        .flatMap((r) => r.layers.map((l) => l.kind)));

      if (layerKinds.has("handler") || layerKinds.has("usecase")) {
        if (moduleInfo) {
          moduleImports.push(`"${moduleInfo.modulePath}/internal/${modPkg}"`);
        }
        const usecaseFields: string[] = [];
        for (const expansion of architecture.routes) {
          if (expansion.route.moduleName !== modPkg) continue;
          const layers = new Set(expansion.layers.map((l) => l.kind));
          if (!layers.has("handler") && !layers.has("usecase")) continue;
          usecaseFields.push(`\t\t${expansion.route.handlerName}Usecase: nil, // TODO: inject`);
        }
        handlerInitLines.push(`\t${handlerVar} := &${modPkg}.${handlerType}{`);
        handlerInitLines.push(...usecaseFields);
        handlerInitLines.push(`\t}`);
      }
    }

    const body: string[] = [];
    if (moduleImports.length > 0 || moduleInfo) {
      body.push(`import (`);
      body.push(`\t"github.com/gin-gonic/gin"`);
      for (const imp of moduleImports.sort()) {
        body.push(`\t${imp}`);
      }
      body.push(`)`);
      body.push(``);
    }
    body.push(`func RegisterRoutes(api *gin.RouterGroup) {`);
    body.push(...handlerInitLines);
    body.push(``);
    for (const line of routeLines) {
      body.push(`\t${line}`);
    }
    body.push(`}`);

    add(routeFile, {
      id: "routes.register",
      stableHash: `${routeFile}:register`,
      owner: "code-inlay",
      language: "go",
      content: body.join("\n"),
    });
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
