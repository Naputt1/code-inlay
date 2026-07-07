import { describe, it, expect } from "vitest";
import * as go from "../src/index.js";

function printExprStr(expr: go.Expression): string {
  const sb = new go.StringBuilder();
  go.printExpr(sb, expr);
  return sb.toString();
}

describe("printExpr — Ident", () => {
  it("prints a simple ident", () => {
    expect(printExprStr(go.id("foo"))).toBe("foo");
  });
});

describe("printExpr — BasicLit", () => {
  it("prints string literal", () => {
    expect(printExprStr(go.str("hello"))).toBe('"hello"');
  });

  it("prints int literal", () => {
    expect(printExprStr(go.int(42))).toBe("42");
  });

  it("prints float literal", () => {
    expect(printExprStr(go.float(3.14))).toBe("3.14");
  });

  it("prints char literal", () => {
    expect(printExprStr(go.char("a"))).toBe("'a'");
  });

  it("prints imag literal", () => {
    expect(printExprStr(go.imag("1.5i"))).toBe("1.5i");
  });
});

describe("printExpr — ParenExpr", () => {
  it("prints (x + y)", () => {
    expect(printExprStr(go.paren(go.binary(go.id("x"), "+", go.id("y"))))).toBe("(x + y)");
  });
});

describe("printExpr — StarExpr", () => {
  it("prints *x", () => {
    expect(printExprStr(go.star(go.id("x")))).toBe("*x");
  });

  it("prints **x (pointer to pointer)", () => {
    expect(printExprStr(go.star(go.star(go.id("x"))))).toBe("**x");
  });
});

describe("printExpr — SelectorExpr", () => {
  it("prints a.b", () => {
    expect(printExprStr(go.sel(go.id("a"), "b"))).toBe("a.b");
  });
});

describe("printExpr — CallExpr", () => {
  it("prints foo()", () => {
    expect(printExprStr(go.call("foo"))).toBe("foo()");
  });

  it("prints foo(a, b)", () => {
    expect(printExprStr(go.call("foo", go.id("a"), go.id("b")))).toBe("foo(a, b)");
  });

  it("prints foo(bar(x))", () => {
    expect(printExprStr(go.call("foo", go.call("bar", go.id("x"))))).toBe("foo(bar(x))");
  });
});

describe("printExpr — UnaryExpr", () => {
  it("prints &x", () => {
    expect(printExprStr(go.addr(go.id("x")))).toBe("&x");
  });

  it("prints *x", () => {
    expect(printExprStr(go.deref(go.id("x")))).toBe("*x");
  });

  it("prints -x", () => {
    expect(printExprStr(go.neg(go.id("x")))).toBe("-x");
  });

  it("prints !x", () => {
    expect(printExprStr(go.not(go.id("x")))).toBe("!x");
  });
});

describe("printExpr — BinaryExpr precedence", () => {
  it("a + b * c does NOT wrap b*c", () => {
    expect(printExprStr(go.binary(go.id("a"), "+", go.binary(go.id("b"), "*", go.id("c"))))).toBe(
      "a + b * c",
    );
  });

  it("(a + b) * c DOES wrap a+b", () => {
    expect(
      printExprStr(go.binary(go.paren(go.binary(go.id("a"), "+", go.id("b"))), "*", go.id("c"))),
    ).toBe("(a + b) * c");
  });

  it("same-op associativity: a - b - c", () => {
    expect(printExprStr(go.binary(go.binary(go.id("a"), "-", go.id("b")), "-", go.id("c")))).toBe(
      "a - b - c",
    );
  });
});

