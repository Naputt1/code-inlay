import type {
  AppAst,
  AppDefinition,
  ArchitectureRef,
  ArchitectureSelection,
  AdapterRef,
  AdapterSelection,
  AdapterTarget,
  BackendExtension,
  CodecConfig,
  CodecPreset,
  Diagnostic,
  EnvVarInfo,
  EnvVarType,
  ErrorDefinition,
  MiddlewareAst,
  ModuleAst,
  ResolvedCodec,
  ResolvedCodecSingle,
  ResponseFormat,
  RouteAst,
  SSEAst,
  WSAst,
  ServiceDefinition,
  ServiceExtensionResult,
} from "../types/index.js";
import { joinPath, serviceTypeName } from "../utils/naming.js";
import { stableHash } from "../utils/hash.js";
import { hasEntityPlaceholder } from "../schema/extras.js";

export function parseEnvDefs(
  env: Record<string, { _def: Record<string, unknown> }> | undefined,
): Record<string, EnvVarInfo> | undefined {
  if (!env) return undefined;

  const result: Record<string, EnvVarInfo> = {};

  for (const [key, schema] of Object.entries(env)) {
    let required = true;
    let description = schema._def.description as string | undefined;
    let defaultValue: string | undefined;
    let inner: { _def: Record<string, unknown> } = schema;

    if (inner._def.typeName === "ZodOptional") {
      required = false;
      inner = inner._def.innerType as { _def: Record<string, unknown> };
    }

    if (inner._def.typeName === "ZodDefault") {
      required = false;
      const defaultFn = inner._def.defaultValue as () => unknown;
      defaultValue = String(defaultFn());
      description ??= inner._def.description as string | undefined;
      inner = inner._def.innerType as { _def: Record<string, unknown> };
    }

    const typeName = inner._def.typeName as string;
    let type: EnvVarType;
    if (typeName === "ZodString") type = "string";
    else if (typeName === "ZodNumber") type = "number";
    else if (typeName === "ZodBoolean") type = "boolean";
    else throw new Error(`parseEnvDefs: "${key}" has unsupported type ${typeName}`);

    result[key] = { type, default: defaultValue, required, description };
  }

  return result;
}

