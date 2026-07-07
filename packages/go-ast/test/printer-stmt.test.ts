import { describe, it, expect } from "vitest";
import * as go from "../src/index.js";

function body(...stmts: go.Statement[]): string {
  const f = go.file("main", go.function_("foo", [], undefined, go.block(...stmts)));
  return go.printFile(f);
}

const x = go.id("x");
const y = go.id("y");
const a = go.id("a");
const b = go.id("b");

/* ─── ReturnStmt ─────────────────────────────── */

describe("ReturnStmt", () => {
  it("return", () => {
    expect(body(go.return_())).toBe("package main\n\nfunc foo() {\n\treturn\n}\n");
  });

  it("return x", () => {
    expect(body(go.return_(x))).toBe("package main\n\nfunc foo() {\n\treturn x\n}\n");
  });

  it("return x, y", () => {
    expect(body(go.return_(x, y))).toBe("package main\n\nfunc foo() {\n\treturn x, y\n}\n");
  });
});

/* ─── AssignStmt ─────────────────────────────── */

describe("AssignStmt", () => {
  it("x = y", () => {
    expect(body(go.assign(x, "=", y))).toBe("package main\n\nfunc foo() {\n\tx = y\n}\n");
  });

  it("x := y", () => {
    expect(body(go.assign(x, ":=", y))).toBe("package main\n\nfunc foo() {\n\tx := y\n}\n");
  });

  it("x += y", () => {
    expect(body(go.assign(x, "+=", y))).toBe("package main\n\nfunc foo() {\n\tx += y\n}\n");
  });

  it("x, y = a, b", () => {
    expect(body(go.assign([x, y], "=", [a, b]))).toBe(
      "package main\n\nfunc foo() {\n\tx, y = a, b\n}\n",
    );
  });

  it("depth propagation: composite lit on RHS", () => {
    const lit = { kind: "CompositeLit" as const, type: go.id("T"), elts: [go.kv("k", go.int(1))] };
    expect(body(go.def(x, lit as go.Expression))).toBe(
      "package main\n\nfunc foo() {\n\tx := T{\n\t\tk: 1,\n\t}\n}\n",
    );
  });
});

/* ─── ExprStmt ───────────────────────────────── */

describe("ExprStmt", () => {
  it("foo()", () => {
    expect(body(go.expr(go.call("foo")))).toBe("package main\n\nfunc foo() {\n\tfoo()\n}\n");
  });
});

/* ─── IfStmt ─────────────────────────────────── */

describe("IfStmt", () => {
  it("if x {}", () => {
    expect(body(go.ifStmt(x, go.block()))).toBe("package main\n\nfunc foo() {\n\tif x {\n\t}\n}\n");
  });

  it("if x {} else {}", () => {
    expect(body(go.ifStmt(x, go.block(), go.block()))).toBe(
      "package main\n\nfunc foo() {\n\tif x {\n\t} else {\n\t}\n}\n",
    );
  });

  it("if x {} else if y {} else {}", () => {
    expect(body(go.ifStmt(x, go.block(), go.ifStmt(y, go.block(), go.block())))).toBe(
      "package main\n\nfunc foo() {\n\tif x {\n\t} else if y {\n\t} else {\n\t}\n}\n",
    );
  });

  it("if init; cond {}", () => {
    expect(
      body({
        kind: "IfStmt",
        init: go.def(x, go.int(0)),
        cond: go.binary(x, "<", go.int(10)),
        body: go.block(),
      } as go.IfStmt),
    ).toBe("package main\n\nfunc foo() {\n\tif x := 0; x < 10 {\n\t}\n}\n");
  });
});

/* ─── ForStmt ────────────────────────────────── */

describe("ForStmt", () => {
  it("for {}", () => {
    expect(body(go.forStmt(undefined, undefined, undefined, go.block()))).toBe(
      "package main\n\nfunc foo() {\n\tfor {\n\t}\n}\n",
    );
  });

  it("for cond {}", () => {
    expect(body(go.forStmt(undefined, go.binary(x, "<", go.int(10)), undefined, go.block()))).toBe(
      "package main\n\nfunc foo() {\n\tfor x < 10 {\n\t}\n}\n",
    );
  });

  it("for init; cond; post {}", () => {
    expect(
      body(
        go.forStmt(
          go.def(x, go.int(0)),
          go.binary(x, "<", go.int(10)),
          go.incDec(x, "++"),
          go.block(go.expr(go.call("foo"))),
        ),
      ),
    ).toBe("package main\n\nfunc foo() {\n\tfor x := 0; x < 10; x++ {\n\t\tfoo()\n\t}\n}\n");
  });
});

