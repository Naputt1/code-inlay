// ─────────────────────────────────────────────────────────────
// @schemago/go-ast — Printer: AST → formatted Go source string
// ─────────────────────────────────────────────────────────────

import type {
  File,
  CommentGroup,
  Declaration,
  FuncDecl,
  GenDecl,
  Spec,
  ImportSpec,
  TypeSpec,
  ValueSpec,
  Type,
  Field,
  Expression,
  Statement,
  Ident,
  BasicLit,
  StarExpr,
  SelectorExpr,
  CallExpr,
  UnaryExpr,
  BinaryExpr,
  KeyValueExpr,
  CompositeLit,
  FuncLit,
  IndexExpr,
  SliceExpr,
  TypeAssertExpr,
  ParenExpr,
  BadExpr,
  StructType,
  InterfaceType,
  FuncType,
  ArrayType,
  SliceType,
  MapType,
  ChanType,
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
  LabeledStmt,
  SendStmt,
  IncDecStmt,
  BranchStmt,
  SwitchStmt,
  TypeSwitchStmt,
  SelectStmt,
  CaseClause,
  CommClause,
  Tag,
  AssignOp,
} from "./nodes.js";

// ─── Precedence levels (matching Go spec) ──────────────────

const PREC: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 3,
  "<=": 3,
  ">": 3,
  ">=": 3,
  "+": 4,
  "-": 4,
  "|": 4,
  "^": 4,
  "*": 5,
  "/": 5,
  "%": 5,
  "<<": 5,
  ">>": 5,
  "&": 5,
  "&^": 5,
};

function binOpPrec(op: string): number {
  return PREC[op] ?? 0;
}

function needParens(inner: Expression, outerPrec: number, leftAssoc: boolean): boolean {
  const p = nodePrec(inner);
  if (p === undefined) return false;
  if (p < outerPrec) return true;
  if (p === outerPrec) return !leftAssoc;
  return false;
}

function nodePrec(e: Expression): number | undefined {
  if (e.kind === "BinaryExpr") return binOpPrec(e.op);
  if (e.kind === "UnaryExpr") return 6;
  if (e.kind === "StarExpr") return 6;
  return undefined;
}

const SELECTOR_PREC = 7;

export type PrintConfig = {
  indent?: string;
  tabWidth?: number;
};

const defaultConfig: PrintConfig = {
  indent: "\t",
  tabWidth: 1,
};

// ─── Main entry ────────────────────────────────────────────

export function printFile(file: File): string {
  const sb = new StringBuilder();
  sb.pushLine(`package ${file.packageName}`);
  sb.pushLine("");

  if (file.imports.length > 0) {
    printImports(sb, file.imports);
    sb.pushLine("");
  }

  for (let i = 0; i < file.decls.length; i++) {
    if (i > 0) sb.pushLine("");
    printDeclaration(sb, file.decls[i], 0);
  }

  return sb.toString();
}

export function printDeclaration(sb: StringBuilder, decl: Declaration, depth: number): void {
  switch (decl.kind) {
    case "FuncDecl":
      return printFuncDecl(sb, decl, depth);
    case "GenDecl":
      return printGenDecl(sb, decl, depth);
  }
}

