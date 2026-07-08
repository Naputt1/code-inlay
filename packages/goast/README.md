# @schemago/goast

Pure TypeScript Go AST library. Build, print, walk, and transform Go source code AST nodes — no external dependencies, no Go toolchain required.

## API

- **Nodes** (`src/nodes.ts`) — Discriminated union types mirroring Go's `go/ast` (File, FuncDecl, GenDecl, StructType, FuncType, CallExpr, IfStmt, RangeStmt, etc.)
- **Builder** (`src/builder.ts`) — 50+ fluent helpers: `go.id("x")`, `go.call(go.id("fmt"), go.str("hello"))`, `go.ifStmt(...)`, etc.
- **Printer** (`src/printer.ts`) — `printFile(f)`, `printDeclaration(d)`, `printExpr(e)`, `printStatement(s)` → formatted Go source string
- **Walker** (`src/walk.ts`) — `walk(node, visitor)`, `find(node, kind)`, `transform(node, transformer)` for tree traversal and mutation
- **Parser** (`src/parser.ts`) — Bridges Go's `go/parser` via the decl-parser binary for parsing existing Go files into AST nodes
- **Tags** (`src/tag.ts`) — Parse, serialize, and update Go struct tags

## Usage

```ts
import * as go from "@schemago/goast";

const file = go.file(
  "main",
  go.genDecl("import", go.importSpec("fmt")),
  go.function_(
    "main",
    [],
    undefined,
    go.block(go.expr(go.call(go.sel(go.id("fmt"), "Println"), go.str("hello")))),
  ),
);

console.log(go.printFile(file));
// package main
//
// import "fmt"
//
// func main() {
//     fmt.Println("hello")
// }
```
