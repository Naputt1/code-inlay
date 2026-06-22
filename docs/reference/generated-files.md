# Generated Files

## Go server (go-server target)

```
cmd/server/main.go                    # Server entry point
internal/<module>/
  handler.go                          # Gin HTTP handlers
  types.go                            # Request/response types
  usecase.go                          # Use case interface + implementation
  repo.go                             # Repository interface
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

## TypeScript client (ts-client target)

```
clients/
  client.ts                           # Typed API client
  types.ts                            # Request/response types
```

## OpenAPI (openapi target)

```
openapi.json                          # OpenAPI 3.0 specification
```

## Per-module vs per-route

Each route generates its own structs, handlers, use cases, and repositories within the module. The naming convention is:

- Types: `<HandlerName><ModuleName>Request` / `<HandlerName><ModuleName>Response`
- Files: `internal/<module>/types.go` (all types in one file per module)
