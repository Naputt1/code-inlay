import type { z } from "zod";

export const AST_VERSION = "2.0";
export const COMPILER_VERSION = "0.2.0";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
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
  transport: "http" | "grpc" | "cli" | string;
  options?: Record<string, unknown>;
};

export type FileCreationMode = "disabled" | "markers-only" | "skeleton";

export type CompileSettings = {
  fileCreation: FileCreationMode;
  targets?: string[];
  targetOptions?: Record<string, Record<string, unknown>>;
  runtime?: RuntimeConfig;
  testing?: TestingConfig;
  metadata?: MetadataConfig;
  sandbox?: SandboxConfig;
};

export type RouteDefinition<
  TInput extends SchemaLike | undefined = SchemaLike | undefined,
  TResponse extends SchemaLike | undefined = SchemaLike | undefined,
> = {
  kind: "RouteDefinition";
  id: string;
  method: HttpMethod;
  path: string;
  architecture?: ArchitectureRef | ArchitectureRef[] | ArchitectureSelection;
  adapter?: AdapterRef | AdapterRef[] | AdapterSelection;
  adapters?: AdapterRef[] | AdapterSelection;
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
  architecture?: ArchitectureRef | ArchitectureRef[] | ArchitectureSelection;
  adapters?: AdapterRef[] | AdapterSelection;
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
export type AdapterRef = BuiltInAdapterName | AdapterPlugin;
export type BuiltInArchitectureName =
  | "clean"
  | "minimal"
  | "atomic"
  | "layered";
export type BuiltInAdapterName = "gin";

export type AppDefinition = {
  kind: "AppDefinition";
  architecture?: ArchitectureRef | ArchitectureRef[] | ArchitectureSelection;
  architectures?: ArchitectureRef[] | ArchitectureSelection;
  adapters?: AdapterRef[] | AdapterSelection;
  router?: RouterDefinition;
  modules: ModuleDefinition[];
  transformers: AstTransformer[];
  plugins: BackendCompilerPlugin[];
  targets?: CodeTarget[];
  options: CompileSettings;
};

export type InferInput<T extends RouteDefinition> =
  Extract<T["input"], SchemaLike> extends never
    ? undefined
    : z.infer<Extract<T["input"], SchemaLike>>;

export type InferResponse<T extends RouteDefinition> =
  Extract<T["response"], SchemaLike> extends never
    ? undefined
    : z.infer<Extract<T["response"], SchemaLike>>;

export type AstDocument = {
  astVersion: AstVersion;
  compilerVersion: string;
  root: AppAst;
};

export type AppAst = AstNodeBase<"App"> & {
  architecture: ArchitectureSelection;
  adapters: AdapterSelection;
  router: RouterAst;
  modules: ModuleAst[];
  plugins: BackendCompilerPlugin[];
  targets: CodeTarget[];
  options: CompileSettings;
};

export type RouterAst = AstNodeBase<"Router"> & {
  adapter: AdapterRef;
  prefix: string;
  middleware: MiddlewareAst[];
};

export type ModuleAst = AstNodeBase<"Module"> & {
  name: string;
  architecture?: ArchitectureSelection;
  adapters?: AdapterSelection;
  routes: RouteAst[];
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
  input?: SchemaLike;
  response?: SchemaLike;
  middleware: MiddlewareAst[];
  metadata: Record<string, unknown>;
};

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

export type GeneratedRegionAst = AstNodeBase<"GeneratedRegion"> &
  GeneratedRegion;

export type ArchitectureAst = {
  nodes: Array<HandlerAst | ServiceAst | RepositoryAst | GeneratedLayer>;
  routes: RouteExpansionAst[];
};

export type RouteExpansionAst = {
  route: RouteAst;
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

export type RuntimeConfig = {
  enabled: boolean;
  di?: "wire" | "manual" | "google-wire" | "uber-fx";
  middleware?: string[];
  tracing?: "otel" | "none";
  logger?: "zerolog" | "slog" | "logrus" | "none";
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

export type SandboxConfig = {
  enabled: boolean;
  timeout?: number;
  allowedFs?: string[];
  allowNet?: boolean;
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
  fileForLayer(route: RouteAst, layer: string): string;
  regionId(route: RouteAst, layer: string): string;
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
  transport?: "http" | "grpc" | "cli" | string;
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
  | "schema"
  | "architecture-layer"
  | "adapter-target"
  | "generated-region"
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
  files: Record<string, { regions: string[] }>;
};

export type CachedRegion = {
  id: string;
  stableHash: string;
  contentHash: string;
  file: string;
  owner?: string;
};
