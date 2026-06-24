# Architecture

Architecture plugins control how your code is structured. Built-in options include **Clean**, **Minimal**, **Atomic**, and **Layered**.

## Features directory

By default, modules are generated under `internal/<module>/`. You can nest them under a subdirectory with `featuresDir`:

```ts
export default defineApp({
  options: {
    featuresDir: "features",
  },
});
```

This changes all module paths from `internal/<module>/` to `internal/features/<module>/`:

```
# Without featuresDir:
internal/user/handler.go

# With featuresDir: "features"
internal/features/user/handler.go
```

## Clean architecture

The default. Generates a full clean architecture stack for each route:

- **Handler** — HTTP layer (Gin handler)
- **Use case** — Business logic interface + implementation scaffold
- **Repository** — Data access interface (and implementation when a DB service is available)
- **Entity** — HTTP request/response types
- **Domain** — Domain entity types (separated from HTTP types)

```ts
export default defineApp({
  architecture: "clean",
  // ...
});
```

Output per route:

```
internal/<module>/handler.go      # Gin HTTP handlers
internal/<module>/usecase.go      # Use case interface + implementation
internal/<module>/repo.go         # Repository interface + implementation
internal/<module>/types.go        # HTTP request/response types
internal/<module>/domain.go       # Domain entity structs (clean arch only)
```

### Entity vs domain types

- **Entity types** (`types.go`) — HTTP request/response structs with `json`, `form`, and `validate` tags. Generated per route.
- **Domain types** (`domain.go`) — Domain entity structs with only `json` tags. Generated from routes that have both a `response` and a `responseFormat`. Deduplicated by structural fingerprint.

## Minimal architecture

Generates only the handler — no use case or repository interfaces.

```ts
export default defineApp({
  architecture: { mode: "replace", refs: ["minimal"] },
  // ...
});
```

Output per route:

```
internal/<module>/handler.go      # Gin HTTP handlers
internal/<module>/types.go        # Request/response types
internal/<module>/domain.go       # Domain entity types (clean arch only)
```

## Atomic architecture

Similar to clean, but collapses use cases and repositories into the handler module for simpler projects.

## Layered architecture

Generates explicit layer directories (handlers, services, repositories) instead of module-based organization.

## Modular architecture

You can combine architectures per-module:

```ts
defineModule({
  name: "ticket",
  architecture: "clean", // Only this module uses clean architecture
  routes: ticketRoutes,
});
```

## Custom architecture

You can write your own architecture plugin:

```ts
const myArchitecture = defineArchitecture({
  name: "my-arch",
  version: "1.0.0",
  transform(ctx, ast) {
    // Generate custom layers
    return { nodes: [], routes: [] };
  },
});

export default defineApp({
  architecture: myArchitecture,
  // ...
});
```
