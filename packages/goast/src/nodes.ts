// ─────────────────────────────────────────────────────────────
// @schemago/goast — Go AST node types (mirrors go/ast)
// All nodes use discriminated unions on the `kind` field.
// ─────────────────────────────────────────────────────────────

// ─── Helpers ────────────────────────────────────────────────

export type Pos = {
  line: number;
  col: number;
  offset: number;
};

export type CommentGroup = {
  kind: "CommentGroup";
  list: Comment[];
};

export type Comment = {
  kind: "Comment";
  text: string; // includes // or /* */ delimiters
};

// ─── File & Package ────────────────────────────────────────

export type File = {
  kind: "File";
  packageName: string;
  imports: ImportSpec[];
  decls: Declaration[];
  comments?: CommentGroup[];
  pos?: Pos;
};

// ─── Declarations ──────────────────────────────────────────

export type Declaration = FuncDecl | GenDecl;

export type FuncDecl = {
  kind: "FuncDecl";
  name: string;
  recv?: Field; // nil for functions, set for methods
  typeParams?: Field[];
  type: FuncType;
  body?: BlockStmt;
  doc?: CommentGroup;
  pos?: Pos;
};

export type GenDecl = {
  kind: "GenDecl";
  token: Token;
  specs: Spec[];
  lparen?: boolean; // has ( )
  doc?: CommentGroup;
  pos?: Pos;
};

export type Token = "import" | "const" | "type" | "var";

// ─── Specs ─────────────────────────────────────────────────

export type Spec = ImportSpec | TypeSpec | ValueSpec;

export type ImportSpec = {
  kind: "ImportSpec";
  path: string;
  name?: string; // alias ("" = dot-import, "_" = blank, "f" = f "fmt")
  comment?: CommentGroup;
};

export type TypeSpec = {
  kind: "TypeSpec";
  name: string;
  type: Type;
  typeParams?: Field[];
  assign?: boolean; // `=` for type aliases
  doc?: CommentGroup;
};

export type ValueSpec = {
  kind: "ValueSpec";
  names: string[];
  type?: Type;
  values?: Expression[];
  doc?: CommentGroup;
};

// ─── Types ─────────────────────────────────────────────────

export type Type =
  | Ident
  | StarExpr
  | SelectorExpr
  | ArrayType
  | SliceType
  | MapType
  | StructType
  | InterfaceType
  | FuncType
  | ChanType
  | ParenExpr
  | IndexExpr
  | IndexListExpr;

export type ArrayType = {
  kind: "ArrayType";
  len?: Expression; // nil for [...]T
  elt: Type;
};

export type SliceType = {
  kind: "SliceType";
  elt: Type;
};

export type MapType = {
  kind: "MapType";
  key: Type;
  value: Type;
};

export type StructType = {
  kind: "StructType";
  fields: Field[];
};

export type InterfaceType = {
  kind: "InterfaceType";
  methods: Field[];
};

export type FuncType = {
  kind: "FuncType";
  typeParams?: Field[];
  params: Field[];
  results?: Field[];
};

export type ChanType = {
  kind: "ChanType";
  dir: ChanDir;
  value: Type;
};

export type ChanDir = "send" | "recv" | "both";

// ─── Fields ────────────────────────────────────────────────

export type Field = {
  kind: "Field";
  names: string[];
  type: Type;
  tag?: Tag;
  embedded?: boolean;
  variadic?: boolean;
  doc?: CommentGroup;
  comment?: CommentGroup;
};

// Tag is a raw string like `json:"name" gorm:"column:name"`
// Use TagBuilder or parse() utilities for structured access.
export type Tag = string;

// ─── Expressions ───────────────────────────────────────────

export type Expression =
  | BadExpr
  | Ident
  | BasicLit
  | FuncLit
  | CompositeLit
  | SliceLit
  | ParenExpr
  | SelectorExpr
  | IndexExpr
  | IndexListExpr
  | SliceExpr
  | TypeAssertExpr
  | CallExpr
  | StarExpr
  | UnaryExpr
  | BinaryExpr
  | KeyValueExpr;

export type BadExpr = {
  kind: "BadExpr";
};

export type Ident = {
  kind: "Ident";
  name: string;
  pos?: Pos;
};

export type BasicLit = {
  kind: "BasicLit";
  token: LitToken;
  value: string; // raw literal including quotes for strings
  pos?: Pos;
};

export type LitToken = "int" | "float" | "string" | "char" | "imag";

export type FuncLit = {
  kind: "FuncLit";
  type: FuncType;
  body: BlockStmt;
};

export type CompositeLit = {
  kind: "CompositeLit";
  type?: Type; // nil for bare `{1, 2, 3}`
  elts: Expression[];
  incomplete?: boolean; // trailing comma
};

export type SliceLit = {
  kind: "SliceLit";
  elts: Expression[];
  incomplete?: boolean;
};

export type ParenExpr = {
  kind: "ParenExpr";
  x: Expression;
};

export type SelectorExpr = {
  kind: "SelectorExpr";
  x: Expression;
  sel: string;
};

export type IndexExpr = {
  kind: "IndexExpr";
  x: Expression;
  index: Expression;
};

export type IndexListExpr = {
  kind: "IndexListExpr";
  x: Expression;
  indices: Expression[];
};

