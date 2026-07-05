# Services

Services are external dependencies your application needs — databases, caches, message queues, or any shared resource. They are generated as injectable Go types.

## Defining a service

```ts
import { defineService } from "@schemago/schemago";

defineService({ name: "db", close: true });
defineService({ name: "redis", close: true });
```

## Generated output

Each service generates a file in `internal/service/`:

```go
// internal/service/db.go
package service

type DBService interface {
    Close() error
}

type dbService struct{}

func NewDBService() *dbService {
    return &dbService{}
}

func (s *dbService) Close() error {
    return nil
}
```

When `close: true`, the service gets a `Close() error` method. The generated `main.go` calls `Close()` on shutdown.

## Matching services to modules

Services are injected into use case scaffolds based on name matching:

| Match rule                         | Example                                                               |
| ---------------------------------- | --------------------------------------------------------------------- |
| Service name matches module name   | Service `db` → module `ticket` when ticket has no explicit `services` |
| Module has explicit `services: []` | `services: ["mygorm", "redis"]` wins over name matching               |

```ts
defineModule({
  name: "ticket",
  services: ["mygorm", "redis"], // Explicit services for this module
  routes: [...],
});
```

When a service is matched, its interface is added as a field on the use case struct and injected via the constructor:

```go
type ticketUsecaseImpl struct {
    repo     TicketRepository
    mygormSvc service.MyGormService
    redisSvc  service.RedisService
}

func NewTicketUsecase(repo TicketRepository, mygormSvc service.MyGormService, redisSvc service.RedisService) *ticketUsecaseImpl {
    // ...
}
```

## Extension-backed services

Services can also be backed by [extensions](/guide/extensions), which provide additional capabilities like database accessor types, custom file generation, and automatic `go get` for Go modules.

```ts
const mygorm = defineServiceExtension({
  name: "gorm",
  service: {
    provides: "database",
    optionsSchema: z.object({ driver: z.enum(["mysql", "postgres", "sqlite"]) }),
    dbAccessor: "DB",
    dbType: "*gorm.DB",
    dbTypePkg: "gorm.io/gorm",
    goModules: (opts) => ["gorm.io/gorm", `gorm.io/driver/${opts.driver}`],
  },
});
```

See the [Extensions](/guide/extensions) guide for details.
