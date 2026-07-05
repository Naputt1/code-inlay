# Generated Files

## Go server (go-server target)

```
cmd/server/main.go                    # Server entry point
internal/service/
  <name>.go                           # Service interface + implementation
internal/<module>/
  handler.go                          # Gin HTTP handlers
  types.go                            # HTTP request/response types
  domain.go                           # Domain entity structs (clean arch only, when responseFormat is used)
  usecase.go                          # Use case interface + implementation
  repo.go                             # Repository interface + implementation
  <name>_usecase.go                   # Grouped use case (when usecaseOrganization = "grouped")
internal/http/
  routes.go                           # Route registration
  <module>_routes.go                  # Per-module route registration
  <name>_routes.go                    # Per-prefix route groups
internal/metadata/
  registry.go                         # Route registry (when metadata enabled)
  schemas.go                          # Schema reflection (when enabled)
runtime/
  go.mod                              # Runtime Go module
  context.go                          # Request context helpers
  middleware.go                       # Logging/tracing middleware
  main.go                             # DI-wired bootstrap (when runtime enabled)
```

### Features directory

When `featuresDir: "features"` is set, all module paths are nested:

```
internal/features/<module>/handler.go
internal/features/<module>/usecase.go
# ... instead of internal/<module>/...
```

## OpenAPI (openapi target)

```
openapi.json                          # OpenAPI 3.0 specification
```

## Per-module vs per-route

Each route generates its own structs, handlers, use cases, and repositories within the module. The naming convention is:

- Types: `<HandlerName><ModuleName>Request` / `<HandlerName><ModuleName>Response`
- Files: `internal/<module>/types.go` (all types in one file per module)
