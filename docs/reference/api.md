# API Reference

## DSL functions

### defineRoute()

```ts
defineRoute(input: DefineRouteInput): RouteDefinition
```

Defines a single API route with its schema.

See [Defining Routes](/guide/routes).

### defineRouteGroup()

```ts
defineRouteGroup(input: { prefix, middleware?, routes }): RouteDefinition[]
```

Groups routes under a common path prefix with shared middleware.

See [Route Groups](/guide/route-groups).

### defineModule()

```ts
defineModule(input: { name, routes, ... }): ModuleDefinition
```

Groups routes into a Go package.

See [Modules](/guide/modules).

### defineApp()

```ts
defineApp(input: { modules, ... }): AppDefinition
```

Top-level application definition. This is the default export of `backend.config.ts`.

See [Configuration](/guide/configuration).

### defineRouter()

```ts
defineRouter(input: { adapter, prefix?, middleware? }): RouterDefinition
```

Configures the HTTP router adapter.

### defineService()

```ts
defineService(input: { name, close? }): ServiceDefinition
```

Declares an external service dependency (e.g. database, cache). Generates an interface, struct, and constructor in `internal/service/`.

See [Services](/guide/services).

### defineServiceExtension()

```ts
defineServiceExtension(input: { name, service }): BackendExtension & ((opts) => ServiceExtensionResult)
```

Creates a reusable service backend with type-safe options, custom code generation, and automatic Go module installation.

See [Extensions](/guide/extensions).

### defineResponseFormat()

```ts
defineResponseFormat(input: { wrapper }): ResponseFormat
```

Defines a response format wrapper. Use `z.entity()` as a placeholder that gets replaced with each route's response schema.

```ts
const stdFormat = defineResponseFormat({
  wrapper: z.object({ status: z.boolean(), data: z.entity() }),
});
```

### defineMiddleware()

```ts
defineMiddleware(input: { name, handler? }): MiddlewareDefinition
```

Defines a middleware component.

### defineArchitecture()

```ts
defineArchitecture(plugin: ArchitecturePlugin): ArchitecturePlugin
```

Wraps a custom architecture plugin.

### defineAdapter()

```ts
defineAdapter(adapter: RouterAdapter): RouterAdapter
```

Wraps a custom adapter plugin.

### defineTransformer()

```ts
defineTransformer(transformer: AstTransformer): AstTransformer
```

Wraps a custom AST transformer.

### defineTarget()

```ts
defineTarget(target: CodeTarget): CodeTarget
```

Wraps a custom code target.

### definePlugin()

```ts
definePlugin(plugin: BackendCompilerPlugin): BackendCompilerPlugin
```

Wraps a complete plugin package.

## Compilation

### compile()

```ts
compile(options: CompileOptions): Promise<CompileResult>
```

Programmatic access to the compiler. Useful for custom tooling or tests.

```ts
import { compile } from "@code-inlay/backend-gen";

const result = await compile({ app, dryRun: true });
console.log(result.generation.files);
```
