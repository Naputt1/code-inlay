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
    strategy: "grouped", // "merged" | "single" | "grouped"
    groupBy: "operation", // "path" | "operation" | "handler" | "module"
  },
  routes: staffRoutes,
});
```

| Strategy  | Behavior                                   |
| --------- | ------------------------------------------ |
| `merged`  | All routes share a single use case file    |
| `single`  | Each route gets its own use case interface |
| `grouped` | Routes are grouped by `groupBy` strategy   |

## Services

Modules can declare which services they depend on. Services are injected into use case scaffolds:

```ts
defineModule({
  name: "ticket",
  services: ["mygorm", "redis"], // Service names to inject
  routes: ticketRoutes,
});
```

## Response format

Modules can override the global response format wrapper:

```ts
defineModule({
  name: "admin",
  responseFormat: adminFormat, // Per-module response format
  routes: adminRoutes,
});
```

### Usecase organization options

| Option     | Type      | Default  | Description                                            |
| ---------- | --------- | -------- | ------------------------------------------------------ |
| `strategy` | `string`  | `merged` | `"merged"` \| `"single"` \| `"grouped"`                |
| `groupBy`  | `string`  | —        | `"path"` \| `"operation"` \| `"handler"` \| `"module"` |
| `scaffold` | `boolean` | `true`   | Generate implementation scaffolds                      |

When `scaffold: false`, only the use case interface is generated — no implementation struct or constructor.

## Module-level configuration

Modules can override the app-level architecture and adapters:

```ts
defineModule({
  name: "ticket",
  architecture: "clean", // Override app-level architecture
  adapters: [{ name: "gin", transport: "http" }],
  responseFormat: ticketFormat, // Per-module response format
  services: ["mygorm"],
  routes: ticketRoutes,
});
```
