# Getting Started

## Prerequisites

- **Go 1.26+**
- **Node.js 22+**
- **pnpm** (or npm, yarn)

## Install

```sh
npm install -g @code-inlay/backend-gen
# or
pnpm add -g @code-inlay/backend-gen
```

## Create a new project

```sh
backend-gen init my-api
cd my-api
```

This scaffolds:

```
my-api/
  backend.config.ts       # Route definitions
  go.mod
  cmd/server/main.go      # Skeleton server
  internal/               # Module directories
    user/
      handler.go
      types.go
      repo.go
      usecase.go
```

## Define your first route

Edit `backend.config.ts`:

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

## Generate

```sh
backend-gen generate
```

This produces:

- `internal/user/handler.go` — Gin handler with `c.Param("id")`
- `internal/user/types.go` — Go types with `json`, `form`, and `validate` tags
- `internal/user/usecase.go` — Use case interface + implementation
- `internal/user/repo.go` — Repository interface
- `internal/http/routes.go` — Route registration
- `cmd/server/main.go` — Server entry point

## Run the server

```sh
go run ./cmd/server/main.go
```

## Next steps

- Learn about [defining routes](/guide/routes)
- Configure [validation rules](/guide/validation)
- Explore [available architectures](/guide/architecture)
