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
import {
  defaultFileForLayer,
  defaultRegionId,
  extractPathParams,
  fileForModuleRoutes,
  lowerIdent,
  pascalCase,
  regionIdForUsecaseImports,
  resolveUsecaseGroupKey,
  resolveUsecaseOrg,
  snakeCase,
} from "./naming.js";
import {
  extractEntityContext,
  generateEntityStructs,
  generateRouteTypes,
  requestType,
  responseType,
} from "./schema.js";
import { generateGinHandler, resolveAdapters } from "./adapters.js";
import { generateServer, serverFilePath } from "./srvgen.js";
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
  const usecaseFileInfo = new Map<string, { moduleName: string; groupKey: string }>();

  const domainRoutesByModule = new Map<string, RouteAst[]>();
  const repositoryRoutesByModule = new Map<string, RouteAst[]>();

  for (const expansion of architecture.routes) {
    const route = expansion.route;

    for (const layer of expansion.layers) {
      if (layer.kind === "domain") {
        domainModules.add(route.moduleName);
        const routes = domainRoutesByModule.get(route.moduleName) ?? [];
        routes.push(route);
        domainRoutesByModule.set(route.moduleName, routes);
      }
      if (layer.kind === "repository") {
        repositoryModules.add(route.moduleName);
        const routes = repositoryRoutesByModule.get(route.moduleName) ?? [];
        routes.push(route);
        repositoryRoutesByModule.set(route.moduleName, routes);
      }
      const layerGroupKey =
        layer.kind === "usecase"
          ? (() => {
              const mod = ast.modules.find((m) => m.name === route.moduleName);
              const org = resolveUsecaseOrg(
                route,
                mod?.usecaseOrganization,
                ast.options.usecaseOrganization,
              );
              return resolveUsecaseGroupKey(route, org);
            })()
          : undefined;

      if (layer.kind === "usecase" && layerGroupKey) {
        if (!usecaseFileInfo.has(layer.file)) {
          usecaseFileInfo.set(layer.file, {
            moduleName: route.moduleName,
            groupKey: layerGroupKey,
          });
        }
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
          groupKey: layerGroupKey,
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
            content: [`import (`, `\t"net/http"`, ``, `\t"github.com/gin-gonic/gin"`, `)`].join(
              "\n",
            ),
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
        const routeFile = fileForModuleRoutes(route.moduleName);
        const lines = routeLinesByFile.get(routeFile) ?? [];

        const routeMws = collectMiddlewareNames(route, ast);
        const mwSet = middlewareByFile.get(routeFile) ?? new Set();
        for (const mw of routeMws) {
          mwSet.add(mw);
        }
        middlewareByFile.set(routeFile, mwSet);

        const routeGroup = (route.metadata?._group as string) ?? "";
        const groupMwNames = new Set((route.metadata?._groupMw as string[]) ?? []);
        const routeMwVars = routeMws
          .filter((n) => !groupMwNames.has(n))
          .map((n) => `middleware.${n}`);
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

  for (const [moduleName, routes] of domainRoutesByModule) {
    const domainFile = `internal/${moduleName}/types.go`;
    const regionId = `${moduleName}.domain`;
    const domainContent = generateDomain(moduleName, routes, diagnostics);
    add(domainFile, {
      id: regionId,
      stableHash: `${regionId}:${moduleName}:${routes.length}routes`,
      owner: "code-inlay",
      language: "go",
      content: domainContent,
    });
  }

  for (const [moduleName, routes] of repositoryRoutesByModule) {
    const repoFile = `internal/${moduleName}/repo.go`;
    const regionId = `${moduleName}.repository`;
    const repoContent = generateRepository(routes, moduleName);
    add(repoFile, {
      id: regionId,
      stableHash: `${regionId}:${moduleName}:${routes.length}routes`,
      owner: "code-inlay",
      language: "go",
      content: repoContent,
    });
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
  for (const [file, info] of usecaseFileInfo) {
    const regionId = regionIdForUsecaseImports(info.moduleName, info.groupKey);
    if (usecaseImportsAdded.has(regionId)) continue;
    usecaseImportsAdded.add(regionId);
    add(file, {
      id: regionId,
      stableHash: `${file}:imports:${info.groupKey}`,
      owner: "code-inlay",
      language: "go",
      content: `import "context"`,
    });
  }

  const moduleNamesInOrder: string[] = [];

  for (const [routeFile, routeLines] of routeLinesByFile) {
    const mwNames = middlewareByFile.get(routeFile) ?? new Set();

    const moduleName = routeFile.replace(/^.*internal\/http\/(.+)_routes\.go$/, "$1");
    moduleNamesInOrder.push(moduleName);

    const moduleImports: string[] = [];
    const handlerInitLines: string[] = [];
    const mod = ast.modules.find((m) => m.name === moduleName);

    if (mod) {
      const modPkg = mod.name;
      const handlerType = `${pascalCase(modPkg)}Handler`;
      const handlerVar = `${lowerIdent(modPkg)}Handler`;
      const layerKinds = new Set(
        architecture.routes
          .filter((r) => r.route.moduleName === modPkg)
          .flatMap((r) => r.layers.map((l) => l.kind)),
      );

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

    const funcParams = `api *gin.RouterGroup`;

    const body: string[] = [];
    body.push(`import (`);
    body.push(`\t"github.com/gin-gonic/gin"`);
    if (mwNames.size > 0 && moduleInfo) {
      body.push(`\t"${moduleInfo.modulePath}/internal/middleware"`);
    }
    for (const imp of moduleImports.sort()) {
      body.push(`\t${imp}`);
    }
    body.push(`)`);
    body.push(``);
    const funcName = `register${pascalCase(moduleName)}Routes`;
    body.push(`func ${funcName}(${funcParams}) {`);
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
      const gMwArgs =
        gMw && gMw.size > 0
          ? [...gMw]
              .sort()
              .map((n) => `middleware.${n}`)
              .join(", ")
          : "";
      const groupDecl = gMwArgs
        ? `${gv} := api.Group("${prefix}", ${gMwArgs})`
        : `${gv} := api.Group("${prefix}")`;
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
      id: `routes.register.${moduleName}`,
      stableHash: `${routeFile}:register`,
      owner: "code-inlay",
      language: "go",
      content: body.join("\n"),
    });
  }

  // Generate combined routes.go that calls each per-module function
  if (routeLinesByFile.size > 0) {
    const combinedBody: string[] = [];
    combinedBody.push(`import (`);
    combinedBody.push(`\t"github.com/gin-gonic/gin"`);
    combinedBody.push(`)`);
    combinedBody.push(``);
    combinedBody.push(`func RegisterRoutes(api *gin.RouterGroup) {`);
    for (const modName of moduleNamesInOrder) {
      const funcName = `register${pascalCase(modName)}Routes`;
      combinedBody.push(`\t${funcName}(api)`);
    }
    combinedBody.push(`}`);

    add("internal/http/routes.go", {
      id: "routes.register",
      stableHash: `internal/http/routes.go:register`,
      owner: "code-inlay",
      language: "go",
      content: combinedBody.join("\n"),
    });
  }

  for (const { file, regionId, content } of generateHandlerStructs(architecture)) {
    add(file, { id: regionId, language: "go", content });
  }

  for (const patch of generateMiddlewareFiles(ast)) {
    for (const region of patch.regions) {
      add(patch.path, region);
    }
  }

  if (moduleInfo) {
    const adapters = resolveAdapters(
      ast.adapters.refs.map((ref) => {
        if (typeof ref === "string") return { name: ref, transport: ref === "gin" ? "http" : ref };
        return { name: ref.name, transport: ref.transport ?? "http" };
      }),
      diagnostics,
    );

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
      .map(
        ([path, regions]): GeneratedFilePatch => ({
          path,
          regions: regions.sort((a, b) => a.id.localeCompare(b.id)),
        }),
      ),
  };
}

function generateLayerContent(
  route: RouteAst,
  layer: string,
  diagnostics: Diagnostic[],
): string | undefined {
  switch (layer) {
    case "types":
      return generateRouteTypes(route, diagnostics, route.responseFormat);
    case "domain":
      return undefined; // handled per module in aggregateDomainContent
    case "repository":
      return undefined;
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

function generateDomain(moduleName: string, routes: RouteAst[], diagnostics: Diagnostic[]): string {
  const parts: string[] = [`type ${pascalCase(moduleName)}ID string`];

  const routesWithEntity = routes.filter((r) => r.response && r.responseFormat);
  if (routesWithEntity.length > 0) {
    const entityContent = generateEntityStructs(moduleName, routesWithEntity, diagnostics);
    if (entityContent) parts.push(entityContent);
  }

  return parts.join("\n\n");
}

type RepositoryMethod = {
  name: string;
  params: string;
  results: string;
};

function inferRepositoryMethod(route: RouteAst, moduleName: string): RepositoryMethod | null {
  const handler = route.handlerName;
  const pathParams = extractPathParams(route.path);
  const hasID = pathParams.length > 0;
  const baseEntity = pascalCase(moduleName);
  const context = extractEntityContext(route.id);
  const entityName = context ? `${baseEntity}${pascalCase(context)}` : baseEntity;

  const verb = ["List", "Get", "Create", "New", "Update", "Edit", "Delete", "Remove", "Set"].find(
    (v) => handler.startsWith(v),
  );
  if (!verb) return null;

  const entityPart = handler.slice(verb.length);

  switch (verb) {
    case "List":
      return {
        name: context ? `FindAll${pascalCase(context)}` : "FindAll",
        params: "ctx context.Context",
        results: `([]${entityName}, error)`,
      };
    case "Get":
      if (!hasID) return null;
      return {
        name: context ? `Find${pascalCase(context)}ByID` : "FindByID",
        params: `ctx context.Context, id ${baseEntity}ID`,
        results: `(${entityName}, error)`,
      };
    case "Create":
    case "New":
      return {
        name: context ? `Create${pascalCase(context)}` : "Create",
        params: `ctx context.Context, entity ${entityName}`,
        results: `(${entityName}, error)`,
      };
    case "Update":
    case "Edit":
      if (!hasID) return null;
      return {
        name: context ? `Update${pascalCase(context)}` : "Update",
        params: `ctx context.Context, id ${baseEntity}ID, entity ${entityName}`,
        results: `(${entityName}, error)`,
      };
    case "Delete":
    case "Remove":
      if (!hasID) return null;
      return {
        name: context ? `Delete${pascalCase(context)}` : "Delete",
        params: `ctx context.Context, id ${baseEntity}ID`,
        results: "error",
      };
    case "Set": {
      let field = entityPart;
      if (field.startsWith(baseEntity)) field = field.slice(baseEntity.length);
      if (!field) field = entityPart;
      return {
        name: `Set${field}`,
        params: hasID ? `ctx context.Context, id ${baseEntity}ID` : "ctx context.Context",
        results: "error",
      };
    }
    default:
      return null;
  }
}

function generateRepository(routes: RouteAst[], moduleName: string): string {
  const typeName = pascalCase(moduleName);
  const seen = new Map<string, RepositoryMethod>();

  for (const route of routes) {
    const method = inferRepositoryMethod(route, moduleName);
    if (!method) continue;
    const key = `${method.name}(${method.params})`;
    if (!seen.has(key)) {
      seen.set(key, method);
    }
  }

  if (seen.size === 0) {
    return [
      `type ${typeName}Repository interface {`,
      `\t// Add developer-owned persistence methods outside generated regions as needed.`,
      `}`,
    ].join("\n");
  }

  const body = [...seen.values()].map((m) => `\t${m.name}(${m.params}) ${m.results}`).join("\n");

  return [`type ${typeName}Repository interface {`, body, `}`].join("\n");
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
  const moduleRespTypes = new Map<string, string[]>();

  for (const expansion of architecture.routes) {
    const route = expansion.route;
    const layers = new Set(expansion.layers.map((l) => l.kind));
    if (!layers.has("handler") && !layers.has("usecase")) continue;

    const fields = moduleFields.get(route.moduleName) ?? [];
    fields.push(`\t${route.handlerName}Usecase ${route.handlerName}Usecase`);
    moduleFields.set(route.moduleName, fields);

    const respTypes = moduleRespTypes.get(route.moduleName) ?? [];
    const rType = responseType(route);
    if (rType !== "struct{}" && !respTypes.includes(rType)) {
      respTypes.push(rType);
    }
    moduleRespTypes.set(route.moduleName, respTypes);
  }

  const result: HandlerStructOutput[] = [];
  for (const [moduleName, fields] of moduleFields) {
    const typeName = `${pascalCase(moduleName)}Handler`;
    const respTypes = (moduleRespTypes.get(moduleName) ?? []).sort();
    const checks = respTypes.map((t) => `var _ ${t}`).join("\n");
    const content = checks
      ? `type ${typeName} struct {\n${fields.join("\n")}\n}\n\n${checks}`
      : `type ${typeName} struct {\n${fields.join("\n")}\n}`;
    result.push({
      file: `internal/${moduleName}/handler.go`,
      regionId: `${moduleName}.0handler.struct`,
      content,
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

function collectAllMiddlewareInfo(ast: AppAst): Array<{ name: string; handler?: string }> {
  const seen = new Set<string>();
  const result: Array<{ name: string; handler?: string }> = [];
  for (const mod of ast.modules) {
    for (const mw of mod.middleware) {
      if (!seen.has(mw.name)) {
        seen.add(mw.name);
        result.push({ name: mw.name, handler: mw.handler });
      }
    }
    for (const route of mod.routes) {
      for (const mw of route.middleware) {
        if (!seen.has(mw.name)) {
          seen.add(mw.name);
          result.push({ name: mw.name, handler: mw.handler });
        }
      }
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

function generateMiddlewareFiles(ast: AppAst): GeneratedFilePatch[] {
  const mws = collectAllMiddlewareInfo(ast);
  return mws.map((mw) => {
    const fileName = snakeCase(mw.name);
    const funcName = mw.handler ?? mw.name;
    const content = [
      `import "github.com/gin-gonic/gin"`,
      ``,
      `func ${funcName}(c *gin.Context) {`,
      `\t// TODO: implement ${funcName}`,
      `\tc.Next()`,
      `}`,
      ``,
    ].join("\n");

    return {
      path: `internal/middleware/${fileName}.go`,
      regions: [
        {
          id: `middleware.${mw.name}`,
          stableHash: `middleware:${mw.name}`,
          owner: "code-inlay",
          language: "go",
          content,
        },
      ],
    };
  });
}
