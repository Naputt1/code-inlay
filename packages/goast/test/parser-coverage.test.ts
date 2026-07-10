import { describe, it, expect, beforeAll } from "vitest";
import * as go from "../src/index.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  File, FuncDecl, GenDecl, StructType, Field, TypeSpec,
  ReturnStmt, AssignStmt, IfStmt, RangeStmt, ForStmt,
  SwitchStmt, CallExpr, CompositeLit, Ident, BasicLit,
  GoStmt, DeferStmt, SendStmt, SelectStmt, TypeSwitchStmt,
  IncDecStmt, BranchStmt, LabeledStmt, ExprStmt, DeclStmt,
  FuncLit, KeyValueExpr, SliceExpr, TypeAssertExpr,
  StarExpr, MapType, ChanType, SliceType, ArrayType, FuncType,
  InterfaceType, ParenExpr, UnaryExpr, BinaryExpr,
  IndexListExpr,
} from "../src/nodes.js";

const TEST_BINARY = join(import.meta.dirname, "..", "tools", "decl-parser", "decl-parser");

const parser = go.createParser(existsSync(TEST_BINARY) ? TEST_BINARY : undefined);
const hasParser = parser.hasParser();

function skipIfNoParser() {
  if (!hasParser) {
    console.warn("Skipping: decl-parser binary not found");
  }
  return !hasParser;
}

function parse(src: string): File {
  const result = parser.parse(src);
  if (result.kind === "ParseError") throw new Error(result.message);
  return result.file;
}

function getFunc(name: string, src: string): FuncDecl {
  const f = parse(src);
  const decl = f.decls.find((d): d is FuncDecl => d.kind === "FuncDecl" && d.name === name);
  if (!decl) throw new Error(`func ${name} not found`);
  return decl;
}

describe("parser: statement coverage", () => {
  it("parses GoStmt (goroutine)", () => {
    if (skipIfNoParser()) return;
    const f = getFunc("run", `package p
func run() { go doWork() }
func doWork() {}
`);
    const stmt = f.body!.list[0] as GoStmt;
    expect(stmt.kind).toBe("GoStmt");
    expect(stmt.call.func.kind).toBe("Ident");
    expect((stmt.call.func as Ident).name).toBe("doWork");
  });

  it("parses DeferStmt", () => {
    if (skipIfNoParser()) return;
    const f = getFunc("clean", `package p
func clean() { defer close() }
`);
    const stmt = f.body!.list[0] as DeferStmt;
    expect(stmt.kind).toBe("DeferStmt");
  });

  it("parses SendStmt (channel send)", () => {
    if (skipIfNoParser()) return;
    const f = getFunc("send", `package p
func send(ch chan int) { ch <- 42 }
`);
    const stmt = f.body!.list[0] as SendStmt;
    expect(stmt.kind).toBe("SendStmt");
    expect(stmt.chan.kind).toBe("Ident");
    expect(stmt.value.kind).toBe("BasicLit");
  });

  it("parses SelectStmt", () => {
    if (skipIfNoParser()) return;
    const f = getFunc("pick", `package p
func pick(ch1, ch2 chan int) int {
  select {
  case x := <-ch1:
    return x
  case ch2 <- 1:
    return 0
  default:
    return -1
  }
}
`);
    const stmt = f.body!.list[0] as SelectStmt;
    expect(stmt.kind).toBe("SelectStmt");
    expect(stmt.body.list.length).toBeGreaterThanOrEqual(2);
  });

  it("parses TypeSwitchStmt", () => {
    if (skipIfNoParser()) return;
    const f = getFunc("kind", `package p
func kind(v any) string {
  switch x := v.(type) {
  case int:
    return "int"
  case string:
    return "string"
  default:
    return "other"
  }
}
`);
    const stmt = f.body!.list[0] as TypeSwitchStmt;
    expect(stmt.kind).toBe("TypeSwitchStmt");
    expect(stmt.body.list.length).toBeGreaterThanOrEqual(2);
    const clause = stmt.body.list[0];
    expect(clause.kind).toBe("CaseClause");
  });

  it("parses IncDecStmt", () => {
    if (skipIfNoParser()) return;
    const f = getFunc("inc", `package p
func inc() { x := 0; x++; x-- }
`);
    const body = f.body!;
    expect(body.list[1].kind).toBe("IncDecStmt");
    expect((body.list[1] as IncDecStmt).token).toBe("++");
    expect(body.list[2].kind).toBe("IncDecStmt");
    expect((body.list[2] as IncDecStmt).token).toBe("--");
  });

  it("parses BranchStmt: break, continue, goto", () => {
    if (skipIfNoParser()) return;
    const f = getFunc("branch", `package p
func branch() {
  for i := 0; i < 10; i++ {
    if i == 5 { break }
    if i == 3 { continue }
  }
  goto end
end:
}
`);
    const body = f.body!;
    const outerIf = body.list[0].kind === "ForStmt"
      ? (body.list[0] as ForStmt).body.list.find(
          (s): s is IfStmt => s.kind === "IfStmt"
        )
      : null;
    if (outerIf) {
      expect(outerIf.body.list[0].kind).toBe("BranchStmt");
      expect((outerIf.body.list[0] as BranchStmt).token).toBe("break");
    }
    const gotoStmt = body.list[body.list.length - 2] as BranchStmt;
    expect(gotoStmt.kind).toBe("BranchStmt");
    expect(gotoStmt.token).toBe("goto");
    expect(gotoStmt.label).toBe("end");
    const labeled = body.list[body.list.length - 1] as LabeledStmt;
    expect(labeled.kind).toBe("LabeledStmt");
    expect(labeled.label).toBe("end");
  });
});

