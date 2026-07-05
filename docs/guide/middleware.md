# Middleware

Middleware is defined with `defineMiddleware()` and applied to routes or groups.

## Defining middleware

```ts
import { defineMiddleware } from "@schemago/schemago";

const jwtAuth = defineMiddleware({ name: "JwtAuth" });
const jwtIsAdmin = defineMiddleware({ name: "JwtIsAdmin" });
```

## Applying middleware

Middleware can be applied at the **group**, **module**, or **route** level:

```ts
// Group level
const adminRoutes = defineRouteGroup({
  prefix: "/admin",
  middleware: [jwtAuth, jwtIsAdmin],
  routes: [
    // routes here inherit jwtAuth + jwtIsAdmin
  ],
});

// Route level (appended to group)
defineRoute({
  id: "publicInfo",
  method: "GET",
  path: "/info",
  middleware: [], // override — no middleware
  handler: "PublicInfo",
});

// Route level (adds to inherited)
defineRoute({
  id: "delete",
  method: "DELETE",
  path: "/:id",
  middleware: [jwtIsAdmin], // additional middleware appended
  handler: "Delete",
});
```

## Generated output

Middleware is registered as Gin middleware in `internal/http/routes.go`:

```go
admin := api.Group("/admin", middleware.JwtAuth, middleware.JwtIsAdmin)
{
    admin.DELETE("/:id", handler.Delete)
}
```

## Handler generation

Each middleware generates a corresponding handler wrapper in `internal/middleware/` (when using the skeleton file creation mode).
