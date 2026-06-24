# Configuration

The `backend.config.ts` file is the single source of truth for your API. It uses `defineApp()` as the top-level export.

```ts
export default defineApp({
  // ...
});
```

## defineApp

| Option           | Type                      | Default   | Description                    |
| ---------------- | ------------------------- | --------- | ------------------------------ |
| `architecture`   | `ArchitectureRef`         | `"clean"` | Architecture plugin            |
| `router`         | `RouterDefinition`        | —         | Router adapter + prefix        |
| `modules`        | `ModuleDefinition[]`      | —         | API modules                    |
| `services`       | `ServiceDefinition[]`     | `[]`      | Service dependencies           |
| `extensions`     | `BackendExtension[]`      | `[]`      | Service extensions             |
| `responseFormat` | `ResponseFormat`          | —         | Global response format wrapper |
| `transformers`   | `AstTransformer[]`        | `[]`      | AST transformers               |
| `plugins`        | `BackendCompilerPlugin[]` | `[]`      | External plugins               |
| `targets`        | `CodeTarget[]`            | `[]`      | Additional output targets      |
| `options`        | `CompileSettings`         | —         | Compiler options               |

### options

```ts
options: {
  fileCreation: "skeleton",     // "disabled" | "markers-only" | "skeleton"
  targets: ["go-server"],        // Built-in Go server target
  featuresDir: "features",       // Optional: nest modules under internal/features/
  targetOptions: {
    "ts-client": { outputDir: "clients" },
    openapi: { title: "My API", version: "1.0.0" },
  },
  usecaseOrganization: {
    strategy: "merged",          // "merged" | "single" | "grouped"
    scaffold: true,              // Generate use case implementation scaffolds
  },
  runtime: {
    enabled: false,
    di: "wire",                  // "wire" | "manual" | "google-wire" | "uber-fx"
    tracing: "otel",             // "otel" | "none"
    logger: "zerolog",           // "zerolog" | "slog" | "logrus" | "none"
  },
  testing: {
    mocks: false,
    scaffolds: false,
    contracts: false,
  },
  metadata: {
    enabled: false,
    routeRegistry: false,
    schemaReflection: false,
  },
}
```
