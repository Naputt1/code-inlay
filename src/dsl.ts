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
  RouteDefinition,
  RouterAdapter,
  RouterDefinition,
  RuntimeConfig,
  SchemaLike,
  TestingConfig,
  AdapterSelection,
  UsecaseOrganization,
} from "./types.js";

export type DefineRouteInput<
  TInput extends SchemaLike | undefined,
  TResponse extends SchemaLike | undefined,
> = {
  id: string;
  method: HttpMethod;
  path: string;
  architecture?: ArchitectureRef | ArchitectureRef[] | ArchitectureSelection;
  adapter?: AdapterRef | AdapterRef[] | AdapterSelection;
  adapters?: AdapterRef[] | AdapterSelection;
  input?: TInput;
  response?: TResponse;
  handler: string;
  usecaseGroup?: string;
  middleware?: MiddlewareDefinition[];
  metadata?: Record<string, unknown>;
};

type DefineRouteBase = {
  id: string;
  method: HttpMethod;
  path: string;
  architecture?: ArchitectureRef | ArchitectureRef[] | ArchitectureSelection;
  adapter?: AdapterRef | AdapterRef[] | AdapterSelection;
  adapters?: AdapterRef[] | AdapterSelection;
  handler: string;
  usecaseGroup?: string;
  middleware?: MiddlewareDefinition[];
  metadata?: Record<string, unknown>;
};

export function defineRoute<TInput extends SchemaLike, TResponse extends SchemaLike>(
  input: DefineRouteBase & { input: TInput; response: TResponse },
): RouteDefinition<TInput, TResponse>;

export function defineRoute<TInput extends SchemaLike>(
  input: DefineRouteBase & { input: TInput; response?: undefined },
): RouteDefinition<TInput, undefined>;

export function defineRoute<TResponse extends SchemaLike>(
  input: DefineRouteBase & { input?: undefined; response: TResponse },
): RouteDefinition<undefined, TResponse>;

export function defineRoute(
  input: DefineRouteBase & { input?: undefined; response?: undefined },
): RouteDefinition<undefined, undefined>;

export function defineRoute<
  TInput extends SchemaLike | undefined = undefined,
  TResponse extends SchemaLike | undefined = undefined,
>(input: DefineRouteInput<TInput, TResponse>): RouteDefinition<TInput, TResponse> {
  return {
    kind: "RouteDefinition",
    id: input.id,
    method: input.method,
    path: input.path,
    architecture: input.architecture,
    adapter: input.adapter,
    adapters: input.adapters,
    input: input.input,
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
  usecaseOrganization?: UsecaseOrganization;
  routes?: RouteDefinition[];
  middleware?: MiddlewareDefinition[];
}): ModuleDefinition {
  return {
    kind: "ModuleDefinition",
    name: input.name,
    architecture: input.architecture,
    adapters: input.adapters,
    usecaseOrganization: input.usecaseOrganization,
    routes: input.routes ?? [],
    middleware: input.middleware ?? [],
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
    transformers: input.transformers ?? [],
    plugins: input.plugins ?? [],
    targets: input.targets ?? [],
    options: {
      fileCreation: input.options?.fileCreation ?? "skeleton",
      usecaseOrganization: input.options?.usecaseOrganization,
      targets: input.options?.targets ?? ["go-server"],
      targetOptions: input.options?.targetOptions,
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

export function defineRouteGroup(input: {
  prefix: string;
  middleware?: MiddlewareDefinition[];
  architecture?: ArchitectureRef | ArchitectureRef[] | ArchitectureSelection;
  routes: RouteDefinition[];
}): RouteDefinition[] {
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
