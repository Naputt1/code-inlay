# plugin

Manage plugins from npm or local packages.

```sh
schemago plugin <subcommand> [name]
```

## Subcommands

| Subcommand      | Description                           |
| --------------- | ------------------------------------- |
| `add <package>` | Install and register a plugin         |
| `remove <name>` | Remove a plugin                       |
| `list`          | List all registered plugins           |
| `update <name>` | Update a plugin to the latest version |

## Examples

```sh
# Install a plugin
schemago plugin add @scope/my-architecture

# List plugins
schemago plugin list

# Remove a plugin
schemago plugin remove @scope/my-architecture
```
