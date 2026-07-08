import { describe, it, expect } from "vitest";
import * as go from "../src/index.js";

// ─── Helpers ──────────────────────────────────────────────────
const id = (n: string) => ({ kind: "Ident" as const, name: n });
const x = id("x");
const y = id("y");
const a = id("a");
const b = id("b");
const c = id("c");

// ─── Expressions ──────────────────────────────────────────────
describe("expressions", () => {
  it("id", () => {
    expect(go.id("x")).toEqual({ kind: "Ident", name: "x" });
  });

  it("str", () => {
    expect(go.str("hello")).toEqual({ kind: "BasicLit", token: "string", value: `"hello"` });
  });

  it("int", () => {
    expect(go.int(42)).toEqual({ kind: "BasicLit", token: "int", value: "42" });
  });

  it("float", () => {
    expect(go.float(3.14)).toEqual({ kind: "BasicLit", token: "float", value: "3.14" });
  });

  it("char", () => {
    expect(go.char("a")).toEqual({ kind: "BasicLit", token: "char", value: "'a'" });
  });

  it("imag", () => {
    expect(go.imag("3i")).toEqual({ kind: "BasicLit", token: "imag", value: "3i" });
  });

  it("lit", () => {
    expect(go.lit("int", "42")).toEqual({ kind: "BasicLit", token: "int", value: "42" });
  });

  it("star", () => {
    expect(go.star(x)).toEqual({ kind: "StarExpr", x });
  });

  it("qual", () => {
    expect(go.qual("pkg", "Foo")).toEqual({ kind: "SelectorExpr", x: id("pkg"), sel: "Foo" });
  });

  it("sel", () => {
    expect(go.sel(x, "method")).toEqual({ kind: "SelectorExpr", x, sel: "method" });
  });

  it("addr", () => {
    expect(go.addr(x)).toEqual({ kind: "UnaryExpr", op: "&", x });
  });

  it("deref", () => {
    expect(go.deref(x)).toEqual({ kind: "UnaryExpr", op: "*", x });
  });

  it("neg", () => {
    expect(go.neg(x)).toEqual({ kind: "UnaryExpr", op: "-", x });
  });

  it("not", () => {
    expect(go.not(x)).toEqual({ kind: "UnaryExpr", op: "!", x });
  });

  it("binary", () => {
    expect(go.binary(x, "+", y)).toEqual({ kind: "BinaryExpr", x, op: "+", y });
  });

  it("eq", () => {
    expect(go.eq(x, y)).toEqual({ kind: "BinaryExpr", x, op: "==", y });
  });

  it("neq", () => {
    expect(go.neq(x, y)).toEqual({ kind: "BinaryExpr", x, op: "!=", y });
  });

  it("call with string func auto-converts to Ident", () => {
    expect(go.call("foo", a, b)).toEqual({ kind: "CallExpr", func: id("foo"), args: [a, b] });
  });

  it("call with Ident func keeps Ident", () => {
    expect(go.call(id("foo"), a, b)).toEqual({ kind: "CallExpr", func: id("foo"), args: [a, b] });
  });

  it("kv auto-converts string key to Ident", () => {
    expect(go.kv("key", id("val"))).toEqual({
      kind: "KeyValueExpr",
      key: id("key"),
      value: id("val"),
    });
  });

  it("kv with Ident key keeps Ident", () => {
    expect(go.kv(id("key"), id("val"))).toEqual({
      kind: "KeyValueExpr",
      key: id("key"),
      value: id("val"),
    });
  });

  it("elt", () => {
    const kv1 = go.kv("name", id("Alice"));
    const kv2 = go.kv("age", go.int(30));
    expect(go.elt(id("Person"), kv1, kv2)).toEqual({
      kind: "CompositeLit",
      type: id("Person"),
      elts: [kv1, kv2],
      incomplete: true,
    });
  });

  it("index", () => {
    expect(go.index(x, y)).toEqual({ kind: "IndexExpr", x, index: y });
  });

  it("sliceExpr", () => {
    expect(go.sliceExpr(x, a, b)).toEqual({ kind: "SliceExpr", x, low: a, high: b });
  });

  it("paren", () => {
    expect(go.paren(x)).toEqual({ kind: "ParenExpr", x });
  });

  it("typeAssert", () => {
    expect(go.typeAssert(x, id("int"))).toEqual({ kind: "TypeAssertExpr", x, type: id("int") });
  });

  it("typeAssert without type", () => {
    expect(go.typeAssert(x)).toEqual({ kind: "TypeAssertExpr", x, type: undefined });
  });

  it("funcLit", () => {
    const ft = go.funcType([], undefined);
    const body = go.block(go.return_(go.int(1)));
    expect(go.funcLit(ft, body)).toEqual({ kind: "FuncLit", type: ft, body });
  });

  it("badExpr", () => {
    expect(go.badExpr()).toEqual({ kind: "BadExpr" });
  });
});

