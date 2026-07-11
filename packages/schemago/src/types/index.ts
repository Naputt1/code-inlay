import type { z } from "zod";
import type { Field, Statement, Expression } from "@schemago/goast";

export const AST_VERSION = "2.0";
export const COMPILER_VERSION = "0.2.0";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type WSLibrary = "gorilla/websocket" | "nhooyr.io/websocket";
export type CodecPreset = "json" | "sse" | "protobuf";
export type CustomCodecDef = { marshal: string; unmarshal?: string };
export type CodecDef = CodecPreset | CustomCodecDef;
export type NegotiationStrategy = "accept-header" | "subprotocol" | "query-param";
export type CodecNegotiation = {
  from: NegotiationStrategy | NegotiationStrategy[];
  default: string;
  options: Record<string, CodecDef>;
};
export type CodecConfig = CodecDef | CodecNegotiation;
export type ResolvedCodecSingle =
  | { kind: "preset"; preset: CodecPreset }
  | { kind: "custom"; marshal: string; unmarshal?: string };
export type ResolvedCodec =
  | ResolvedCodecSingle
  | {
      kind: "negotiated";
      strategy: NegotiationStrategy[];
      defaultKey: string;
      codecs: Record<string, ResolvedCodecSingle>;
    };
export type SSEFieldMapping = { eventField?: string; idField?: string; retry?: number };
export type TransportProtocol = "http" | "grpc" | "cli" | "sse" | "ws" | string;
export type DiagnosticLevel = "error" | "warning";

export type Diagnostic = {
  level: DiagnosticLevel;
  code: string;
  message: string;
  file?: string;
  regionId?: string;
  nodeId?: string;
};

export type MaybePromise<T> = T | Promise<T>;

export type SchemaLike = z.ZodTypeAny;

export type AstVersion = typeof AST_VERSION;
export type PluginType =
  | "adapter"
  | "architecture"
  | "transformer"
  | "validator"
  | "codegen"
  | "target";

export type PipelineStage =
  | "preTransform"
  | "architecture"
  | "adapter"
  | "codegen"
  | "postTransform"
  | "target"
  | "validate";

export type SourceRef = {
  file?: string;
  line?: number;
  column?: number;
};

export type AstNodeBase<TKind extends string = string> = {
  kind: TKind;
  id: string;
  stableId: string;
  source?: SourceRef;
  annotations: Record<string, unknown>;
  pluginData: Record<string, unknown>;
};

export type ArchitectureSelection = {
  mode: "replace" | "append";
  refs: ArchitectureRef[];
};

export type AdapterSelection = {
  mode: "replace" | "append";
  refs: AdapterRef[];
};

export type AdapterTarget = {
  name: string;
  transport: TransportProtocol;
  options?: Record<string, unknown>;
};

export type FileCreationMode = "disabled" | "markers-only" | "skeleton";

export type UsecaseGroupBy =
  | "path"
  | "operation"
  | "handler"
  | "module"
  | ((route: RouteAst) => string);

export type UsecaseOrganization = {
  strategy: "merged" | "single" | "grouped";
  groupBy?: UsecaseGroupBy;
  scaffold?: boolean;
};

export const HttpStatus = {
  BadRequest: 400,
  Unauthorized: 401,
  PaymentRequired: 402,
  Forbidden: 403,
  NotFound: 404,
  MethodNotAllowed: 405,
  NotAcceptable: 406,
  ProxyAuthRequired: 407,
  RequestTimeout: 408,
  Conflict: 409,
  Gone: 410,
  LengthRequired: 411,
  PreconditionFailed: 412,
  RequestEntityTooLarge: 413,
  RequestURITooLong: 414,
  UnsupportedMediaType: 415,
  RequestedRangeNotSatisfiable: 416,
  ExpectationFailed: 417,
  Teapot: 418,
  MisdirectedRequest: 421,
  UnprocessableEntity: 422,
  Locked: 423,
  FailedDependency: 424,
  UpgradeRequired: 426,
  PreconditionRequired: 428,
  TooManyRequests: 429,
  RequestHeaderFieldsTooLarge: 431,
  UnavailableForLegalReasons: 451,
  InternalServerError: 500,
  NotImplemented: 501,
  BadGateway: 502,
  ServiceUnavailable: 503,
  GatewayTimeout: 504,
} as const;

