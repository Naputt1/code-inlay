// ─────────────────────────────────────────────────────────────
// @schemago/goast — Visitor / traversal utilities
// ─────────────────────────────────────────────────────────────

import type { Node } from "./nodes.js";

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

function internalWalk(node: Node, visitor: Visitor): boolean {
  const action = visitor.enter?.(node);
  if (action === "stop") return true;

  if (action !== "skip") {
    if (walkChildren(node, (child) => internalWalk(child, visitor))) return true;
  }

  visitor.leave?.(node);
  return false;
}

function walkChildren(node: Node, visit: (child: Node) => boolean): boolean {
  switch (node.kind) {
    case "File":
      if (node.imports) for (const i of node.imports) if (visit(i)) return true;
      for (const d of node.decls) if (visit(d)) return true;
      if (node.comments) for (const c of node.comments) if (visit(c)) return true;
      break;
    case "FuncDecl":
      if (node.recv) if (visit(node.recv)) return true;
      if (node.typeParams) for (const tp of node.typeParams) if (visit(tp)) return true;
      if (visit(node.type)) return true;
      if (node.body && visit(node.body)) return true;
      break;
    case "GenDecl":
      for (const s of node.specs) if (visit(s)) return true;
      break;
    case "FuncType":
      if (node.typeParams) for (const tp of node.typeParams) if (visit(tp)) return true;
      for (const p of node.params) if (visit(p)) return true;
      if (node.results) for (const r of node.results) if (visit(r)) return true;
      break;
    case "StructType":
      for (const f of node.fields) if (visit(f)) return true;
      break;
    case "InterfaceType":
      for (const m of node.methods) if (visit(m)) return true;
      break;
    case "Field":
      if (visit(node.type)) return true;
      break;
    case "TypeSpec":
      if (node.typeParams) for (const tp of node.typeParams) if (visit(tp)) return true;
      if (visit(node.type)) return true;
      break;
    case "ValueSpec":
      if (node.type && visit(node.type)) return true;
      if (node.values) for (const v of node.values) if (visit(v)) return true;
      break;
    case "ImportSpec":
      break;
    case "BlockStmt":
      for (const s of node.list) if (visit(s)) return true;
      break;
    case "IfStmt":
      if (node.init && visit(node.init)) return true;
      if (visit(node.cond as Node)) return true;
      if (visit(node.body)) return true;
      if (node.elseStmt && visit(node.elseStmt)) return true;
      break;
    case "ForStmt":
      if (node.init && visit(node.init)) return true;
      if (node.cond && visit(node.cond as Node)) return true;
      if (node.post && visit(node.post)) return true;
      if (visit(node.body)) return true;
      break;
    case "RangeStmt":
      if (node.key && visit(node.key as Node)) return true;
      if (node.value && visit(node.value as Node)) return true;
      if (visit(node.expr as Node)) return true;
      if (visit(node.body)) return true;
      break;
    case "ReturnStmt":
      for (const r of node.results) if (visit(r)) return true;
      break;
    case "AssignStmt":
      for (const l of node.lhs) if (visit(l)) return true;
      for (const r of node.rhs) if (visit(r)) return true;
      break;
    case "ExprStmt":
      if (visit(node.expr)) return true;
      break;
    case "GoStmt":
    case "DeferStmt":
      if (visit(node.call)) return true;
      break;
    case "DeclStmt":
      if (visit(node.decl)) return true;
      break;
    case "IncDecStmt":
      if (visit(node.expr)) return true;
      break;
    case "SendStmt":
      if (visit(node.chan)) return true;
      if (visit(node.value)) return true;
      break;
    case "SwitchStmt":
      if (node.init && visit(node.init)) return true;
      if (node.tag && visit(node.tag as Node)) return true;
      if (visit(node.body)) return true;
      break;
    case "TypeSwitchStmt":
      if (node.init && visit(node.init)) return true;
      if (visit(node.assign as Node)) return true;
      if (visit(node.body)) return true;
      break;
    case "SelectStmt":
      if (visit(node.body)) return true;
      break;
    case "CaseClause":
      for (const v of node.values) if (visit(v)) return true;
      for (const b of node.body) if (visit(b)) return true;
      break;
    case "CommClause":
      if (node.comm && visit(node.comm)) return true;
      for (const b of node.body) if (visit(b)) return true;
      break;
    case "LabeledStmt":
      if (visit(node.stmt)) return true;
      break;
    case "BranchStmt":
    case "EmptyStmt":
      break;
    // Expressions
    case "Ident":
    case "BasicLit":
    case "BadExpr":
      break;
    case "StarExpr":
      if (visit(node.x as Node)) return true;
      break;
    case "SelectorExpr":
      if (visit(node.x)) return true;
      break;
    case "CallExpr":
      if (visit(node.func)) return true;
      for (const a of node.args) if (visit(a)) return true;
      break;
    case "UnaryExpr":
      if (visit(node.x)) return true;
      break;
    case "BinaryExpr":
      if (visit(node.x)) return true;
      if (visit(node.y)) return true;
      break;
    case "CompositeLit":
      if (node.type && visit(node.type)) return true;
      for (const e of node.elts) if (visit(e)) return true;
      break;
    case "KeyValueExpr":
      if (visit(node.key)) return true;
      if (visit(node.value)) return true;
      break;
    case "IndexExpr":
      if (visit(node.x)) return true;
      if (visit(node.index)) return true;
      break;
    case "SliceExpr":
      if (visit(node.x)) return true;
      if (node.low && visit(node.low)) return true;
      if (node.high && visit(node.high)) return true;
      if (node.max && visit(node.max)) return true;
      break;
    case "TypeAssertExpr":
      if (visit(node.x)) return true;
      if (node.type && visit(node.type)) return true;
      break;
    case "ParenExpr":
      if (visit(node.x)) return true;
      break;
    case "FuncLit":
      if (visit(node.type)) return true;
      if (visit(node.body)) return true;
      break;
    case "ArrayType":
      if (node.len && visit(node.len)) return true;
      if (visit(node.elt)) return true;
      break;
    case "SliceType":
      if (visit(node.elt)) return true;
      break;
    case "MapType":
      if (visit(node.key)) return true;
      if (visit(node.value)) return true;
      break;
    case "ChanType":
      if (visit(node.value)) return true;
      break;
    default:
      break;
  }
  return false;
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

function internalTransform(
  node: Node,
  transformer: Transformer,
  parent: Node | undefined,
): Node | null {
  const enterResult = transformer.enter?.(node, parent);
  let current = enterResult !== undefined ? enterResult : node;

  if (current === null) return null as unknown as Node;

  // Don't recurse into children that were replaced by enter
  const needsChildrenWalk = current === node;

  if (needsChildrenWalk) {
    current = transformChildren(current, transformer);
  }

  const leaveResult = transformer.leave?.(current, parent);
  if (leaveResult === null) return null;
  return leaveResult ?? current;
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
      const t = internalTransform(value as Node, transformer, node);
      if (t !== null) clone[key] = t;
    }
  }

  return clone as Node;
}