// ─── Statements ───────────────────────────────────────────────
describe("statements", () => {
  it("block", () => {
    const s1 = go.expr(go.id("foo"));
    const s2 = go.expr(go.id("bar"));
    expect(go.block(s1, s2)).toEqual({ kind: "BlockStmt", list: [s1, s2] });
  });

  it("return_ with no args", () => {
    expect(go.return_()).toEqual({ kind: "ReturnStmt", results: [] });
  });

  it("return_ with one arg", () => {
    expect(go.return_(a)).toEqual({ kind: "ReturnStmt", results: [a] });
  });

  it("return_ with multiple args", () => {
    expect(go.return_(a, b)).toEqual({ kind: "ReturnStmt", results: [a, b] });
  });

  it("assign wraps arrays", () => {
    expect(go.assign([a, b], ":=", [c])).toEqual({
      kind: "AssignStmt",
      lhs: [a, b],
      token: ":=",
      rhs: [c],
    });
  });

  it("def", () => {
    expect(go.def(a, b)).toEqual({ kind: "AssignStmt", lhs: [a], token: ":=", rhs: [b] });
  });

  it("expr", () => {
    const call = go.call("foo");
    expect(go.expr(call)).toEqual({ kind: "ExprStmt", expr: call });
  });

  it("ifStmt without else", () => {
    const body = go.block(go.expr(go.id("x")));
    expect(go.ifStmt(x, body)).toEqual({ kind: "IfStmt", cond: x, body, elseStmt: undefined });
  });

  it("ifStmt with else", () => {
    const body = go.block(go.expr(go.id("x")));
    const elseStmt = go.block(go.expr(go.id("y")));
    expect(go.ifStmt(x, body, elseStmt)).toEqual({ kind: "IfStmt", cond: x, body, elseStmt });
  });

  it("forStmt", () => {
    const init = go.def(a, go.int(0));
    const cond = go.binary(a, "<", go.int(10));
    const post = go.incDec(a, "++");
    const body = go.block(go.expr(go.id("x")));
    expect(go.forStmt(init, cond, post, body)).toEqual({ kind: "ForStmt", init, cond, post, body });
  });

  it("rangeStmt", () => {
    const body = go.block(go.expr(go.id("x")));
    expect(go.rangeStmt(a, b, ":=", x, body)).toEqual({
      kind: "RangeStmt",
      key: a,
      value: b,
      token: ":=",
      expr: x,
      body,
    });
  });

  it("sendStmt", () => {
    const ch = go.id("ch");
    const val = go.id("msg");
    expect(go.sendStmt(ch, val)).toEqual({ kind: "SendStmt", chan: ch, value: val });
  });

  it("emptyStmt", () => {
    expect(go.emptyStmt()).toEqual({ kind: "EmptyStmt" });
  });

  it("goStmt", () => {
    const call = go.call("foo");
    expect(go.goStmt(call)).toEqual({ kind: "GoStmt", call });
  });

  it("defer", () => {
    const call = go.call("foo");
    expect(go.defer(call)).toEqual({ kind: "DeferStmt", call });
  });

  it("declStmt", () => {
    const decl = go.genDecl("var", go.valueSpec(["x"], go.id("int")));
    expect(go.declStmt(decl)).toEqual({ kind: "DeclStmt", decl });
  });

  it("incDec", () => {
    expect(go.incDec(x, "++")).toEqual({ kind: "IncDecStmt", expr: x, token: "++" });
    expect(go.incDec(x, "--")).toEqual({ kind: "IncDecStmt", expr: x, token: "--" });
  });

  it("branch without label", () => {
    expect(go.branch("break")).toEqual({ kind: "BranchStmt", token: "break", label: undefined });
  });

  it("branch with label", () => {
    expect(go.branch("goto", "label")).toEqual({
      kind: "BranchStmt",
      token: "goto",
      label: "label",
    });
  });

  it("caseClause", () => {
    const stmt = go.expr(go.id("x"));
    expect(go.caseClause([x], stmt)).toEqual({ kind: "CaseClause", values: [x], body: [stmt] });
  });

  it("defaultClause", () => {
    const stmt = go.expr(go.id("x"));
    expect(go.defaultClause(stmt)).toEqual({ kind: "CaseClause", values: [], body: [stmt] });
  });

  it("switchStmt", () => {
    const c1 = go.caseClause([x], go.expr(go.id("x")));
    const c2 = go.defaultClause(go.expr(go.id("y")));
    expect(go.switchStmt(undefined, undefined, c1, c2)).toEqual({
      kind: "SwitchStmt",
      init: undefined,
      tag: undefined,
      body: { kind: "BlockStmt", list: [c1, c2] },
    });
  });
});