export type HttpStatusCode = (typeof HttpStatus)[keyof typeof HttpStatus] | (number & {});

export type ErrorDefinition = {
  kind: "ErrorDefinition";
  name: string;
  httpStatus: HttpStatusCode;
  fields?: SchemaLike;
};

export type ResponseFormat = {
  kind: "ResponseFormat";
  wrapper: SchemaLike;
};

export type ServiceDefinition = {
  kind: "ServiceDefinition";
  name: string;
  close?: boolean;
  env?: string[];
  structFields?: Field[];
  extraImports?: string[];
  interfaceMethods?: { name: string; params: Field[]; results?: Field[] }[];
  ctor?: {
    returnsError?: boolean;
  };
};

export type ServiceFileCtx<TOptions> = {
  name: string;
  options: TOptions;
  typeName: string;
  implName: string;
  ctorName: string;
  close?: boolean;
};

export type ServiceMainCtx<TOptions> = {
  name: string;
  options: TOptions;
  typeName: string;
  implName: string;
  ctorName: string;
  close?: boolean;
  varName: string;
};

export type DialectMethodCtx<TOptions> = {
  method: RepositoryMethod;
  baseEntity: string;
  implName: string;
  options: TOptions;
};

export type BackendExtension = {
  name: string;
  service?: {
    provides?: "database";
    optionsSchema: z.ZodType;
    dbAccessor?: string;
    dbType?: string;
    dbTypePkg?: string;
    goModules?: string[] | ((options: Record<string, unknown>) => string[]);
    generateFile?: (ctx: ServiceFileCtx<Record<string, unknown>>) => string;
    generateDialectMethod?: (ctx: DialectMethodCtx<Record<string, unknown>>) => string;
    structFields?: (ctx: ServiceFileCtx<Record<string, unknown>>) => Field[];
    extraImports?: (ctx: ServiceFileCtx<Record<string, unknown>>) => string[];
    interfaceMethods?: (
      ctx: ServiceFileCtx<Record<string, unknown>>,
    ) => { name: string; params: Field[]; results?: Field[] }[];
    implementationMethods?: (
      ctx: ServiceFileCtx<Record<string, unknown>>,
    ) => { name: string; params: Field[]; results?: Field[]; body: Statement[] }[];
    ctor?: {
      params?: (ctx: ServiceFileCtx<Record<string, unknown>>) => Field[];
      body?: (ctx: ServiceFileCtx<Record<string, unknown>>) => Statement[];
    };
    mainConstructorArgs?: (ctx: ServiceMainCtx<Record<string, unknown>>) => Expression[];
    startup?: (ctx: ServiceMainCtx<Record<string, unknown>>) => Statement[];
    healthCheck?: (ctx: ServiceMainCtx<Record<string, unknown>>) => Statement[];
    extraFiles?: (ctx: ServiceFileCtx<Record<string, unknown>>) => Record<string, string>;
  };
};

export type ServiceExtensionResult = {
  kind: "ServiceExtensionResult";
  name: string;
  extension: string;
  close?: boolean;
  options: Record<string, unknown>;
};

export type RepositoryMethod = {
  name: string;
  params: string;
  results: string;
  entityName: string;
};

export type CompileSettings = {
  fileCreation: FileCreationMode;
  usecaseOrganization?: UsecaseOrganization;
  responseFormat?: ResponseFormat;
  targets?: string[];
  targetOptions?: Record<string, Record<string, unknown>>;
  featuresDir?: string;
  runtime?: RuntimeConfig;
  testing?: TestingConfig;
  metadata?: MetadataConfig;
  validationError?: ValidationErrorConfig;
};

export type RouteDefinition<
  TMethod extends HttpMethod = HttpMethod,
  TPath extends string = string,
  THandler extends string = string,
  TQuery extends SchemaLike | undefined = undefined,
  TBody extends SchemaLike | undefined = undefined,
  TResponse extends SchemaLike | undefined = undefined,
