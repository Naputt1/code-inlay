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

export function id(name: string): Ident {
  return { kind: "Ident", name };
}

export function str(value: string): BasicLit {
  return { kind: "BasicLit", token: "string", value: `"${value}"` };
}

export function int(value: number | string): BasicLit {
  return { kind: "BasicLit", token: "int", value: String(value) };
}

export function float(value: number | string): BasicLit {
  return { kind: "BasicLit", token: "float", value: String(value) };
}

export function char(value: string): BasicLit {
  return { kind: "BasicLit", token: "char", value: `'${value}'` };
}

export function imag(value: string): BasicLit {
  return { kind: "BasicLit", token: "imag", value };
}

export function lit(token: BasicLit["token"], value: string): BasicLit {
  return { kind: "BasicLit", token, value };
}

export function star(x: Type | Expression): StarExpr {
  return { kind: "StarExpr", x };
}

export function qual(pkg: string, name: string): SelectorExpr {
  return { kind: "SelectorExpr", x: id(pkg), sel: name };
}

export function sel(x: Expression, name: string): SelectorExpr {
  return { kind: "SelectorExpr", x, sel: name };
}

export function addr(x: Expression): UnaryExpr {
  return { kind: "UnaryExpr", op: "&", x };
}

export function deref(x: Expression): UnaryExpr {
  return { kind: "UnaryExpr", op: "*", x };
}

export function neg(x: Expression): UnaryExpr {
  return { kind: "UnaryExpr", op: "-", x };
}

export function not(x: Expression): UnaryExpr {
  return { kind: "UnaryExpr", op: "!", x };
}

export function binary(x: Expression, op: BinaryOp, y: Expression): BinaryExpr {
  return { kind: "BinaryExpr", x, op, y };
}

export function eq(x: Expression, y: Expression): BinaryExpr {
  return binary(x, "==", y);
}

export function neq(x: Expression, y: Expression): BinaryExpr {
  return binary(x, "!=", y);
}

export function call(func: Expression | string, ...args: Expression[]): CallExpr {
  const f = typeof func === "string" ? id(func) : func;
  return { kind: "CallExpr", func: f, args };
}

export function kv(key: Expression | string, value: Expression): KeyValueExpr {
  const k = typeof key === "string" ? id(key) : key;
  return { kind: "KeyValueExpr", key: k, value };
}

export function elt(type: Type, ...elts: Expression[]): CompositeLit {
  return { kind: "CompositeLit", type, elts, incomplete: true };
}

export function sliceLit(...elts: Expression[]): SliceLit {
  return { kind: "SliceLit", elts, incomplete: true };
}

export function index(x: Expression, index: Expression): IndexExpr {
  return { kind: "IndexExpr", x, index };
}

export function sliceExpr(x: Expression, low?: Expression, high?: Expression): SliceExpr {
  return { kind: "SliceExpr", x, low, high };
}

export function paren(x: Expression): ParenExpr {
  return { kind: "ParenExpr", x };
}

export function typeAssert(x: Expression, type?: Type): TypeAssertExpr {
  return { kind: "TypeAssertExpr", x, type };
}

export function funcLit(type: FuncType, body: BlockStmt): FuncLit {
  return { kind: "FuncLit", type, body };
}

export function badExpr(): BadExpr {
  return { kind: "BadExpr" };
}

// ─── Statement shortcuts ───────────────────────────────────

export function commentStmt(text: string): CommentStmt {
  return { kind: "CommentStmt", text };
}

export function block(...stmts: Statement[]): BlockStmt {
  return { kind: "BlockStmt", list: stmts };
}

export function return_(...results: Expression[]): ReturnStmt {
  return { kind: "ReturnStmt", results };
}

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

export function def(lhs: Expression | Expression[], rhs: Expression | Expression[]): AssignStmt {
  return assign(Array.isArray(lhs) ? lhs : [lhs], ":=", Array.isArray(rhs) ? rhs : [rhs]);
}

export function expr(expr: Expression): ExprStmt {
  return { kind: "ExprStmt", expr };
}

export function ifStmt(cond: Expression, body: BlockStmt, elseStmt?: Statement): IfStmt {
  return { kind: "IfStmt", cond, body, elseStmt };
}

export function forStmt(
  init: Statement | undefined,
  cond: Expression | undefined,
  post: Statement | undefined,
  body: BlockStmt,
): ForStmt {
  return { kind: "ForStmt", init, cond, post, body };
}

