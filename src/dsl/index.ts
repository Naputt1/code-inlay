import { z } from "zod";
import { validationZ } from "../schema/extras.js";
import { EnvRef } from "../types/index.js";
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
  CodecConfig,
  CompileSettings,
  CorsConfig,
  DialectMethodCtx,
  EnvContext,
  ErrorDefinition,
  HttpMethod,
  HttpStatusCode,
  MetadataConfig,
  MiddlewareDefinition,
  ModuleDefinition,
  PluginPackage,
  ResponseFormat,
  RouteDefinition,
  RouteLike,
  RouterAdapter,
  RouterDefinition,
  RuntimeConfig,
  SchemaLike,
  ServiceDefinition,
  ServiceExtensionResult,
  ServiceFileCtx,
  ServiceInput,
  SSEDefinition,
  SSEFieldMapping,
  TestingConfig,
  AdapterSelection,
  UsecaseOrganization,
  ValidationErrorConfig,
  WSDefinition,
  WSLibrary,
} from "../types/index.js";

export type DefineRouteInput<
  TMethod extends HttpMethod,
  TPath extends string,
  THandler extends string,
  TQuery extends SchemaLike | undefined,
  TBody extends SchemaLike | undefined,
  TResponse extends SchemaLike | undefined,
> = {
  path: TPath;
  architecture?: ArchitectureRef | ArchitectureRef[] | ArchitectureSelection;
  adapter?: AdapterRef | AdapterRef[] | AdapterSelection;
  adapters?: AdapterRef[] | AdapterSelection;
  responseFormat?: ResponseFormat;
  errors?: ErrorDefinition[];
  response?: TResponse;
  handler: THandler;
  usecaseGroup?: string;
  middleware?: MiddlewareDefinition[];
  metadata?: Record<string, unknown>;
  query?: TQuery;
  method: TMethod;
  body?: TMethod extends "GET" | "DELETE" ? undefined : TBody;
};

export function defineRoute<
  const TMethod extends HttpMethod,
  const TPath extends string,
  const THandler extends string,
  TQuery extends SchemaLike | undefined = undefined,
  TBody extends SchemaLike | undefined = undefined,
  TResponse extends SchemaLike | undefined = undefined,