> = {
  kind: "RouteDefinition";
  method: TMethod;
  path: TPath;
  architecture?: ArchitectureRef | ArchitectureRef[] | ArchitectureSelection;
  adapter?: AdapterRef | AdapterRef[] | AdapterSelection;
  adapters?: AdapterRef[] | AdapterSelection;
  responseFormat?: ResponseFormat;
  errors?: ErrorDefinition[];
  query?: TQuery;
  body?: TBody;
  response?: TResponse;
  handler: THandler;
  middleware: MiddlewareDefinition[];
  usecaseGroup?: string;
  metadata: Record<string, unknown>;
};

export type SSEDefinition = {
  kind: "SSEDefinition";
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
};

export type WSDefinition = {
  kind: "WSDefinition";
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
};

export type RouteLike =
  | RouteDefinition<
      HttpMethod,
      string,
      string,
      SchemaLike | undefined,
      SchemaLike | undefined,
      SchemaLike | undefined
    >
  | SSEDefinition
  | WSDefinition;

export type MiddlewareDefinition = {
  kind: "MiddlewareDefinition";
  name: string;
  handler?: string;
};

export type ModuleDefinition = {
  kind: "ModuleDefinition";
  name: string;
  architecture?: ArchitectureRef | ArchitectureRef[] | ArchitectureSelection;
  adapters?: AdapterRef[] | AdapterSelection;
  services?: string[];
  usecaseOrganization?: UsecaseOrganization;
  responseFormat?: ResponseFormat;
  errors?: ErrorDefinition[];
  routes: readonly RouteLike[];
  middleware: MiddlewareDefinition[];
};

export type ServiceInput = Omit<ServiceDefinition, "name"> | Omit<ServiceExtensionResult, "name">;

export class EnvRef {
  constructor(public readonly name: string) {}
  toString(): string {
    return `\${${this.name}}`;
  }
}

export type EnvContext = {
  env: Record<string, EnvRef>;
};

export type CorsConfig = {
  allowOrigins: string[];
  allowMethods: string[];
  allowHeaders: string[];
  allowCredentials?: boolean;
  exposeHeaders?: string[];
  maxAge?: number;
};

export type RouterDefinition = {
  kind: "RouterDefinition";
  adapter: AdapterRef;
  prefix: string;
  middleware: MiddlewareDefinition[];
  cors?: CorsConfig;
};

export type ArchitectureRef = BuiltInArchitectureName | ArchitecturePlugin;
export type AdapterRef = BuiltInAdapterName | AdapterPlugin;
export type BuiltInArchitectureName = "clean" | "minimal" | "atomic" | "layered" | "sse" | "ws";
export type BuiltInAdapterName = "gin";

export type EnvVarType = "string" | "number" | "boolean";

export type EnvVarInfo = {
  type: EnvVarType;
  default?: string;
  required: boolean;
  description?: string;
};

export type AppDefinition = {
  kind: "AppDefinition";
  env?: Record<string, z.ZodTypeAny>;
  architecture?: ArchitectureRef | ArchitectureRef[] | ArchitectureSelection;
  architectures?: ArchitectureRef[] | ArchitectureSelection;
  adapters?: AdapterRef[] | AdapterSelection;
  router?: RouterDefinition;
  modules: ModuleDefinition[];
  extensions?: BackendExtension[];
  services?: (ServiceDefinition | ServiceExtensionResult)[];
  transformers: AstTransformer[];
  plugins: BackendCompilerPlugin[];
  targets?: CodeTarget[];
  errors?: ErrorDefinition[];
  options: CompileSettings;
};

export type InferResponse<T extends RouteDefinition> =
  Extract<T["response"], SchemaLike> extends never
    ? undefined
    : z.infer<Extract<T["response"], SchemaLike>>;

export type AstDocument = {
  astVersion: AstVersion;
  compilerVersion: string;
  root: AppAst;
};

