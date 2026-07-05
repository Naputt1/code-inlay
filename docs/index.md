# SchemaGo

**TypeScript-defined Go backend code generator.**

Write your API routes with Zod schemas in a single `backend.config.ts` file, and generate a complete Go server — handlers, use cases, repositories, route registration, DI wiring, and OpenAPI spec.

## How it works

```
backend.config.ts  ──►  schemago generate
                          │
                          ├── Go server
                          │     cmd/server/main.go
                          │     internal/*/handler.go
                          │     internal/*/usecase.go
                          │     internal/*/repo.go
                          │     internal/http/routes.go
                          │     runtime/
                          │
                           └── OpenAPI spec
```

## Features

- **Type-safe route definitions** via Zod schemas
- **Go server generation** with Gin adapter
- **Clean / Minimal / Atomic / Layered** architectures
- **Service definitions** — declare external dependencies (DB, cache, etc.)
- **Service extensions** — reusable backends with typed options and custom code generation
- **Response format wrappers** — consistent API response envelopes
- **Domain type separation** — domain entities separated from HTTP types
- **Input validation** — Zod rules mapped to `validate` struct tags
- **OpenAPI 3.0** spec generation
- **Plugin system** — custom architectures, transformers, targets
- **Watch mode** with live code regeneration
- **Region-based editing** — safe incremental code generation

## Quick start

```sh
npx @schemago/schemago init my-api
cd my-api
npm install
npx schemago generate
```

See the [Getting Started](/guide/getting-started) guide.
