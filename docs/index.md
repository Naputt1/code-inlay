# Code Inlay

**TypeScript-defined Go backend code generator.**

Write your API routes with Zod schemas in a single `backend.config.ts` file, and generate a complete Go server — handlers, use cases, repositories, route registration, DI wiring, OpenAPI spec, and TypeScript client.

## How it works

```
backend.config.ts  ──►  backend-gen generate
                          │
                          ├── Go server
                          │     cmd/server/main.go
                          │     internal/*/handler.go
                          │     internal/*/usecase.go
                          │     internal/*/repo.go
                          │     internal/http/routes.go
                          │     runtime/
                          │
                          ├── OpenAPI spec
                          │
                          └── TypeScript client
```

## Features

- **Type-safe route definitions** via Zod schemas
- **Go server generation** with Gin adapter
- **Clean / Minimal / Atomic / Layered** architectures
- **Input validation** — Zod rules mapped to `validate` struct tags
- **OpenAPI 3.0** spec generation
- **TypeScript client** generation
- **Plugin system** — custom architectures, transformers, targets
- **Watch mode** with live code regeneration
- **Region-based editing** — safe incremental code generation

## Quick start

```sh
npx @code-inlay/backend-gen init my-api
cd my-api
npm install
npx backend-gen generate
```

See the [Getting Started](/guide/getting-started) guide.
