import type {
  AppAst,
  AppServiceDef,
  ArchitectureAst,
  Diagnostic,
  GeneratedFilePatch,
  GeneratedRegion,
  GenerationAst,
  RouteAst,
} from "../types/index.js";
import type { GoModuleInfo } from "../utils/env.js";
import {
  defaultFileForLayer,
  defaultRegionId,
  featuresPath,
  fileForModuleRoutes,
  lowerIdent,
  pascalCase,
  regionIdForUsecaseImpl,
  regionIdForUsecaseImports,
  resolveUsecaseGroupKey,
  resolveUsecaseOrg,
  serviceFilePath,
  serviceRegionId,
  serviceTypeName,
} from "../utils/naming.js";
import { generateEntityStructs, generateRouteTypes } from "../schema/index.js";
import { generateGinHandler, resolveAdapters } from "../adapters/gin.js";
import { generateServer, serverFilePath } from "../srvgen/index.js";
import { batchEnrichGoRegions } from "../plugins/enrich.js";
import { generateRepository } from "./repository.js";
import { generateServiceFile } from "./service.js";
import { generateUsecaseInterface, generateUsecaseScaffold } from "./usecase.js";
import { generateHandlerStructs } from "./handler.js";
import { generateMiddlewareFiles } from "./middleware.js";
import type { ScaffoldPart } from "./types.js";

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
    const nonDbServices = moduleServices.filter((s) => !s.dbAccessor);
    const importLines: string[] = [];
    if (nonDbServices.length > 0 && moduleInfo) {
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
        for (const svc of moduleServices) {
          const svcVar = `${lowerIdent(svc.name)}Svc`;
          handlerInitLines.push(`\tif ${svcVar} == nil {`);
          handlerInitLines.push(`\t\tpanic("${svcVar} must not be nil")`);
          handlerInitLines.push(`\t}`);
        }
        if (moduleServices.length > 0) handlerInitLines.push(``);
        if (repositoryModules.has(modPkg) && dbProvider) {
          handlerInitLines.push(
            `\t${repoVarName} := ${modPkg}.New${pascalCase(modPkg)}Repository(${lowerIdent(dbProvider.name)}Svc.${dbProvider.dbAccessor}())`,
          );
          handlerInitLines.push(``);
        } else if (moduleServices.length === 0 && repositoryModules.has(modPkg)) {
          handlerInitLines.push(
            `\t${repoVarName} := ${modPkg}.New${pascalCase(modPkg)}Repository()`,
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
            const repoArg = repositoryModules.has(modPkg) ? `${repoVarName}, ` : "";
            usecaseFields.push(
              `\t\t${handlerName}Usecase: ${modPkg}.New${handlerName}Usecase(${repoArg}),`,
            );
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
      return undefined;
    case "repository":
      return undefined;
    case "usecase":
      return generateUsecaseInterface(route, hasDomain);
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
