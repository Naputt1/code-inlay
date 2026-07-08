// ─────────────────────────────────────────────────────────────
// @schemago/go-ast — Public API
// ─────────────────────────────────────────────────────────────

// Node types (the Go AST model)
export type {
  // File & Package
  File,
  Pos,
  CommentGroup,
  Comment,
  // Declarations
  Declaration,
  FuncDecl,
  GenDecl,
  Token,
  // Specs
  Spec,
  ImportSpec,
  TypeSpec,
  ValueSpec,
  // Types
  Type,
  ArrayType,
  SliceType,
  MapType,
  StructType,
  InterfaceType,
  FuncType,
  ChanType,
  ChanDir,
  // Fields
  Field,
  Tag,
  // Expressions
  Expression,
  Ident,
  BasicLit,
  LitToken,
  FuncLit,
  CompositeLit,
  ParenExpr,
  SelectorExpr,
  IndexExpr,
  SliceExpr,
  TypeAssertExpr,
  CallExpr,
  StarExpr,
  UnaryExpr,
  UnaryOp,
  BinaryExpr,
  BinaryOp,
  KeyValueExpr,
  // Statements
  Statement,
  CommentStmt,
  DeclStmt,
  EmptyStmt,
  LabeledStmt,
  ExprStmt,
  SendStmt,
  IncDecStmt,
  AssignStmt,
  AssignOp,
  GoStmt,
  DeferStmt,
  ReturnStmt,
  BranchStmt,
  BranchToken,
  BlockStmt,
  IfStmt,
  SwitchStmt,
  CaseClause,
  TypeSwitchStmt,
  SelectStmt,
  CommClause,
  ForStmt,
  RangeStmt,
} from "./nodes.js";

// Builder API
export {
  // Expressions
  id,
  str,
  int,
  float,
  char,
  imag,
  lit,
  star,
  qual,
  sel,
  addr,
  deref,
  neg,
  not,
  binary,
  eq,
  neq,
  call,
  kv,
  elt,
  index,
  sliceExpr,
  paren,
  typeAssert,
  funcLit,
  badExpr,
  // Statements
  block,
  return_,
  assign,
  def,
  expr,
  ifStmt,
  forStmt,
  rangeStmt,
  goStmt,
  defer,
  declStmt,
  incDec,
  branch,
  caseClause,
  defaultClause,
  switchStmt,
  // Types
  funcType,
  structType,
  interfaceType,
  array,
  sliceType,
  mapType,
  chan,
  // Fields
  field,
  embedded,
  // Declarations
  funcDecl,
  function_,
  method,
  genDecl,
  typeSpec,
  aliasSpec,
  valueSpec,
  importSpec,
  // Files
  file,
  // Tags
  tag,
  // Comments
  comment,
  commentStmt,
  commentGroup,
  lineComment,
} from "./builder.js";

// Printer
export {
  printFile,
  printDeclaration,
  printExpr,
  printStatement,
  printBlock,
  printType,
  StringBuilder,
} from "./printer.js";
export type { PrintConfig } from "./printer.js";

// Walk / visitor utilities
export { walk, find, findFirst, transform } from "./walk.js";
export type { Visitor, VisitAction, Transformer } from "./walk.js";

// Tag utilities
export { parseTag, serializeTag, getTag, setTag, removeTag } from "./tag.js";

// Parser (decl-parser bridge)
export { createParser, GoParser } from "./parser.js";
export type { ParseResult, ParseError } from "./parser.js";
