# CLI Overview

The \`schemago\` CLI generates and manages your Go backend code.

```
Usage: schemago <command> [options]
```

## Commands

| Command    | Description                                   |
| ---------- | --------------------------------------------- |
| `generate` | Full compile + write files                    |
| `dev`      | Watch mode with live-regeneration             |
| `check`    | Dry-run, exit 1 on changes                    |
| `diff`     | Show pending changes                          |
| `inspect`  | Introspect AST, routes, regions, plugins      |
| `init`     | Scaffold a new project                        |
| `docs`     | Generate API documentation                    |
| `migrate`  | Detect and apply usecase organization changes |
| `plugin`   | Manage plugins                                |

## Global options

| Option                           | Description                                     |
| -------------------------------- | ----------------------------------------------- |
| `--config <path>`                | Config file path (default: `backend.config.ts`) |
| `--cwd <path>`                   | Working directory (default: cwd)                |
| `--module <name>`                | Filter to a single module                       |
| `--route <id>`                   | Filter to a single route                        |
| `--force-region <id>`            | Override drift protection for a region          |
| `--format <tree\|json\|mermaid>` | Output format (for inspect commands)            |
