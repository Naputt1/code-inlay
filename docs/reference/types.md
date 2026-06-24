# Types

Key TypeScript types used in the public API.

## ServiceDefinition

```ts
type ServiceDefinition = {
  kind: "ServiceDefinition";
  name: string;
  close?: boolean;
};
```

Declares a named service dependency. See [Services](/guide/services).

## ServiceExtensionResult

```ts
type ServiceExtensionResult = {
  kind: "ServiceExtensionResult";
  name: string;
  extension: string;
  close?: boolean;
  options: Record<string, unknown>;
};
```

The result of calling a service extension factory. See [Extensions](/guide/extensions).

## BackendExtension

```ts
type BackendExtension = {
  name: string;
  service?: {
    provides?: "database";
    optionsSchema: z.ZodType;
    dbAccessor?: string;
    dbType?: string;
    dbTypePkg?: string;
    goModules?: string[] | ((options: Record<string, unknown>) => string[]);
    generateFile?: (ctx: ServiceFileCtx) => string;
    generateDialectMethod?: (ctx: DialectMethodCtx) => string;
  };
};
```

Defines a reusable service extension. See [Extensions](/guide/extensions).

## ResponseFormat

```ts
type ResponseFormat = {
  kind: "ResponseFormat";
  wrapper: SchemaLike;
};
```

A response format wrapper containing a `z.entity()` placeholder. Applied at app, module, or route level. See [Schemas & Types](/guide/schemas).

## UsecaseOrganization

```ts
type UsecaseOrganization = {
  strategy: "merged" | "single" | "grouped";
  groupBy?: UsecaseGroupBy;
  scaffold?: boolean; // default: true
};
```

Controls how use case files are organized. When `scaffold: false`, only the interface is generated — no implementation. See [Modules](/guide/modules).

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
  responseFormat?: ResponseFormat;
  services?: string[];
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
  services?: (ServiceDefinition | ServiceExtensionResult)[];
  extensions?: BackendExtension[];
  responseFormat?: ResponseFormat;
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
  featuresDir?: string;          // Optional: nest modules under internal/<featuresDir>/
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
