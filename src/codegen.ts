import type {
  AppAst,
  AppServiceDef,
  ArchitectureAst,
  BackendExtension,
  Diagnostic,
  GeneratedFilePatch,
  GeneratedRegion,
  GenerationAst,
  RepositoryMethod,
  RouteAst,
} from "./types.js";
import type { GoModuleInfo } from "./env.js";
import {
  defaultFileForLayer,
  defaultRegionId,
  extractPathParams,
  featuresPath,
  fileForModuleRoutes,
  lowerIdent,
  pascalCase,
  regionIdForUsecaseImpl,
  regionIdForUsecaseImports,
  resolveUsecaseGroupKey,
  resolveUsecaseOrg,
  serviceConstructorName,
  serviceFilePath,
  serviceImplName,
  serviceRegionId,
  serviceTypeName,
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
import { batchEnrichGoRegions } from "./enrich.js";
export function generateCode(
  ast: AppAst,
  architecture: ArchitectureAst,
  diagnostics: Diagnostic[],
  moduleInfo?: GoModuleInfo,
): GenerationAst {
  const files = new Map<string, GeneratedRegion[]>();
  const featuresDir = ast.options.featuresDir;

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
    const hasDomainLayer = expansion.layers.some((l) => l.kind === "domain");

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
      const content = generateLayerContent(route, layer.kind, diagnostics, hasDomainLayer);
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
        const handlerFile = defaultFileForLayer(route, "handler", featuresDir);
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
          ...generateGinHandler(route, diagnostics, adapter.name, hasDomainLayer),
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
    const domainFile = featuresPath(`internal/${moduleName}/domain.go`, featuresDir);
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

  // Resolve services for a module: by name match + explicit module.services config
  const getModuleServices = (moduleName: string): AppServiceDef[] => {
    const mod = ast.modules.find((m) => m.name === moduleName);
    const explicit = mod?.services ?? [];
    const services: AppServiceDef[] = [];
    const seen = new Set<string>();
    const addIfNew = (svc: AppServiceDef) => {
      if (!seen.has(svc.name)) {
        seen.add(svc.name);
        services.push(svc);
      }
    };
    for (const svc of ast.services) {
      if (svc.name === moduleName) addIfNew(svc);
      if (explicit.includes(svc.name)) addIfNew(svc);
    }
    return services;
  };

  for (const [moduleName, routes] of repositoryRoutesByModule) {
    const repoFile = featuresPath(`internal/${moduleName}/repo.go`, featuresDir);
    const regionId = `${moduleName}.repository`;
    const moduleSvcs = getModuleServices(moduleName);
    const dbProvider = moduleSvcs.find((s) => s.dbAccessor);
    const repoParts = generateRepository(routes, moduleName, dbProvider, ast.serviceExtensions);
    const suffixForPart = (part: ScaffoldPart): string => {
      if (part.kind === "imports") return ".0imports";
      if (part.kind === "interface") return "";
      if (part.kind === "struct") return ".1struct";
      if (part.kind === "function") return ".2ctor";
      const methodName = part.symbolName.split(".").pop();
      return `.3${methodName}`;
    };
    for (const part of repoParts) {
      const suffix = suffixForPart(part);
      add(repoFile, {
        id: regionId + suffix,
        stableHash: `${regionId}:${moduleName}:${routes.length}routes${suffix}`,
        owner: "code-inlay",
        language: "go",
        content: part.content,
        symbolName: part.symbolName,
        kind: part.kind,
        signature: part.signature,
        receiver: part.receiver,
        expectsUserCode: part.expectsUserCode,
        isStub: part.isStub,
        imports: part.imports,
      });
    }
  }

  // Generate service files at internal/service/<name>.go
  for (const svc of ast.services) {
    const svcFile = serviceFilePath(svc.name);
    const svcParts = generateServiceFile(svc, ast.serviceExtensions);
    const svcSuffix = (part: ScaffoldPart): string => {
      if (part.kind === "imports") return ".0imports";
      if (part.kind === "interface") return "";
      if (part.kind === "struct") return ".1struct";
      if (part.kind === "function") return ".2ctor";
      const methodName = part.symbolName.split(".").pop();
      return `.3${methodName}`;
    };
    for (const part of svcParts) {
      add(svcFile, {
        id: serviceRegionId(svc.name) + svcSuffix(part),
        stableHash: `service:${svc.name}${svcSuffix(part)}`,
        owner: "code-inlay",
        language: "go",
        content: part.content,
        symbolName: part.symbolName,
        kind: part.kind,
        signature: part.signature,
        receiver: part.receiver,
        expectsUserCode: part.expectsUserCode,
        isStub: part.isStub,
        imports: part.imports,
      });
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
  for (const [file, info] of usecaseFileInfo) {
    const regionId = regionIdForUsecaseImports(info.moduleName, info.groupKey);
    if (usecaseImportsAdded.has(regionId)) continue;
    usecaseImportsAdded.add(regionId);
    const moduleServices = getModuleServices(info.moduleName);
    const importLines: string[] = [];
    if (moduleServices.length > 0 && moduleInfo) {
      importLines.push(`import (`);
      importLines.push(`\t"context"`);
      importLines.push(`\tservice "${moduleInfo.modulePath}/internal/service"`);
      importLines.push(`)`);
    } else {
      importLines.push(`import "context"`);
    }
    add(file, {
      id: regionId,
      stableHash: `${file}:imports:${info.groupKey}`,
      owner: "code-inlay",
      language: "go",
      content: importLines.join("\n"),
    });
  }

  // Usecase scaffold implementations (default: on)
  for (const expansion of architecture.routes) {
    const route = expansion.route;
    const hasDomainLayer = expansion.layers.some((l) => l.kind === "domain");
    const usecaseLayers = expansion.layers.filter((l) => l.kind === "usecase");
    if (usecaseLayers.length === 0) continue;
    const mod = ast.modules.find((m) => m.name === route.moduleName);
    const org = resolveUsecaseOrg(route, mod?.usecaseOrganization, ast.options.usecaseOrganization);
    if (org.scaffold === false) continue;
    const groupKey = resolveUsecaseGroupKey(route, org);
    const hasRepository = repositoryModules.has(route.moduleName);
    const moduleServices = getModuleServices(route.moduleName);
    const nonDbServices = moduleServices.filter((s) => !s.dbAccessor);
    const serviceTypes = nonDbServices.map((s) => serviceTypeName(s.name));
    const info = [...usecaseFileInfo.entries()].find(
      ([, v]) => v.moduleName === route.moduleName && v.groupKey === groupKey,
    );
    const implFile = info?.[0] ?? defaultFileForLayer(route, "usecase", featuresDir);
    const parts = generateUsecaseScaffold(
      route,
      route.moduleName,
      hasRepository,
      serviceTypes,
      hasDomainLayer,
    );
    const suffixes = ["", ".ctor", ".execute"];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const suffix = suffixes[i];
      add(implFile, {
        id: regionIdForUsecaseImpl(route, groupKey) + suffix,
        stableHash: `${route.stableId}:usecase-impl:${implFile}${suffix}`,
        owner: "code-inlay",
        language: "go",
        content: part.content,
        symbolName: part.symbolName,
        kind: part.kind,
        signature: part.signature,
        receiver: part.receiver,
        expectsUserCode: part.expectsUserCode,
        isStub: part.isStub,
        groupKey,
      });
    }
  }

  const moduleNamesInOrder: string[] = [];

  for (const [routeFile, routeLines] of routeLinesByFile) {
    const mwNames = middlewareByFile.get(routeFile) ?? new Set();

    const moduleName = routeFile.replace(/^.*internal\/http\/(.+)_routes\.go$/, "$1");
    moduleNamesInOrder.push(moduleName);

    const moduleImports: string[] = [];
    const handlerInitLines: string[] = [];
    const mod = ast.modules.find((m) => m.name === moduleName);
    const moduleServices = getModuleServices(moduleName);

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
          moduleImports.push(
            `"${moduleInfo.modulePath}/${featuresPath(`internal/${modPkg}`, featuresDir)}"`,
          );
        }
        if (moduleServices.length > 0 && moduleInfo) {
          moduleImports.push(`"${moduleInfo.modulePath}/internal/service"`);
        }
        const usecaseFields: string[] = [];
        const dbProvider = moduleServices.find((s) => s.dbAccessor);
        const nonDbSvcs = dbProvider
          ? moduleServices.filter((s) => s !== dbProvider)
          : moduleServices;
        const repoVarName = `${lowerIdent(modPkg)}Repo`;
        if (repositoryModules.has(modPkg) && dbProvider) {
          handlerInitLines.push(
            `\t${repoVarName} := ${modPkg}.New${pascalCase(modPkg)}Repository(${lowerIdent(dbProvider.name)}Svc.${dbProvider.dbAccessor}())`,
          );
          handlerInitLines.push(``);
        }
        for (const expansion of architecture.routes) {
          if (expansion.route.moduleName !== modPkg) continue;
          const layers = new Set(expansion.layers.map((l) => l.kind));
          if (!layers.has("handler") && !layers.has("usecase")) continue;
          const handlerName = expansion.route.handlerName;
          if (moduleServices.length > 0) {
            const repoArg = repositoryModules.has(modPkg)
              ? dbProvider
                ? `${repoVarName}, `
                : "nil /*repo TODO*/, "
              : "";
            const svcArgs = nonDbSvcs.map((s) => `${lowerIdent(s.name)}Svc`).join(", ");
            usecaseFields.push(
              `\t\t${handlerName}Usecase: ${modPkg}.New${handlerName}Usecase(${repoArg}${svcArgs}),`,
            );
          } else {
            usecaseFields.push(`\t\t${handlerName}Usecase: nil, // TODO: inject`);
          }
        }
        handlerInitLines.push(`\t${handlerVar} := &${modPkg}.${handlerType}{`);
        handlerInitLines.push(...usecaseFields);
        handlerInitLines.push(`\t}`);
      }
    }

    let funcParams = `api *gin.RouterGroup`;
    for (const svc of moduleServices) {
      const svcName = serviceTypeName(svc.name);
      funcParams += `, ${lowerIdent(svc.name)}Svc service.${svcName}`;
    }

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
    const serviceImports = new Set<string>();
    const combinedParams: string[] = [`api *gin.RouterGroup`];
    for (const svc of ast.services) {
      const svcName = serviceTypeName(svc.name);
      const svcArg = `${lowerIdent(svc.name)}Svc service.${svcName}`;
      combinedParams.push(svcArg);
      if (moduleInfo) {
        serviceImports.add(`"${moduleInfo.modulePath}/internal/service"`);
      }
    }

    const combinedBody: string[] = [];
    combinedBody.push(`import (`);
    combinedBody.push(`\t"github.com/gin-gonic/gin"`);
    for (const imp of [...serviceImports].sort()) {
      combinedBody.push(`\t${imp}`);
    }
    combinedBody.push(`)`);
    combinedBody.push(``);
    combinedBody.push(`func RegisterRoutes(${combinedParams.join(", ")}) {`);
    for (const modName of moduleNamesInOrder) {
      const funcName = `register${pascalCase(modName)}Routes`;
      const callArgs = [`api`];
      const modServices = getModuleServices(modName);
      for (const s of modServices) {
        callArgs.push(`${lowerIdent(s.name)}Svc`);
      }
      combinedBody.push(`\t${funcName}(${callArgs.join(", ")})`);
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

  for (const { file, regionId, content } of generateHandlerStructs(architecture, featuresDir)) {
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

  batchEnrichGoRegions(files);

  const result = [...files.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([path, regions]): GeneratedFilePatch => ({
        path,
        regions: regions.sort((a, b) => a.id.localeCompare(b.id)),
      }),
    );

  return { files: result };
}

function generateLayerContent(
  route: RouteAst,
  layer: string,
  diagnostics: Diagnostic[],
  hasDomain?: boolean,
): string | undefined {
  switch (layer) {
    case "entity":
      return generateRouteTypes(route, diagnostics, route.responseFormat);
    case "domain":
      return undefined; // handled per module in aggregateDomainContent
    case "repository":
      return undefined;
    case "usecase":
      return generateUsecase(route, hasDomain);
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
        entityName,
      };
    case "Get":
      if (!hasID) return null;
      return {
        name: context ? `Find${pascalCase(context)}ByID` : "FindByID",
        params: `ctx context.Context, id ${baseEntity}ID`,
        results: `(${entityName}, error)`,
        entityName,
      };
    case "Create":
    case "New":
      return {
        name: context ? `Create${pascalCase(context)}` : "Create",
        params: `ctx context.Context, entity ${entityName}`,
        results: `(${entityName}, error)`,
        entityName,
      };
    case "Update":
    case "Edit":
      if (!hasID) return null;
      return {
        name: context ? `Update${pascalCase(context)}` : "Update",
        params: `ctx context.Context, id ${baseEntity}ID, entity ${entityName}`,
        results: `(${entityName}, error)`,
        entityName,
      };
    case "Delete":
    case "Remove":
      if (!hasID) return null;
      return {
        name: context ? `Delete${pascalCase(context)}` : "Delete",
        params: `ctx context.Context, id ${baseEntity}ID`,
        results: "error",
        entityName,
      };
    case "Set": {
      let field = entityPart;
      if (field.startsWith(baseEntity)) field = field.slice(baseEntity.length);
      if (!field) field = entityPart;
      return {
        name: `Set${field}`,
        params: hasID ? `ctx context.Context, id ${baseEntity}ID` : "ctx context.Context",
        results: "error",
        entityName,
      };
    }
    default:
      return null;
  }
}

function generateRepository(
  routes: RouteAst[],
  moduleName: string,
  dbProvider: AppServiceDef | undefined,
  extensions: BackendExtension[],
): ScaffoldPart[] {
  const typeName = pascalCase(moduleName);
  const baseEntity = typeName;
  const implName = `${lowerIdent(moduleName)}RepositoryImpl`;
  const dbType = dbProvider?.dbType ?? "*gorm.DB";
  const dbTypePkg = dbProvider?.dbTypePkg ?? "";
  const dialect = dbProvider?.extension;
  const seen = new Map<string, RepositoryMethod>();

  for (const route of routes) {
    const method = inferRepositoryMethod(route, moduleName);
    if (!method) continue;
    const key = `${method.name}(${method.params})`;
    if (!seen.has(key)) {
      seen.set(key, method);
    }
  }

  const parts: ScaffoldPart[] = [];

  if (dbProvider) {
    const importLines = [`import (`, `\t"context"`];
    if (dbTypePkg) importLines.push(`\t"${dbTypePkg}"`);
    importLines.push(`)`);
    parts.push({
      kind: "imports" as const,
      symbolName: "",
      content: importLines.join("\n"),
      expectsUserCode: false,
      isStub: false,
      imports: [...(dbTypePkg ? ["context", dbTypePkg] : ["context"])],
    });
  }

  if (seen.size === 0) {
    const content = [
      `type ${typeName}Repository interface {`,
      `\t// Add developer-owned persistence methods outside generated regions as needed.`,
      `}`,
    ].join("\n");
    parts.push({
      kind: "interface" as const,
      symbolName: `${typeName}Repository`,
      content,
      expectsUserCode: false,
      isStub: false,
    });
  } else {
    const body = [...seen.values()].map((m) => `\t${m.name}(${m.params}) ${m.results}`).join("\n");
    const content = [`type ${typeName}Repository interface {`, body, `}`].join("\n");
    parts.push({
      kind: "interface" as const,
      symbolName: `${typeName}Repository`,
      content,
      expectsUserCode: false,
      isStub: false,
    });

    const structContent = [`type ${implName} struct {`, `\tdb ${dbType}`, `}`].join("\n");
    parts.push({
      kind: "struct" as const,
      symbolName: implName,
      content: structContent,
      expectsUserCode: false,
      isStub: false,
    });

    const ctorSig = `func New${typeName}Repository(db ${dbType}) *${implName}`;
    parts.push({
      kind: "function" as const,
      symbolName: `New${typeName}Repository`,
      signature: ctorSig,
      content: `\treturn &${implName}{db: db}`,
      expectsUserCode: false,
      isStub: false,
    });

    for (const method of seen.values()) {
      const methodPart = generateDialectMethodPart(
        method,
        baseEntity,
        implName,
        dialect,
        extensions,
        dbProvider?.extensionOptions,
      );
      if (methodPart) parts.push(methodPart);
    }
  }

  return parts;
}

function generateDialectMethodPart(
  method: RepositoryMethod,
  baseEntity: string,
  implName: string,
  dialect?: string,
  extensions?: BackendExtension[],
  extensionOptions?: Record<string, unknown>,
): ScaffoldPart | null {
  if (dialect && extensions) {
    const ext = extensions.find((e) => e.name === dialect);
    if (ext?.service?.generateDialectMethod) {
      const ctx = { method, baseEntity, implName, options: extensionOptions ?? {} };
      const content = ext.service.generateDialectMethod(ctx);
      return {
        kind: "method" as const,
        symbolName: `${implName}.${method.name}`,
        receiver: `*${implName}`,
        content,
        expectsUserCode: false,
        isStub: true,
      };
    }
  }
  return generateDefaultStubPart(method, implName);
}

function generateDefaultStubPart(method: RepositoryMethod, implName: string): ScaffoldPart {
  const sigBase = `func (r *${implName}) ${method.name}(${method.params})`;
  const sig = `${sigBase} ${method.results}`;
  const content = `\t// TODO: implement ${method.name}\n\treturn ${getZeroValue(method.results)}`;
  return {
    kind: "method" as const,
    symbolName: `${implName}.${method.name}`,
    receiver: `*${implName}`,
    signature: sig,
    content,
    expectsUserCode: false,
    isStub: true,
  };
}

function getZeroValue(results: string): string {
  if (results === "error") return "nil";
  if (results.startsWith("(") && results.endsWith(", error)")) {
    const inner = results.slice(1, -", error)".length);
    if (inner.includes("[]")) return "nil, nil";
    return `${inner}{}, nil`;
  }
  return "nil, nil";
}

function usecaseDomainInputParams(
  route: RouteAst,
  moduleName: string,
): { params: string; paramNames: string[] } | null {
  const verb = ["List", "Get", "Create", "New", "Update", "Edit", "Delete", "Remove", "Set"].find(
    (v) => route.handlerName.startsWith(v),
  );
  if (!verb) return null;

  const baseID = `${pascalCase(moduleName)}ID`;
  const baseEntity = pascalCase(moduleName);
  const context = extractEntityContext(route.id);
  const entityName = context ? `${baseEntity}${pascalCase(context)}` : baseEntity;

  switch (verb) {
    case "List": {
      const hasParams = !!route.query || !!route.body || extractPathParams(route.path).length > 0;
      if (hasParams) return null;
      return { params: "", paramNames: [] };
    }
    case "Get":
      return { params: `id ${baseID}`, paramNames: ["id"] };
    case "Create":
    case "New":
      return { params: `entity ${entityName}`, paramNames: ["entity"] };
    case "Update":
    case "Edit":
      return { params: `id ${baseID}, entity ${entityName}`, paramNames: ["id", "entity"] };
    case "Delete":
    case "Remove":
      return { params: `id ${baseID}`, paramNames: ["id"] };
    case "Set":
      return { params: `id ${baseID}`, paramNames: ["id"] };
    default:
      return null;
  }
}

function generateUsecase(route: RouteAst, hasDomain?: boolean): string {
  const respType = responseType(route);
  let executeParams: string;
  if (hasDomain) {
    const domainParams = usecaseDomainInputParams(route, route.moduleName);
    if (domainParams) {
      if (domainParams.params === "") {
        executeParams = `ctx context.Context) (${respType}, error`;
      } else {
        executeParams = `ctx context.Context, ${domainParams.params}) (${respType}, error`;
      }
    } else {
      executeParams = `ctx context.Context, input ${requestType(route)}) (${respType}, error`;
    }
  } else {
    executeParams = `ctx context.Context, input ${requestType(route)}) (${respType}, error`;
  }
  return [`type ${route.handlerName}Usecase interface {`, `\tExecute(${executeParams})`, `}`].join(
    "\n",
  );
}

function generateServiceFile(svc: AppServiceDef, extensions?: BackendExtension[]): ScaffoldPart[] {
  const typeName = serviceTypeName(svc.name);
  const implName = serviceImplName(svc.name);
  const ctorName = serviceConstructorName(svc.name);

  if (svc.extension && extensions) {
    const ext = extensions.find((e) => e.name === svc.extension);
    if (ext?.service?.generateFile) {
      return [
        {
          kind: "interface" as const,
          symbolName: typeName,
          content: ext.service.generateFile({
            name: svc.name,
            options: svc.extensionOptions ?? {},
            typeName,
            implName,
            ctorName,
            close: svc.close,
          }),
          expectsUserCode: false,
          isStub: false,
        },
      ];
    }
  }

  const parts: ScaffoldPart[] = [];

  if (svc.dbTypePkg) {
    parts.push({
      kind: "imports" as const,
      symbolName: "",
      content: `import "${svc.dbTypePkg}"`,
      expectsUserCode: false,
      isStub: false,
      imports: [svc.dbTypePkg],
    });
  }

  const ifaceLines: string[] = [`type ${typeName} interface {`];
  if (svc.dbAccessor && svc.dbType) {
    ifaceLines.push(`\t${svc.dbAccessor}() ${svc.dbType}`);
  }
  if (svc.close) {
    ifaceLines.push(`\tClose() error`);
  }
  ifaceLines.push(`}`);
  parts.push({
    kind: "interface" as const,
    symbolName: typeName,
    content: ifaceLines.join("\n"),
    expectsUserCode: false,
    isStub: false,
  });

  parts.push({
    kind: "struct" as const,
    symbolName: implName,
    content: `type ${implName} struct {}`,
    expectsUserCode: false,
    isStub: false,
  });

  const ctorSig = `func ${ctorName}() (*${implName}, error)`;
  parts.push({
    kind: "function" as const,
    symbolName: ctorName,
    signature: ctorSig,
    content: `\treturn &${implName}{}, nil`,
    expectsUserCode: false,
    isStub: false,
  });

  if (svc.dbAccessor && svc.dbType) {
    const accessorName = svc.dbAccessor;
    parts.push({
      kind: "method" as const,
      symbolName: `${implName}.${accessorName}`,
      receiver: `*${implName}`,
      signature: `func (s *${implName}) ${accessorName}() ${svc.dbType}`,
      content: `\t// TODO: return initialized ${svc.dbType}\n\treturn nil`,
      expectsUserCode: false,
      isStub: true,
    });
  }

  if (svc.close) {
    parts.push({
      kind: "method" as const,
      symbolName: `${implName}.Close`,
      receiver: `*${implName}`,
      signature: `func (s *${implName}) Close() error`,
      content: `\treturn nil`,
      expectsUserCode: false,
      isStub: false,
    });
  }

  return parts;
}

type ScaffoldPart = {
  kind: "struct" | "function" | "method" | "interface" | "type" | "imports";
  symbolName: string;
  signature?: string;
  receiver?: string;
  content: string;
  expectsUserCode: boolean;
  isStub: boolean;
  imports?: string[];
};

function repoMethodName(
  verb: string,
  context: string,
  baseEntity: string,
  handlerName: string,
): string {
  switch (verb) {
    case "List":
      return context ? `FindAll${pascalCase(context)}` : "FindAll";
    case "Get":
      return context ? `Find${pascalCase(context)}ByID` : "FindByID";
    case "Create":
    case "New":
      return context ? `Create${pascalCase(context)}` : "Create";
    case "Update":
    case "Edit":
      return context ? `Update${pascalCase(context)}` : "Update";
    case "Delete":
    case "Remove":
      return context ? `Delete${pascalCase(context)}` : "Delete";
    case "Set": {
      let field = handlerName.slice("Set".length);
      if (field.startsWith(baseEntity)) field = field.slice(baseEntity.length);
      if (!field) field = handlerName.slice("Set".length);
      return `Set${field}`;
    }
    default:
      return "";
  }
}

function scaffoldExecuteContent(
  verb: string,
  context: string,
  baseEntity: string,
  handlerName: string,
  respType: string,
): string {
  const rmn = repoMethodName(verb, context, baseEntity, handlerName);
  switch (verb) {
    case "Get":
      return [
        `\tresult, err := uc.repo.${rmn}(ctx, id)`,
        `\tif err != nil {`,
        `\t\treturn ${respType}{}, err`,
        `\t}`,
        `\t// TODO: map result to ${respType}`,
        `\treturn ${respType}{}, nil`,
      ].join("\n");
    case "Create":
    case "New":
      return [
        `\tcreated, err := uc.repo.${rmn}(ctx, entity)`,
        `\tif err != nil {`,
        `\t\treturn ${respType}{}, err`,
        `\t}`,
        `\t// TODO: map created to ${respType}`,
        `\treturn ${respType}{}, nil`,
      ].join("\n");
    case "Update":
    case "Edit":
      return [
        `\tupdated, err := uc.repo.${rmn}(ctx, id, entity)`,
        `\tif err != nil {`,
        `\t\treturn ${respType}{}, err`,
        `\t}`,
        `\t// TODO: map updated to ${respType}`,
        `\treturn ${respType}{}, nil`,
      ].join("\n");
    case "Delete":
    case "Remove":
      return [
        `\tif err := uc.repo.${rmn}(ctx, id); err != nil {`,
        `\t\treturn ${respType}{}, err`,
        `\t}`,
        `\treturn ${respType}{}, nil`,
      ].join("\n");
    case "List":
      return [
        `\tresults, err := uc.repo.${rmn}(ctx)`,
        `\tif err != nil {`,
        `\t\treturn ${respType}{}, err`,
        `\t}`,
        `\t// TODO: map results to ${respType}`,
        `\treturn ${respType}{}, nil`,
      ].join("\n");
    case "Set":
      return [
        `\tif err := uc.repo.${rmn}(ctx, id); err != nil {`,
        `\t\treturn ${respType}{}, err`,
        `\t}`,
        `\treturn ${respType}{}, nil`,
      ].join("\n");
    default:
      return `\t// TODO: implement\n\treturn ${respType}{}, nil`;
  }
}

function generateUsecaseScaffold(
  route: RouteAst,
  moduleName: string,
  hasRepository: boolean,
  serviceTypes: string[],
  hasDomain?: boolean,
): ScaffoldPart[] {
  const ifaceName = `${route.handlerName}Usecase`;
  const structName = `${lowerIdent(route.handlerName)}UsecaseImpl`;
  const repoType = hasRepository ? `${pascalCase(moduleName)}Repository` : undefined;
  const reqType = requestType(route);
  const respType = responseType(route);

  const structFields: string[] = [];
  const ctorParams: string[] = [];
  const ctorBody: string[] = [];
  const assignFields: string[] = [];

  if (repoType) {
    structFields.push(`\trepo ${repoType}`);
    ctorParams.push(`repo ${repoType}`);
    ctorBody.push(`\tif repo == nil {`);
    ctorBody.push(`\t\tpanic("${repoType} must not be nil")`);
    ctorBody.push(`\t}`);
    assignFields.push(`\t\trepo: repo`);
  }
  for (let i = 0; i < serviceTypes.length; i++) {
    const st = serviceTypes[i];
    const svcName = st.replace(/Service$/, "");
    const varName = `${lowerIdent(svcName)}Svc`;
    structFields.push(`\t${varName} service.${st}`);
    ctorParams.push(`${varName} service.${st}`);
    ctorBody.push(`\tif ${varName} == nil {`);
    ctorBody.push(`\t\tpanic("service.${st} must not be nil")`);
    ctorBody.push(`\t}`);
    assignFields.push(`\t\t${varName}: ${varName}`);
  }

  const parts: ScaffoldPart[] = [];

  // Struct declaration
  const structDecl = (() => {
    if (structFields.length === 0) {
      return `type ${structName} struct {}`;
    }
    return [`type ${structName} struct {`, ...structFields, `}`].join("\n");
  })();
  parts.push({
    kind: "struct",
    symbolName: structName,
    content: structDecl,
    expectsUserCode: false,
    isStub: false,
  });

  // Constructor function
  const ctorBodyLines =
    structFields.length === 0
      ? [`\treturn &${structName}{}`]
      : [
          ...ctorBody,
          `\treturn &${structName}{`,
          assignFields.map((f) => `${f},`).join("\n"),
          `\t}`,
        ];
  const ctorParamsStr = structFields.length === 0 ? "" : ctorParams.join(", ");
  const ctorSig = `func New${ifaceName}(${ctorParamsStr}) *${structName}`;
  parts.push({
    kind: "function",
    symbolName: `New${ifaceName}`,
    signature: ctorSig,
    content: ctorBodyLines.join("\n"),
    expectsUserCode: false,
    isStub: false,
  });

  // Execute method
  let executeSig: string;
  let executeContent: string;
  if (hasDomain && repoType) {
    const domainParams = usecaseDomainInputParams(route, moduleName);
    if (domainParams) {
      const context = extractEntityContext(route.id);
      const baseEntity = pascalCase(moduleName);
      const verb = [
        "List",
        "Get",
        "Create",
        "New",
        "Update",
        "Edit",
        "Delete",
        "Remove",
        "Set",
      ].find((v) => route.handlerName.startsWith(v));
      if (domainParams.params === "") {
        executeSig = `func (uc *${structName}) Execute(ctx context.Context) (${respType}, error)`;
      } else {
        executeSig = `func (uc *${structName}) Execute(ctx context.Context, ${domainParams.params}) (${respType}, error)`;
      }
      if (verb) {
        executeContent = scaffoldExecuteContent(
          verb,
          context,
          baseEntity,
          route.handlerName,
          respType,
        );
      } else {
        executeContent = `\t// TODO: implement ${ifaceName}\n\treturn ${respType}{}, nil`;
      }
    } else {
      executeSig = `func (uc *${structName}) Execute(ctx context.Context, input ${reqType}) (${respType}, error)`;
      executeContent = `\t// TODO: implement ${ifaceName}\n\treturn ${respType}{}, nil`;
    }
  } else {
    executeSig = `func (uc *${structName}) Execute(ctx context.Context, input ${reqType}) (${respType}, error)`;
    executeContent = `\t// TODO: implement ${ifaceName}\n\treturn ${respType}{}, nil`;
  }
  parts.push({
    kind: "method",
    symbolName: `${structName}.Execute`,
    receiver: `*${structName}`,
    signature: executeSig,
    content: executeContent,
    expectsUserCode: true,
    isStub: true,
  });

  return parts;
}

type HandlerStructOutput = {
  file: string;
  regionId: string;
  content: string;
};

function generateHandlerStructs(
  architecture: ArchitectureAst,
  featuresDir?: string,
): HandlerStructOutput[] {
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
      file: featuresPath(`internal/${moduleName}/handler.go`, featuresDir),
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
    const funcSig = `func ${funcName}(c *gin.Context)`;

    return {
      path: `internal/middleware/${fileName}.go`,
      regions: [
        {
          id: `middleware.${mw.name}.0imports`,
          stableHash: `middleware:${mw.name}:imports`,
          owner: "code-inlay",
          language: "go",
          content: `import "github.com/gin-gonic/gin"`,
        },
        {
          id: `middleware.${mw.name}.1func`,
          stableHash: `middleware:${mw.name}:func`,
          owner: "code-inlay",
          language: "go",
          content: `\t// TODO: implement ${funcName}\n\tc.Next()`,
          symbolName: funcName,
          kind: "function",
          signature: funcSig,
          isStub: true,
        },
      ],
    };
  });
}

// enrichRegion logic moved to src/enrich.ts (batch AST + regex fallback)