// ─── Types ────────────────────────────────────────────────────
describe("types", () => {
  it("funcType with params only", () => {
    const p = [go.field(["x"], go.id("int"))];
    expect(go.funcType(p)).toEqual({ kind: "FuncType", params: p, results: undefined });
  });

  it("funcType with params and results", () => {
    const p = [go.field(["x"], go.id("int"))];
    const r = [go.field([], go.id("string"))];
    expect(go.funcType(p, r)).toEqual({ kind: "FuncType", params: p, results: r });
  });

  it("structType", () => {
    const f1 = go.field(["Name"], go.id("string"));
    const f2 = go.field(["Age"], go.id("int"));
    expect(go.structType(f1, f2)).toEqual({ kind: "StructType", fields: [f1, f2] });
  });

  it("interfaceType", () => {
    const m1 = go.embedded(go.id("Stringer"));
    expect(go.interfaceType(m1)).toEqual({ kind: "InterfaceType", methods: [m1] });
  });

  it("array", () => {
    expect(go.array(go.int(5), go.id("int"))).toEqual({
      kind: "ArrayType",
      len: go.int(5),
      elt: go.id("int"),
    });
  });

  it("array without len", () => {
    expect(go.array(undefined, go.id("int"))).toEqual({
      kind: "ArrayType",
      len: undefined,
      elt: go.id("int"),
    });
  });

  it("sliceType", () => {
    expect(go.sliceType(go.id("int"))).toEqual({ kind: "SliceType", elt: go.id("int") });
  });

  it("mapType", () => {
    expect(go.mapType(go.id("string"), go.id("int"))).toEqual({
      kind: "MapType",
      key: go.id("string"),
      value: go.id("int"),
    });
  });

  it("chan both", () => {
    expect(go.chan("both", go.id("int"))).toEqual({
      kind: "ChanType",
      dir: "both",
      value: go.id("int"),
    });
  });

  it("chan recv", () => {
    expect(go.chan("recv", go.id("int"))).toEqual({
      kind: "ChanType",
      dir: "recv",
      value: go.id("int"),
    });
  });

  it("chan send", () => {
    expect(go.chan("send", go.id("int"))).toEqual({
      kind: "ChanType",
      dir: "send",
      value: go.id("int"),
    });
  });
});

// ─── Fields ───────────────────────────────────────────────────
describe("fields", () => {
  it("field with names -> not embedded", () => {
    expect(go.field(["Name"], go.id("string"), go.tag({ json: "name" }))).toEqual({
      kind: "Field",
      names: ["Name"],
      type: go.id("string"),
      tag: `json:"name"`,
      embedded: false,
    });
  });

  it("field without names -> embedded", () => {
    const result = go.field([], go.id("string"));
    expect(result).toEqual({
      kind: "Field",
      names: [],
      type: go.id("string"),
      embedded: true,
    });
  });

  it("embedded", () => {
    expect(go.embedded(go.id("string"))).toEqual({
      kind: "Field",
      names: [],
      type: go.id("string"),
      embedded: true,
    });
  });
});

