// ─────────────────────────────────────────────────────────────
// @schemago/goast — Fluent Go AST construction helpers
// ─────────────────────────────────────────────────────────────

import type {
  Expression,
  Statement,
  Type,
  Declaration,
  Spec,
  Field,
  File,
  Ident,
  BasicLit,
  CommentStmt,
  StarExpr,
  SelectorExpr,
  CallExpr,
  UnaryExpr,
  BinaryExpr,
  KeyValueExpr,
  CompositeLit,
  SliceLit,
  IndexExpr,
  IndexListExpr,
  SliceExpr,
  TypeAssertExpr,
  ParenExpr,
  FuncLit,
  BadExpr,
  BlockStmt,
  ReturnStmt,
  AssignStmt,
  ExprStmt,
  IfStmt,
  ForStmt,
  RangeStmt,
  GoStmt,
  DeferStmt,
  DeclStmt,
  EmptyStmt,
  SendStmt,
  IncDecStmt,
  BranchStmt,
  SwitchStmt,
  CaseClause,
  FuncDecl,
  GenDecl,
  TypeSpec,
  ValueSpec,
  ImportSpec,
  StructType,
  InterfaceType,
  FuncType,
  ArrayType,
  SliceType,
  MapType,
  ChanType,
  ChanDir,
  Tag,
  CommentGroup,
  Comment,
  AssignOp,
  BinaryOp,
  BranchToken,
  Token,
} from "./nodes.js";

// ─── Expression shortcuts ──────────────────────────────────

/** Create an identifier expression. */
export function id(name: string): Ident {
  return { kind: "Ident", name };
}

/** Create a string literal expression. */
export function str(value: string): BasicLit {
  return { kind: "BasicLit", token: "string", value: `"${value}"` };
}

/** Create an integer literal expression. */
export function int(value: number | string): BasicLit {
  return { kind: "BasicLit", token: "int", value: String(value) };
}

/** Create a float literal expression. */
export function float(value: number | string): BasicLit {
  return { kind: "BasicLit", token: "float", value: String(value) };
}

/** Create a character literal expression. */
export function char(value: string): BasicLit {
  return { kind: "BasicLit", token: "char", value: `'${value}'` };
}

/** Create an imaginary number literal expression. */
export function imag(value: string): BasicLit {
  return { kind: "BasicLit", token: "imag", value };
}

/** Create a basic literal with explicit token type. */
export function lit(token: BasicLit["token"], value: string): BasicLit {
  return { kind: "BasicLit", token, value };
}

/** Create a pointer type or dereference expression. */
export function star(x: Type | Expression): StarExpr {
  return { kind: "StarExpr", x };
}

/** Create a qualified identifier (pkg.Name). */
export function qual(pkg: string, name: string): SelectorExpr {
  return { kind: "SelectorExpr", x: id(pkg), sel: name };
}

/** Create a selector expression (x.name). */
export function sel(x: Expression, name: string): SelectorExpr {
  return { kind: "SelectorExpr", x, sel: name };
}

/** Create an address-of expression (export function addr(x). */
export function addr(x: Expression): UnaryExpr {
  return { kind: "UnaryExpr", op: "&", x };
}

/** Create a pointer dereference expression (*x). */
export function deref(x: Expression): UnaryExpr {
  return { kind: "UnaryExpr", op: "*", x };
}

/** Create a unary negation expression (-x). */
export function neg(x: Expression): UnaryExpr {
  return { kind: "UnaryExpr", op: "-", x };
}

/** Create a logical NOT expression (!x). */
export function not(x: Expression): UnaryExpr {
  return { kind: "UnaryExpr", op: "!", x };
}

/** Create a binary expression (x op y). */
export function binary(x: Expression, op: BinaryOp, y: Expression): BinaryExpr {
  return { kind: "BinaryExpr", x, op, y };
}

/** Create an equality comparison (x == y). */
export function eq(x: Expression, y: Expression): BinaryExpr {
  return binary(x, "==", y);
}

/** Create an inequality comparison (x != y). */
export function neq(x: Expression, y: Expression): BinaryExpr {
  return binary(x, "!=", y);
}

/** Create a function call expression. */
export function call(func: Expression | string, ...args: Expression[]): CallExpr {
  const f = typeof func === "string" ? id(func) : func;
  return { kind: "CallExpr", func: f, args };
}

/** Create a key-value expression for composite literals. */
export function kv(key: Expression | string, value: Expression): KeyValueExpr {
  const k = typeof key === "string" ? id(key) : key;
  return { kind: "KeyValueExpr", key: k, value };
}

/** Create a composite literal with type and elements. */
export function elt(type: Type, ...elts: Expression[]): CompositeLit {
  return { kind: "CompositeLit", type, elts, incomplete: true };
}