export type AppServiceDef = {
  name: string;
  close?: boolean;
  typeName: string;
  extension?: string;
  env?: string[];
  extensionOptions?: Record<string, unknown>;
  provides?: string;
  dbAccessor?: string;
  dbType?: string;
  dbTypePkg?: string;
  structFields?: Field[];
  extraImports?: string[];
  interfaceMethods?: { name: string; params: Field[]; results?: Field[] }[];
  implementationMethods?: { name: string; params: Field[]; results?: Field[]; body: Statement[] }[];
  ctor?: {
    params?: Field[];
    body?: Statement[];
    returnsError?: boolean;
  };
  mainConstructorArgs?: Expression[];
  startup?: Statement[];
  healthCheck?: Statement[];
  extraFiles?: Record<string, string>;
};

export type AppAst = AstNodeBase<"App"> & {
  env?: Record<string, EnvVarInfo>;
  architecture: ArchitectureSelection;
  adapters: AdapterSelection;
  router: RouterAst;
  modules: ModuleAst[];
  services: AppServiceDef[];
  serviceExtensions: BackendExtension[];
  plugins: BackendCompilerPlugin[];
  targets: CodeTarget[];
  errors: ErrorDefinition[];
  options: CompileSettings;
};

export type RouterAst = AstNodeBase<"Router"> & {
  adapter: AdapterRef;
  prefix: string;
  middleware: MiddlewareAst[];
  cors?: CorsConfig;
};

export type ModuleAst = AstNodeBase<"Module"> & {
  name: string;
  architecture?: ArchitectureSelection;
  adapters?: AdapterSelection;
  services: string[];
  usecaseOrganization?: UsecaseOrganization;
  responseFormat?: ResponseFormat;
  routes: RouteLikeAst[];
  middleware: MiddlewareAst[];
};

export type RouteAst = AstNodeBase<"Route"> & {
  moduleName: string;
  method: HttpMethod;
  path: string;
  fullPath: string;
  handlerName: string;
  architecture?: ArchitectureSelection;
  adapters?: AdapterSelection;
  resolvedArchitectures: ArchitectureRef[];
  resolvedAdapters: AdapterTarget[];
  responseFormat?: ResponseFormat;
  errors: ErrorDefinition[];
  query?: SchemaLike;
  body?: SchemaLike;
  response?: SchemaLike;
  middleware: MiddlewareAst[];
  usecaseGroup?: string;
  metadata: Record<string, unknown>;
};

export type SSEAst = AstNodeBase<"SSE"> & {
  moduleName: string;
  path: string;
  fullPath: string;
  handlerName: string;
  architecture?: ArchitectureSelection;
  adapters?: AdapterSelection;
  resolvedArchitectures: ArchitectureRef[];
  resolvedAdapters: AdapterTarget[];
  events: SchemaLike;
  middleware: MiddlewareAst[];
  metadata: Record<string, unknown>;
  codec?: ResolvedCodec;
  sseFields?: SSEFieldMapping;
  usecaseCodec?: boolean;
};

export type WSAst = AstNodeBase<"WS"> & {
  moduleName: string;
  path: string;
  fullPath: string;
  handlerName: string;
  architecture?: ArchitectureSelection;
  adapters?: AdapterSelection;
  resolvedArchitectures: ArchitectureRef[];
  resolvedAdapters: AdapterTarget[];
  message: SchemaLike;
  events?: SchemaLike;
  wsLibrary?: string;
  middleware: MiddlewareAst[];
  metadata: Record<string, unknown>;
  codec?: ResolvedCodec;
  usecaseCodec?: boolean;
};

export type RouteLikeAst = RouteAst | SSEAst | WSAst;

export type MiddlewareAst = AstNodeBase<"Middleware"> & {
  name: string;
  handler?: string;
};

export type HandlerAst = AstNodeBase<"Handler"> & {
  route: RouteAst;
  symbolName: string;
  file: string;
  regionId: string;
  owner: string;
};

export type ServiceAst = AstNodeBase<"Service"> & {
  route: RouteAst;
  symbolName: string;
  file: string;
  regionId: string;
  owner: string;
};

export type RepositoryAst = AstNodeBase<"Repository"> & {
  route: RouteAst;
  symbolName: string;
  file: string;
  regionId: string;
  owner: string;
};

