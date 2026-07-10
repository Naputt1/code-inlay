# @schemago/goast

A pure TypeScript Go AST (Abstract Syntax Tree) library for building, printing, walking, transforming, and parsing Go source code. Zero runtime dependencies.

## Install

```bash
npm install @schemago/goast
# Requires Go to build the decl-parser binary for parse support:
# cd tools/decl-parser && go build -o decl-parser .
```

## API

### Builder (`id`, `str`, `call`, `block`, etc.)

Construct Go AST nodes programmatically. 69+ fluent helpers mirroring Go's syntax.

```typescript
import * as go from "@schemago/goast";

const f = go.file(
  "handler",
  go.genDecl("import", go.importSpec("fmt")),
  go.function_(
    "Greet",
    [go.field(["name"], go.id("string"))],
    [go.field([], go.id("string"))],
    go.block(
      go.return_(go.call(go.sel(go.id("fmt"), "Sprintf"), go.str("Hello %s"), go.id("name"))),
    ),
  ),
);
```

### Printer (`printFile`, `printExpr`, `printStatement`, `printType`)

Serialize any AST node back to formatted Go source code.

```typescript
const source = go.printFile(f); // "package handler\n\nimport \"fmt\"\n\nfunc Greet(name string) string {\n..."
```

### Walker (`walk`, `find`, `findFirst`, `transform`)

Traverse, search, and mutate AST trees.

```typescript
const structs = go.find(f, "StructType");
const result = go.transform(f, {
  leave: (node) => (node.kind === "Field" ? go.field(["Name", "Age"], go.id("string")) : node),
});
```

### Parser (`parseSource`, `parseFile`, `parseSummary`, `GoParser`)

Parse Go source code into goast's AST nodes. Requires the `decl-parser` Go binary (auto-built via `postinstall`).

```typescript
const ast = go.parseSource('package main\n\nfunc main() { println("hello") }');
const source = go.printFile(ast); // round-trip: parse → print

// Summary mode — lightweight declaration metadata
const summaries = go.parseSummarySource("package p\nfunc Foo() {}");
console.log(summaries[0].symbolName); // "Foo"
```

### Tags (`parseTag`, `serializeTag`, `getTag`, `setTag`, `removeTag`)

Parse and manipulate Go struct tags.

```typescript
const tag = go.tag({ json: "name,omitempty", validate: "required" });
const parsed = go.parseTag(tag); // { json: "name,omitempty", validate: "required" }
```

## Modules

| Module      | File         | Exports                        | Description                                    |
| ----------- | ------------ | ------------------------------ | ---------------------------------------------- |
| **Nodes**   | `nodes.ts`   | Types                          | Discriminated union types for all Go AST nodes |
| **Builder** | `builder.ts` | 69 functions                   | Fluent AST construction helpers                |
| **Printer** | `printer.ts` | 7 functions + `StringBuilder`  | AST to formatted Go source                     |
| **Walker**  | `walk.ts`    | 4 functions + types            | Depth-first traversal, search, transform       |
| **Parser**  | `parser.ts`  | 5 functions + `GoParser` class | Parse Go source to AST via Go bridge           |
| **Tags**    | `tag.ts`     | 5 functions                    | Struct tag parsing and manipulation            |

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

## License

MIT
