import type {
  AppAst,
  AppServiceDef,
  ArchitectureAst,
  Diagnostic,
  GeneratedFilePatch,
  GeneratedRegion,
  GenerationAst,
  RouteAst,
  RouteLikeAst,
  SSEAst,
  WSAst,
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
import {
  generateEntityStructs,
  generateRouteTypes,
  generateNamedStructs,
} from "../schema/index.js";
import {
  generateGinHandler,
  generateGinSSEHandler,
  generateGinWSHandler,
  handlerImportsForCodec,
  resolveAdapters,
} from "../adapters/gin-goast.js";
import { generateServer, serverFilePath } from "../srvgen/index.js";
import { generateEnvConfigFile } from "../srvgen/config.js";
import { batchEnrichGoRegions } from "../plugins/enrich.js";
import { generateRepository } from "./repository.js";
import { generateServiceFile } from "./service.js";
import { generateUsecaseInterface, generateUsecaseScaffold } from "./usecase.js";
import { generateHandlerStructs } from "./handler.js";
import { generateMiddlewareFiles } from "./middleware.js";
import { generateStandardErrors, generateModuleErrors, collectModuleErrors } from "./errors.js";
import { generateBindingErrorFunction, doesSchemaNeedFmt } from "./validation.js";
import type { BindingErrorConfig } from "./validation.js";
import type { ScaffoldPart } from "./types.js";
import { generateHandlerInitLines, generateRegisterModuleRoutes, generateCombinedRegisterRoutes } from "./route-registration-goast.js";

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

  const standardErrorPatches = generateStandardErrors(featuresDir);
  for (const patch of standardErrorPatches) {
    for (const region of patch.regions) {
      add(patch.path, region);
    }
  }

  const routeLinesByFile = new Map<string, Array<{ content: string; group: string }>>();
  const middlewareByFile = new Map<string, Set<string>>();

  const domainModules = new Set<string>();
  const repositoryModules = new Set<string>();
  const handlerImports = new Map<string, Set<string>>();
  const streamImportsAdded = new Set<string>();
  const usecaseFileInfo = new Map<string, { moduleName: string; groupKey: string }>();

  const domainRoutesByModule = new Map<string, RouteLikeAst[]>();
  const repositoryRoutesByModule = new Map<string, RouteLikeAst[]>();

  for (const expansion of architecture.routes) {
    const route = expansion.route;
    const hasDomainLayer = expansion.layers.some((l) => l.kind === "domain");

    for (const layer of expansion.layers) {
      if (layer.kind === "domain" && route.kind === "Route") {
        domainModules.add(route.moduleName);
        const routes = domainRoutesByModule.get(route.moduleName) ?? [];
        routes.push(route);
        domainRoutesByModule.set(route.moduleName, routes);
      }
      if (layer.kind === "repository" && route.kind === "Route") {
        repositoryModules.add(route.moduleName);
        const routes = repositoryRoutesByModule.get(route.moduleName) ?? [];
        routes.push(route);
        repositoryRoutesByModule.set(route.moduleName, routes);
      }

      let layerGroupKey: string | undefined;
      if (layer.kind === "usecase" && route.kind === "Route") {
        const mod = ast.modules.find((m) => m.name === route.moduleName);
        const org = resolveUsecaseOrg(
          route,
          mod?.usecaseOrganization,
          ast.options.usecaseOrganization,
        );
        layerGroupKey = resolveUsecaseGroupKey(route, org);

        if (!usecaseFileInfo.has(layer.file)) {
          usecaseFileInfo.set(layer.file, {
            moduleName: route.moduleName,
            groupKey: layerGroupKey,
          });
        }
      }

      if ((layer.kind === "sse" || layer.kind === "ws") && !streamImportsAdded.has(layer.file)) {
        streamImportsAdded.add(layer.file);
        add(layer.file, {
          id: `${route.moduleName}.0${layer.kind}.imports`,
          stableHash: `${layer.file}:${layer.kind}:imports`,
          owner: "schemago",
          language: "go",
          kind: "imports",
          imports: ["context"],
          content: [`import (`, `\t"context"`, `)`].join("\n"),
        });
      }

      const content = generateLayerContent(route, layer.kind, diagnostics, hasDomainLayer);
      if (content !== undefined) {
        add(layer.file, {
          id: layer.regionId,
          stableHash: layer.stableId
            ? `${layer.stableId}:${layer.file}:codegen`
            : `${route.stableId}:${layer.kind}:${layer.file}`,
          owner: layer.owner ?? "schemago",
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

        if (!handlerImports.has(handlerFile)) {
          handlerImports.set(handlerFile, new Set<string>());
        }
        const hd = handlerImports.get(handlerFile)!;

        if (route.kind === "Route") {
          hd.add("errors");
          hd.add("net/http");
          hd.add("github.com/gin-gonic/gin");
          if (moduleInfo) {
            const httperrPkgPath = featuresPath("internal/httperr", featuresDir);
            hd.add(`${moduleInfo.modulePath}/${httperrPkgPath}`);
          }
          add(handlerFile, {
            ...generateGinHandler(route, diagnostics, adapter.name, hasDomainLayer),
            stableHash: `${route.stableId}:${adapter.name}:handler:${handlerFile}`,
            owner: adapter.name,
          });
        } else if (route.kind === "SSE") {
          hd.add("fmt");
          hd.add("io");
          hd.add("github.com/gin-gonic/gin");
          const sseCodecImports = handlerImportsForCodec((route as SSEAst).codec);
          for (const ci of sseCodecImports) hd.add(ci);
          add(handlerFile, {
            ...generateGinSSEHandler(route as SSEAst),
            stableHash: `${route.stableId}:${adapter.name}:handler:${handlerFile}`,
            owner: adapter.name,
          });
        } else if (route.kind === "WS") {
          hd.add("github.com/gin-gonic/gin");
          const wsLib = (route as WSAst).wsLibrary ?? "gorilla/websocket";
          const wsPkg =
            wsLib === "nhooyr.io/websocket"
              ? "nhooyr.io/websocket"
              : "github.com/gorilla/websocket";
          hd.add(wsPkg);
          const wsCodecImports = handlerImportsForCodec((route as WSAst).codec);
          for (const ci of wsCodecImports) hd.add(ci);
          add(handlerFile, {
            ...generateGinWSHandler(route as WSAst),
            stableHash: `${route.stableId}:${adapter.name}:handler:${handlerFile}`,
            owner: adapter.name,
          });
        }
      }

      const routeRegions =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        adapter.generateRoute?.({ diagnostics, route: route as any, architecture }) ?? [];
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
    const domainContent = generateDomain(moduleName, routes as RouteAst[], diagnostics);
    add(domainFile, {
      id: regionId,
      stableHash: `${regionId}:${moduleName}:${routes.length}routes`,
      owner: "schemago",
      language: "go",
      content: domainContent,
    });
  }

  for (const [handlerFile, imports] of handlerImports) {
    const sorted = [...imports].sort((a, b) => {
      const aStd = !a.startsWith("github.com") && !a.startsWith("nhooyr.io");
      const bStd = !b.startsWith("github.com") && !b.startsWith("nhooyr.io");
      if (aStd && !bStd) return -1;
      if (!aStd && bStd) return 1;
      return a.localeCompare(b);
    });
    const modName = handlerFile.match(/([^/]+)\/handler\.go$/)?.[1] ?? "handler";
    add(handlerFile, {
      id: `${modName}.0handler.imports`,
      stableHash: `${handlerFile}:imports`,
      owner: "schemago",
      language: "go",
      kind: "imports",
      imports: sorted,
      content: [`import (`, ...sorted.map((i) => `\t"${i}"`), `)`].join("\n"),
    });
  }

  for (const mod of ast.modules) {
    const moduleErrors = collectModuleErrors(mod.routes as RouteAst[]);
    if (moduleErrors.length > 0) {
      const errorPatches = generateModuleErrors(mod.name, moduleErrors, featuresDir);
      for (const patch of errorPatches) {
        for (const region of patch.regions) {
          add(patch.path, region);
        }
      }
    }
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
    const repoParts = generateRepository(
      routes as RouteAst[],
      moduleName,
      dbProvider,
      ast.serviceExtensions,
    );
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
        owner: "schemago",
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
    const svcParts = generateServiceFile(svc, ast.serviceExtensions, moduleInfo?.modulePath);
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
        owner: "schemago",
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
    const hasRepo = repositoryModules.has(info.moduleName);
    const accessibleServices = hasRepo
      ? moduleServices.filter((s) => !s.dbAccessor)
      : moduleServices;
    const importLines: string[] = [];

    if (accessibleServices.length === 0) {
      importLines.push(`import "context"`);
    } else if (moduleInfo) {
      importLines.push(`import (`);
      importLines.push(`\t"context"`);
      importLines.push(`\tservice "${moduleInfo.modulePath}/internal/service"`);
      importLines.push(`)`);
    } else {
      importLines.push(`import "context"`);
      diagnostics.push({
        level: "warning",
        code: "missing-module-info",
        message: `Cannot determine service import path for "${file}" — Go module info not available. Run within a Go module directory (go.mod required).`,
      });
    }
    add(file, {
      id: regionId,
      stableHash: `${file}:imports:${info.groupKey}`,
      owner: "schemago",
      language: "go",
      content: importLines.join("\n"),
    });
  }

  for (const expansion of architecture.routes) {
    const route = expansion.route;
    if (route.kind !== "Route") continue;
    const hasDomainLayer = expansion.layers.some((l) => l.kind === "domain");
    const usecaseLayers = expansion.layers.filter((l) => l.kind === "usecase");
    if (usecaseLayers.length === 0) continue;
    const mod = ast.modules.find((m) => m.name === route.moduleName);
    const org = resolveUsecaseOrg(route, mod?.usecaseOrganization, ast.options.usecaseOrganization);
    if (org.scaffold === false) continue;
    const groupKey = resolveUsecaseGroupKey(route, org);
    const hasRepository = repositoryModules.has(route.moduleName);
    const moduleServices = getModuleServices(route.moduleName);
    const accessibleServices = hasRepository
      ? moduleServices.filter((s) => !s.dbAccessor)
      : moduleServices;
    const serviceTypes = accessibleServices.map((s) => serviceTypeName(s.name));
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
        owner: "schemago",
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

    const mod = ast.modules.find((m) => m.name === moduleName);
    const moduleServices = getModuleServices(moduleName);

    let moduleImports: string[] = [];
    let handlerInitLines: string[] = [];
    if (mod) {
      const result = generateHandlerInitLines(
        mod, moduleServices, architecture.routes,
        moduleInfo, featuresDir, repositoryModules,
      );
      moduleImports = result.moduleImports;
      handlerInitLines = result.handlerInitLines;
    }

    let funcParams = `api *gin.RouterGroup`;
    for (const svc of moduleServices) {
      const svcName = serviceTypeName(svc.name);
      funcParams += `, ${lowerIdent(svc.name)}Svc service.${svcName}`;
    }

    const mwImport = mwNames.size > 0 && moduleInfo
      ? [`"${moduleInfo.modulePath}/internal/middleware"`]
      : [];
    const allImports = [...mwImport, ...moduleImports];
    const body = generateRegisterModuleRoutes(
      moduleName, allImports, handlerInitLines, funcParams, routeLines, groupMwByPrefix,
    );

    add(routeFile, {
      id: `routes.register.${moduleName}`,
      stableHash: `${routeFile}:register`,
      owner: "schemago",
      language: "go",
      content: body.join("\n"),
    });
  }

  if (routeLinesByFile.size > 0) {
    const combinedBody = generateCombinedRegisterRoutes(
      moduleNamesInOrder, ast.services, moduleInfo, getModuleServices,
    );
    add("internal/http/routes.go", {
      id: "routes.register",
      stableHash: `internal/http/routes.go:register`,
      owner: "schemago",
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

    const configPatch = generateEnvConfigFile(ast.env ?? {}, moduleInfo);
    if (configPatch) {
      for (const region of configPatch.regions) {
        add(configPatch.path, region);
      }
    }
  }

  {
    const valConfig: BindingErrorConfig = {
      httpStatus: ast.options.validationError?.httpStatus ?? 400,
      bodySchema: ast.options.validationError?.body,
    };

    const needsFmt = doesSchemaNeedFmt(valConfig.bodySchema);
    const bindingFunc = generateBindingErrorFunction(valConfig);
    const httperrResolvePath = featuresPath("internal/httperr/resolve.go", featuresDir);

    add(httperrResolvePath, {
      id: "httperr.resolveBindingError.imports",
      stableHash: `httperr:resolveBindingError:imports`,
      owner: "schemago",
      language: "go",
      kind: "imports",
      imports: [
        ...(valConfig.bodySchema ? ["errors"] : []),
        ...(needsFmt ? ["fmt"] : []),
        "net/http",
        "github.com/gin-gonic/gin",
        ...(valConfig.bodySchema ? ["github.com/go-playground/validator/v10"] : []),
      ],
      content: [
        `import (`,
        ...(valConfig.bodySchema ? [`\t"errors"`] : []),
        ...(needsFmt ? [`\t"fmt"`] : []),
        `\t"net/http"`,
        `\t"github.com/gin-gonic/gin"`,
        ...(valConfig.bodySchema ? [`\t"github.com/go-playground/validator/v10"`] : []),
        `)`,
      ].join("\n"),
    });

    add(httperrResolvePath, {
      id: "httperr.resolveBindingError",
      stableHash: `httperr:resolveBindingError:global`,
      owner: "schemago",
      language: "go",
      content: bindingFunc,
      symbolName: "ResolveBindingError",
      expectsUserCode: true,
    });
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
  route: RouteLikeAst,
  layer: string,
  diagnostics: Diagnostic[],
  hasDomain?: boolean,
): string | undefined {
  switch (layer) {
    case "entity":
      if (route.kind === "Route") {
        return generateRouteTypes(route, diagnostics, route.responseFormat);
      }
      if (route.kind === "SSE") {
        return generateNamedStructs(
          `${route.handlerName}${pascalCase(route.moduleName)}Event`,
          route.events,
          diagnostics,
        );
      }
      if (route.kind === "WS") {
        const parts: string[] = [];
        parts.push(
          generateNamedStructs(
            `${route.handlerName}${pascalCase(route.moduleName)}Message`,
            route.message,
            diagnostics,
          ),
        );
        if (route.events) {
          parts.push(
            generateNamedStructs(
              `${route.handlerName}${pascalCase(route.moduleName)}Event`,
              route.events,
              diagnostics,
            ),
          );
        }
        return parts.join("\n\n");
      }
      return undefined;
    case "domain":
      return undefined;
    case "repository":
      return undefined;
    case "usecase":
      if (route.kind === "Route") {
        return generateUsecaseInterface(route, hasDomain);
      }
      return undefined;
    case "sse":
      if (route.kind === "SSE") {
        const sse = route as SSEAst;
        const eventType = `${sse.handlerName}${pascalCase(sse.moduleName)}Event`;
        if (sse.usecaseCodec) {
          return `type ${sse.handlerName}Usecase interface {\n\tExecute(ctx context.Context, events chan<- ${eventType}, marshal func(${eventType}) ([]byte, error)) error\n}`;
        }
        return `type ${sse.handlerName}Usecase interface {\n\tExecute(ctx context.Context, events chan<- ${eventType}) error\n}`;
      }
      return undefined;
    case "ws":
      if (route.kind === "WS") {
        const ws = route as WSAst;
        const msgType = `${ws.handlerName}${pascalCase(ws.moduleName)}Message`;
        const evtType = ws.events
          ? `${ws.handlerName}${pascalCase(ws.moduleName)}Event`
          : "struct{}";
        if (ws.usecaseCodec) {
          return `type ${ws.handlerName}Usecase interface {\n\tExecute(ctx context.Context, read <-chan ${msgType}, write chan<- ${evtType}, marshal func(${evtType}) ([]byte, error), unmarshal func([]byte, *${msgType}) error) error\n}`;
        }
        return `type ${ws.handlerName}Usecase interface {\n\tExecute(ctx context.Context, read <-chan ${msgType}, write chan<- ${evtType}) error\n}`;
      }
      return undefined;
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

function collectMiddlewareNames(route: RouteLikeAst, ast: AppAst): string[] {
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