export function printExpr(
  sb: StringBuilder,
  expr: Expression,
  prec?: number,
  depth?: number,
): void {
  const outerPrec = prec ?? 0;
  const outerDepth = depth ?? 0;

  switch (expr.kind) {
    case "BadExpr":
      sb.push("BAD");
      break;
    case "Ident":
      sb.push(expr.name);
      break;
    case "BasicLit":
      sb.push(expr.value);
      break;
    case "ParenExpr":
      sb.push("(");
      printExpr(sb, expr.x, 0, outerDepth);
      sb.push(")");
      break;
    case "StarExpr":
      sb.push("*");
      printExpr(sb, expr.x as Expression, 6, outerDepth);
      break;
    case "SelectorExpr": {
      const needSelParen = needParens(expr.x, SELECTOR_PREC, true);
      if (needSelParen) sb.push("(");
      printExpr(sb, expr.x, SELECTOR_PREC, outerDepth);
      if (needSelParen) sb.push(")");
      sb.push(".");
      sb.push(expr.sel);
      break;
    }
    case "CallExpr":
      printExpr(sb, expr.func, 6, outerDepth);
      sb.push("(");
      for (let i = 0; i < expr.args.length; i++) {
        if (i > 0) sb.push(", ");
        printExpr(sb, expr.args[i], 0, outerDepth);
      }
      sb.push(")");
      break;
    case "UnaryExpr": {
      sb.push(expr.op);
      const needP = needParens(expr.x, 6, false);
      if (needP) sb.push("(");
      printExpr(sb, expr.x, 6, outerDepth);
      if (needP) sb.push(")");
      break;
    }
    case "BinaryExpr": {
      const p = binOpPrec(expr.op);
      const needP = needParens(expr, outerPrec, true);
      if (needP) sb.push("(");
      printExpr(sb, expr.x, p, outerDepth);
      sb.push(` ${expr.op} `);
      printExpr(sb, expr.y, p + 1, outerDepth);
      if (needP) sb.push(")");
      break;
    }
    case "CompositeLit":
      if (expr.type) {
        printType(sb, expr.type);
      }
      if (expr.elts.length === 0) {
        sb.push("{}");
      } else {
        sb.push("{\n");
        for (const el of expr.elts) {
          sb.push(getIndent(outerDepth + 1));
          printExpr(sb, el, 0, outerDepth + 1);
          sb.push(",\n");
        }
        sb.push(getIndent(outerDepth));
        sb.push("}");
      }
      break;
    case "KeyValueExpr":
      printExpr(sb, expr.key, 0, outerDepth);
      sb.push(": ");
      printExpr(sb, expr.value, 0, outerDepth);
      break;
    case "IndexExpr":
      printExpr(sb, expr.x, 6, outerDepth);
      sb.push("[");
      printExpr(sb, expr.index, 0, outerDepth);
      sb.push("]");
      break;
    case "SliceExpr":
      printExpr(sb, expr.x, 6, outerDepth);
      sb.push("[");
      if (expr.low) printExpr(sb, expr.low, 0, outerDepth);
      sb.push(":");
      if (expr.high) printExpr(sb, expr.high, 0, outerDepth);
      if (expr.max) {
        sb.push(":");
        printExpr(sb, expr.max, 0, outerDepth);
      }
      sb.push("]");
      break;
    case "TypeAssertExpr":
      printExpr(sb, expr.x, 6, outerDepth);
      sb.push(".");
      if (expr.type) {
        sb.push("(");
        printType(sb, expr.type);
        sb.push(")");
      } else {
        sb.push("(type)");
      }
      break;
    case "FuncLit":
      printFuncType(sb, expr.type, 0);
      sb.push(" ");
      printBlock(sb, expr.body, outerDepth);
      sb.push("\n");
      break;
    default:
      sb.push("/* unhandled expr */");
  }
}