export type SliceExpr = {
  kind: "SliceExpr";
  x: Expression;
  low?: Expression;
  high?: Expression;
  max?: Expression; // only valid with three-index slice
};

export type TypeAssertExpr = {
  kind: "TypeAssertExpr";
  x: Expression;
  type?: Type; // nil for `x.(type)` in type switches
};

export type CallExpr = {
  kind: "CallExpr";
  func: Expression;
  args: Expression[];
  ellipsis?: boolean; // trailing `...`
};

export type StarExpr = {
  kind: "StarExpr";
  x: Type | Expression;
};

export type UnaryExpr = {
  kind: "UnaryExpr";
  op: UnaryOp;
  x: Expression;
};

export type UnaryOp =
  | "+"
  | "-"
  | "!"
  | "^"
  | "*" // pointer dereference
  | "&" // address of
  | "<-"; // channel receive

export type BinaryExpr = {
  kind: "BinaryExpr";
  x: Expression;
  op: BinaryOp;
  y: Expression;
};

export type BinaryOp =
  // arithmetic
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  // bitwise
  | "&"
  | "|"
  | "^"
  | "<<"
  | ">>"
  | "&^"
  // comparison
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  // logical
  | "&&"
  | "||";

export type KeyValueExpr = {
  kind: "KeyValueExpr";
  key: Expression;
  value: Expression;
};

// ─── Statements ────────────────────────────────────────────

export type Statement =
  | CommentStmt
  | DeclStmt
  | EmptyStmt
  | LabeledStmt
  | ExprStmt
  | SendStmt
  | IncDecStmt
  | AssignStmt
  | GoStmt
  | DeferStmt
  | ReturnStmt
  | BranchStmt
  | BlockStmt
  | IfStmt
  | SwitchStmt
  | TypeSwitchStmt
  | SelectStmt
  | ForStmt
  | RangeStmt
  | CaseClause
  | CommClause;

export type DeclStmt = {
  kind: "DeclStmt";
  decl: Declaration;
};

export type CommentStmt = {
  kind: "CommentStmt";
  text: string;
};

export type EmptyStmt = {
  kind: "EmptyStmt";
};

export type LabeledStmt = {
  kind: "LabeledStmt";
  label: string;
  stmt: Statement;
};

export type ExprStmt = {
  kind: "ExprStmt";
  expr: Expression;
};

export type SendStmt = {
  kind: "SendStmt";
  chan: Expression;
  value: Expression;
};

export type IncDecStmt = {
  kind: "IncDecStmt";
  expr: Expression;
  token: "++" | "--";
};

export type AssignStmt = {
  kind: "AssignStmt";
  lhs: Expression[];
  token: AssignOp;
  rhs: Expression[];
};

export type AssignOp =
  | "="
  | ":="
  | "+="
  | "-="
  | "*="
  | "/="
  | "%="
  | "&="
  | "|="
  | "^="
  | "<<="
  | ">>="
  | "&^=";

export type GoStmt = {
  kind: "GoStmt";
  call: CallExpr;
};

export type DeferStmt = {
  kind: "DeferStmt";
  call: CallExpr;
};

export type ReturnStmt = {
  kind: "ReturnStmt";
  results: Expression[];
};

export type BranchStmt = {
  kind: "BranchStmt";
  token: BranchToken;
  label?: string;
};

export type BranchToken = "break" | "continue" | "goto" | "fallthrough";

export type BlockStmt = {
  kind: "BlockStmt";
  list: Statement[];
};

export type IfStmt = {
  kind: "IfStmt";
  init?: Statement;
  cond: Expression;
  body: BlockStmt;
  elseStmt?: Statement; // IfStmt for `else if`, BlockStmt for `else`
};

export type SwitchStmt = {
  kind: "SwitchStmt";
  init?: Statement;
  tag?: Expression;
  body: BlockStmt; // contains CaseClause
};

export type CaseClause = {
  kind: "CaseClause";
  values: Expression[]; // empty for `default:`
  body: Statement[];
};

export type TypeSwitchStmt = {
  kind: "TypeSwitchStmt";
  init?: Statement;
  assign: AssignStmt;
  body: BlockStmt; // contains CaseClause
};

export type SelectStmt = {
  kind: "SelectStmt";
  body: BlockStmt; // contains CommClause
};

export type CommClause = {
  kind: "CommClause";
  comm: Statement; // SendStmt or ExprStmt (recv), nil for default
  body: Statement[];
};

export type ForStmt = {
  kind: "ForStmt";
  init?: Statement;
  cond?: Expression;
  post?: Statement;
  body: BlockStmt;
};

export type RangeStmt = {
  kind: "RangeStmt";
  key?: Expression;
  value?: Expression;
  token: "=" | ":=";
  expr: Expression;
  body: BlockStmt;
};

// ─── Node union ───────────────────────────────────────────

export type Node =
  | File
  | Declaration
  | FuncDecl
  | GenDecl
  | Spec
  | ImportSpec
  | TypeSpec
  | ValueSpec
  | Type
  | Field
  | Expression
  | Statement
  | BlockStmt
  | CommentGroup
  | Comment
  | CaseClause
  | CommClause
  | SliceLit
  | IndexListExpr;
