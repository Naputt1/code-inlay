# inspect

Introspect the compiled AST, routes, regions, plugins, or pipeline graph.

```sh
backend-gen inspect <subcommand> [id] [options]
```

## Subcommands

| Subcommand   | Description                    |
| ------------ | ------------------------------ |
| `ast`        | Show the full AST              |
| `route <id>` | Show a specific route's AST    |
| `graph`      | Show the plugin pipeline graph |
| `plugins`    | List all registered plugins    |
| `regions`    | List all generated regions     |

## Options

| Option                           | Description                     |
| -------------------------------- | ------------------------------- |
| `--format <tree\|json\|mermaid>` | Output format (default: `tree`) |

## Examples

```sh
# Show the full AST
backend-gen inspect ast

# Show a specific route
backend-gen inspect route createUser

# Show pipeline graph as JSON
backend-gen inspect graph --format json

# Show all plugins
backend-gen inspect plugins

# Show all generated regions
backend-gen inspect regions
```