describe("parser: expression coverage", () => {
  it("parses FuncLit (closure)", () => {
    if (skipIfNoParser()) return;
    const f = getFunc("mapIt", `package p
func mapIt(fn func(int) int) int { return fn(1) }
`);
    // FuncLit in the source — function param
    const param = f.type.params[0].type as FuncType;
    expect(param.kind).toBe("FuncType");
    expect(param.params).toHaveLength(1);
    expect(param.results).toHaveLength(1);
  });

  it("parses inline FuncLit", () => {
    if (skipIfNoParser()) return;
    const f = getFunc("run", `package p
func run() {
  add := func(a, b int) int { return a + b }
  _ = add(1, 2)
}
`);
    const assign = f.body!.list[0] as AssignStmt;
    const rhs = assign.rhs[0] as FuncLit;
    expect(rhs.kind).toBe("FuncLit");
    expect(rhs.type.params).toHaveLength(1);
    expect(rhs.type.params[0].names).toEqual(["a", "b"]);
    expect(rhs.body).toBeDefined();
  });

  it("parses CompositeLit with key-value", () => {
    if (skipIfNoParser()) return;
    const f = getFunc("make", `package p
type Item struct { X int }
func make() Item { return Item{X: 1} }
`);
    const ret = f.body!.list[0] as ReturnStmt;
    const cl = ret.results[0] as CompositeLit;
    expect(cl.kind).toBe("CompositeLit");
    expect(cl.type?.kind).toBe("Ident");
    expect((cl.type as Ident).name).toBe("Item");
    expect(cl.elts).toHaveLength(1);
    expect(cl.elts[0].kind).toBe("KeyValueExpr");
    const kv = cl.elts[0] as KeyValueExpr;
    expect((kv.key as Ident).name).toBe("X");
    expect((kv.value as BasicLit).value).toBe("1");
  });

  it("parses bare CompositeLit (slice literal)", () => {
    if (skipIfNoParser()) return;
    const f = getFunc("nums", `package p
func nums() { _ = []int{1, 2, 3} }
`);
    const assign = f.body!.list[0] as AssignStmt;
    const rhs = assign.rhs[0] as CompositeLit;
    expect(rhs.kind).toBe("CompositeLit");
    expect(rhs.elts).toHaveLength(3);
  });

  it("parses SliceExpr (slice operation)", () => {
    if (skipIfNoParser()) return;
    const f = getFunc("sub", `package p
func sub(s []int) { _ = s[1:3]; _ = s[:2]; _ = s[1:] }
`);
    const stmts = f.body!.list;
    const se1 = ((stmts[0] as AssignStmt).rhs[0] as SliceExpr);
    expect(se1.kind).toBe("SliceExpr");
    expect(se1.low).toBeDefined();
    expect(se1.high).toBeDefined();
  });

  it("parses TypeAssertExpr", () => {
    if (skipIfNoParser()) return;
    const f = getFunc("conv", `package p
func conv(v any) { _ = v.(string) }
`);
    const assign = f.body!.list[0] as AssignStmt;
    const ta = assign.rhs[0] as TypeAssertExpr;
    expect(ta.kind).toBe("TypeAssertExpr");
    expect(ta.type?.kind).toBe("Ident");
    expect((ta.type as Ident).name).toBe("string");
  });

  it("parses UnaryExpr (all ops)", () => {
    if (skipIfNoParser()) return;
    const f = getFunc("ops", `package p
func ops(x int, ok bool) {
  _ = -x; _ = +x; _ = ^x
  _ = !ok; _ = &x
}
`);
    const stmts = f.body!.list;
    const ops = ["-", "+", "^", "!", "&"];
    for (let i = 0; i < ops.length; i++) {
      const ue = (stmts[i] as AssignStmt).rhs[0] as UnaryExpr;
      expect(ue.kind).toBe("UnaryExpr");
      expect(ue.op).toBe(ops[i]);
    }
  });

  it("parses BinaryExpr (various ops)", () => {
    if (skipIfNoParser()) return;
    const f = getFunc("calc", `package p
func calc(a, b int) { _ = a + b; _ = a == b; _ = a && true }
`);
    const stmts = f.body!.list;
    expect(((stmts[0] as AssignStmt).rhs[0] as BinaryExpr).op).toBe("+");
    expect(((stmts[1] as AssignStmt).rhs[0] as BinaryExpr).op).toBe("==");
    expect(((stmts[2] as AssignStmt).rhs[0] as BinaryExpr).op).toBe("&&");
  });
});

