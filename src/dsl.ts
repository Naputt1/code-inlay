import type {
  AdapterRef,
  AppDefinition,
  ArchitecturePlugin,
  ArchitectureRef,
  AstTransformer,
  HttpMethod,
  MiddlewareDefinition,
  ModuleDefinition,
  RouteDefinition,
  RouterAdapter,
  RouterDefinition,
  SchemaLike,
} from "./types.js";

export type DefineRouteInput<
  TInput extends SchemaLike | undefined,
  TResponse extends SchemaLike | undefined,
> = {
  id: string;
  method: HttpMethod;
  path: string;
  input?: TInput;
  response?: TResponse;
  handler: string;
  middleware?: MiddlewareDefinition[];
  metadata?: Record<string, unknown>;
};

type DefineRouteBase = {
  id: string;
  method: HttpMethod;
  path: string;
  handler: string;
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
    input: input.input,
    response: input.response,
    handler: input.handler,
    middleware: input.middleware ?? [],
    metadata: input.metadata ?? {},
  };
}

export function defineMiddleware(input: {
  name: string;
  handler?: string;
}): MiddlewareDefinition {
  return {
    kind: "MiddlewareDefinition",
    name: input.name,
    handler: input.handler,
  };
}

export function defineModule(input: {
  name: string;
  routes?: RouteDefinition[];
  middleware?: MiddlewareDefinition[];
}): ModuleDefinition {
  return {
    kind: "ModuleDefinition",
    name: input.name,
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
  architecture: ArchitectureRef;
  router: RouterDefinition;
  modules: ModuleDefinition[];
  transformers?: AstTransformer[];
}): AppDefinition {
  return {
    kind: "AppDefinition",
    architecture: input.architecture,
    router: input.router,
    modules: input.modules,
    transformers: input.transformers ?? [],
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
