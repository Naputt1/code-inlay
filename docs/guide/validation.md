# Validation

Zod validation rules are automatically mapped to Go `validate` struct tags (compatible with `go-playground/validator`).

## Rule mapping

| Zod method | `validate` tag | Example |
|---|---|---|
| Non-optional field | `required` | `z.string()` → `validate:"required"` |
| `z.string().min(n)` | `min=n` | `z.string().min(3)` → `validate:"required,min=3"` |
| `z.string().max(n)` | `max=n` | `z.string().max(100)` → `validate:"required,max=100"` |
| `z.string().length(n)` | `len=n` | `z.string().length(10)` → `validate:"required,len=10"` |
| `z.string().email()` | `email` | `z.string().email()` → `validate:"required,email"` |
| `z.string().url()` | `url` | `z.string().url()` → `validate:"required,url"` |
| `z.string().regex(/p/)` | `regex=p` | `z.string().regex(/^[a-z]+$/)` → `validate:"required,regex=^[a-z]+$"` |
| `z.number().min(n)` | `min=n` | `z.number().min(1)` → `validate:"required,min=1"` |
| `z.number().max(n)` | `max=n` | `z.number().max(150)` → `validate:"required,max=150"` |
| `z.number().positive()` | `gt=0` | `z.number().positive()` → `validate:"required,gt=0"` |
| `z.number().negative()` | `lt=0` | `z.number().negative()` → `validate:"required,lt=0"` |
| `z.enum(["a","b"])` | `oneof=a b` | `z.enum(["admin","user"])` → `validate:"required,oneof=admin user"` |
| `z.array().min(n)` | `min=n` | `z.array(z.string()).min(1)` → `validate:"required,min=1"` |
| `z.array().max(n)` | `max=n` | `z.array(z.string()).max(10)` → `validate:"required,max=10"` |

## Optional fields with validators

Optional fields keep their validators but don't get `required`:

```ts
z.object({ email: z.string().email().optional() })
```

```go
Email *string `json:"email,omitempty" form:"email" validate:"email"`
```

## Response structs

Response structs do **not** receive `validate` tags — they are only used for serialization, not input binding.

```ts
defineRoute({
  id: "get",
  method: "GET",
  path: "/users/:id",
  response: z.object({ name: z.string() }),  // no validate tags
  handler: "GetUser",
})
```

```go
type GetUserResponse struct {
    Name string `json:"name"`  // no validate tag
}
```

## Full example

```ts
defineRoute({
  id: "create",
  method: "POST",
  path: "/users",
  body: z.object({
    name: z.string().min(2).max(100),
    email: z.string().email(),
    age: z.int32().positive().optional(),
    role: z.enum(["admin", "user", "guest"]),
    tags: z.array(z.string()).min(1),
  }),
  handler: "CreateUser",
})
```

```go
type CreateUserRequest struct {
    Age  *int32  `json:"age,omitempty" form:"age" validate:"gt=0"`
    Email string `json:"email" form:"email" validate:"required,email"`
    Name  string `json:"name" form:"name" validate:"required,min=2,max=100"`
    Role  string `json:"role" form:"role" validate:"required,oneof=admin user guest"`
    Tags  []string `json:"tags" form:"tags" validate:"required,min=1"`
}
```
