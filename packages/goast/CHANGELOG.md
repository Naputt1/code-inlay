# Changelog

## [0.1.0] — 2024-07

### Added

- Full Go source → AST parser via decl-parser Go bridge
- Generics support: `IndexListExpr` type for multi-type-arg expressions
- Position tracking on key AST nodes (File, FuncDecl, GenDecl, Ident, BasicLit)
- Round-trip test suite: 37 snapshot files + 557 Go stdlib files (100% pass)
- Export comment printing on import statements
- `BadStmt` handling in decl-parser
- `parseSummary()`, `parseSummaryFile()` methods for lightweight declaration metadata
- Auto-detection of decl-parser binary path
- `postinstall` script for automatic binary build

### Fixed

- Walker: `SliceLit` now properly traversed by `walkChildren` and `collectChildren`
- Printer: Type nodes in expression contexts (make, new) now delegate to `printType`
- Printer: `SendStmt` trailing newline in `CommClause` context
- Printer: Buffer size for large files (50MB max)
- Type system: `as unknown as Type` casts eliminated from `printType`
- TypeScript: All `tsc --noEmit` and `tsup --dts` errors resolved
- Schemago integration: consolidated binary path resolution into goast's `GoParser`

## [0.0.1] — 2024-06

### Initial release

- Go AST node type definitions (nodes.ts)
- Fluent builder API (builder.ts)
- AST printer (printer.ts)
- Tree walker with find/transform utilities (walk.ts)
- Struct tag utilities (tag.ts)
- Basic decl-parser bridge (parser.ts)
