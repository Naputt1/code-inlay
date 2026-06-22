# Region System

The region system enables safe incremental code generation. Generated code is placed between `// @gen:start` and `// @gen:end` markers, allowing hand-written code outside these markers to coexist.

## How it works

Each generated block is a **region** delimited by markers:

```go
// @gen:start user.create.types
type CreateUserRequest struct {
    Name string `json:"name" form:"name" validate:"required"`
}

type CreateUserResponse struct {
    Id string `json:"id"`
}
// @gen:end user.create.types

// Hand-written code outside markers is preserved
func HelperFunction() string {
    return "hello"
}
```

## Region IDs

Each region has a unique ID combining the route ID and layer type:

```
<module>.<route>.<layer>
```

Examples:

- `user.create.types` — Route types
- `user.create.handler` — Gin handler
- `user.create.usecase` — Use case
- `user.create.repository` — Repository
- `user.create.route` — Route registration

## Drift protection

Each region stores a content hash. If the content inside markers has been manually edited, the generator detects the drift and **skips** updating that region unless `--force-region` is specified.

## File creation modes

| Mode           | Behavior                                |
| -------------- | --------------------------------------- |
| `skeleton`     | Create missing files with empty markers |
| `markers-only` | Only write into existing markers        |
| `disabled`     | Don't create or modify files            |
