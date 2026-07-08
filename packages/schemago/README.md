# @schemago/schemago

The CLI tool and code generation DSL. See the [root README](../../README.md) for full documentation.

This package contains:

- `src/generators/` — All Go code generators, each consuming `@schemago/goast`
- `src/adapters/` — Transport adapter (Gin)
- `src/compiler/` — Code compilation and file generation pipeline
- `src/cli/` — CLI commands (generate, dev, check, init, etc.)
- `test/` — Test suite (49 files, 791 tests)

Built with `tsup`, tested with `vitest`.
