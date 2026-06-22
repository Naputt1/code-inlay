# Route Groups

Route groups let you organize routes under a common prefix and shared middleware.

## Basic group

```ts
const userRoutes = defineRouteGroup({
  prefix: "/users",
  middleware: [authMiddleware],
  routes: [
    defineRoute({
      id: "list",
      method: "GET",
      path: "",
      handler: "ListUsers",
    }),
    defineRoute({
      id: "get",
      method: "GET",
      path: "/:id",
      handler: "GetUser",
    }),
  ],
});
```

## Nested groups

```ts
const adminRoutes = defineRouteGroup({
  prefix: "/admin",
  middleware: [jwtAuth, jwtIsAdmin],
  routes: [
    defineRoute({
      id: "dashboard",
      method: "GET",
      path: "/dashboard",
      handler: "Dashboard",
    }),
    ...defineRouteGroup({
      prefix: "/users",
      routes: [
        defineRoute({
          id: "adminListUsers",
          method: "GET",
          path: "",
          handler: "AdminListUsers",
        }),
      ],
    }),
  ],
});
```

## Middleware inheritance

Route-level middleware is **appended** to group-level middleware:

```ts
const group = defineRouteGroup({
  prefix: "/admin",
  middleware: [jwtAuth],
  routes: [
    defineRoute({
      id: "publicInfo",
      method: "GET",
      path: "/info",
      middleware: [],           // Override: no middleware
      handler: "PublicInfo",
    }),
    defineRoute({
      id: "delete",
      method: "DELETE",
      path: "/:id",
      middleware: [jwtIsAdmin], // Appended after jwtAuth
      handler: "Delete",
    }),
  ],
});
```
