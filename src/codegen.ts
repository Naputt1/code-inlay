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

  const routeLinesByFile = new Map<string, Array<{ content: string; group: string }>>();
  const middlewareByFile = new Map<string, Set<string>>();

  const domainModules = new Set<string>();
  const repositoryModules = new Set<string>();
  const handlerImportsAdded = new Set<string>();
  const usecaseFiles = new Set<string>();

  for (const expansion of architecture.routes) {
    const route = expansion.route;

    for (const layer of expansion.layers) {
      if (layer.kind === "domain") {
        if (domainModules.has(route.moduleName)) continue;
        domainModules.add(route.moduleName);
      }
      if (layer.kind === "repository") {
        if (repositoryModules.has(route.moduleName)) continue;
        repositoryModules.add(route.moduleName);
      }
      if (layer.kind === "usecase") {
        usecaseFiles.add(layer.file);
      }
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
        const handlerFile = defaultFileForLayer(route, "handler");
        if (!handlerImportsAdded.has(handlerFile)) {
          handlerImportsAdded.add(handlerFile);
          add(handlerFile, {
            id: `${route.moduleName}.0handler.imports`,
            stableHash: `${handlerFile}:imports`,
            owner: "code-inlay",
            language: "go",
            content: [
              `import (`,
              `\t"net/http"`,
              ``,
              `\t"github.com/gin-gonic/gin"`,
              `)`,
            ].join("\n"),
          });
        }
        add(handlerFile, {
          ...generateGinHandler(route, diagnostics, adapter.name),
          stableHash: `${route.stableId}:${adapter.name}:handler:${handlerFile}`,
          owner: adapter.name,
        });
      }

      const routeCtx = { diagnostics, route, architecture };
      const routeRegions = adapter.generateRoute?.(routeCtx) ?? [];
      for (const region of routeRegions) {
        const routeFile = defaultFileForLayer(route, "route");
        const lines = routeLinesByFile.get(routeFile) ?? [];

        const routeMws = collectMiddlewareNames(route, ast);
        const mwSet = middlewareByFile.get(routeFile) ?? new Set();
        for (const mw of routeMws) {
          mwSet.add(mw);
        }
        middlewareByFile.set(routeFile, mwSet);

        const routeGroup = (route.metadata?._group as string) ?? "";
        const groupMwNames = new Set((route.metadata?._groupMw as string[]) ?? []);
        const routeMwVars = routeMws.filter((n) => !groupMwNames.has(n)).map(mwToParamName);
        const allMwVars = routeMws.map(mwToParamName);
        let line = region.content;
        if (routeMwVars.length > 0) {
          const lastComma = region.content.lastIndexOf(", ");
          const before = region.content.slice(0, lastComma);
          const after = region.content.slice(lastComma + 2);
          line = `${before}, ${routeMwVars.join(", ")}, ${after}`;
        }
        lines.push({ content: line, group: routeGroup });
        routeLinesByFile.set(routeFile, lines);
      }
    }
  }

  const groupMwByPrefix = new Map<string, Set<string>>();
  for (const expansion of architecture.routes) {
    const route = expansion.route;
    const routeGroup = (route.metadata?._group as string) ?? "";
    if (!routeGroup) continue;
    const groupMwNames = (route.metadata?._groupMw as string[]) ?? [];
    const existing = groupMwByPrefix.get(routeGroup) ?? new Set();
    for (const n of groupMwNames) existing.add(n);
    groupMwByPrefix.set(routeGroup, existing);
  }

  const usecaseImportsAdded = new Set<string>();
  for (const uf of usecaseFiles) {
    const modName = uf.split("/")[1] ?? "unknown";
    const regionId = `${modName}.0usecase.imports`;
    if (usecaseImportsAdded.has(regionId)) continue;
    usecaseImportsAdded.add(regionId);
    add(uf, {
      id: regionId,
      stableHash: `${uf}:imports`,
      owner: "code-inlay",
      language: "go",
      content: `import "context"`,
    });
  }

  for (const [routeFile, routeLines] of routeLinesByFile) {
    const moduleImports: string[] = [];
    const handlerInitLines: string[] = [];
    const mwNames = middlewareByFile.get(routeFile) ?? new Set();

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

    const mwParams = [...mwNames].sort().map((n) => `${mwToParamName(n)} gin.HandlerFunc`).join(", ");
    const params = mwParams ? `api *gin.RouterGroup, ${mwParams}` : `api *gin.RouterGroup`;

    const body: string[] = [];
    if (moduleImports.length > 0 || moduleInfo || mwNames.size > 0) {
      body.push(`import (`);
      body.push(`\t"github.com/gin-gonic/gin"`);
      for (const imp of moduleImports.sort()) {
        body.push(`\t${imp}`);
      }
      body.push(`)`);
      body.push(``);
    }
    body.push(`func RegisterRoutes(${params}) {`);
    body.push(...handlerInitLines);
    body.push(``);
    const groups = new Map<string, typeof routeLines>();
    const ungrouped: typeof routeLines = [];
    for (const rl of routeLines) {
      if (rl.group) {
        const g = groups.get(rl.group) ?? [];
        g.push(rl);
        groups.set(rl.group, g);
      } else {
        ungrouped.push(rl);
      }
    }

    const groupVar = (prefix: string) => {
      const cleaned = prefix.replace(/^\/+/, "").replace(/\/+/g, "_");
      return cleaned || "root";
    };

    const stripPath = (full: string, prefix: string) => {
      if (!prefix) return full;
      const base = full.startsWith(prefix) ? full.slice(prefix.length) : full;
      return base || "";
    };

    for (const rl of ungrouped) {
      body.push(`\t${rl.content}`);
    }
    if (ungrouped.length > 0 && groups.size > 0) {
      body.push(``);
    }
    for (const [prefix, lines] of groups) {
      const gv = groupVar(prefix);
      const gMw = groupMwByPrefix.get(prefix);
      const gMwArgs = gMw && gMw.size > 0
        ? [...gMw].sort().map(mwToParamName).join(", ")
        : "";
      const groupDecl = gMwArgs ? `${gv} := api.Group("${prefix}", ${gMwArgs})` : `${gv} := api.Group("${prefix}")`;
      body.push(`\t${groupDecl}`);
      body.push(`\t{`);
      for (const rl of lines) {
        const lineWithGv = rl.content.replace(/^api\./, `${gv}.`);
        const pathMatch = lineWithGv.match(/^(\w+)\.(\w+)\((".*?")/);
        if (pathMatch) {
          const oldPath = pathMatch[3].slice(1, -1);
          const newPath = stripPath(oldPath, prefix);
          const fixed = lineWithGv.replace(pathMatch[3], JSON.stringify(newPath));
          body.push(`\t\t${fixed}`);
        } else {
          body.push(`\t\t${lineWithGv}`);
        }
      }
      body.push(`\t}`);
      body.push(``);
    }
    if (body[body.length - 1] === "") body.pop();
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

function collectMiddlewareNames(route: RouteAst, ast: AppAst): string[] {
  const names = new Set<string>();
  for (const mw of route.middleware) {
    names.add(mw.name);
  }
  const mod = ast.modules.find((m) => m.name === route.moduleName);
  if (mod) {
    for (const mw of mod.middleware) {
      names.add(mw.name);
    }
  }
  return [...names];
}

function mwToParamName(name: string): string {
  if (!name) return "";
  return name.charAt(0).toLowerCase() + name.slice(1);
}
