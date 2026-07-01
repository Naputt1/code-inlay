import { z } from "zod";
import { validationZ } from "../schema/extras.js";
import type {
  AdapterRef,
  AppDefinition,
  ArchitecturePlugin,
  ArchitectureRef,
  ArchitectureSelection,
  AstTransformer,
  BackendCompilerPlugin,
  BackendExtension,
  CodeTarget,
  CompileSettings,
  CorsConfig,
  DialectMethodCtx,
  ErrorDefinition,
  HttpMethod,
  HttpStatusCode,
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
  ServiceExtensionResult,
  ServiceFileCtx,
  TestingConfig,
  AdapterSelection,
  UsecaseOrganization,
  ValidationErrorConfig,
} from "../types/index.js";

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
  errors?: ErrorDefinition[];
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
    errors: input.errors,
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
  errors?: ErrorDefinition[];
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
    errors: input.errors,
    routes: input.routes ?? [],
    middleware: input.middleware ?? [],
  };
}

export function defineService(input: {
  name: string;
  close?: boolean;
  env?: string[];
}): ServiceDefinition {
  return {
    kind: "ServiceDefinition",
    name: input.name,
    close: input.close,
    env: input.env,
  };
}

export function defineServiceExtension<TOptions extends Record<string, unknown>>(input: {
  name: string;
  service: {
    provides?: "database";
    optionsSchema: z.ZodType<TOptions>;
    dbAccessor?: string;
    dbType?: string;
    dbTypePkg?: string;
    goModules?: string[] | ((options: TOptions) => string[]);
    generateFile?: (ctx: ServiceFileCtx<TOptions>) => string;
    generateDialectMethod?: (ctx: DialectMethodCtx<TOptions>) => string;
  };
}): BackendExtension &
  ((opts: { name: string; close?: boolean } & TOptions) => ServiceExtensionResult) {
  const factory = (opts: { name: string; close?: boolean } & TOptions): ServiceExtensionResult => ({
    kind: "ServiceExtensionResult",
    name: opts.name,
    extension: input.name,
    close: opts.close,
    options: input.service.optionsSchema.parse(opts) as Record<string, unknown>,
  });
  return Object.defineProperties(factory, {
    name: { value: input.name, writable: false },
    service: { value: input.service, writable: false },
  }) as BackendExtension &
    ((opts: { name: string; close?: boolean } & TOptions) => ServiceExtensionResult);
}

export function defineCors(config: CorsConfig): CorsConfig {
  return {
    allowOrigins: config.allowOrigins,
    allowMethods: config.allowMethods,
    allowHeaders: config.allowHeaders,
    allowCredentials: config.allowCredentials,
    exposeHeaders: config.exposeHeaders,
    maxAge: config.maxAge,
  };
}

export function defineRouter(input: {
  adapter: AdapterRef;
  prefix?: string;
  middleware?: MiddlewareDefinition[];
  cors?: CorsConfig;
}): RouterDefinition {
  return {
    kind: "RouterDefinition",
    adapter: input.adapter,
    prefix: input.prefix ?? "",
    middleware: input.middleware ?? [],
    cors: input.cors,
  };
}

export function defineEnv(input: Record<string, z.ZodTypeAny>): Record<string, z.ZodTypeAny> {
  for (const [key, schema] of Object.entries(input)) {
    let inner: z.ZodTypeAny = schema;
    while (inner._def?.innerType) inner = inner._def.innerType as z.ZodTypeAny;
    const typeName = (inner._def as { typeName?: string })?.typeName;
    if (typeName !== "ZodString" && typeName !== "ZodNumber" && typeName !== "ZodBoolean") {
      throw new Error(
        `defineEnv: "${key}" must be z.string(), z.number(), or z.boolean() (got ${typeName})`,
      );
    }
  }
  return input;
}

export function defineApp(input: {
  env?: Record<string, z.ZodTypeAny>;
  architecture?: ArchitectureRef | ArchitectureRef[] | ArchitectureSelection;
  architectures?: ArchitectureRef[] | ArchitectureSelection;
  adapters?: AdapterRef[] | AdapterSelection;
  router?: RouterDefinition;
  modules: ModuleDefinition[];
  extensions?: BackendExtension[];
  services?: (ServiceDefinition | ServiceExtensionResult)[];
  transformers?: AstTransformer[];
  plugins?: BackendCompilerPlugin[];
  targets?: CodeTarget[];
  errors?: ErrorDefinition[];
  runtime?: RuntimeConfig;
  testing?: TestingConfig;
  metadata?: MetadataConfig;
  options?: Partial<CompileSettings>;
}): AppDefinition {
  return {
    kind: "AppDefinition",
    env: input.env,
    architecture: input.architecture,
    architectures: input.architectures,
    adapters: input.adapters,
    router: input.router,
    modules: input.modules,
    extensions: input.extensions,
    services: input.services ?? [],
    transformers: input.transformers ?? [],
    plugins: input.plugins ?? [],
    targets: input.targets ?? [],
    errors: input.errors ?? [],
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
      validationError: input.options?.validationError,
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

export function defineError(input: {
  name: string;
  httpStatus: HttpStatusCode;
  fields?: SchemaLike;
}): ErrorDefinition {
  return {
    kind: "ErrorDefinition",
    name: input.name,
    httpStatus: input.httpStatus,
    fields: input.fields,
  };
}

export function defineValidationError(input: {
  httpStatus?: HttpStatusCode;
  body: (z: typeof validationZ) => SchemaLike;
}): ValidationErrorConfig {
  return {
    httpStatus: input.httpStatus,
    body: input.body(validationZ),
  };
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