// ─── Declarations ─────────────────────────────────────────────
describe("declarations", () => {
  it("function_", () => {
    const params = [go.field(["x"], go.id("int"))];
    const results = [go.field([], go.id("string"))];
    const body = go.block(go.return_(go.str("ok")));
    const fn = go.function_("Foo", params, results, body);
    expect(fn.kind).toBe("FuncDecl");
    expect(fn.name).toBe("Foo");
    expect(fn.recv).toBeUndefined();
    expect(fn.type).toEqual({ kind: "FuncType", params, results });
    expect(fn.body).toBe(body);
  });

  it("method", () => {
    const recv = go.field(["h"], go.star(go.id("Handler")));
    const params = [go.field([], go.id("string"))];
    const body = go.block(go.return_(go.str("ok")));
    const fn = go.method(recv, "Foo", params, undefined, body);
    expect(fn.kind).toBe("FuncDecl");
    expect(fn.name).toBe("Foo");
    expect(fn.recv).toBe(recv);
    expect(fn.type).toEqual({ kind: "FuncType", params, results: undefined });
    expect(fn.body).toBe(body);
  });

  it("genDecl sets lparen for multiple specs", () => {
    const s1 = go.typeSpec("A", go.id("int"));
    const s2 = go.typeSpec("B", go.id("string"));
    expect(go.genDecl("import", s1, s2)).toEqual({
      kind: "GenDecl",
      token: "import",
      specs: [s1, s2],
      lparen: true,
    });
  });

  it("genDecl no lparen for single spec", () => {
    const s1 = go.typeSpec("A", go.id("int"));
    expect(go.genDecl("import", s1)).toEqual({
      kind: "GenDecl",
      token: "import",
      specs: [s1],
      lparen: false,
    });
  });

  it("typeSpec", () => {
    expect(go.typeSpec("Foo", go.id("string"))).toEqual({
      kind: "TypeSpec",
      name: "Foo",
      type: go.id("string"),
    });
  });

  it("aliasSpec has assign=true", () => {
    const result = go.aliasSpec("Foo", go.id("string"));
    expect(result.kind).toBe("TypeSpec");
    expect(result.name).toBe("Foo");
    expect(result.type).toEqual(go.id("string"));
    expect(result.assign).toBe(true);
  });

  it("valueSpec", () => {
    expect(go.valueSpec(["x"], go.id("int"), [go.int(42)])).toEqual({
      kind: "ValueSpec",
      names: ["x"],
      type: go.id("int"),
      values: [go.int(42)],
    });
  });

  it("importSpec without name", () => {
    expect(go.importSpec("fmt")).toEqual({ kind: "ImportSpec", path: "fmt" });
  });

  it("importSpec with name", () => {
    expect(go.importSpec("path", "name")).toEqual({
      kind: "ImportSpec",
      path: "path",
      name: "name",
    });
  });
});

// ─── File ─────────────────────────────────────────────────────
describe("file", () => {
  it("extracts import specs, keeps other decls", () => {
    const imp = go.genDecl("import", go.importSpec("fmt"), go.importSpec("net/http"));
    const decl = go.genDecl("var", go.valueSpec(["x"], go.id("int")));
    const f = go.file("main", imp, decl);
    expect(f.kind).toBe("File");
    expect(f.packageName).toBe("main");
    expect(f.imports).toEqual([
      { kind: "ImportSpec", path: "fmt" },
      { kind: "ImportSpec", path: "net/http" },
    ]);
    expect(f.decls).toEqual([decl]);
  });

  it("with no imports", () => {
    const decl = go.genDecl("var", go.valueSpec(["x"], go.id("int")));
    const f = go.file("main", decl);
    expect(f.imports).toEqual([]);
    expect(f.decls).toEqual([decl]);
  });

  it("with only imports", () => {
    const imp = go.genDecl("import", go.importSpec("fmt"));
    const f = go.file("main", imp);
    expect(f.imports).toEqual([{ kind: "ImportSpec", path: "fmt" }]);
    expect(f.decls).toEqual([]);
  });
});

// ─── Tags ─────────────────────────────────────────────────────
describe("tags", () => {
  it("tag with single key", () => {
    expect(go.tag({ json: "name" })).toBe(`json:"name"`);
  });

  it("tag with multiple keys", () => {
    expect(go.tag({ json: "name", gorm: "column:name" })).toBe(`json:"name" gorm:"column:name"`);
  });
});

// ─── Comments ─────────────────────────────────────────────────
describe("comments", () => {
  it("comment", () => {
    expect(go.comment("// foo")).toEqual({ kind: "Comment", text: "// foo" });
  });

  it("commentGroup", () => {
    const c1 = go.comment("// foo");
    const c2 = go.comment("// bar");
    expect(go.commentGroup(c1, c2)).toEqual({ kind: "CommentGroup", list: [c1, c2] });
  });

  it("lineComment", () => {
    expect(go.lineComment("text")).toEqual({
      kind: "CommentGroup",
      list: [{ kind: "Comment", text: "// text" }],
    });
  });
});
