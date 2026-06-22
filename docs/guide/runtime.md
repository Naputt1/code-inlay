# Runtime

The runtime layer provides DI wiring, middleware scaffolding, logging, and tracing.

## Configuration

```ts
export default defineApp({
  options: {
    runtime: {
      enabled: true,
      di: "wire", // Dependency injection style
      tracing: "otel", // OpenTelemetry
      logger: "zerolog", // Structured logging
    },
  },
});
```

## DI options

| Option        | Description                    |
| ------------- | ------------------------------ |
| `manual`      | Manually wired dependencies    |
| `wire`        | Google Wire (codegen-based DI) |
| `google-wire` | Same as `wire`                 |
| `uber-fx`     | Uber Fx (runtime DI)           |

## Generated runtime

When `runtime.enabled` is `true`, the generator creates:

- `runtime/context.go` — Request context helpers
- `runtime/middleware.go` — Logging, tracing middleware
- `runtime/main.go` — DI-wired application bootstrap
- `runtime/go.mod` — Separate Go module for runtime

## Tracing

When `tracing: "otel"` is set, handlers are wrapped with OpenTelemetry spans automatically.

## Logging

When `logger: "zerolog"` is set, request logging middleware is generated using zerolog.
