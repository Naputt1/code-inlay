# SchemaGo

**TypeScript-defined Go backend code generator.**

Write your API routes with Zod schemas in a single `backend.config.ts`, and generate a complete Go server — handlers, use cases, repositories, route registration, DI wiring, and OpenAPI spec.

## Quick start

```sh
npx @schemago/schemago init my-api
cd my-api
npm install
npx schemago generate
go run ./cmd/server/main.go
```

## Example

```ts
import { z, defineRoute, defineModule, defineRouter, defineApp } from "@schemago/schemago";

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
- **Service definitions** — declare external dependencies (DB, cache, etc.)
- **Service extensions** — reusable backends with typed options and custom code generation
- **Response format wrappers** — consistent API response envelopes using `z.entity()` placeholders
- **Domain type separation** — domain entities separated from HTTP request/response types
- **Input validation** — Zod `.min()`, `.email()`, `.positive()` etc. mapped to `validate` struct tags
- **OpenAPI 3.0** spec generation
- **Plugin system** — custom architectures, adapters, transformers, targets
- **Watch mode** with live code regeneration
- **Region-based editing** — safe incremental code generation

## Project Structure

This is a pnpm monorepo:

- **`@schemago/goast`** (`packages/goast/`) — Pure TypeScript Go AST library. Builds and prints Go AST nodes with zero external deps. Used by all generators.
- **`@schemago/schemago`** (`packages/schemago/`) — The CLI tool and code generation DSL. Consumes `@schemago/goast` for all Go code output. No string templates.

## Development

```sh
pnpm install          # install dependencies + build decl-parser
pnpm build            # turbo builds goast → schemago
pnpm test             # run all tests across both packages
pnpm check            # lint + format + typecheck
pnpm changeset        # create a changeset for a new release
```

`turbo.json` handles the build order automatically: `@schemago/goast` builds first, then `@schemago/schemago`.

## CLI

| Command    | Description                       |
| ---------- | --------------------------------- |
| `generate` | Full compile + write files        |
| `dev`      | Watch mode with live-regeneration |
| `check`    | Dry-run, exit 1 on changes        |
| `diff`     | Show pending changes              |
| `inspect`  | Introspect AST, routes, plugins   |
| `init`     | Scaffold a new project            |

## Documentation

Full documentation at [naputt1.github.io/schemago](https://naputt1.github.io/schemago).

## License

MIT
