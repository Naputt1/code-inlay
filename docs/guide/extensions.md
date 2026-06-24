# Extensions

Extensions let you define reusable service backends with type-safe options, custom code generation, and automatic dependency management.

## Defining an extension

Use `defineServiceExtension()` to create an extension. It takes a `name` and a `service` configuration:

```ts
import { defineServiceExtension, z } from "@code-inlay/backend-gen";

const mygorm = defineServiceExtension({
  name: "gorm",
  service: {
    provides: "database",
    optionsSchema: z.object({
      driver: z.enum(["mysql", "postgres", "sqlite"]),
    }),
    dbAccessor: "DB",
    dbType: "*gorm.DB",
    dbTypePkg: "gorm.io/gorm",
    goModules: (opts) => ["gorm.io/gorm", `gorm.io/driver/${opts.driver}`],
  },
});
```

## Extension options

| Option                  | Type                             | Description                                             |
| ----------------------- | -------------------------------- | ------------------------------------------------------- |
| `provides`              | `"database"`                     | Service capability (future: cache, queue, etc.)         |
| `optionsSchema`         | `z.ZodType`                      | Schema for user-supplied options                        |
| `dbAccessor`            | `string`                         | Repository field name for the db accessor (e.g. `"DB"`) |
| `dbType`                | `string`                         | Go type for db accessor (e.g. `"*gorm.DB"`)             |
| `dbTypePkg`             | `string`                         | Import path for the db type                             |
| `goModules`             | `string[] \| (opts) => string[]` | Go modules to `go get`                                  |
| `generateFile`          | `(ctx) => string`                | Custom service file generator                           |
| `generateDialectMethod` | `(ctx) => string`                | Custom repository dialect method generator              |

## Using extensions

Register extensions on `defineApp()` and instantiate them as services:

```ts
export default defineApp({
  extensions: [mygorm],
  services: [
    mygorm({ name: "mygorm", driver: "sqlite", close: true }),
    defineService({ name: "redis" }),
  ],
  modules: [
    defineModule({
      name: "ticket",
      services: ["mygorm"], // Uses mygorm service
      routes: ticketRoutes,
    }),
  ],
});
```

### How it works

1. The extension's `optionsSchema` validates the supplied options (`{ driver: "sqlite" }`).
2. The extension's `provides`, `dbAccessor`, `dbType`, `dbTypePkg` are resolved into the service AST.
3. Repository implementations use `dbAccessor` to call `s.DB()` and `dbType` for the injected field type.
4. Module use case scaffolds inject the service via constructor.

## Generated service file

By default, a service skeleton with interface, struct, and constructor is generated:

```go
// internal/service/mygorm.go
package service

type MyGormService interface {
    DB() *gorm.DB
    Close() error
}

type myGormService struct {
    db *gorm.DB
}

func NewMyGormService() (*myGormService, error) {
    return &myGormService{}, nil
}

func (s *myGormService) DB() *gorm.DB {
    return s.db
}

func (s *myGormService) Close() error {
    return nil
}
```

Use `generateFile` to produce custom service code instead:

```ts
service: {
  generateFile: (ctx) => `// Custom generated file content for ${ctx.name}`,
}
```

## Repository dialect methods

When a module uses a database extension, repository implementations get dialect-specific generated code. Use `generateDialectMethod` to provide custom query methods:

```ts
service: {
  generateDialectMethod: (ctx) => {
    const { method, baseEntity, implName } = ctx;
    return `func (r *${implName}) ${method.name}(${method.params}) ${method.results} {
    // Custom ${method.entityName} query using r.db
}`;
  },
}
```

Without `generateDialectMethod`, a TODO stub is generated.

## Automatic module installation

Extensions can declare `goModules` to auto-install Go dependencies:

```ts
goModules: (opts) => ["gorm.io/gorm", `gorm.io/driver/${opts.driver}`],
```

After code generation, the compiler runs `go get` for each listed module.