describe("printExpr — CompositeLit", () => {
  it("with type Foo{a: 1}", () => {
    expect(
      printExprStr({
        kind: "CompositeLit",
        type: go.id("Foo"),
        elts: [go.kv("a", go.int(1))],
      } as go.CompositeLit),
    ).toBe("Foo{\n\ta: 1,\n}");
  });

  it("without type {a: 1}", () => {
    expect(
      printExprStr({
        kind: "CompositeLit",
        elts: [go.kv("a", go.int(1))],
      } as go.CompositeLit),
    ).toBe("{\n\ta: 1,\n}");
  });

  it("empty Foo{}", () => {
    expect(
      printExprStr({
        kind: "CompositeLit",
        type: go.id("Foo"),
        elts: [],
      } as go.CompositeLit),
    ).toBe("Foo{}");
  });

  it("nested [][]int{{1}, {2}}", () => {
    expect(
      printExprStr({
        kind: "CompositeLit",
        type: go.sliceType(go.sliceType(go.id("int"))),
        elts: [
          { kind: "CompositeLit", elts: [go.int(1)] } as go.CompositeLit,
          { kind: "CompositeLit", elts: [go.int(2)] } as go.CompositeLit,
        ],
      } as go.CompositeLit),
    ).toBe("[][]int{\n\t{\n\t\t1,\n\t},\n\t{\n\t\t2,\n\t},\n}");
  });
});

describe("printExpr — KeyValueExpr", () => {
  it("prints key: value", () => {
    expect(printExprStr(go.kv("key", go.id("value")))).toBe("key: value");
  });
});

describe("printExpr — IndexExpr", () => {
  it("prints a[i]", () => {
    expect(printExprStr(go.index(go.id("a"), go.int(0)))).toBe("a[0]");
  });
});

describe("printExpr — SliceExpr", () => {
  it("prints a[low:high]", () => {
    expect(printExprStr(go.sliceExpr(go.id("a"), go.int(0), go.int(5)))).toBe("a[0:5]");
  });

  it("prints a[:high]", () => {
    expect(printExprStr(go.sliceExpr(go.id("a"), undefined, go.int(5)))).toBe("a[:5]");
  });

  it("prints a[low:]", () => {
    expect(printExprStr(go.sliceExpr(go.id("a"), go.int(0)))).toBe("a[0:]");
  });

  it("prints a[:]", () => {
    expect(printExprStr(go.sliceExpr(go.id("a")))).toBe("a[:]");
  });

  it("prints a[low:high:max]", () => {
    expect(
      printExprStr({
        kind: "SliceExpr",
        x: go.id("a"),
        low: go.int(0),
        high: go.int(5),
        max: go.int(10),
      } as go.SliceExpr),
    ).toBe("a[0:5:10]");
  });
});

describe("printExpr — TypeAssertExpr", () => {
  it("prints x.(Type)", () => {
    expect(printExprStr(go.typeAssert(go.id("x"), go.id("Type")))).toBe("x.(Type)");
  });

  it("prints x.(type)", () => {
    expect(printExprStr(go.typeAssert(go.id("x")))).toBe("x.(type)");
  });
});

describe("printExpr — FuncLit", () => {
  it("prints func() { ... }", () => {
    expect(
      printExprStr(
        go.funcLit(
          go.funcType([go.field(["x"], go.id("int"))], [go.field([], go.id("int"))]),
          go.block(go.return_(go.id("x"))),
        ),
      ),
    ).toBe("func(x int) int {\n\treturn x\n}\n");
  });
});

describe("printExpr — depth propagation", () => {
  it("CompositeLit inside return at depth 1 indents correctly", () => {
    const sb = new go.StringBuilder();
    go.printStatement(
      sb,
      go.return_({
        kind: "CompositeLit",
        type: go.id("Foo"),
        elts: [go.kv("a", go.int(1))],
      } as go.CompositeLit),
      1,
    );
    expect(sb.toString()).toBe("\treturn Foo{\n\t\ta: 1,\n\t}\n");
  });
});

describe("printExpr — precedence edge cases", () => {
  it("star of selector: *a.b (star binds looser than selector)", () => {
    expect(printExprStr(go.star(go.sel(go.id("a"), "b")))).toBe("*a.b");
  });

  it("selector of star: (*a).b (selector needs parens around star)", () => {
    expect(printExprStr(go.sel(go.star(go.id("a")), "b"))).toBe("(*a).b");
  });
});
