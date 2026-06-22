# Metadata

The metadata system generates runtime-accessible information about your API routes.

## Configuration

```ts
export default defineApp({
  metadata: {
    enabled: true,
    routeRegistry: true, // Generate route registry
    schemaReflection: false, // Generate schema introspection
  },
});
```

## Route registry

When enabled, generates a route registry at `internal/metadata/registry.go`:

```go
package metadata

type RouteInfo struct {
    ID      string `json:"id"`
    Method  string `json:"method"`
    Path    string `json:"path"`
    Handler string `json:"handler"`
    Module  string `json:"module"`
    Input   string `json:"input,omitempty"`
}

type ModuleInfo struct {
    Name   string      `json:"name"`
    Routes []RouteInfo `json:"routes"`
}
```

This can be used for runtime debugging, admin UIs, or middleware that inspects route metadata.
