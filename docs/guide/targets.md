# Targets

Targets generate additional output formats alongside the Go server.

## Built-in targets

| Target      | Description                              |
| ----------- | ---------------------------------------- |
| `go-server` | Go server code (default, always enabled) |
| `openapi`   | OpenAPI 3.0 specification                |

## Configuration

```ts
export default defineApp({
  options: {
    targets: ["go-server", "openapi"],
    targetOptions: {
      openapi: { title: "My API", version: "1.0.0" },
    },
  },
});
```

## OpenAPI target

Generates `openapi.json`:

```json
{
  "openapi": "3.0.0",
  "info": { "title": "My API", "version": "1.0.0" },
  "paths": {
    "/users": {
      "get": {
        "parameters": [...],
        "responses": { "200": { ... } }
      }
    }
  }
}
```