describe("parser: type coverage", () => {
  it("parses MapType", () => {
    if (skipIfNoParser()) return;
    const f = parse(`package p
type M map[string]int
`);
    const spec = (f.decls[0] as GenDecl).specs[0] as TypeSpec;
    expect(spec.type.kind).toBe("MapType");
    const mt = spec.type as MapType;
    expect((mt.key as Ident).name).toBe("string");
    expect((mt.value as Ident).name).toBe("int");
  });

  it("parses ChanType", () => {
    if (skipIfNoParser()) return;
    const f = parse(`package p
type C chan int
type S <-chan int
type T chan<- int
`);
    const specs: any[] = [];
      for (const d of f.decls) {
        if (d.kind === "GenDecl") specs.push(...(d as GenDecl).specs);
      }
    expect((specs[0].type as ChanType).dir).toBe("both");
    expect((specs[1].type as ChanType).dir).toBe("recv");
    expect((specs[2].type as ChanType).dir).toBe("send");
  });

  it("parses ArrayType", () => {
    if (skipIfNoParser()) return;
    const f = parse(`package p
type A [3]int
`);
    const spec = (f.decls[0] as GenDecl).specs[0] as TypeSpec;
    expect(spec.type.kind).toBe("ArrayType");
    const at = spec.type as ArrayType;
    expect(at.len).toBeDefined();
    expect((at.elt as Ident).name).toBe("int");
  });

  it("parses SliceType", () => {
    if (skipIfNoParser()) return;
    const f = parse(`package p
type S []byte
`);
    const spec = (f.decls[0] as GenDecl).specs[0] as TypeSpec;
    expect(spec.type.kind).toBe("SliceType");
  });

  it("parses InterfaceType with methods", () => {
    if (skipIfNoParser()) return;
    const f = parse(`package p
type Handler interface {
  Serve(ctx string) error
}
`);
    const spec = (f.decls[0] as GenDecl).specs[0] as TypeSpec;
    expect(spec.type.kind).toBe("InterfaceType");
    const iface = spec.type as InterfaceType;
    expect(iface.methods).toHaveLength(1);
    expect(iface.methods[0].names).toEqual(["Serve"]);
  });

  it("parses type alias", () => {
    if (skipIfNoParser()) return;
    const f = parse(`package p
type Str = string
`);
    const spec = (f.decls[0] as GenDecl).specs[0] as TypeSpec;
    expect(spec.assign).toBe(true);
    expect((spec.type as Ident).name).toBe("string");
  });

  it("parses import aliases", () => {
    if (skipIfNoParser()) return;
    const f = parse(`package p
import (
  h "net/http"
  _ "embed"
  . "math"
)
`);
    expect(f.imports).toHaveLength(3);
    expect(f.imports[0].name).toBe("h");
    expect(f.imports[1].name).toBe("_");
    expect(f.imports[2].name).toBe(".");
  });

  it("parses variadic parameters", () => {
    if (skipIfNoParser()) return;
    const f = getFunc("sum", `package p
func sum(nums ...int) int {
  total := 0
  for _, n := range nums { total += n }
  return total
}
`);
    expect(f.type.params[0].variadic).toBe(true);
    expect(f.type.params[0].variadic).toBe(true);
    expect((f.type.params[0].type as Ident).name).toBe("int");
  });

  it("parses const declarations", () => {
    if (skipIfNoParser()) return;
    const f = parse(`package p
const a = 1
const b string = "hello"
const (
  c = 2
  d = 3
)
`);
    const consts = f.decls.filter((d): d is GenDecl => d.kind === "GenDecl" && d.token === "const");
    expect(consts).toHaveLength(3);
    expect(consts[0].specs).toHaveLength(1);
    expect(consts[2].lparen).toBe(true);
    expect(consts[2].specs).toHaveLength(2);
  });

  it("parses nested struct (embedded types)", () => {
    if (skipIfNoParser()) return;
    const f = parse(`package p
type Outer struct {
  Inner
  *Base
  X int
}
`);
    const spec = (f.decls[0] as GenDecl).specs[0] as TypeSpec;
    const st = spec.type as StructType;
    expect(st.fields[0].embedded).toBe(true);
    expect(st.fields[1].embedded).toBe(true);
    expect(st.fields[1].type.kind).toBe("StarExpr");
    expect(st.fields[2].embedded).toBe(false);
  });
});

