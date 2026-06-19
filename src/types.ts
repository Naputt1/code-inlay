import type { z } from "zod";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type DiagnosticLevel = "error" | "warning";

export type Diagnostic = {
  level: DiagnosticLevel;
  code: string;
  message: string;
  file?: string;
  regionId?: string;
};

export type MaybePromise<T> = T | Promise<T>;

export type SchemaLike = z.ZodTypeAny;

export type RouteDefinition<
  TInput extends SchemaLike | undefined = SchemaLike | undefined,
  TResponse extends SchemaLike | undefined = SchemaLike | undefined,
> = {
  kind: "RouteDefinition";
  id: string;
  method: HttpMethod;
  path: string;
  input?: TInput;
  response?: TResponse;
  handler: string;
  middleware: MiddlewareDefinition[];
  metadata: Record<string, unknown>;
};

export type MiddlewareDefinition = {
  kind: "MiddlewareDefinition";
  name: string;
  handler?: string;
};

export type ModuleDefinition = {
  kind: "ModuleDefinition";
  name: string;
  routes: RouteDefinition[];
  middleware: MiddlewareDefinition[];
};

export type RouterDefinition = {
  kind: "RouterDefinition";
  adapter: AdapterRef;
  prefix: string;
  middleware: MiddlewareDefinition[];
};

export type ArchitectureRef = BuiltInArchitectureName | ArchitecturePlugin;
export type AdapterRef = BuiltInAdapterName | RouterAdapter;
export type BuiltInArchitectureName = "clean" | "minimal" | "atomic" | "layered";
export type BuiltInAdapterName = "gin";

export type AppDefinition = {
  kind: "AppDefinition";
  architecture: ArchitectureRef;
  router: RouterDefinition;
  modules: ModuleDefinition[];
  transformers: AstTransformer[];
};

export type InferInput<T extends RouteDefinition> = Extract<T["input"], SchemaLike> extends never
  ? undefined
  : z.infer<Extract<T["input"], SchemaLike>>;

export type InferResponse<T extends RouteDefinition> = Extract<T["response"], SchemaLike> extends never
  ? undefined
  : z.infer<Extract<T["response"], SchemaLike>>;

export type AppAst = {
  kind: "App";
  architecture: ArchitectureRef;
  router: RouterAst;
  modules: ModuleAst[];
};

export type RouterAst = {
  kind: "Router";
  adapter: AdapterRef;
  prefix: string;
  middleware: MiddlewareAst[];
};

export type ModuleAst = {
  kind: "Module";
  name: string;
  routes: RouteAst[];
  middleware: MiddlewareAst[];
};

export type RouteAst = {
  kind: "Route";
  id: string;
  moduleName: string;
  method: HttpMethod;
  path: string;
  fullPath: string;
  handlerName: string;
  input?: SchemaLike;
  response?: SchemaLike;
  middleware: MiddlewareAst[];
  metadata: Record<string, unknown>;
};

export type MiddlewareAst = {
  kind: "Middleware";
  name: string;
  handler?: string;
};

export type ArchitectureAst = {
  routes: RouteExpansionAst[];
};

export type RouteExpansionAst = {
  route: RouteAst;
  layers: GeneratedLayer[];
};

export type GeneratedLayer = {
  kind: string;
  symbolName: string;
  file: string;
  regionId: string;
};

export type GenerationAst = {
  files: GeneratedFilePatch[];
};

export type GeneratedFilePatch = {
  path: string;
  regions: GeneratedRegion[];
};

export type GeneratedRegion = {
  id: string;
  language: "go";
  content: string;
};

export type ArchitectureContext = {
  diagnostics: Diagnostic[];
  fileForLayer(route: RouteAst, layer: string): string;
  regionId(route: RouteAst, layer: string): string;
};

export type ArchitecturePlugin = {
  name: string;
  transform(ctx: ArchitectureContext, ast: AppAst): ArchitectureAst;
};

export type AdapterContext = {
  diagnostics: Diagnostic[];
};

export type AdapterRouteContext = AdapterContext & {
  route: RouteAst;
  architecture: ArchitectureAst;
};

export type AdapterMiddlewareContext = AdapterContext & {
  middleware: MiddlewareAst;
};

export type AdapterServerContext = AdapterContext & {
  app: AppAst;
  architecture: ArchitectureAst;
};

export type RouterAdapter = {
  name: string;
  generateRoute(ctx: AdapterRouteContext): GeneratedRegion[];
  generateMiddleware(ctx: AdapterMiddlewareContext): GeneratedRegion[];
  generateServer(ctx: AdapterServerContext): GeneratedRegion[];
};

export type AstTransformer = {
  name: string;
  transform(ast: AppAst): AppAst;
};

export type CompileOptions = {
  configFile?: string;
  app?: AppDefinition;
  cwd?: string;
  module?: string;
  route?: string;
  dryRun?: boolean;
  check?: boolean;
};

export type CompileResult = {
  ast?: AppAst;
  architecture?: ArchitectureAst;
  generation: GenerationAst;
  diagnostics: Diagnostic[];
  changedFiles: string[];
  diffs: FileDiff[];
};

export type FileDiff = {
  path: string;
  before: string;
  after: string;
};