export type AdapterTargetAst = AstNodeBase<"AdapterTarget"> & AdapterTarget;

export type GeneratedRegionAst = AstNodeBase<"GeneratedRegion"> & GeneratedRegion;

export type ArchitectureAst = {
  nodes: Array<HandlerAst | ServiceAst | RepositoryAst | GeneratedLayer>;
  routes: RouteExpansionAst[];
};

export type RouteExpansionAst = {
  route: RouteLikeAst;
  layers: GeneratedLayer[];
};

export type GeneratedLayer = {
  kind: string;
  id?: string;
  stableId?: string;
  owner?: string;
  mergeKey?: string;
  symbolName: string;
  file: string;
  regionId: string;
};

export type GenerationAst = {
  files: GeneratedFilePatch[];
};

export type GoSymKind =
  | "function"
  | "method"
  | "struct"
  | "interface"
  | "type"
  | "const"
  | "var"
  | "imports";

export type GeneratedFilePatch = {
  path: string;
  regions: GeneratedRegion[];
};

export type GeneratedRegion = {
  id: string;
  stableHash?: string;
  owner?: string;
  contentHash?: string;
  language: "go" | "typescript" | "yaml" | "json" | "markdown";
  content: string;
  groupKey?: string;
  symbolName?: string;
  kind?: GoSymKind;
  signature?: string;
  receiver?: string;
  imports?: string[];
  expectsUserCode?: boolean;
  isStub?: boolean;
};

export type TargetContext = {
  diagnostics: Diagnostic[];
  ast: AppAst;
  architecture: ArchitectureAst;
  registry: {
    plugins: BackendCompilerPlugin[];
    architectures: Map<string, ArchitecturePlugin>;
    adapters: Map<string, AdapterPlugin>;
    transformers: TransformerPlugin[];
    validators: ValidatorPlugin[];
    targets: Map<string, CodeTarget>;
    manifestHash: string;
  };
  cwd: string;
  options: CompileSettings;
};

export type CodeTarget = {
  name: string;
  version?: string;
  apiVersion?: "3";
  stage: "codegen" | "postTransform";
  generate(ctx: TargetContext): MaybePromise<GeneratedFilePatch[]>;
};

export type HealthCheckConfig = {
  enabled?: boolean;
  livenessPath?: string;
  readinessPath?: string;
};

export type LoggerConfig = {
  provider: "zerolog" | "slog" | "logrus" | "none";
  level?: "debug" | "info" | "warn" | "error";
  format?: "json" | "text";
};

export type RuntimeConfig = {
  enabled: boolean;
  di?: "wire" | "manual" | "google-wire" | "uber-fx";
  middleware?: string[];
  tracing?: "otel" | "none";
  logger?: LoggerConfig;
  shutdownTimeout?: number;
  healthCheck?: HealthCheckConfig;
};

export type ValidationErrorConfig = {
  httpStatus?: HttpStatusCode;
  body?: SchemaLike;
};

export type TestingConfig = {
  mocks: boolean;
  scaffolds: boolean;
  contracts: boolean;
  framework?: "testify" | "moq" | "gomock";
};

export type MetadataConfig = {
  enabled: boolean;
  routeRegistry: boolean;
  schemaReflection: boolean;
};

export type PluginCompatibility = {
  astVersion: string;
  coreVersion: string;
  nodeVersion?: string;
};

export type PluginPackage = {
  name: string;
  version: string;
  type: PluginType;
  transport?: string;
  compatibility: PluginCompatibility;
  capabilities?: string[];
  dependencies?: Record<string, string>;
  settings?: Record<string, unknown>;
  manifestHash: string;
};

export type ArchitectureContext = {
  diagnostics: Diagnostic[];
  fileForLayer(route: RouteLikeAst, layer: string): string;
  regionId(route: RouteLikeAst, layer: string): string;
  owner: string;
};

export type ArchitecturePlugin = {
  name: string;
  version?: string;
  apiVersion?: "2";
  transform(ctx: ArchitectureContext, ast: AppAst): ArchitectureAst;
};

