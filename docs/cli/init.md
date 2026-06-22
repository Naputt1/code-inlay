# init

Scaffold a new project structure.

```sh
backend-gen init <project-name>
```

Creates a new directory with the following structure:

```
<project-name>/
  backend.config.ts      # Route definitions
  go.mod                 # Go module
  cmd/server/main.go     # Server entry point
  internal/              # Module directories
```

## Example

```sh
backend-gen init my-api
cd my-api
backend-gen generate
go run ./cmd/server/main.go
```