function resolveCodecConfig(config: CodecConfig | undefined): ResolvedCodec | undefined {
  if (!config) return undefined;
  if (typeof config === "string") {
    return { kind: "preset", preset: config as CodecPreset };
  }
  if ("from" in config) {
    const strategies = Array.isArray(config.from) ? config.from : [config.from];
    const codecs: Record<string, ResolvedCodecSingle> = {};
    for (const [key, def] of Object.entries(config.options)) {
      codecs[key] =
        typeof def === "string"
          ? { kind: "preset", preset: def as CodecPreset }
          : { kind: "custom", marshal: def.marshal, unmarshal: def.unmarshal };
    }
    return { kind: "negotiated", strategy: strategies, defaultKey: config.default, codecs };
  }
  if ("marshal" in config) {
    return { kind: "custom", marshal: config.marshal, unmarshal: config.unmarshal };
  }
  return { kind: "preset", preset: config as unknown as CodecPreset };
}

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
  const appResponseFormat = app.options.responseFormat;

  const extMap = new Map<string, BackendExtension>((app.extensions ?? []).map((e) => [e.name, e]));

  const toAppService = (
    s: ServiceDefinition | ServiceExtensionResult,
  ): AppAst["services"][number] => {
    if (s.kind === "ServiceExtensionResult") {
      const ext = extMap.get(s.extension);
      return {
        name: s.name,
        close: s.close,
        typeName: serviceTypeName(s.name),
        extension: s.extension,
        extensionOptions: s.options,
        provides: ext?.service?.provides,
        dbAccessor: ext?.service?.dbAccessor,
        dbType: ext?.service?.dbType,
        dbTypePkg: ext?.service?.dbTypePkg,
      };
    }
    return {
      name: s.name,
      close: s.close,
      typeName: serviceTypeName(s.name),
      env: s.env,
    };
  };

  const appErrors = app.errors ?? [];

  const ast: AppAst = {
    kind: "App",
    id: "app",
    stableId: nodeStableId("app"),
    annotations: {},
    pluginData: {},
    env: parseEnvDefs(app.env),
    architecture: appArchitecture,
    adapters: appAdapters,
    services: (app.services ?? []).map(toAppService),
    serviceExtensions: app.extensions ?? [],
    errors: appErrors,
    router: {
      kind: "Router",
      id: "router",
      stableId: nodeStableId("router"),
      annotations: {},
      pluginData: {},
      adapter: router.adapter,
      prefix: router.prefix,
      middleware: router.middleware.map((middleware) => toMiddlewareAst(middleware, "router")),
      cors: router.cors,
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
      const moduleResponseFormat = resolveResponseFormat(module.responseFormat, appResponseFormat);

      const moduleErrors = mergeErrors(appErrors, module.errors ?? []);

      return {
        kind: "Module",
        id: module.name,
        stableId: nodeStableId(`module:${module.name}`),
        annotations: {},
        pluginData: {},
        name: module.name,
        architecture: moduleArchitecture,
        adapters: moduleAdapters,
        services: module.services ?? [],
        usecaseOrganization: module.usecaseOrganization,
        responseFormat: moduleResponseFormat,
        middleware: module.middleware.map((middleware) =>
          toMiddlewareAst(middleware, `module:${module.name}`),
        ),
        routes: module.routes.map((route) => {
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
          const effectiveArchitecture =
            routeArchitecture ??
            moduleArchitecture ??
            (route.kind === "SSEDefinition"
              ? normalizeArchitectureSelection("sse")
              : route.kind === "WSDefinition"
                ? normalizeArchitectureSelection("ws")
                : appArchitecture);

          const routeId = route.handler.charAt(0).toLowerCase() + route.handler.slice(1);

          if (route.kind === "SSEDefinition") {
            return {
              kind: "SSE" as const,
              id: routeId,
              stableId: nodeStableId(`module:${module.name}:sse:${routeId}`),
              annotations: {},
              pluginData: {},
              moduleName: module.name,
              path: route.path,
              fullPath: joinPath(router.prefix, route.path),
              handlerName: route.handler,
              architecture: effectiveArchitecture,
              adapters: routeAdapters,
              resolvedArchitectures: effectiveArchitecture.refs,
              resolvedAdapters: selectionToTargets(resolvedAdapterSelection),
              events: route.events,
              middleware: (route.middleware ?? []).map((mw) =>
                toMiddlewareAst(mw, `module:${module.name}:sse:${routeId}`),
              ),
              metadata: route.metadata ?? {},
              codec: resolveCodecConfig(route.codec),
              sseFields: route.sseFields,
              usecaseCodec: route.usecaseCodec,
            } satisfies SSEAst;
          }

          if (route.kind === "WSDefinition") {
            return {
              kind: "WS" as const,
              id: routeId,
              stableId: nodeStableId(`module:${module.name}:ws:${routeId}`),
              annotations: {},
              pluginData: {},
              moduleName: module.name,
              path: route.path,
              fullPath: joinPath(router.prefix, route.path),
              handlerName: route.handler,
              architecture: effectiveArchitecture,
              adapters: routeAdapters,
              resolvedArchitectures: effectiveArchitecture.refs,
              resolvedAdapters: selectionToTargets(resolvedAdapterSelection),
              message: route.message,
              events: route.events,
              wsLibrary: route.wsLibrary,
              middleware: (route.middleware ?? []).map((mw) =>
                toMiddlewareAst(mw, `module:${module.name}:ws:${routeId}`),
              ),
              metadata: route.metadata ?? {},
              codec: resolveCodecConfig(route.codec),
              usecaseCodec: route.usecaseCodec,
            } satisfies WSAst;
          }

          const routeResponseFormat = resolveResponseFormat(
            route.responseFormat,
            moduleResponseFormat,
          );
          const routeErrors = mergeErrors(moduleErrors, route.errors ?? []);
          return {
            kind: "Route" as const,
            id: routeId,
            stableId: nodeStableId(`module:${module.name}:route:${routeId}`),
            annotations: {},
            pluginData: {},
            moduleName: module.name,
            method: route.method,
            path: route.path,
            fullPath: joinPath(router.prefix, route.path),
            handlerName: route.handler,
            architecture: effectiveArchitecture,
            adapters: routeAdapters,
            resolvedArchitectures: effectiveArchitecture.refs,
            resolvedAdapters: selectionToTargets(resolvedAdapterSelection),
            responseFormat: routeResponseFormat,
            errors: routeErrors,
            query: route.query,
            body: route.body,
            response: route.response,
            middleware: route.middleware.map((mw) =>
              toMiddlewareAst(mw, `module:${module.name}:route:${routeId}`),
            ),
            usecaseGroup: route.usecaseGroup,
            metadata: route.metadata,
          } satisfies RouteAst;
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
  const errorNames = new Set<string>();

  for (const err of ast.errors) {
    if (errorNames.has(err.name)) {
      diagnostics.push({
        level: "error",
        code: "duplicate-error-name",
        message: `Duplicate error name "${err.name}". Error names must be unique across the app.`,
      });
    }
    errorNames.add(err.name);
  }

  for (const module of ast.modules) {
    if (!isIdentifierSegment(module.name)) {
      diagnostics.push({
        level: "error",
        code: "invalid-module-name",
        message: `Module name "${module.name}" must contain only letters, numbers, underscores, or hyphens.`,
      });
    }

    if (module.responseFormat && !hasEntityPlaceholder(module.responseFormat.wrapper)) {
      diagnostics.push({
        level: "warning",
        code: "response-format-no-entity",
        message: `Module "${module.name}" has a responseFormat wrapper that does not contain a z.entity() placeholder. The wrapper schema will be used as-is without entity substitution.`,
        nodeId: module.stableId,
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

      if (route.kind === "Route") {
        if (route.body && (route.method === "GET" || route.method === "DELETE")) {
          diagnostics.push({
            level: "error",
            code: "body-not-allowed",
            message: `Route "${route.id}" in module "${route.moduleName}" has a body schema but uses method ${route.method}. Body is not allowed on GET or DELETE routes.`,
          });
        }

        if (route.responseFormat) {
          if (!hasEntityPlaceholder(route.responseFormat.wrapper)) {
            diagnostics.push({
              level: "warning",
              code: "response-format-no-entity",
              message: `Route "${route.id}" in module "${route.moduleName}" has a responseFormat wrapper that does not contain a z.entity() placeholder. The wrapper schema will be used as-is without entity substitution.`,
              nodeId: route.stableId,
            });
          }
          if (!route.response) {
            diagnostics.push({
              level: "warning",
              code: "response-format-no-response",
              message: `Route "${route.id}" in module "${route.moduleName}" has a responseFormat but no response schema. Domain entity structs will not be generated for this route. Add a response schema to enable entity extraction.`,
              nodeId: route.stableId,
            });
          }
        }
      }
    }
  }
}

function mergeErrors(parent: ErrorDefinition[], child: ErrorDefinition[]): ErrorDefinition[] {
  const errorMap = new Map<string, ErrorDefinition>();
  for (const err of parent) {
    errorMap.set(err.name, err);
  }
  for (const err of child) {
    errorMap.set(err.name, err);
  }
  return Array.from(errorMap.values());
}

function resolveResponseFormat(
  child?: ResponseFormat,
  parent?: ResponseFormat,
): ResponseFormat | undefined {
  return child ?? parent;
}

function isIdentifierSegment(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value);
}