export type AdapterContext = {
  diagnostics: Diagnostic[];
  target?: AdapterTarget;
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

export type AdapterPlugin = {
  name: string;
  version?: string;
  apiVersion?: "2";
  transport?: TransportProtocol;
  generateRoute(ctx: AdapterRouteContext): GeneratedRegion[];
  generateMiddleware(ctx: AdapterMiddlewareContext): GeneratedRegion[];
  generateServer(ctx: AdapterServerContext): GeneratedRegion[];
};

export type RouterAdapter = AdapterPlugin;

export type AstPatch =
  | { op: "replaceAst"; ast: AppAst }
  | { op: "addDiagnostic"; diagnostic: Diagnostic };

export type PluginContext = {
  diagnostics: Diagnostic[];
  plugin: BackendCompilerPlugin;
};

export type PipelineHook<TAst = AppAst> = {
  stage: PipelineStage;
  order?: number;
  run(ctx: PluginContext, ast: TAst): MaybePromise<TAst | AstPatch[]>;
};

export type AstTransformer = {
  name: string;
  version?: string;
  hooks?: PipelineHook[];
  transform(ast: AppAst): AppAst;
};

export type TransformerPlugin = AstTransformer;

export type CodegenPlugin = {
  name: string;
  version: string;
  apiVersion?: "2";
};

export type ValidatorPlugin = {
  name: string;
  version: string;
  apiVersion?: "2";
  validate(ctx: PluginContext, ast: AppAst): MaybePromise<void>;
};

export type BackendCompilerPlugin = {
  name: string;
  version: string;
  apiVersion: "2";
  architectures?: ArchitecturePlugin[];
  adapters?: AdapterPlugin[];
  transformers?: TransformerPlugin[];
  codeGenerators?: CodegenPlugin[];
  validators?: ValidatorPlugin[];
};

export type CompileOptions = {
  configFile?: string;
  app?: AppDefinition;
  cwd?: string;
  module?: string;
  route?: string;
  dryRun?: boolean;
  check?: boolean;
  forceRegions?: string[];
  forceRegion?: string;
  changedFiles?: string[];
  watch?: boolean;
};

export type CompileResult = {
  document?: AstDocument;
  ast?: AppAst;
  architecture?: ArchitectureAst;
  generation: GenerationAst;
  diagnostics: Diagnostic[];
  changedFiles: string[];
  diffs: FileDiff[];
  dependencyGraph?: DependencyGraph;
};

export type FileDiff = {
  path: string;
  before: string;
  after: string;
};

export type DependencyNodeKind =
  | "app"
  | "module"
  | "route"
  | "sse"
  | "ws"
  | "schema"
  | "architecture-layer"
  | "adapter-target"
  | "generated-region"
  | "generated-symbol"
  | "file";

export type DependencyNode = {
  id: string;
  kind: DependencyNodeKind;
  hash: string;
};

export type DependencyGraph = {
  nodes: Record<string, DependencyNode>;
  edges: Array<{ from: string; to: string; reason: string }>;
};

export type CompilerCache = {
  compilerVersion: string;
  astVersion: AstVersion;
  pluginManifestHash: string;
  dependencyGraph: DependencyGraph;
  regions: Record<string, CachedRegion>;
  symbols: Record<string, CachedSymbol>;
  symbolsByFile: Record<string, Record<string, string>>;
  files: Record<string, { regions: string[]; symbols: string[] }>;
};

export type CachedRegion = {
  id: string;
  stableHash: string;
  contentHash: string;
  file: string;
  owner?: string;
  groupKey?: string;
};

export type CachedSymbol = {
  stableHash: string;
  shortHash: string;
  contentHash: string;
  symbolName: string;
  kind: GoSymKind;
  file: string;
  owner?: string;
  expectsUserCode?: boolean;
  isStub?: boolean;
  imports?: string[];
  signature?: string;
  receiver?: string;
};

export type GoDeclaration = {
  kind: GoSymKind;
  symbolName: string;
  receiver?: string;
  signature?: string;
  body?: string;
  bodyStart: number;
  bodyEnd: number;
  startLine: number;
  endLine: number;
  imports?: string[];
};