describe("parser: multi-return and named returns", () => {
  it("parses multiple return values", () => {
    if (skipIfNoParser()) return;
    const f = getFunc("div", `package p
func div(a, b int) (int, error) {
  if b == 0 { return 0, errors.New("div by zero") }
  return a / b, nil
}
`);
    expect(f.type.results).toHaveLength(2);
  });

  it("parses named returns", () => {
    if (skipIfNoParser()) return;
    const f = getFunc("split", `package p
func split(sum int) (x, y int) {
  x = sum * 4 / 9
  y = sum - x
  return
}
`);
    expect(f.type.results).toBeDefined();
    expect(f.type.results!).toHaveLength(1);
    expect(f.type.results![0].names).toEqual(["x", "y"]);
  });
});

describe("parser: IndexListExpr (generics multi-arg)", () => {
  it("parses single type param instantiation", () => {
    if (skipIfNoParser()) return;
    const f = parse(`package p
type Vector []int
func zero[T any]() T { var zero T; return zero }
`);
    const funcDecl = f.decls.find((d): d is FuncDecl => d.kind === "FuncDecl");
    expect(funcDecl).toBeDefined();
    if (!funcDecl) return;
    expect(funcDecl.typeParams).toBeDefined();
    expect(funcDecl.typeParams!).toHaveLength(1);
  });

  it("parses generic type instantiation via builder and printer", () => {
    const expr = go.indexList(go.id("p"), go.id("T"), go.id("U"));
    expect(expr.kind).toBe("IndexListExpr");
    expect(expr.indices).toHaveLength(2);

    const sb = new go.StringBuilder();
    go.printExpr(sb, expr);
    expect(sb.toString()).toBe("p[T, U]");

    const found: string[] = [];
    go.walk(expr, { enter: (n) => { if (n.kind === "Ident") found.push((n as Ident).name); return "continue"; } });
    expect(found).toContain("p");
    expect(found).toContain("T");
    expect(found).toContain("U");
  });
});

describe("parser: position info", () => {
  it("populates pos on parsed nodes", () => {
    if (skipIfNoParser()) return;
    const f = parse(`package p

type X struct{}

func Foo() {}
`);

    expect(f.pos).toBeDefined();

    const funcDecl = f.decls.find((d): d is FuncDecl => d.kind === "FuncDecl")!;
    expect(funcDecl.pos).toBeDefined();
    expect(funcDecl.pos!.line).toBeGreaterThan(0);
  });
});
