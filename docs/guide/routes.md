# Defining Routes

Routes are defined with `defineRoute()` which accepts a Zod schema for the request query, body, and response.

## Basic route

```ts
defineRoute({
  id: "createUser",
  method: "POST",
  path: "/users",
  body: z.object({ name: z.string(), email: z.string().email() }),
  response: z.object({ id: z.string() }),
  handler: "CreateUser",
});
```

## Route with path parameters

Use `:param` syntax in the path:

```ts
defineRoute({
  id: "getUser",
  method: "GET",
  path: "/users/:id",
  response: z.object({ id: z.string(), name: z.string() }),
  handler: "GetUser",
});
```

Path parameters are automatically added to the request struct and populated via `c.Param("id")`.

## Route with query parameters

```ts
defineRoute({
  id: "listUsers",
  method: "GET",
  path: "/users",
  query: z.object({ page: z.number().optional(), q: z.string().optional() }),
  response: z.object({ items: z.array(z.object({ id: z.string() })) }),
  handler: "ListUsers",
});
```

Query parameters are bound using Gin's `ShouldBindQuery`.

## Route with body

```ts
defineRoute({
  id: "createUser",
  method: "POST",
  path: "/users",
  body: z.object({ name: z.string(), email: z.string().email() }),
  handler: "CreateUser",
});
```

Body is bound using Gin's `ShouldBindJSON`.

## Route with both query and body

```ts
defineRoute({
  id: "search",
  method: "POST",
  path: "/search",
  query: z.object({ q: z.string() }),
  body: z.object({ filters: z.object({ category: z.string().optional() }) }),
  response: z.object({ results: z.array(z.object({ id: z.string() })) }),
  handler: "Search",
});
```

Both `ShouldBindQuery` and `ShouldBindJSON` are used, and the request struct merges both.

## Route options

| Option           | Type                                              | Description                               |
| ---------------- | ------------------------------------------------- | ----------------------------------------- |
| `id`             | `string`                                          | Unique route identifier                   |
| `method`         | `"GET" \| "POST" \| "PUT" \| "PATCH" \| "DELETE"` | HTTP method                               |
| `path`           | `string`                                          | URL path with optional `:param` segments  |
| `handler`        | `string`                                          | Handler function name                     |
| `query`          | `ZodObject`                                       | Query parameter schema (GET/DELETE only)  |
| `body`           | `ZodObject`                                       | Request body schema (POST/PUT/PATCH only) |
| `response`       | `ZodObject`                                       | Response schema                           |
| `middleware`     | `MiddlewareDefinition[]`                          | Route-level middleware                    |
| `responseFormat` | `ResponseFormat`                                  | Per-route response format wrapper         |
| `usecaseGroup`   | `string`                                          | Override usecase grouping                 |

## Generated types

For a route `POST /users` with body `{ name: string, age?: number }`:

```go
type CreateUserRequest struct {
    Age  *int32 `json:"age,omitempty" form:"age"`
    Name string `json:"name" form:"name" validate:"required"`
}

type CreateUserResponse struct {
    Id string `json:"id"`
}
```

Request types get `json`, `form`, and `validate` tags. Response types only get `json` tags.
