import type {
  AdapterRef,
  AppDefinition,
  ArchitecturePlugin,
  ArchitectureRef,
  ArchitectureSelection,
  AstTransformer,
  BackendCompilerPlugin,
  CodeTarget,
  CompileSettings,
  HttpMethod,
  MetadataConfig,
  MiddlewareDefinition,
  ModuleDefinition,
  PluginPackage,
  ResponseFormat,
  RouteDefinition,
  RouterAdapter,
  RouterDefinition,
  RuntimeConfig,
  SchemaLike,
  ServiceDefinition,
  TestingConfig,
  AdapterSelection,
  UsecaseOrganization,
} from "./types.js";
export type DefineRouteInput<
  TQuery extends SchemaLike | undefined,
  TBody extends SchemaLike | undefined,
  TResponse extends SchemaLike | undefined,
> = {
  id: string;
  path: string;
  architecture?: ArchitectureRef | ArchitectureRef[] | ArchitectureSelection;
  adapter?: AdapterRef | AdapterRef[] | AdapterSelection;
  adapters?: AdapterRef[] | AdapterSelection;
  responseFormat?: ResponseFormat;
  response?: TResponse;
  handler: string;
  usecaseGroup?: string;
  middleware?: MiddlewareDefinition[];
  metadata?: Record<string, unknown>;
  query?: TQuery;
} & (
  | { method: "GET" | "DELETE"; body?: undefined }
  | { method: Exclude<HttpMethod, "GET" | "DELETE">; body?: TBody }
);

export function defineRoute<
  TQuery extends SchemaLike | undefined = undefined,
  TBody extends SchemaLike | undefined = undefined,
  TResponse extends SchemaLike | undefined = undefined,
>(input: DefineRouteInput<TQuery, TBody, TResponse>): RouteDefinition<TQuery, TBody, TResponse> {
  return {
    kind: "RouteDefinition",
    id: input.id,
    method: input.method,
    path: input.path,
    architecture: input.architecture,
    adapter: input.adapter,
    adapters: input.adapters,
    responseFormat: input.responseFormat,
    query: input.query,
    body: input.body,
    response: input.response,
    handler: input.handler,
    usecaseGroup: input.usecaseGroup,
    middleware: input.middleware ?? [],
    metadata: input.metadata ?? {},
  };
}

export function defineMiddleware(input: { name: string; handler?: string }): MiddlewareDefinition {
  return {
    kind: "MiddlewareDefinition",
    name: input.name,
    handler: input.handler,
  };
}

export function defineModule(input: {
  name: string;
  architecture?: ArchitectureRef | ArchitectureRef[] | ArchitectureSelection;
  adapters?: AdapterRef[] | AdapterSelection;
  services?: string[];
  usecaseOrganization?: UsecaseOrganization;
  responseFormat?: ResponseFormat;
  routes?: RouteDefinition<
    SchemaLike | undefined,
    SchemaLike | undefined,
    SchemaLike | undefined
  >[];
  middleware?: MiddlewareDefinition[];
}): ModuleDefinition {
  return {
    kind: "ModuleDefinition",
    name: input.name,
    architecture: input.architecture,
    adapters: input.adapters,
    services: input.services,
    usecaseOrganization: input.usecaseOrganization,
    responseFormat: input.responseFormat,
    routes: input.routes ?? [],
    middleware: input.middleware ?? [],
  };
}

export function defineService(input: { name: string; close?: boolean }): ServiceDefinition {
  return {
    kind: "ServiceDefinition",
    name: input.name,
    close: input.close,
  };
}

export function defineRouter(input: {
  adapter: AdapterRef;
  prefix?: string;
  middleware?: MiddlewareDefinition[];
}): RouterDefinition {
  return {
    kind: "RouterDefinition",
    adapter: input.adapter,
    prefix: input.prefix ?? "",
    middleware: input.middleware ?? [],
  };
}

export function defineApp(input: {
  architecture?: ArchitectureRef | ArchitectureRef[] | ArchitectureSelection;
  architectures?: ArchitectureRef[] | ArchitectureSelection;
  adapters?: AdapterRef[] | AdapterSelection;
  router?: RouterDefinition;
  modules: ModuleDefinition[];
  services?: ServiceDefinition[];
  transformers?: AstTransformer[];
  plugins?: BackendCompilerPlugin[];
  targets?: CodeTarget[];
  runtime?: RuntimeConfig;
  testing?: TestingConfig;
  metadata?: MetadataConfig;
  options?: Partial<CompileSettings>;
}): AppDefinition {
  return {
    kind: "AppDefinition",
    architecture: input.architecture,
    architectures: input.architectures,
    adapters: input.adapters,
    router: input.router,
    modules: input.modules,
    services: input.services ?? [],
    transformers: input.transformers ?? [],
    plugins: input.plugins ?? [],
    targets: input.targets ?? [],
    options: {
      fileCreation: input.options?.fileCreation ?? "skeleton",
      usecaseOrganization: input.options?.usecaseOrganization,
      responseFormat: input.options?.responseFormat,
      targets: input.options?.targets ?? ["go-server"],
      targetOptions: input.options?.targetOptions,
      featuresDir: input.options?.featuresDir,
      runtime: input.runtime ?? { enabled: false },
      testing: input.testing ?? {
        mocks: false,
        scaffolds: false,
        contracts: false,
      },
      metadata: input.metadata ?? {
        enabled: false,
        routeRegistry: false,
        schemaReflection: false,
      },
    },
  };
}

export function defineRouteGroup<
  TRoute extends RouteDefinition<
    SchemaLike | undefined,
    SchemaLike | undefined,
    SchemaLike | undefined
  >,
>(input: {
  prefix: string;
  middleware?: MiddlewareDefinition[];
  architecture?: ArchitectureRef | ArchitectureRef[] | ArchitectureSelection;
  routes: TRoute[];
}): TRoute[] {
  return input.routes.map((route) => ({
    ...route,
    path: joinPath(input.prefix, route.path),
    architecture: route.architecture ?? input.architecture,
    middleware: [...(input.middleware ?? []), ...route.middleware],
    metadata: {
      ...route.metadata,
      _group: input.prefix,
      _groupMw: (input.middleware ?? []).map((m) => m.name),
    },
  }));
}

function joinPath(prefix: string, path: string): string {
  if (!path) return prefix;
  const a = prefix.replace(/\/+$/, "");
  const b = path.startsWith("/") ? path : `/${path}`;
  return `${a}${b}` || "/";
}

export function defineResponseFormat(input: { wrapper: SchemaLike }): ResponseFormat {
  return {
    kind: "ResponseFormat",
    wrapper: input.wrapper,
  };
}

export function defineArchitecture(plugin: ArchitecturePlugin): ArchitecturePlugin {
  return plugin;
}

export function defineAdapter(adapter: RouterAdapter): RouterAdapter {
  return adapter;
}

export function defineTransformer(transformer: AstTransformer): AstTransformer {
  return transformer;
}

export function defineTarget(target: CodeTarget): CodeTarget {
  return target;
}

export function defineRuntime(config: RuntimeConfig): RuntimeConfig {
  return config;
}

export function defineTesting(config: TestingConfig): TestingConfig {
  return config;
}

export function defineMetadata(config: MetadataConfig): MetadataConfig {
  return config;
}

export function definePlugin(
  plugin: BackendCompilerPlugin & {
    compatibility?: PluginPackage["compatibility"];
  },
): BackendCompilerPlugin {
  return plugin;
}
