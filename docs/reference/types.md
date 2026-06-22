# Types

Key TypeScript types used in the public API.

## RouteDefinition

```ts
type RouteDefinition<TQuery, TBody, TResponse> = {
  kind: "RouteDefinition";
  id: string;
  method: HttpMethod;
  path: string;
  handler: string;
  query?: TQuery;
  body?: TBody;
  response?: TResponse;
  middleware: MiddlewareDefinition[];
  usecaseGroup?: string;
  metadata: Record<string, unknown>;
};
```

## ModuleDefinition

```ts
type ModuleDefinition = {
  kind: "ModuleDefinition";
  name: string;
  architecture?: ArchitectureRef | ArchitectureRef[] | ArchitectureSelection;
  adapters?: AdapterRef[] | AdapterSelection;
  usecaseOrganization?: UsecaseOrganization;
  routes: RouteDefinition[];
  middleware: MiddlewareDefinition[];
};
```

## AppDefinition

```ts
type AppDefinition = {
  kind: "AppDefinition";
  architecture?: ArchitectureRef | ArchitectureRef[] | ArchitectureSelection;
  router?: RouterDefinition;
  modules: ModuleDefinition[];
  transformers: AstTransformer[];
  plugins: BackendCompilerPlugin[];
  targets?: CodeTarget[];
  options: CompileSettings;
};
```

## CompileSettings

```ts
type CompileSettings = {
  fileCreation: FileCreationMode; // "disabled" | "markers-only" | "skeleton"
  usecaseOrganization?: UsecaseOrganization;
  targets?: string[];
  targetOptions?: Record<string, Record<string, unknown>>;
  runtime?: RuntimeConfig;
  testing?: TestingConfig;
  metadata?: MetadataConfig;
};
```

## AdapterPlugin

```ts
type AdapterPlugin = {
  name: string;
  version?: string;
  apiVersion?: "2";
  transport?: "http" | "grpc" | "cli" | string;
  generateRoute(ctx: AdapterRouteContext): GeneratedRegion[];
  generateMiddleware(ctx: AdapterMiddlewareContext): GeneratedRegion[];
  generateServer(ctx: AdapterServerContext): GeneratedRegion[];
};
```

## ArchitecturePlugin

```ts
type ArchitecturePlugin = {
  name: string;
  version?: string;
  apiVersion?: "2";
  transform(ctx: ArchitectureContext, ast: AppAst): ArchitectureAst;
};
```

## CodeTarget

```ts
type CodeTarget = {
  name: string;
  version?: string;
  apiVersion?: "3";
  stage: "codegen" | "postTransform";
  generate(ctx: TargetContext): MaybePromise<GeneratedFilePatch[]>;
};
```

## AstTransformer

```ts
type AstTransformer = {
  name: string;
  version?: string;
  hooks?: PipelineHook[];
  transform(ast: AppAst): AppAst;
};
```

## GeneratedRegion

```ts
type GeneratedRegion = {
  id: string;
  stableHash?: string;
  owner?: string;
  language: "go" | "typescript" | "yaml" | "json" | "markdown";
  content: string;
};
```