/** Create a slice literal expression {elts...}. */
export function sliceLit(...elts: Expression[]): SliceLit {
  return { kind: "SliceLit", elts, incomplete: true };
}

/** Create an index expression x[index]. */
export function index(x: Expression, index: Expression): IndexExpr {
  return { kind: "IndexExpr", x, index };
}

/** Create a multi-index expression, e.g. for generics x[a, b]. */
export function indexList(x: Expression, ...indices: Expression[]): IndexListExpr {
  return { kind: "IndexListExpr", x, indices };
}

/** Create a slice expression x[low:high]. */
export function sliceExpr(x: Expression, low?: Expression, high?: Expression): SliceExpr {
  return { kind: "SliceExpr", x, low, high };
}

/** Create a parenthesized expression (x). */
export function paren(x: Expression): ParenExpr {
  return { kind: "ParenExpr", x };
}

/** Create a type assertion expression x.(T). */
export function typeAssert(x: Expression, type?: Type): TypeAssertExpr {
  return { kind: "TypeAssertExpr", x, type };
}

/** Create a function literal (closure). */
export function funcLit(type: FuncType, body: BlockStmt): FuncLit {
  return { kind: "FuncLit", type, body };
}

/** Create a placeholder for a malformed expression. */
export function badExpr(): BadExpr {
  return { kind: "BadExpr" };
}

// ─── Statement shortcuts ───────────────────────────────────

/** Create a comment statement. */
export function commentStmt(text: string): CommentStmt {
  return { kind: "CommentStmt", text };
}

/** Create a block statement { ... }. */
export function block(...stmts: Statement[]): BlockStmt {
  return { kind: "BlockStmt", list: stmts };
}

/** Create a return statement. */
export function return_(...results: Expression[]): ReturnStmt {
  return { kind: "ReturnStmt", results };
}

/** Create an assignment statement with explicit operator. */
export function assign(
  lhs: Expression[] | Expression,
  token: AssignOp,
  rhs: Expression[] | Expression,
): AssignStmt {
  return {
    kind: "AssignStmt",
    lhs: Array.isArray(lhs) ? lhs : [lhs],
    token,
    rhs: Array.isArray(rhs) ? rhs : [rhs],
  };
}

/** Create a short variable declaration (:=). */
export function def(lhs: Expression | Expression[], rhs: Expression | Expression[]): AssignStmt {
  return assign(Array.isArray(lhs) ? lhs : [lhs], ":=", Array.isArray(rhs) ? rhs : [rhs]);
}

/** Wrap an expression as an expression statement. */
export function expr(expr: Expression): ExprStmt {
  return { kind: "ExprStmt", expr };
}

/** Create an if statement with optional else. */
export function ifStmt(cond: Expression, body: BlockStmt, elseStmt?: Statement): IfStmt {
  return { kind: "IfStmt", cond, body, elseStmt };
}

/** Create a for loop with optional init, cond, post. */
export function forStmt(
  init: Statement | undefined,
  cond: Expression | undefined,
  post: Statement | undefined,
  body: BlockStmt,
): ForStmt {
  return { kind: "ForStmt", init, cond, post, body };
}

/** Create a range loop over an expression. */
export function rangeStmt(
  key: Expression | undefined,
  value: Expression | undefined,
  token: "=" | ":=",
  expr: Expression,
  body: BlockStmt,
): RangeStmt {
  return { kind: "RangeStmt", key, value, token, expr, body };
}

/** Create a channel send statement ch <- val. */
export function sendStmt(chanExpr: Expression, valueExpr: Expression): SendStmt {
  return { kind: "SendStmt", chan: chanExpr, value: valueExpr };
}

/** Create an empty statement. */
export function emptyStmt(): EmptyStmt {
  return { kind: "EmptyStmt" };
}

/** Create a goroutine statement go f(). */
export function goStmt(call: CallExpr): GoStmt {
  return { kind: "GoStmt", call };
}

/** Create a defer statement defer f(). */
export function defer(call: CallExpr): DeferStmt {
  return { kind: "DeferStmt", call };
}

/** Wrap a declaration as a statement. */
export function declStmt(decl: Declaration): DeclStmt {
  return { kind: "DeclStmt", decl };
}

/** Create an increment or decrement statement. */
export function incDec(expr: Expression, token: "++" | "--"): IncDecStmt {
  return { kind: "IncDecStmt", expr, token };
}

/** Create a branch statement (break, continue, goto, fallthrough). */
export function branch(token: BranchToken, label?: string): BranchStmt {
  return { kind: "BranchStmt", token, label };
}

/** Create a case clause for switch statements. */
export function caseClause(values: Expression[], ...body: Statement[]): CaseClause {
  return { kind: "CaseClause", values, body };
}

/** Create a default clause for switch statements. */
export function defaultClause(...body: Statement[]): CaseClause {
  return { kind: "CaseClause", values: [], body };
}

