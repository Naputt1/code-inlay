import type {
  AppAst,
  AppDefinition,
  ArchitectureRef,
  ArchitectureSelection,
  AdapterRef,
  AdapterSelection,
  AdapterTarget,
  Diagnostic,
  MiddlewareAst,
  ModuleAst,
  RouteAst,
} from "./types.js";
import { joinPath } from "./naming.js";
import { stableHash } from "./hash.js";

export function buildAst(app: AppDefinition, diagnostics: Diagnostic[]): AppAst {
  const router = app.router ?? {
    kind: "RouterDefinition" as const,
    adapter: "gin" as const,
    prefix: "",
    middleware: [],
  };
  const appArchitecture = normalizeArchitectureSelection(
    app.architectures ?? app.architecture ?? "clean",
  );
  const appAdapters = normalizeAdapterSelection(app.adapters ?? [router.adapter]);

  const ast: AppAst = {
    kind: "App",
    id: "app",
    stableId: nodeStableId("app"),
    annotations: {},
    pluginData: {},
    architecture: appArchitecture,
    adapters: appAdapters,
    router: {
      kind: "Router",
      id: "router",
      stableId: nodeStableId("router"),
      annotations: {},
      pluginData: {},
      adapter: router.adapter,
      prefix: router.prefix,
      middleware: router.middleware.map((middleware) => toMiddlewareAst(middleware, "router")),
    },
    modules: app.modules.map((module): ModuleAst => {
      const moduleArchitecture = module.architecture
        ? resolveArchitectureSelection(
            appArchitecture,
            normalizeArchitectureSelection(module.architecture),
          )
        : undefined;
      const moduleAdapters = module.adapters
        ? resolveAdapterSelection(appAdapters, normalizeAdapterSelection(module.adapters))
        : undefined;

      return {
        kind: "Module",
        id: module.name,
        stableId: nodeStableId(`module:${module.name}`),
        annotations: {},
        pluginData: {},
        name: module.name,
        architecture: moduleArchitecture,
        adapters: moduleAdapters,
        usecaseOrganization: module.usecaseOrganization,
        middleware: module.middleware.map((middleware) =>
          toMiddlewareAst(middleware, `module:${module.name}`),
        ),
        routes: module.routes.map((route): RouteAst => {
          const routeArchitecture = route.architecture
            ? resolveArchitectureSelection(
                moduleArchitecture ?? appArchitecture,
                normalizeArchitectureSelection(route.architecture),
              )
            : undefined;
          const routeAdapters = normalizeRouteAdapter(route);
          const resolvedAdapterSelection = routeAdapters
            ? resolveAdapterSelection(moduleAdapters ?? appAdapters, routeAdapters)
            : (moduleAdapters ?? appAdapters);
          const resolvedArchitectureSelection =
            routeArchitecture ?? moduleArchitecture ?? appArchitecture;

          return {
            kind: "Route",
            id: route.id,
            stableId: nodeStableId(`module:${module.name}:route:${route.id}`),
            annotations: {},
            pluginData: {},
            moduleName: module.name,
            method: route.method,
            path: route.path,
            fullPath: joinPath(router.prefix, route.path),
            handlerName: route.handler,
            architecture: routeArchitecture,
            adapters: routeAdapters,
            resolvedArchitectures: resolvedArchitectureSelection.refs,
            resolvedAdapters: selectionToTargets(resolvedAdapterSelection),
            input: route.input,
            response: route.response,
            middleware: route.middleware.map((middleware) =>
              toMiddlewareAst(middleware, `module:${module.name}:route:${route.id}`),
            ),
            usecaseGroup: route.usecaseGroup,
            metadata: route.metadata,
          };
        }),
      };
    }),
    plugins: app.plugins,
    targets: app.targets ?? [],
    options: app.options,
  };

  validateAst(ast, diagnostics);
  return app.transformers.reduce((next, transformer) => transformer.transform(next), ast);
}

function toMiddlewareAst(
  input: {
    name: string;
    handler?: string;
  },
  owner: string,
): MiddlewareAst {
  return {
    kind: "Middleware",
    id: input.name,
    stableId: nodeStableId(`${owner}:middleware:${input.name}`),
    annotations: {},
    pluginData: {},
    name: input.name,
    handler: input.handler,
  };
}

export function normalizeArchitectureSelection(
  input: ArchitectureRef | ArchitectureRef[] | ArchitectureSelection,
): ArchitectureSelection {
  if (isArchitectureSelection(input)) {
    return input;
  }
  return {
    mode: "replace",
    refs: Array.isArray(input) ? input : [input],
  };
}

export function normalizeAdapterSelection(
  input: AdapterRef | AdapterRef[] | AdapterSelection,
): AdapterSelection {
  if (isAdapterSelection(input)) {
    return input;
  }
  return {
    mode: "replace",
    refs: Array.isArray(input) ? input : [input],
  };
}

export function resolveArchitectureSelection(
  parent: ArchitectureSelection,
  child: ArchitectureSelection,
): ArchitectureSelection {
  return child.mode === "append"
    ? { mode: "replace", refs: [...parent.refs, ...child.refs] }
    : child;
}

export function resolveAdapterSelection(
  parent: AdapterSelection,
  child: AdapterSelection,
): AdapterSelection {
  return child.mode === "append"
    ? { mode: "replace", refs: [...parent.refs, ...child.refs] }
    : child;
}

function normalizeRouteAdapter(route: {
  adapter?: AdapterRef | AdapterRef[] | AdapterSelection;
  adapters?: AdapterRef[] | AdapterSelection;
}): AdapterSelection | undefined {
  if (route.adapters) return normalizeAdapterSelection(route.adapters);
  if (route.adapter) return normalizeAdapterSelection(route.adapter);
  return undefined;
}

function selectionToTargets(selection: AdapterSelection): AdapterTarget[] {
  return selection.refs.map((ref) => {
    if (typeof ref === "string") {
      return {
        name: ref,
        transport: ref === "gin" ? "http" : ref,
      };
    }
    return {
      name: ref.name,
      transport: ref.transport ?? "http",
    };
  });
}

function isArchitectureSelection(input: unknown): input is ArchitectureSelection {
  return typeof input === "object" && input !== null && "mode" in input && "refs" in input;
}

function isAdapterSelection(input: unknown): input is AdapterSelection {
  return typeof input === "object" && input !== null && "mode" in input && "refs" in input;
}

function nodeStableId(input: string): string {
  return `${input}:${stableHash(input)}`;
}

function validateAst(ast: AppAst, diagnostics: Diagnostic[]): void {
  const routeKeys = new Set<string>();

  for (const module of ast.modules) {
    if (!isIdentifierSegment(module.name)) {
      diagnostics.push({
        level: "error",
        code: "invalid-module-name",
        message: `Module name "${module.name}" must contain only letters, numbers, underscores, or hyphens.`,
      });
    }

    const moduleRouteIds = new Set<string>();
    for (const route of module.routes) {
      const key = `${route.moduleName}.${route.id}`;
      if (routeKeys.has(key) || moduleRouteIds.has(route.id)) {
        diagnostics.push({
          level: "error",
          code: "duplicate-route-id",
          message: `Duplicate route id "${route.id}" in module "${route.moduleName}".`,
        });
      }
      routeKeys.add(key);
      moduleRouteIds.add(route.id);

      if (!isIdentifierSegment(route.id)) {
        diagnostics.push({
          level: "error",
          code: "invalid-route-id",
          message: `Route id "${route.id}" must contain only letters, numbers, underscores, or hyphens.`,
        });
      }
    }
  }
}

function isIdentifierSegment(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value);
}
