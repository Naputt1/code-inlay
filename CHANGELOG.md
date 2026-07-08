# @schemago/schemago

## 0.0.1

### Patch Changes

- 016ef8d: init

## Unreleased

### Major changes

- **Go AST migration**: All 16 Go generators migrated from string templates to `@schemago/goast` — a pure TypeScript Go AST library (handlers, usecases, repositories, services, middleware, errors, validation, route registration, server, runtime, loggers, Gin adapter, proto stubs, metadata, config, SSE/WS).
- **Turbo build pipeline**: Added turborepo for automatic build ordering and caching. `packages/goast/` is built first, then `packages/schemago/`.
- **Monorepo restructure**: Source code moved from root `src/` into `packages/schemago/src/`. Root is now a pure orchestrator with workspace-level scripts only.
- **Legacy cleanup**: Removed all legacy string-template generators, `*Legacy` functions, dead shim files, and unused type imports. Consolidated shared utilities into go-ast files.
- **Test coverage**: Added unit tests for route registration and code generator orchestrator. Fixed channel range-loop bug in WS handler generation.
- **SliceLit node**: Added `SliceLit` expression type to go-ast for proper slice literal representation.
- **Package rename**: `@schemago/go-ast` → `@schemago/goast`.
