# generate

Compile the backend config and generate all output files.

```sh
backend-gen generate [options]
```

This is the primary command. It:

1. Reads and validates `backend.config.ts`
2. Resolves plugins and architectures
3. Runs the compilation pipeline (transform → codegen → post-transform)
4. Writes generated code into existing files
5. Creates skeleton files for missing layers

## Options

| Option                | Description                                     |
| --------------------- | ----------------------------------------------- |
| `--config <path>`     | Config file path (default: `backend.config.ts`) |
| `--cwd <path>`        | Working directory                               |
| `--module <name>`     | Generate only for a specific module             |
| `--route <id>`        | Generate only for a specific route              |
| `--force-region <id>` | Override drift protection                       |
| `--dry-run`           | Compile without writing                         |

## Examples

```sh
# Full generation
backend-gen generate

# Single module
backend-gen generate --module user

# Single route
backend-gen generate --route getUser

# Custom config
backend-gen generate --config ./configs/my-api.ts --cwd ./my-api
```