/* ─── RangeStmt ──────────────────────────────── */

describe("RangeStmt", () => {
  it("for k := range m {}", () => {
    expect(body(go.rangeStmt(x, undefined, ":=", go.id("m"), go.block()))).toBe(
      "package main\n\nfunc foo() {\n\tfor x := range m {\n\t}\n}\n",
    );
  });

  it("for k, v := range m {}", () => {
    expect(body(go.rangeStmt(x, y, ":=", go.id("m"), go.block()))).toBe(
      "package main\n\nfunc foo() {\n\tfor x, y := range m {\n\t}\n}\n",
    );
  });

  it("for _, v := range m {}", () => {
    expect(body(go.rangeStmt(undefined, y, ":=", go.id("m"), go.block()))).toBe(
      "package main\n\nfunc foo() {\n\tfor _, y := range m {\n\t}\n}\n",
    );
  });
});

/* ─── GoStmt ─────────────────────────────────── */

describe("GoStmt", () => {
  it("go f()", () => {
    expect(body(go.goStmt(go.call("f")))).toBe("package main\n\nfunc foo() {\n\tgo f()\n}\n");
  });
});

/* ─── DeferStmt ──────────────────────────────── */

describe("DeferStmt", () => {
  it("defer f()", () => {
    expect(body(go.defer(go.call("f")))).toBe("package main\n\nfunc foo() {\n\tdefer f()\n}\n");
  });
});

/* ─── DeclStmt ───────────────────────────────── */

describe("DeclStmt", () => {
  it("var x int", () => {
    expect(body(go.declStmt(go.genDecl("var", go.valueSpec(["x"], go.id("int")))))).toBe(
      "package main\n\nfunc foo() {\n\tvar x int\n}\n",
    );
  });

  it("const x = 1", () => {
    expect(
      body(go.declStmt(go.genDecl("const", go.valueSpec(["x"], undefined, [go.int(1)])))),
    ).toBe("package main\n\nfunc foo() {\n\tconst x = 1\n}\n");
  });
});

/* ─── EmptyStmt ──────────────────────────────── */

describe("EmptyStmt", () => {
  it("prints nothing", () => {
    expect(body({ kind: "EmptyStmt" } as go.Statement)).toBe("package main\n\nfunc foo() {\n}\n");
  });
});

/* ─── IncDecStmt ─────────────────────────────── */

describe("IncDecStmt", () => {
  it("x++", () => {
    expect(body(go.incDec(x, "++"))).toBe("package main\n\nfunc foo() {\n\tx++\n}\n");
  });

  it("x--", () => {
    expect(body(go.incDec(x, "--"))).toBe("package main\n\nfunc foo() {\n\tx--\n}\n");
  });
});

/* ─── BranchStmt ─────────────────────────────── */

describe("BranchStmt", () => {
  it("break", () => {
    expect(body(go.branch("break"))).toBe("package main\n\nfunc foo() {\n\tbreak\n}\n");
  });

  it("continue", () => {
    expect(body(go.branch("continue"))).toBe("package main\n\nfunc foo() {\n\tcontinue\n}\n");
  });

  it("goto label", () => {
    expect(body(go.branch("goto", "label"))).toBe(
      "package main\n\nfunc foo() {\n\tgoto label\n}\n",
    );
  });

  it("fallthrough", () => {
    expect(body(go.branch("fallthrough"))).toBe("package main\n\nfunc foo() {\n\tfallthrough\n}\n");
  });
});

/* ─── LabeledStmt ────────────────────────────── */

describe("LabeledStmt", () => {
  it("label: stmt", () => {
    expect(
      body({
        kind: "LabeledStmt",
        label: "label",
        stmt: go.expr(go.call("foo")),
      } as go.Statement),
    ).toBe("package main\n\nfunc foo() {\n\tlabel:\n\tfoo()\n}\n");
  });
});

/* ─── SendStmt ───────────────────────────────── */

