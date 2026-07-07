// ─────────────────────────────────────────────────────────────
// @schemago/go-ast — Visitor / traversal utilities
// ─────────────────────────────────────────────────────────────

import type {
  Node, File,
  Declaration, FuncDecl, GenDecl,
  Spec, ImportSpec, TypeSpec, ValueSpec,
  Type, Field,
  Expression, Statement,
  BlockStmt, CaseClause, CommClause,
} from "./nodes.js";

// ─── Visitor ───────────────────────────────────────────────

export type Visitor = {
  enter?: (node: Node) => VisitAction;
  leave?: (node: Node) => void;
};

export type VisitAction = "skip" | "stop" | "continue";

// ─── Walk ──────────────────────────────────────────────────

export function walk(node: Node, visitor: Visitor): void {
  internalWalk(node, visitor);
}

function internalWalk(node: Node, visitor: Visitor): void {
  const action = visitor.enter?.(node);
  if (action === "stop") return;

  if (action !== "skip") {
    walkChildren(node, (child) => internalWalk(child, visitor));
  }

  visitor.leave?.(node);
}

function walkChildren(node: Node, visit: (child: Node) => void): void {
  switch (node.kind) {
    case "File":
      for (const d of node.decls) visit(d);
      break;
    case "FuncDecl":
      if (node.recv) visit(node.recv);
      if (node.typeParams) for (const tp of node.typeParams) visit(tp);
      visit(node.type);
      if (node.body) visit(node.body);
      break;
    case "GenDecl":
      for (const s of node.specs) visit(s);
      break;
    case "FuncType":
      if (node.typeParams) for (const tp of node.typeParams) visit(tp);
      for (const p of node.params) visit(p);
      if (node.results) for (const r of node.results) visit(r);
      break;
    case "StructType":
      for (const f of node.fields) visit(f);
      break;
    case "InterfaceType":
      for (const m of node.methods) visit(m);
      break;
    case "Field":
      visit(node.type);
      break;
    case "TypeSpec":
      if (node.typeParams) for (const tp of node.typeParams) visit(tp);
      visit(node.type);
      break;
    case "ValueSpec":
      if (node.type) visit(node.type);
      if (node.values) for (const v of node.values) visit(v);
      break;
    case "ImportSpec":
      break;
    case "BlockStmt":
      for (const s of node.list) visit(s);
      break;
    case "IfStmt":
      if (node.init) visit(node.init);
      visit(node.cond as Node);
      visit(node.body);
      if (node.elseStmt) visit(node.elseStmt);
      break;
    case "ForStmt":
      if (node.init) visit(node.init);
      if (node.cond) visit(node.cond as Node);
      if (node.post) visit(node.post);
      visit(node.body);
      break;
    case "RangeStmt":
      if (node.key) visit(node.key as Node);
      if (node.value) visit(node.value as Node);
      visit(node.expr as Node);
      visit(node.body);
      break;
    case "ReturnStmt":
      for (const r of node.results) visit(r);
      break;
    case "AssignStmt":
      for (const l of node.lhs) visit(l);
      for (const r of node.rhs) visit(r);
      break;
    case "ExprStmt":
      visit(node.expr);
      break;
    case "GoStmt":
    case "DeferStmt":
      visit(node.call);
      break;
    case "DeclStmt":
      visit(node.decl);
      break;
    case "IncDecStmt":
      visit(node.expr);
      break;
    case "SendStmt":
      visit(node.chan);
      visit(node.value);
      break;
    case "SwitchStmt":
    case "TypeSwitchStmt":
      if (node.init) visit(node.init);
      visit(node.body);
      break;
    case "SelectStmt":
      visit(node.body);
      break;
    case "CaseClause":
      for (const v of node.values) visit(v);
      for (const b of node.body) visit(b);
      break;
    case "CommClause":
      if (node.comm) visit(node.comm);
      for (const b of node.body) visit(b);
      break;
    // Expressions
    case "Ident":
    case "BasicLit":
    case "BadExpr":
      break;
    case "StarExpr":
      visit(node.x as Node);
      break;
    case "SelectorExpr":
      visit(node.x);
      break;
    case "CallExpr":
      visit(node.func);
      for (const a of node.args) visit(a);
      break;
    case "UnaryExpr":
      visit(node.x);
      break;
    case "BinaryExpr":
      visit(node.x);
      visit(node.y);
      break;
    case "CompositeLit":
      if (node.type) visit(node.type);
      for (const e of node.elts) visit(e);
      break;
    case "KeyValueExpr":
      visit(node.key);
      visit(node.value);
      break;
    case "IndexExpr":
      visit(node.x);
      visit(node.index);
      break;
    case "SliceExpr":
      visit(node.x);
      if (node.low) visit(node.low);
      if (node.high) visit(node.high);
      if (node.max) visit(node.max);
      break;
    case "TypeAssertExpr":
      visit(node.x);
      if (node.type) visit(node.type);
      break;
    case "ParenExpr":
      visit(node.x);
      break;
    case "FuncLit":
      visit(node.type);
      visit(node.body);
      break;
    case "BranchStmt":
    case "EmptyStmt":
    case "LabeledStmt":
      break;
    default:
      break;
  }
}