/** Create a switch statement. */
export function switchStmt(
  init: Statement | undefined,
  tag: Expression | undefined,
  ...cases: CaseClause[]
): SwitchStmt {
  return {
    kind: "SwitchStmt",
    init,
    tag,
    body: { kind: "BlockStmt", list: cases as unknown as Statement[] },
  };
}

// ─── Type shortcuts ────────────────────────────────────────

/** Create a function type (func(params) results). */
export function funcType(params: Field[], results?: Field[]): FuncType {
  return { kind: "FuncType", params, results };
}

/** Create a struct type with fields. */
export function structType(...fields: Field[]): StructType {
  return { kind: "StructType", fields };
}

/** Create an interface type with method signatures. */
export function interfaceType(...methods: Field[]): InterfaceType {
  return { kind: "InterfaceType", methods };
}

/** Create a fixed-size array type. */
export function array(len: Expression | undefined, elt: Type): ArrayType {
  return { kind: "ArrayType", len, elt };
}

/** Create a slice type. */
export function sliceType(elt: Type): SliceType {
  return { kind: "SliceType", elt };
}

/** Create a map type. */
export function mapType(key: Type, value: Type): MapType {
  return { kind: "MapType", key, value };
}

/** Create a channel type with direction. */
export function chan(dir: ChanDir, value: Type): ChanType {
  return { kind: "ChanType", dir, value };
}

// ─── Field shortcuts ───────────────────────────────────────

/** Create a struct field or function parameter. */
export function field(names: string[], type: Type, tag?: Tag): Field {
  return {
    kind: "Field",
    names,
    type,
    tag,
    embedded: names.length === 0,
  };
}

/** Create an embedded field (anonymous field). */
export function embedded(type: Type, tag?: Tag): Field {
  return {
    kind: "Field",
    names: [],
    type,
    tag,
    embedded: true,
  };
}

// ─── Declaration shortcuts ─────────────────────────────────

/** Create a function declaration with optional receiver. */
export function funcDecl(
  name: string,
  recv: Field | undefined,
  type: FuncType,
  body?: BlockStmt,
): FuncDecl {
  return { kind: "FuncDecl", name, recv, type, body };
}

/** Create a package-level function declaration. */
export function function_(
  name: string,
  params: Field[],
  results: Field[] | undefined,
  body?: BlockStmt,
): FuncDecl {
  return funcDecl(name, undefined, funcType(params, results), body);
}

/** Create a method declaration on a type. */
export function method(
  recv: Field,
  name: string,
  params: Field[],
  results: Field[] | undefined,
  body?: BlockStmt,
): FuncDecl {
  return funcDecl(name, recv, funcType(params, results), body);
}

/** Create a generic declaration (import, const, type, var). */
export function genDecl(token: Token, ...specs: Spec[]): GenDecl {
  return { kind: "GenDecl", token, specs, lparen: specs.length > 1 };
}

/** Create a type specification. */
export function typeSpec(name: string, type: Type, typeParams?: Field[]): TypeSpec {
  return { kind: "TypeSpec", name, type, typeParams };
}

/** Create a type alias specification. */
export function aliasSpec(name: string, type: Type): TypeSpec {
  return { kind: "TypeSpec", name, type, assign: true };
}

/** Create a value specification (var or const). */
export function valueSpec(names: string[], type?: Type, values?: Expression[]): ValueSpec {
  return { kind: "ValueSpec", names, type, values };
}

/** Create an import specification. */
export function importSpec(path: string, name?: string): ImportSpec {
  return { kind: "ImportSpec", path, name };
}

// ─── File shortcuts ────────────────────────────────────────

/** Create a complete Go source file AST node. */
export function file(packageName: string, ...decls: Declaration[]): File {
  const imports: ImportSpec[] = [];
  const other: Declaration[] = [];
  for (const d of decls) {
    if (d.kind === "GenDecl" && d.token === "import") {
      for (const spec of d.specs) {
        if (spec.kind === "ImportSpec") imports.push(spec);
      }
    } else {
      other.push(d);
    }
  }
  return { kind: "File", packageName, imports, decls: other };
}

// ─── Tags ──────────────────────────────────────────────────

/** Create a struct tag string from key-value pairs. */
export function tag(tags: Record<string, string>): Tag {
  return Object.entries(tags)
    .map(([key, value]) => `${key}:"${value}"`)
    .join(" ");
}

// ─── Comments ──────────────────────────────────────────────

/** Create a comment node. */
export function comment(text: string): Comment {
  return { kind: "Comment", text };
}

/** Create a comment group containing multiple comments. */
export function commentGroup(...comments: Comment[]): CommentGroup {
  return { kind: "CommentGroup", list: comments };
}

/** Create a line comment comment group (// text). */
export function lineComment(text: string): CommentGroup {
  return commentGroup({ kind: "Comment", text: `// ${text}` });
}