export function printStatement(sb: StringBuilder, stmt: Statement, depth: number): void {
  const indent = getIndent(depth);

  switch (stmt.kind) {
    case "ExprStmt":
      sb.push(indent);
      printExpr(sb, stmt.expr, 0, depth);
      sb.push("\n");
      break;
    case "ReturnStmt":
      sb.push(indent);
      sb.push("return");
      if (stmt.results.length > 0) {
        sb.push(" ");
        for (let i = 0; i < stmt.results.length; i++) {
          if (i > 0) sb.push(", ");
          printExpr(sb, stmt.results[i], 0, depth);
        }
      }
      sb.push("\n");
      break;
    case "AssignStmt":
      sb.push(indent);
      for (let i = 0; i < stmt.lhs.length; i++) {
        if (i > 0) sb.push(", ");
        printExpr(sb, stmt.lhs[i], 0, depth);
      }
      sb.push(` ${stmt.token} `);
      for (let i = 0; i < stmt.rhs.length; i++) {
        if (i > 0) sb.push(", ");
        printExpr(sb, stmt.rhs[i], 0, depth);
      }
      sb.push("\n");
      break;
    case "BlockStmt":
      printBlock(sb, stmt, depth);
      sb.push("\n");
      break;
    case "IfStmt": {
      sb.push(indent);
      sb.push("if ");
      if (stmt.init) {
        printStatementSimple(sb, stmt.init, depth);
        sb.push("; ");
      }
      printExpr(sb, stmt.cond, 0, depth);
      sb.push(" ");
      printBlock(sb, stmt.body, depth);
      if (stmt.elseStmt) {
        sb.push(" else ");
        if (stmt.elseStmt.kind === "IfStmt") {
          sb.push("if ");
          printIfContent(sb, stmt.elseStmt, depth);
        } else {
          printBlock(sb, stmt.elseStmt as BlockStmt, depth);
        }
      }
      sb.push("\n");
      break;
    }
    case "ForStmt":
      sb.push(indent);
      sb.push("for ");
      if (stmt.init || stmt.post) {
        if (stmt.init) {
          printStatementSimple(sb, stmt.init, depth);
          sb.push("; ");
        } else {
          sb.push("; ");
        }
        if (stmt.cond) {
          printExpr(sb, stmt.cond, 0, depth);
          sb.push("; ");
        } else {
          sb.push("; ");
        }
        if (stmt.post) {
          printStatementSimple(sb, stmt.post, depth);
        }
        sb.push(" ");
      } else if (stmt.cond) {
        printExpr(sb, stmt.cond, 0, depth);
        sb.push(" ");
      }
      printBlock(sb, stmt.body, depth);
      sb.push("\n");
      break;
    case "RangeStmt":
      sb.push(indent);
      sb.push("for ");
      if (stmt.key || stmt.value) {
        if (stmt.key) {
          printExpr(sb, stmt.key, 0, depth);
        } else {
          sb.push("_");
        }
        if (stmt.value) {
          sb.push(", ");
          printExpr(sb, stmt.value, 0, depth);
        }
        sb.push(` ${stmt.token} `);
      }
      sb.push("range ");
      printExpr(sb, stmt.expr, 0, depth);
      sb.push(" ");
      printBlock(sb, stmt.body, depth);
      sb.push("\n");
      break;
    case "GoStmt":
      sb.push(indent);
      sb.push("go ");
      printExpr(sb, stmt.call.func, 6, depth);
      sb.push("(");
      for (let i = 0; i < stmt.call.args.length; i++) {
        if (i > 0) sb.push(", ");
        printExpr(sb, stmt.call.args[i], 0, depth);
      }
      sb.push(")\n");
      break;
    case "DeferStmt":
      sb.push(indent);
      sb.push("defer ");
      printExpr(sb, stmt.call.func, 6, depth);
      sb.push("(");
      for (let i = 0; i < stmt.call.args.length; i++) {
        if (i > 0) sb.push(", ");
        printExpr(sb, stmt.call.args[i], 0, depth);
      }
      sb.push(")\n");
      break;
    case "DeclStmt":
      printDeclaration(sb, stmt.decl, depth);
      break;
    case "EmptyStmt":
      break;
    case "IncDecStmt":
      sb.push(indent);
      printExpr(sb, stmt.expr, 0, depth);
      sb.push(stmt.token);
      sb.push("\n");
      break;
    case "BranchStmt":
      sb.push(indent);
      sb.push(stmt.token);
      if (stmt.label) {
        sb.push(" ");
        sb.push(stmt.label);
      }
      sb.push("\n");
      break;
    case "LabeledStmt":
      sb.push(indent);
      sb.push(stmt.label);
      sb.push(":\n");
      printStatement(sb, stmt.stmt, depth);
      break;
    case "SwitchStmt":
      sb.push(indent);
      sb.push("switch ");
      if (stmt.init) {
        printStatementSimple(sb, stmt.init, depth);
        sb.push("; ");
      }
      if (stmt.tag) {
        printExpr(sb, stmt.tag, 0, depth);
        sb.push(" ");
      }
      printSwitchBody(sb, stmt.body, depth);
      sb.push("\n");
      break;
    case "TypeSwitchStmt":
      sb.push(indent);
      sb.push("switch ");
      if (stmt.init) {
        printStatementSimple(sb, stmt.init, depth);
        sb.push("; ");
      }
      printStatementSimple(sb, stmt.assign, depth);
      sb.push(" ");
      printSwitchBody(sb, stmt.body, depth);
      sb.push("\n");
      break;
    case "SendStmt":
      sb.push(indent);
      printExpr(sb, stmt.chan, 0, depth);
      sb.push(" <- ");
      printExpr(sb, stmt.value, 0, depth);
      sb.push("\n");
      break;
    case "SelectStmt":
      sb.push(indent);
      sb.push("select ");
      printSelectBody(sb, stmt.body, depth);
      sb.push("\n");
      break;
    default:
      sb.push(indent);
      sb.push("/* unhandled stmt */\n");
  }
}

