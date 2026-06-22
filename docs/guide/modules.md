# Modules

Modules group related routes and their generated code into Go packages.

## Defining a module

```ts
import { defineModule } from "@code-inlay/backend-gen";

const userModule = defineModule({
  name: "user",
  routes: [
    // route definitions...
  ],
});
```

## Module output

A module named `user` generates files in `internal/user/`:

- `internal/user/handler.go` — Gin handlers
- `internal/user/types.go` — Request/response types
- `internal/user/usecase.go` — Use case interface + implementation
- `internal/user/repo.go` — Repository interface

## Usecase organization

Control how use cases are organized within a module:

```ts
defineModule({
  name: "staff",
  usecaseOrganization: {
    strategy: "grouped",        // "merged" | "single" | "grouped"
    groupBy: "operation",       // "path" | "operation" | "handler" | "module"
  },
  routes: staffRoutes,
})
```

| Strategy | Behavior |
|---|---|
| `merged` | All routes share a single use case file |
| `single` | Each route gets its own use case interface |
| `grouped` | Routes are grouped by `groupBy` strategy |

## Module-level configuration

Modules can override the app-level architecture and adapters:

```ts
defineModule({
  name: "ticket",
  architecture: "clean",       // Override app-level architecture
  adapters: [{ name: "gin", transport: "http" }],
  routes: ticketRoutes,
})
```
