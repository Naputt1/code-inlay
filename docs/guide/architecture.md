# Architecture

Architecture plugins control how your code is structured. Built-in options include **Clean**, **Minimal**, **Atomic**, and **Layered**.

## Clean architecture

The default. Generates a full clean architecture stack for each route:

- **Handler** — HTTP layer (Gin handler)
- **Use case** — Business logic
- **Repository** — Data access interface

```ts
export default defineApp({
  architecture: "clean",
  // ...
});
```

Output per route:

```
internal/<module>/handler.go
internal/<module>/usecase.go
internal/<module>/repo.go
internal/<module>/types.go
```

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
internal/<module>/handler.go
internal/<module>/types.go
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
  architecture: "clean",  // Only this module uses clean architecture
  routes: ticketRoutes,
})
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