function printStatementSimple(sb: StringBuilder, stmt: Statement, depth: number = 0): void {
  switch (stmt.kind) {
    case "ExprStmt":
      printExpr(sb, stmt.expr, 0, depth);
      break;
    case "AssignStmt":
      for (let i = 0; i < stmt.lhs.length; i++) {
        if (i > 0) sb.push(", ");
        printExpr(sb, stmt.lhs[i], 0, depth);
      }
      sb.push(` ${stmt.token} `);
      for (let i = 0; i < stmt.rhs.length; i++) {
        if (i > 0) sb.push(", ");
        printExpr(sb, stmt.rhs[i], 0, depth);
      }
      break;
    case "IncDecStmt":
      printExpr(sb, stmt.expr, 0, depth);
      sb.push(stmt.token);
      break;
    default:
      printStatement(sb, stmt, depth);
  }
}

export function printBlock(sb: StringBuilder, block: BlockStmt, depth: number): void {
  const indent = getIndent(depth);
  sb.push("{\n");
  for (const stmt of block.list) {
    printStatement(sb, stmt, depth + 1);
  }
  sb.push(`${indent}}`);
}

function printSwitchBody(sb: StringBuilder, block: BlockStmt, depth: number): void {
  const indent = getIndent(depth);
  sb.push("{\n");
  for (const item of block.list) {
    if (item.kind === "CaseClause") {
      printCaseClause(sb, item, depth);
    } else {
      printStatement(sb, item, depth + 1);
    }
  }
  sb.push(`${indent}}`);
}

function printCaseClause(sb: StringBuilder, cc: CaseClause, depth: number): void {
  const caseIndent = getIndent(depth);
  if (cc.values.length === 0) {
    sb.push(`${caseIndent}default:\n`);
  } else {
    sb.push(caseIndent);
    sb.push("case ");
    for (let i = 0; i < cc.values.length; i++) {
      if (i > 0) sb.push(", ");
      printExpr(sb, cc.values[i], 0, depth);
    }
    sb.push(":\n");
  }
  for (const stmt of cc.body) {
    printStatement(sb, stmt, depth + 1);
  }
}

function printIfContent(sb: StringBuilder, stmt: IfStmt, depth: number): void {
  if (stmt.init) {
    printStatementSimple(sb, stmt.init, depth);
    sb.push("; ");
  }
  printExpr(sb, stmt.cond, 0, depth);
  sb.push(" ");
  printBlock(sb, stmt.body, depth);
  if (stmt.elseStmt) {
    sb.push(" else ");
    if (stmt.elseStmt.kind === "IfStmt") {
      sb.push("if ");
      printIfContent(sb, stmt.elseStmt, depth);
    } else {
      printBlock(sb, stmt.elseStmt as BlockStmt, depth);
    }
  }
}

function printSelectBody(sb: StringBuilder, block: BlockStmt, depth: number): void {
  const indent = getIndent(depth);
  sb.push("{\n");
  for (const item of block.list) {
    if (item.kind === "CommClause") {
      printCommClause(sb, item, depth);
    } else {
      printStatement(sb, item, depth + 1);
    }
  }
  sb.push(`${indent}}`);
}

function printCommClause(sb: StringBuilder, cc: CommClause, depth: number): void {
  const caseIndent = getIndent(depth);
  if (!cc.comm) {
    sb.push(`${caseIndent}default:\n`);
  } else {
    sb.push(caseIndent);
    sb.push("case ");
    printStatementSimple(sb, cc.comm, depth);
    sb.push(":\n");
  }
  for (const stmt of cc.body) {
    printStatement(sb, stmt, depth + 1);
  }
}

