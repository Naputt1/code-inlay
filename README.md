# Code Inlay

**TypeScript-defined Go backend code generator.**

Write your API routes with Zod schemas in a single `backend.config.ts`, and generate a complete Go server — handlers, use cases, repositories, route registration, DI wiring, OpenAPI spec, and TypeScript client.

## Quick start

```sh
npx @code-inlay/backend-gen init my-api
cd my-api
npm install
npx backend-gen generate
go run ./cmd/server/main.go
```

## Example

```ts
import { z, defineRoute, defineModule, defineRouter, defineApp } from "@code-inlay/backend-gen";

const getUser = defineRoute({
  id: "getUser",
  method: "GET",
  path: "/users/:id",
  response: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  handler: "GetUser",
});

export default defineApp({
  architecture: "clean",
  router: defineRouter({ adapter: "gin", prefix: "/api" }),
  modules: [defineModule({ name: "user", routes: [getUser] })],
});
```

This generates:

```
internal/user/
  handler.go      # Gin HTTP handler with c.Param("id")
  types.go        # Go structs with json, form, and validate tags
  usecase.go      # Business logic interface + implementation
  repo.go         # Data access interface
cmd/server/main.go  # Server entry point
internal/http/routes.go  # Route registration
```

## Features

- **Type-safe route definitions** via Zod schemas
- **Go server generation** with Gin adapter
- **Clean / Minimal / Atomic / Layered** architectures
- **Input validation** — Zod `.min()`, `.email()`, `.positive()` etc. mapped to `validate` struct tags
- **OpenAPI 3.0** spec generation
- **TypeScript client** generation
- **Plugin system** — custom architectures, transformers, targets
- **Watch mode** with live code regeneration
- **Region-based editing** — safe incremental code generation

## CLI

| Command | Description |
|---|---|
| `generate` | Full compile + write files |
| `dev` | Watch mode with live-regeneration |
| `check` | Dry-run, exit 1 on changes |
| `diff` | Show pending changes |
| `inspect` | Introspect AST, routes, plugins |
| `init` | Scaffold a new project |

## Documentation

Full documentation at [naputt1.github.io/code-inlay](https://naputt1.github.io/code-inlay).

## License

MIT