function collectChildren(node: Node): { key: string; value: unknown }[] {
  switch (node.kind) {
    case "File": {
      const r: { key: string; value: unknown }[] = [{ key: "decls", value: node.decls }];
      if (node.imports && node.imports.length > 0) r.push({ key: "imports", value: node.imports });
      if (node.comments && node.comments.length > 0)
        r.push({ key: "comments", value: node.comments });
      return r;
    }
    case "FuncDecl": {
      const r: { key: string; value: unknown }[] = [];
      if (node.recv) r.push({ key: "recv", value: node.recv });
      if (node.typeParams) r.push({ key: "typeParams", value: node.typeParams });
      r.push({ key: "type", value: node.type });
      if (node.body) r.push({ key: "body", value: node.body });
      return r;
    }
    case "GenDecl":
      return [{ key: "specs", value: node.specs }];
    case "FuncType": {
      const r: { key: string; value: unknown }[] = [];
      if (node.typeParams) r.push({ key: "typeParams", value: node.typeParams });
      r.push({ key: "params", value: node.params });
      if (node.results) r.push({ key: "results", value: node.results });
      return r;
    }
    case "StructType":
      return [{ key: "fields", value: node.fields }];
    case "InterfaceType":
      return [{ key: "methods", value: node.methods }];
    case "Field":
      return [{ key: "type", value: node.type }];
    case "TypeSpec": {
      const r: { key: string; value: unknown }[] = [];
      if (node.typeParams) r.push({ key: "typeParams", value: node.typeParams });
      r.push({ key: "type", value: node.type });
      return r;
    }
    case "ValueSpec": {
      const r: { key: string; value: unknown }[] = [];
      if (node.type) r.push({ key: "type", value: node.type });
      if (node.values) r.push({ key: "values", value: node.values });
      return r;
    }
    case "ImportSpec":
      return [];
    case "BlockStmt":
      return [{ key: "list", value: node.list }];
    case "IfStmt": {
      const r: { key: string; value: unknown }[] = [];
      if (node.init) r.push({ key: "init", value: node.init });
      r.push({ key: "cond", value: node.cond });
      r.push({ key: "body", value: node.body });
      if (node.elseStmt) r.push({ key: "elseStmt", value: node.elseStmt });
      return r;
    }
    case "ForStmt": {
      const r: { key: string; value: unknown }[] = [];
      if (node.init) r.push({ key: "init", value: node.init });
      if (node.cond) r.push({ key: "cond", value: node.cond });
      if (node.post) r.push({ key: "post", value: node.post });
      r.push({ key: "body", value: node.body });
      return r;
    }
    case "RangeStmt": {
      const r: { key: string; value: unknown }[] = [];
      if (node.key) r.push({ key: "key", value: node.key });
      if (node.value) r.push({ key: "value", value: node.value });
      r.push({ key: "expr", value: node.expr });
      r.push({ key: "body", value: node.body });
      return r;
    }
    case "SwitchStmt": {
      const r: { key: string; value: unknown }[] = [];
      if (node.init) r.push({ key: "init", value: node.init });
      if (node.tag) r.push({ key: "tag", value: node.tag });
      r.push({ key: "body", value: node.body });
      return r;
    }
    case "TypeSwitchStmt": {
      const r: { key: string; value: unknown }[] = [];
      if (node.init) r.push({ key: "init", value: node.init });
      r.push({ key: "assign", value: node.assign });
      r.push({ key: "body", value: node.body });
      return r;
    }
    case "SelectStmt": {
      return [{ key: "body", value: node.body }];
    }
    case "CaseClause": {
      const r: { key: string; value: unknown }[] = [];
      r.push({ key: "values", value: node.values });
      r.push({ key: "body", value: node.body });
      return r;
    }
    case "CommClause": {
      const r: { key: string; value: unknown }[] = [];
      if (node.comm) r.push({ key: "comm", value: node.comm });
      r.push({ key: "body", value: node.body });
      return r;
    }
    case "ReturnStmt":
      return [{ key: "results", value: node.results }];
    case "AssignStmt":
      return [
        { key: "lhs", value: node.lhs },
        { key: "rhs", value: node.rhs },
      ];
    case "ExprStmt":
      return [{ key: "expr", value: node.expr }];
    case "GoStmt":
    case "DeferStmt":
      return [{ key: "call", value: node.call }];
    case "DeclStmt":
      return [{ key: "decl", value: node.decl }];
    case "IncDecStmt":
      return [{ key: "expr", value: node.expr }];
    case "SendStmt":
      return [
        { key: "chan", value: node.chan },
        { key: "value", value: node.value },
      ];
    case "StarExpr":
      return [{ key: "x", value: node.x }];
    case "SelectorExpr":
      return [{ key: "x", value: node.x }];
    case "CallExpr": {
      const r: { key: string; value: unknown }[] = [];
      r.push({ key: "func", value: node.func });
      r.push({ key: "args", value: node.args });
      return r;
    }
    case "UnaryExpr":
      return [{ key: "x", value: node.x }];
    case "BinaryExpr":
      return [
        { key: "x", value: node.x },
        { key: "y", value: node.y },
      ];
    case "CompositeLit": {
      const r: { key: string; value: unknown }[] = [];
      if (node.type) r.push({ key: "type", value: node.type });
      r.push({ key: "elts", value: node.elts });
      return r;
    }
    case "KeyValueExpr":
      return [
        { key: "key", value: node.key },
        { key: "value", value: node.value },
      ];
    case "IndexExpr":
      return [
        { key: "x", value: node.x },
        { key: "index", value: node.index },
      ];
    case "SliceExpr": {
      const r: { key: string; value: unknown }[] = [{ key: "x", value: node.x }];
      if (node.low) r.push({ key: "low", value: node.low });
      if (node.high) r.push({ key: "high", value: node.high });
      if (node.max) r.push({ key: "max", value: node.max });
      return r;
    }
    case "TypeAssertExpr": {
      const r: { key: string; value: unknown }[] = [{ key: "x", value: node.x }];
      if (node.type) r.push({ key: "type", value: node.type });
      return r;
    }
    case "ParenExpr":
      return [{ key: "x", value: node.x }];
    case "FuncLit":
      return [
        { key: "type", value: node.type },
        { key: "body", value: node.body },
      ];
    case "ArrayType": {
      const r: { key: string; value: unknown }[] = [];
      if (node.len) r.push({ key: "len", value: node.len });
      r.push({ key: "elt", value: node.elt });
      return r;
    }
    case "SliceType":
      return [{ key: "elt", value: node.elt }];
    case "MapType":
      return [
        { key: "key", value: node.key },
        { key: "value", value: node.value },
      ];
    case "ChanType":
      return [{ key: "value", value: node.value }];
    case "LabeledStmt":
      return [{ key: "stmt", value: node.stmt }];
    case "BranchStmt":
    case "EmptyStmt":
    case "Ident":
    case "BasicLit":
    case "BadExpr":
      return [];
    default:
      return [];
  }
}