// ─── Finder ────────────────────────────────────────────────

export type NodeKindFilter = Node["kind"];

export function find<N extends Node>(node: Node, kind: N["kind"]): N[] {
  const results: N[] = [];
  walk(node, {
    enter: (n) => {
      if (n.kind === kind) results.push(n as N);
      return "continue";
    },
  });
  return results;
}

export function findFirst<N extends Node>(node: Node, kind: N["kind"]): N | undefined {
  let result: N | undefined;
  walk(node, {
    enter: (n) => {
      if (n.kind === kind) {
        result = n as N;
        return "stop";
      }
      return "continue";
    },
  });
  return result;
}

// ─── Transform ─────────────────────────────────────────────

export type Transformer<C extends Node = Node> = {
  enter?: (node: Node, parent?: C) => Node | null | undefined;
  leave?: (node: Node, parent?: C) => Node | null | undefined;
};

export function transform<T extends Node>(node: T, transformer: Transformer): T {
  return internalTransform(node, transformer, undefined) as T;
}

function internalTransform(node: Node, transformer: Transformer, parent: Node | undefined): Node {
  let current = transformer.enter?.(node, parent) ?? node;

  if (current === null) return null as unknown as Node;

  // Don't recurse into children that were replaced by enter
  const needsChildrenWalk = current === node;

  if (needsChildrenWalk) {
    current = transformChildren(current, transformer);
  }

  const result = transformer.leave?.(current, parent);
  return result ?? current;
}

function transformChildren(node: Node, transformer: Transformer): Node {
  const children = collectChildren(node);
  if (children.length === 0) return node;

  const clone = { ...node } as Record<string, unknown>;

  for (const { key, value } of children) {
    if (Array.isArray(value)) {
      const transformed: Node[] = [];
      for (const child of value) {
        const t = internalTransform(child, transformer, node);
        if (t !== null) transformed.push(t);
      }
      clone[key] = transformed;
    } else if (value != null && typeof value === "object" && "kind" in value) {
      clone[key] = internalTransform(value as Node, transformer, node);
    }
  }

  return clone as Node;
}

function collectChildren(node: Node): { key: string; value: unknown }[] {
  switch (node.kind) {
    case "File": return [{ key: "decls", value: node.decls }];
    case "FuncDecl": {
      const result: { key: string; value: unknown }[] = [];
      result.push({ key: "type", value: node.type });
      if (node.body) result.push({ key: "body", value: node.body });
      return result;
    }
    case "GenDecl": return [{ key: "specs", value: node.specs }];
    case "BlockStmt": return [{ key: "list", value: node.list }];
    case "StructType": return [{ key: "fields", value: node.fields }];
    case "InterfaceType": return [{ key: "methods", value: node.methods }];
    case "Field": return [{ key: "type", value: node.type }];
    case "TypeSpec": return [{ key: "type", value: node.type }];
    case "IfStmt": {
      const r: { key: string; value: unknown }[] = [{ key: "cond", value: node.cond }];
      r.push({ key: "body", value: node.body });
      if (node.elseStmt) r.push({ key: "elseStmt", value: node.elseStmt });
      return r;
    }
    case "ForStmt": {
      const r: { key: string; value: unknown }[] = [];
      r.push({ key: "body", value: node.body });
      return r;
    }
    case "RangeStmt": {
      const r: { key: string; value: unknown }[] = [];
      r.push({ key: "expr", value: node.expr });
      r.push({ key: "body", value: node.body });
      return r;
    }
    case "ReturnStmt": return [{ key: "results", value: node.results }];
    case "AssignStmt": return [{ key: "lhs", value: node.lhs }, { key: "rhs", value: node.rhs }];
    case "ExprStmt": return [{ key: "expr", value: node.expr }];
    case "CallExpr": return [{ key: "args", value: node.args }];
    case "BinaryExpr": return [{ key: "x", value: node.x }, { key: "y", value: node.y }];
    case "CompositeLit": return [{ key: "elts", value: node.elts }];
    default: return [];
  }
}