// ─── Types ─────────────────────────────────────────────────

export function printType(sb: StringBuilder, type: Type): void {
  switch (type.kind) {
    case "Ident":
      sb.push(type.name);
      break;
    case "StarExpr":
      sb.push("*");
      printType(sb, type.x as Type);
      break;
    case "SelectorExpr": {
      const x = type.x;
      if (x.kind === "Ident") {
        sb.push(x.name);
      } else {
        printExpr(sb, x);
      }
      sb.push(".");
      sb.push(type.sel);
      break;
    }
    case "ArrayType":
      sb.push("[");
      if (type.len) printExpr(sb, type.len);
      sb.push("]");
      printType(sb, type.elt);
      break;
    case "SliceType":
      sb.push("[]");
      printType(sb, type.elt);
      break;
    case "MapType":
      sb.push("map[");
      printType(sb, type.key);
      sb.push("]");
      printType(sb, type.value);
      break;
    case "StructType":
      if (type.fields.length === 0) {
        sb.push("struct{}");
      } else {
        sb.push("struct {\n");
        for (const f of type.fields) {
          printFieldDecl(sb, f, 1);
        }
        sb.push("}");
      }
      break;
    case "InterfaceType":
      sb.push("interface {");
      if (type.methods.length > 0) {
        sb.push("\n");
        for (const m of type.methods) {
          printFieldDecl(sb, m, 1);
        }
      }
      sb.push("}");
      break;
    case "FuncType":
      printFuncType(sb, type, 0);
      break;
    case "ChanType":
      if (type.dir === "recv") sb.push("<-chan ");
      else if (type.dir === "send") sb.push("chan<- ");
      else sb.push("chan ");
      printType(sb, type.value);
      break;
    case "ParenExpr":
      sb.push("(");
      printType(sb, type.x as unknown as Type);
      sb.push(")");
      break;
    default:
      sb.push("/* unhandled type */");
  }
}

// ─── Declarations ──────────────────────────────────────────

function printFuncDecl(sb: StringBuilder, decl: FuncDecl, depth: number): void {
  const indent = getIndent(depth);

  // doc comment
  if (decl.doc) printCommentGroup(sb, decl.doc, depth);

  sb.push(indent);
  sb.push("func ");

  // receiver
  if (decl.recv) {
    sb.push("(");
    printFieldParams(sb, [decl.recv]);
    sb.push(") ");
  }

  // type params (generics)
  if (decl.typeParams && decl.typeParams.length > 0) {
    sb.push("[");
    printFieldParams(sb, decl.typeParams);
    sb.push("] ");
  }

  sb.push(decl.name);
  printFuncTypeSuffix(sb, decl.type);

  if (decl.body) {
    sb.push(" ");
    printBlock(sb, decl.body, depth);
    sb.push("\n");
  } else {
    sb.push("\n");
  }
}

function printGenDecl(sb: StringBuilder, decl: GenDecl, depth: number): void {
  const indent = getIndent(depth);
  if (decl.doc) printCommentGroup(sb, decl.doc, depth);

  const multi = decl.lparen || decl.specs.length > 1;

  sb.push(indent);
  sb.push(decl.token);
  if (multi) {
    sb.push(" (\n");
    for (const spec of decl.specs) {
      printSpec(sb, spec, depth + 1);
      sb.push("\n");
    }
    sb.push(`${indent})`);
  } else if (decl.specs.length === 1) {
    sb.push(" ");
    printSpec(sb, decl.specs[0], 0);
  }
  sb.push("\n");
}