>(
  input: DefineRouteInput<TMethod, TPath, THandler, TQuery, TBody, TResponse>,
): RouteDefinition<TMethod, TPath, THandler, TQuery, TBody, TResponse> {
  return {
    kind: "RouteDefinition",
    method: input.method as TMethod,
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

export function defineSSE(input: {
  path: string;
  events: SchemaLike;
  handler: string;
  architecture?: ArchitectureRef | ArchitectureRef[] | ArchitectureSelection;
  adapter?: AdapterRef | AdapterRef[] | AdapterSelection;
  adapters?: AdapterRef[] | AdapterSelection;
  middleware?: MiddlewareDefinition[];
  metadata?: Record<string, unknown>;
  codec?: CodecConfig;
  sseFields?: SSEFieldMapping;
  usecaseCodec?: boolean;
}): SSEDefinition {
  return {
    kind: "SSEDefinition",
    path: input.path,
    events: input.events,
    handler: input.handler,
    architecture: input.architecture,
    adapter: input.adapter,
    adapters: input.adapters,
    middleware: input.middleware ?? [],
    metadata: input.metadata ?? {},
    codec: input.codec,
    sseFields: input.sseFields,
    usecaseCodec: input.usecaseCodec,
  };
}

export function defineWS(input: {
  path: string;
  message: SchemaLike;
  events?: SchemaLike;
  handler: string;
  architecture?: ArchitectureRef | ArchitectureRef[] | ArchitectureSelection;
  adapter?: AdapterRef | AdapterRef[] | AdapterSelection;
  adapters?: AdapterRef[] | AdapterSelection;
  middleware?: MiddlewareDefinition[];
  metadata?: Record<string, unknown>;
  wsLibrary?: WSLibrary;
  codec?: CodecConfig;
  usecaseCodec?: boolean;
}): WSDefinition {
  return {
    kind: "WSDefinition",
    path: input.path,
    message: input.message,
    events: input.events,
    handler: input.handler,
    architecture: input.architecture,
    adapter: input.adapter,
    adapters: input.adapters,
    middleware: input.middleware ?? [],
    metadata: input.metadata ?? {},
    wsLibrary: input.wsLibrary,
    codec: input.codec,
    usecaseCodec: input.usecaseCodec,
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
  routes?: readonly RouteInput[];
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
    routes: flattenRoutes(input.routes ?? []),
    middleware: input.middleware ?? [],
  };
}

export function defineService(input: {
  name?: string;
  close?: boolean;
  env?: string[];
}): ServiceDefinition {
  return {
    kind: "ServiceDefinition",
    name: input.name ?? "",
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
  ((opts: { name?: string; close?: boolean } & TOptions) => ServiceExtensionResult) {
  const factory = (opts: { name?: string; close?: boolean } & TOptions): ServiceExtensionResult => {
    const { name, close, ...rest } = opts as Record<string, unknown>;
    return {
      kind: "ServiceExtensionResult",
      name: (name as string) ?? "",
      extension: input.name,
      close: close as boolean,
      options: input.service.optionsSchema.parse(rest) as Record<string, unknown>,
    };
  };
  return Object.defineProperties(factory, {
    name: { value: input.name, writable: false },
    service: { value: input.service, writable: false },
  }) as BackendExtension &
    ((opts: { name?: string; close?: boolean } & TOptions) => ServiceExtensionResult);
}

export interface AppBuilder<
  TEnv extends Record<string, z.ZodTypeAny> = Record<string, z.ZodTypeAny>,
  TServiceNames extends string = string,
  TModuleNames extends string = string,
> extends AppDefinition {
  defineModule<const TName extends string>(input: {
    name: TName;
    architecture?: ArchitectureRef | ArchitectureRef[] | ArchitectureSelection;
    adapters?: AdapterRef[] | AdapterSelection;
    services?: TServiceNames[];
    usecaseOrganization?: UsecaseOrganization;
    responseFormat?: ResponseFormat;
    errors?: ErrorDefinition[];
    routes?: readonly RouteInput[];
    middleware?: MiddlewareDefinition[];
  }): AppBuilder<TEnv, TServiceNames, TModuleNames | TName>;
}

export function defineCors<T extends CorsConfig | ((ctx: EnvContext) => CorsConfig)>(config: T): T {
  if (typeof config === "function") return config;
  return {
    allowOrigins: config.allowOrigins,
    allowMethods: config.allowMethods,
    allowHeaders: config.allowHeaders,
    allowCredentials: config.allowCredentials,
    exposeHeaders: config.exposeHeaders,
    maxAge: config.maxAge,
  } as T;
}

export function defineRouter(input: {
  adapter: AdapterRef;
  prefix?: string;
  middleware?: MiddlewareDefinition[];
  cors?: CorsConfig | ((ctx: EnvContext) => CorsConfig);
}): RouterDefinition;
export function defineRouter(
  input: (ctx: EnvContext) => {
    adapter: AdapterRef;
    prefix?: string;
    middleware?: MiddlewareDefinition[];
    cors?: CorsConfig | ((ctx: EnvContext) => CorsConfig);
  },
): (ctx: EnvContext) => RouterDefinition;
export function defineRouter(
  input:
    | {
        adapter: AdapterRef;
        prefix?: string;
        middleware?: MiddlewareDefinition[];
        cors?: CorsConfig | ((ctx: EnvContext) => CorsConfig);
      }
    | ((ctx: EnvContext) => {
        adapter: AdapterRef;
        prefix?: string;
        middleware?: MiddlewareDefinition[];
        cors?: CorsConfig | ((ctx: EnvContext) => CorsConfig);
      }),
): unknown {
  if (typeof input === "function") {
    return (ctx: EnvContext): RouterDefinition => {
      const result = input(ctx);
      const cors = typeof result.cors === "function" ? result.cors(ctx) : result.cors;
      return {
        kind: "RouterDefinition",
        adapter: result.adapter,
        prefix: result.prefix ?? "",
        middleware: result.middleware ?? [],
        cors,
      };
    };
  }
  return {
    kind: "RouterDefinition",
    adapter: input.adapter,
    prefix: input.prefix ?? "",
    middleware: input.middleware ?? [],
    cors: input.cors as CorsConfig | undefined,
  };
}

export function defineEnv<const T extends Record<string, z.ZodTypeAny>>(input: T): T {
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

function resolveEnvDefaults(env?: Record<string, z.ZodTypeAny>): Record<string, EnvRef> {
  if (!env) return {};
  const result: Record<string, EnvRef> = {};
  for (const key of Object.keys(env)) {
    result[key] = new EnvRef(key);
  }
  return result;
}

export function defineApp<
  const TEnv extends Record<string, z.ZodTypeAny> = Record<string, z.ZodTypeAny>,
  const TServices extends Record<string, ServiceInput> = Record<string, never>,
>(input: {
  env?: TEnv;
  architecture?: ArchitectureRef | ArchitectureRef[] | ArchitectureSelection;
  architectures?: ArchitectureRef[] | ArchitectureSelection;
  adapters?: AdapterRef[] | AdapterSelection;
  router?: RouterDefinition | ((ctx: EnvContext) => RouterDefinition);
  modules?: ModuleDefinition[];
  extensions?: BackendExtension[];
  services?: TServices;
  transformers?: AstTransformer[];
  plugins?: BackendCompilerPlugin[];
  targets?: CodeTarget[];
  errors?: ErrorDefinition[];
  runtime?: RuntimeConfig;
  testing?: TestingConfig;
  metadata?: MetadataConfig;
  options?: Partial<CompileSettings>;
}): AppBuilder<TEnv, keyof TServices & string, never> {
  const serviceEntries = Object.entries(input.services ?? {}).map(([name, svc]) => ({
    ...svc,
    name,
  })) as (ServiceDefinition | ServiceExtensionResult)[];

  const ctx: EnvContext = { env: resolveEnvDefaults(input.env) };

  let router: RouterDefinition | undefined;
  if (input.router) {
    router =
      typeof input.router === "function"
        ? (input.router as (ctx: EnvContext) => RouterDefinition)(ctx)
        : { ...input.router };
    if (router.cors && typeof router.cors === "function") {
      router.cors = (router.cors as (ctx: EnvContext) => CorsConfig)(ctx);
    }
  }

  const state: AppDefinition = {
    kind: "AppDefinition",
    env: input.env,
    architecture: input.architecture,
    architectures: input.architectures,
    adapters: input.adapters,
    router,
    modules: input.modules ?? [],
    extensions: input.extensions,
    services: serviceEntries,
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

  const builder: Record<string, unknown> & AppDefinition = {
    ...state,
    defineModule: <const TName extends string>(modInput: {
      name: TName;
      architecture?: ArchitectureRef | ArchitectureRef[] | ArchitectureSelection;
      adapters?: AdapterRef[] | AdapterSelection;
      services?: (keyof TServices & string)[];
      usecaseOrganization?: UsecaseOrganization;
      responseFormat?: ResponseFormat;
      errors?: ErrorDefinition[];
      routes?: readonly RouteInput[];
      middleware?: MiddlewareDefinition[];
    }) => {
      state.modules.push({
        kind: "ModuleDefinition",
        name: modInput.name,
        architecture: modInput.architecture,
        adapters: modInput.adapters,
        services: modInput.services,
        usecaseOrganization: modInput.usecaseOrganization,
        responseFormat: modInput.responseFormat,
        errors: modInput.errors,
        routes: flattenRoutes(modInput.routes ?? []),
        middleware: modInput.middleware ?? [],
      });
      return builder;
    },
  };

  return builder as unknown as AppBuilder<TEnv, keyof TServices & string, never>;
}

export type RouteInput = RouteLike | readonly RouteInput[];

function flattenRoutes(routes: readonly RouteInput[]): RouteLike[] {
  const result: RouteLike[] = [];
  for (const r of routes) {
    if (Array.isArray(r)) result.push(...flattenRoutes(r));
    else result.push(r as RouteLike);
  }
  return result;
}

type ExtractHandlers<T extends readonly unknown[]> = T extends readonly [infer First, ...infer Rest]
  ? First extends readonly unknown[]
    ? [...ExtractHandlers<First>, ...ExtractHandlers<Rest>]
    : First extends { handler: infer H extends string }
      ? [H, ...ExtractHandlers<Rest>]
      : ExtractHandlers<Rest>
  : [];

type ExtractMethodPaths<T extends readonly unknown[]> = T extends readonly [
  infer First,
  ...infer Rest,
]
  ? First extends readonly unknown[]
    ? [...ExtractMethodPaths<First>, ...ExtractMethodPaths<Rest>]
    : First extends { method: infer M extends string; path: infer P extends string }
      ? [`${M}:${P}`, ...ExtractMethodPaths<Rest>]
      : ExtractMethodPaths<Rest>
  : [];

type FindDuplicate<T extends readonly string[], Seen extends string = never> = T extends readonly [
  infer First extends string,
  ...infer Rest extends string[],
]
  ? First extends Seen
    ? First
    : FindDuplicate<Rest, Seen | First>
  : false;

type AssertUniqueHandlers<TRoutes extends readonly RouteInput[]> =
  FindDuplicate<ExtractHandlers<TRoutes>> extends false ? true : false;

type AssertUniqueMethodPaths<TRoutes extends readonly RouteInput[]> =
  FindDuplicate<ExtractMethodPaths<TRoutes>> extends false ? true : false;

export function defineRouteGroup<const TRoutes extends readonly RouteInput[]>(input: {
  prefix: string;
  middleware?: MiddlewareDefinition[];
  architecture?: ArchitectureRef | ArchitectureRef[] | ArchitectureSelection;
  routes: TRoutes;
}): [AssertUniqueHandlers<TRoutes>, AssertUniqueMethodPaths<TRoutes>] extends [true, true]
  ? TRoutes
  : never {
  const flat = flattenRoutes(input.routes);
  const seen = new Set<string>();
  for (const r of flat) {
    if (seen.has(r.handler)) throw new Error(`defineRouteGroup: duplicate handler "${r.handler}"`);
    seen.add(r.handler);
  }
  const mpSeen = new Map<string, string>();
  for (const r of flat) {
    if ("method" in r) {
      const key = `${r.method}:${r.path}`;
      const prev = mpSeen.get(key);
      if (prev !== undefined)
        throw new Error(`defineRouteGroup: duplicate ${key} (handlers: "${prev}", "${r.handler}")`);
      mpSeen.set(key, r.handler);
    }
  }
  return flat.map((route) => ({
    ...route,
    path: joinPath(input.prefix, route.path),
    architecture: route.architecture ?? input.architecture,
    middleware: [...(input.middleware ?? []), ...(route.middleware ?? [])],
    metadata: {
      ...route.metadata,
      _group: input.prefix,
      _groupMw: (input.middleware ?? []).map((m) => m.name),
    },
  })) as unknown as [AssertUniqueHandlers<TRoutes>, AssertUniqueMethodPaths<TRoutes>] extends [
    true,
    true,
  ]
    ? TRoutes
    : never;
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
