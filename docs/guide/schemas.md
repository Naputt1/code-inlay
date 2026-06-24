# Schemas & Types

Schemas are defined using Zod and are used to generate Go types, handle request binding, and produce OpenAPI specs.

## Supported Zod types

| Zod type                   | Go type               | Notes                     |
| -------------------------- | --------------------- | ------------------------- |
| `z.string()`               | `string`              |                           |
| `z.number()`               | `float64`             | Default                   |
| `z.int32()`                | `int32`               | Custom extension          |
| `z.int64()`                | `int64`               | Custom extension          |
| `z.float32()`              | `float32`             | Custom extension          |
| `z.boolean()`              | `bool`                |                           |
| `z.enum(["a", "b"])`       | `string`              | Validated via `oneof` tag |
| `z.array(z.string())`      | `[]string`            |                           |
| `z.array(z.object({...}))` | `[]ChildStruct`       |                           |
| `z.object({...})`          | `ChildStruct`         | Nested struct             |
| `z.string().optional()`    | `*string`             | Pointer type              |
| `z.number().optional()`    | `*int32` / `*float64` | Pointer type              |

| `z.entity()`              | `AnyType`             | Placeholder — replaced by response format wrapper |

## Custom Zod extensions

```ts
import { z } from "@code-inlay/backend-gen";

z.int32();  // maps to Go int32
z.int64();  // maps to Go int64
z.float32();// maps to Go float32
z.float64();// maps to Go float64
z.entity(); // placeholder — substituted with the route's response schema
```

`z.entity()` is a placeholder type used with [response formats](/guide/extensions). When a route has a `responseFormat`, the `z.entity()` marker in the wrapper is replaced by the route's actual response schema during generation.

## Required vs optional

Fields are **required** by default. Use `.optional()` to make them optional:

```ts
z.object({
  name: z.string(), // required → string
  email: z.string().email(), // required → string, validated
  age: z.int32().optional(), // optional → *int32
});
```

Generated Go:

```go
type Request struct {
    Age   *int32  `json:"age,omitempty" form:"age"`
    Email string  `json:"email" form:"email" validate:"required,email"`
    Name  string  `json:"name" form:"name" validate:"required"`
}
```

## Nested objects

```ts
z.object({
  address: z.object({
    street: z.string(),
    city: z.string(),
  }),
});
```

This generates a separate Go struct:

```go
type RequestAddress struct {
    City   string `json:"city" form:"city" validate:"required"`
    Street string `json:"street" form:"street" validate:"required"`
}

type Request struct {
    Address RequestAddress `json:"address" form:"address" validate:"required"`
}
```

## Arrays

```ts
z.object({
  tags: z.array(z.string()),
  items: z.array(z.object({ id: z.string(), name: z.string() })),
});
```

```go
type RequestItemsItem struct {
    Id   string `json:"id" form:"id" validate:"required"`
    Name string `json:"name" form:"name" validate:"required"`
}

type Request struct {
    Items []RequestItemsItem `json:"items" form:"items" validate:"required"`
    Tags  []string           `json:"tags" form:"tags" validate:"required"`
}
```