function printSpec(sb: StringBuilder, spec: Spec, depth: number): void {
  const indent = getIndent(depth);
  const doc: CommentGroup | undefined = spec.kind === "ImportSpec" ? spec.comment : spec.doc;
  if (doc) printCommentGroup(sb, doc, depth);
  switch (spec.kind) {
    case "ImportSpec":
      sb.push(indent);
      if (spec.name) {
        sb.push(spec.name);
        sb.push(" ");
      }
      sb.push(`"${spec.path}"`);
      break;
    case "TypeSpec":
      sb.push(indent);
      sb.push(spec.name);
      if (spec.typeParams && spec.typeParams.length > 0) {
        sb.push("[");
        printFieldParams(sb, spec.typeParams);
        sb.push("]");
      }
      if (spec.assign) sb.push(" =");
      sb.push(" ");
      printType(sb, spec.type);
      break;
    case "ValueSpec":
      sb.push(indent);
      for (let i = 0; i < spec.names.length; i++) {
        if (i > 0) sb.push(", ");
        sb.push(spec.names[i]);
      }
      if (spec.type) {
        sb.push(" ");
        printType(sb, spec.type);
      }
      if (spec.values && spec.values.length > 0) {
        sb.push(" = ");
        for (let i = 0; i < spec.values.length; i++) {
          if (i > 0) sb.push(", ");
          printExpr(sb, spec.values[i]);
        }
      }
      break;
  }
}

// ─── Imports ───────────────────────────────────────────────

function printImports(sb: StringBuilder, imports: ImportSpec[]): void {
  if (imports.length === 0) return;
  if (imports.length === 1) {
    const imp = imports[0];
    if (imp.name) {
      sb.pushLine(`import ${imp.name} "${imp.path}"`);
    } else {
      sb.pushLine(`import "${imp.path}"`);
    }
    return;
  }

  sb.pushLine("import (");
  for (const imp of imports) {
    sb.push("\t");
    if (imp.name) {
      sb.push(imp.name);
      sb.push(" ");
    }
    sb.pushLine(`"${imp.path}"`);
  }
  sb.pushLine(")");
}

// ─── Fields ────────────────────────────────────────────────

function printFieldDecl(sb: StringBuilder, f: Field, depth: number): void {
  const indent = getIndent(depth);
  sb.push(indent);
  if (f.embedded || f.names.length === 0) {
    printType(sb, f.type);
  } else {
    for (let i = 0; i < f.names.length; i++) {
      if (i > 0) sb.push(", ");
      sb.push(f.names[i]);
    }
    sb.push(" ");
    printType(sb, f.type);
  }
  if (f.tag) {
    sb.push(" ");
    sb.push("`");
    sb.push(f.tag);
    sb.push("`");
  }
  sb.push("\n");
}

function printFieldParams(sb: StringBuilder, fields: Field[]): void {
  for (let i = 0; i < fields.length; i++) {
    if (i > 0) sb.push(", ");
    const f = fields[i];
    if (f.names.length > 0) {
      for (let j = 0; j < f.names.length; j++) {
        if (j > 0) sb.push(", ");
        sb.push(f.names[j]);
      }
      sb.push(" ");
    }
    printType(sb, f.type);
  }
}

// ─── FuncType ──────────────────────────────────────────────

function printFuncType(sb: StringBuilder, ft: FuncType, depth: number): void {
  sb.push("func");
  printFuncTypeSuffix(sb, ft);
}

function printFuncTypeSuffix(sb: StringBuilder, ft: FuncType): void {
  // type params
  if (ft.typeParams && ft.typeParams.length > 0) {
    sb.push("[");
    printFieldParams(sb, ft.typeParams);
    sb.push("]");
  }

  // params
  sb.push("(");
  printFieldParams(sb, ft.params);
  sb.push(")");

  // results
  if (ft.results && ft.results.length > 0) {
    if (ft.results.length === 1 && ft.results[0].names.length === 0) {
      sb.push(" ");
      printType(sb, ft.results[0].type);
    } else {
      sb.push(" (");
      printFieldParams(sb, ft.results);
      sb.push(")");
    }
  }
}

// ─── Comments ──────────────────────────────────────────────

function printCommentGroup(sb: StringBuilder, cg: CommentGroup, depth: number): void {
  const indent = getIndent(depth);
  for (const c of cg.list) {
    sb.push(indent);
    sb.push(c.text);
    sb.push("\n");
  }
}

// ─── Utility ───────────────────────────────────────────────

function getIndent(depth: number): string {
  return "\t".repeat(depth);
}

export class StringBuilder {
  private buf: string[] = [];

  push(s: string): void {
    this.buf.push(s);
  }

  pushLine(s: string): void {
    this.buf.push(s);
    this.buf.push("\n");
  }

  toString(): string {
    return this.buf.join("");
  }
}
