# plugin

Manage plugins from npm or local packages.

```sh
backend-gen plugin <subcommand> [name]
```

## Subcommands

| Subcommand | Description |
|---|---|
| `add <package>` | Install and register a plugin |
| `remove <name>` | Remove a plugin |
| `list` | List all registered plugins |
| `update <name>` | Update a plugin to the latest version |

## Examples

```sh
# Install a plugin
backend-gen plugin add @scope/my-architecture

# List plugins
backend-gen plugin list

# Remove a plugin
backend-gen plugin remove @scope/my-architecture
```