export function rangeStmt(
  key: Expression | undefined,
  value: Expression | undefined,
  token: "=" | ":=",
  expr: Expression,
  body: BlockStmt,
): RangeStmt {
  return { kind: "RangeStmt", key, value, token, expr, body };
}

export function sendStmt(chanExpr: Expression, valueExpr: Expression): SendStmt {
  return { kind: "SendStmt", chan: chanExpr, value: valueExpr };
}

export function emptyStmt(): EmptyStmt {
  return { kind: "EmptyStmt" };
}

export function goStmt(call: CallExpr): GoStmt {
  return { kind: "GoStmt", call };
}

export function defer(call: CallExpr): DeferStmt {
  return { kind: "DeferStmt", call };
}

export function declStmt(decl: Declaration): DeclStmt {
  return { kind: "DeclStmt", decl };
}

export function incDec(expr: Expression, token: "++" | "--"): IncDecStmt {
  return { kind: "IncDecStmt", expr, token };
}

export function branch(token: BranchToken, label?: string): BranchStmt {
  return { kind: "BranchStmt", token, label };
}

export function caseClause(values: Expression[], ...body: Statement[]): CaseClause {
  return { kind: "CaseClause", values, body };
}

export function defaultClause(...body: Statement[]): CaseClause {
  return { kind: "CaseClause", values: [], body };
}

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

export function funcType(params: Field[], results?: Field[]): FuncType {
  return { kind: "FuncType", params, results };
}

export function structType(...fields: Field[]): StructType {
  return { kind: "StructType", fields };
}

export function interfaceType(...methods: Field[]): InterfaceType {
  return { kind: "InterfaceType", methods };
}

export function array(len: Expression | undefined, elt: Type): ArrayType {
  return { kind: "ArrayType", len, elt };
}

export function sliceType(elt: Type): SliceType {
  return { kind: "SliceType", elt };
}

export function mapType(key: Type, value: Type): MapType {
  return { kind: "MapType", key, value };
}

export function chan(dir: ChanDir, value: Type): ChanType {
  return { kind: "ChanType", dir, value };
}

// ─── Field shortcuts ───────────────────────────────────────

export function field(names: string[], type: Type, tag?: Tag): Field {
  return {
    kind: "Field",
    names,
    type,
    tag,
    embedded: names.length === 0,
  };
}

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

export function funcDecl(
  name: string,
  recv: Field | undefined,
  type: FuncType,
  body?: BlockStmt,
): FuncDecl {
  return { kind: "FuncDecl", name, recv, type, body };
}

export function function_(
  name: string,
  params: Field[],
  results: Field[] | undefined,
  body?: BlockStmt,
): FuncDecl {
  return funcDecl(name, undefined, funcType(params, results), body);
}

export function method(
  recv: Field,
  name: string,
  params: Field[],
  results: Field[] | undefined,
  body?: BlockStmt,
): FuncDecl {
  return funcDecl(name, recv, funcType(params, results), body);
}

export function genDecl(token: Token, ...specs: Spec[]): GenDecl {
  return { kind: "GenDecl", token, specs, lparen: specs.length > 1 };
}

export function typeSpec(name: string, type: Type, typeParams?: Field[]): TypeSpec {
  return { kind: "TypeSpec", name, type, typeParams };
}

export function aliasSpec(name: string, type: Type): TypeSpec {
  return { kind: "TypeSpec", name, type, assign: true };
}

export function valueSpec(names: string[], type?: Type, values?: Expression[]): ValueSpec {
  return { kind: "ValueSpec", names, type, values };
}

export function importSpec(path: string, name?: string): ImportSpec {
  return { kind: "ImportSpec", path, name };
}

// ─── File shortcuts ────────────────────────────────────────

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

export function tag(tags: Record<string, string>): Tag {
  return Object.entries(tags)
    .map(([key, value]) => `${key}:"${value}"`)
    .join(" ");
}

// ─── Comments ──────────────────────────────────────────────

export function comment(text: string): Comment {
  return { kind: "Comment", text };
}

export function commentGroup(...comments: Comment[]): CommentGroup {
  return { kind: "CommentGroup", list: comments };
}

export function lineComment(text: string): CommentGroup {
  return commentGroup({ kind: "Comment", text: `// ${text}` });
}