describe("SendStmt", () => {
  it("ch <- v", () => {
    expect(
      body({
        kind: "SendStmt",
        chan: go.id("ch"),
        value: go.id("v"),
      } as go.Statement),
    ).toBe("package main\n\nfunc foo() {\n\tch <- v\n}\n");
  });
});

/* ─── SwitchStmt ─────────────────────────────── */

describe("SwitchStmt", () => {
  it("switch x { case 1: ... default: ... }", () => {
    expect(
      body(
        go.switchStmt(
          undefined,
          x,
          go.caseClause([go.int(1)], go.expr(go.call("foo"))),
          go.defaultClause(go.expr(go.call("bar"))),
        ),
      ),
    ).toBe(
      "package main\n\nfunc foo() {\n\tswitch x {\n\tcase 1:\n\t\tfoo()\n\tdefault:\n\t\tbar()\n\t}\n}\n",
    );
  });

  it("switch { case x > 0: ... }", () => {
    expect(
      body(
        go.switchStmt(
          undefined,
          undefined,
          go.caseClause([go.binary(x, ">", go.int(0))], go.expr(go.call("foo"))),
        ),
      ),
    ).toBe("package main\n\nfunc foo() {\n\tswitch {\n\tcase x > 0:\n\t\tfoo()\n\t}\n}\n");
  });

  it("switch x := y; x { ... }", () => {
    expect(
      body(
        go.switchStmt(
          go.def(x, go.id("y")),
          x,
          go.caseClause([go.int(1)], go.expr(go.call("foo"))),
        ),
      ),
    ).toBe("package main\n\nfunc foo() {\n\tswitch x := y; x {\n\tcase 1:\n\t\tfoo()\n\t}\n}\n");
  });
});

/* ─── TypeSwitchStmt ─────────────────────────── */

describe("TypeSwitchStmt", () => {
  it("switch x := y.(type) { case int: ... }", () => {
    expect(
      body({
        kind: "TypeSwitchStmt",
        assign: go.assign([x], ":=", [go.typeAssert(go.id("y"))]),
        body: { kind: "BlockStmt", list: [go.caseClause([go.id("int")], go.expr(go.call("foo")))] },
      } as go.Statement),
    ).toBe(
      "package main\n\nfunc foo() {\n\tswitch x := y.(type) {\n\tcase int:\n\t\tfoo()\n\t}\n}\n",
    );
  });
});

/* ─── SelectStmt ─────────────────────────────── */

describe("SelectStmt", () => {
  it("select { case v := <-ch: ... default: ... }", () => {
    expect(
      body({
        kind: "SelectStmt",
        body: {
          kind: "BlockStmt",
          list: [
            {
              kind: "CommClause",
              comm: go.assign([x], ":=", [go.typeAssert(go.id("ch"))]) as unknown as go.Statement,
              body: [go.expr(go.call("fmt.Println", x))],
            },
            {
              kind: "CommClause",
              comm: null as unknown as go.Statement,
              body: [go.expr(go.call("fmt.Println", go.str("default")))],
            },
          ],
        },
      } as go.Statement),
    ).toBe(
      'package main\n\nfunc foo() {\n\tselect {\n\tcase x := ch.(type):\n\t\tfmt.Println(x)\n\tdefault:\n\t\tfmt.Println("default")\n\t}\n}\n',
    );
  });
});

/* ─── CaseClause (indirect via switch) ───────── */

describe("CaseClause", () => {
  it("case 1, 2: body indented", () => {
    expect(
      body(
        go.switchStmt(undefined, x, go.caseClause([go.int(1), go.int(2)], go.expr(go.call("foo")))),
      ),
    ).toBe("package main\n\nfunc foo() {\n\tswitch x {\n\tcase 1, 2:\n\t\tfoo()\n\t}\n}\n");
  });
});

/* ─── Depth/indentation ──────────────────────── */

describe("depth / indentation", () => {
  it("multi-level nesting: func > if > for > return", () => {
    expect(
      body(
        go.ifStmt(
          x,
          go.block(go.forStmt(undefined, y, undefined, go.block(go.return_(go.int(42))))),
        ),
      ),
    ).toBe("package main\n\nfunc foo() {\n\tif x {\n\t\tfor y {\n\t\t\treturn 42\n\t\t}\n\t}\n}\n");
  });
});
