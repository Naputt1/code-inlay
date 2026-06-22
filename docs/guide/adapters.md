# Adapters

Adapters define the HTTP transport layer. Currently the only built-in adapter is **Gin**.

## Gin adapter

The Gin adapter generates handler code using the Gin web framework.

```ts
export default defineApp({
  router: defineRouter({ adapter: "gin", prefix: "/api" }),
  // ...
});
```

### Binding strategy

The adapter chooses the correct binding method based on the route definition:

| Route has                  | Binding method                                                 |
| -------------------------- | -------------------------------------------------------------- |
| `query` only               | `c.ShouldBindQuery(&input)`                                    |
| `body` only                | `c.ShouldBindJSON(&input)`                                     |
| Both `query` + `body`      | `c.ShouldBindQuery(&query)` + `c.ShouldBindJSON(&requestBody)` |
| Neither (path params only) | `c.Param("id")`                                                |

### Validation

All `validate` tags on request structs are enforced by Gin's built-in validation (powered by `go-playground/validator`). When validation fails, the handler returns `400 Bad Request` with the error message.

### Generated handler example

```go
func (h *UserHandler) CreateUser(c *gin.Context) {
    var input CreateUserRequest
    if err := c.ShouldBindJSON(&input); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    output, err := h.CreateUserUsecase.Execute(c.Request.Context(), input)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }
    c.JSON(http.StatusOK, output)
}
```

## Writing a custom adapter

```ts
const myAdapter = defineAdapter({
  name: "echo",
  transport: "http",
  generateRoute(ctx) {
    return [
      {
        id: defaultRegionId(ctx.route, "route"),
        language: "go",
        content: `e.${methodName(ctx.route.method)}("${ctx.route.path}", handler.${ctx.route.handlerName})`,
      },
    ];
  },
  generateMiddleware(ctx) {
    return [];
  },
  generateServer(ctx) {
    return [];
  },
});

export default defineApp({
  router: defineRouter({ adapter: myAdapter }),
  // ...
});
```
