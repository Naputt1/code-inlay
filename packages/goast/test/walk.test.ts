/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import * as go from "../src/index.js";
import { walk, find, findFirst, transform } from "../src/walk.js";

describe("walk", () => {
  it("visits all nodes in a complex file", () => {
    const f = go.file(
      "main",
      go.genDecl("import", go.importSpec("fmt")),
      go.genDecl("type", go.typeSpec("Point", go.structType(go.field(["X", "Y"], go.id("int"))))),
      go.function_(
        "main",
        [],
        undefined,
        go.block(go.return_(go.call(go.id("fmt.Println"), go.str("hello")))),
      ),
    );

    const visited: string[] = [];
    walk(f, {
      enter: (n) => {
        visited.push(n.kind);
        return "continue";
      },
    });

    expect(visited).toContain("File");
    expect(visited).toContain("GenDecl");
    expect(visited).toContain("ImportSpec");
    expect(visited).toContain("TypeSpec");
    expect(visited).toContain("StructType");
    expect(visited).toContain("Field");
    expect(visited).toContain("Ident");
    expect(visited).toContain("FuncDecl");
    expect(visited).toContain("FuncType");
    expect(visited).toContain("BlockStmt");
    expect(visited).toContain("ReturnStmt");
    expect(visited).toContain("CallExpr");
    expect(visited).toContain("BasicLit");
  });

  it('"skip" action prevents child traversal', () => {
    const f = go.file(
      "main",
      go.function_("foo", [], undefined, go.block(go.return_(go.id("nil")))),
    );

    const visited: string[] = [];
    walk(f, {
      enter: (n) => {
        visited.push(n.kind);
        if (n.kind === "FuncDecl") return "skip";
        return "continue";
      },
    });

    expect(visited).toContain("File");
    expect(visited).toContain("FuncDecl");
    expect(visited).not.toContain("FuncType");
    expect(visited).not.toContain("BlockStmt");
    expect(visited).not.toContain("ReturnStmt");
    expect(visited).not.toContain("Ident");
  });

  it('"stop" action halts traversal', () => {
    const f = go.file(
      "main",
      go.function_("foo", [], undefined, go.block(go.return_(go.id("one")))),
      go.function_("bar", [], undefined, go.block(go.return_(go.id("two")))),
    );

    const visited: string[] = [];
    walk(f, {
      enter: (n) => {
        visited.push(n.kind);
        if (n.kind === "Ident" && n.name === "one") return "stop";
        return "continue";
      },
    });

    expect(visited).toContain("Ident");
    expect(visited.filter((k) => k === "FuncDecl").length).toBe(1);
    expect(visited.filter((k) => k === "BlockStmt").length).toBe(1);
  });

  it("leave callback is called after children", () => {
    let enterCount = 0;
    let leaveCount = 0;

    const f = go.file("main", go.function_("foo", [], undefined, go.block(go.return_(go.id("x")))));

    walk(f, {
      enter: () => {
        enterCount++;
        return "continue";
      },
      leave: () => {
        leaveCount++;
      },
    });

    expect(enterCount).toBeGreaterThanOrEqual(leaveCount);
    expect(enterCount).toBe(leaveCount);
  });
});

describe("find", () => {
  it("returns all matches", () => {
    const f = go.file(
      "test",
      go.genDecl(
        "type",
        go.typeSpec("A", go.structType(go.field(["X"], go.id("int")))),
        go.typeSpec("B", go.structType(go.field(["Y"], go.id("int")))),
        go.typeSpec("C", go.structType(go.field(["Z"], go.id("int")))),
      ),
    );

    const structs = find(f, "StructType");
    expect(structs).toHaveLength(3);
  });

  it("returns empty array for non-matching kind", () => {
    const f = go.file(
      "test",
      go.genDecl("type", go.typeSpec("A", go.structType(go.field(["X"], go.id("int"))))),
    );

    const chans = find(f, "ChanType");
    expect(chans).toEqual([]);
  });
});

describe("findFirst", () => {
  it("returns the first match", () => {
    const f = go.file(
      "test",
      go.genDecl(
        "type",
        go.typeSpec("A", go.structType(go.field(["X"], go.id("int")))),
        go.typeSpec("B", go.structType(go.field(["Y"], go.id("int")))),
      ),
    );

    const first = findFirst(f, "StructType");
    expect(first).toBeDefined();
    expect(first!.kind).toBe("StructType");
    expect((first as any).fields[0].names[0]).toBe("X");
  });

  it("returns undefined when no match", () => {
    const f = go.file(
      "test",
      go.genDecl("type", go.typeSpec("A", go.structType(go.field(["X"], go.id("int"))))),
    );

    const result = findFirst(f, "ChanType");
    expect(result).toBeUndefined();
  });
});

describe("transform", () => {
  it("replaces node via leave", () => {
    const f = go.file(
      "test",
      go.genDecl("type", go.typeSpec("User", go.structType(go.field(["Name"], go.id("string"))))),
    );

    const result = transform(f, {
      leave: (node) => {
        if (node.kind === "Field") {
          return go.field(["Name"], go.id("int"));
        }
        return node;
      },
    }) as go.File;

    const fields = find(result, "Field");
    expect(fields[0].type.kind).toBe("Ident");
    expect((fields[0].type as go.Ident).name).toBe("int");

    const originalFields = find(f, "Field");
    expect(originalFields[0].type.kind).toBe("Ident");
    expect((originalFields[0].type as go.Ident).name).toBe("string");
  });

  it("removes node via null on leave", () => {
    const f = go.file(
      "test",
      go.genDecl(
        "type",
        go.typeSpec(
          "User",
          go.structType(go.field(["Name"], go.id("string")), go.field(["Age"], go.id("int"))),
        ),
      ),
    );

    const result = transform(f, {
      leave: (node) => {
        if (node.kind === "Field" && (node as any).names[0] === "Age") return null;
        return node;
      },
    }) as go.File;

    const fields = find(result, "Field");
    expect(fields).toHaveLength(1);
    expect(fields[0].names[0]).toBe("Name");

    const originalFields = find(f, "Field");
    expect(originalFields).toHaveLength(2);
  });

  it("replaces node via enter, skipping original children", () => {
    const replaced = go.block(go.return_(go.id("replaced")));

    const f = go.file(
      "main",
      go.function_("foo", [], undefined, go.block(go.return_(go.id("original")))),
    );

    const result = transform(f, {
      enter: (node) => {
        if (node.kind === "BlockStmt") {
          return replaced;
        }
        return node;
      },
    }) as go.File;

    const returns = find(result, "ReturnStmt");
    expect(returns).toHaveLength(1);
    const idents = find(result, "Ident");
    const identNames = idents.map((i) => i.name);
    expect(identNames).toContain("replaced");
    expect(identNames).not.toContain("original");
  });

  it("preserves non-traversed leaf nodes unchanged", () => {
    const f = go.file(
      "main",
      go.function_("foo", [], undefined, go.block(go.return_(go.id("x"), go.int(42)))),
    );

    const result = transform(f, {}) as go.File;

    const source1 = JSON.stringify(f);
    const source2 = JSON.stringify(result);
    expect(source2).toBe(source1);
  });
});

describe("walk covers all node kinds", () => {
  it("SendStmt", () => {
    const f = go.file(
      "main",
      go.function_(
        "foo",
        [],
        undefined,
        go.block({
          kind: "SendStmt",
          chan: go.id("ch"),
          value: go.int(1),
        }),
      ),
    );
    const visited: string[] = [];
    walk(f, {
      enter: (n) => {
        visited.push(n.kind);
        return "continue";
      },
    });
    expect(visited).toContain("SendStmt");
    expect(visited).toContain("Ident");
    expect(visited).toContain("BasicLit");
  });

  it("SelectStmt and CommClause", () => {
    const f = go.file(
      "main",
      go.function_(
        "foo",
        [],
        undefined,
        go.block({
          kind: "SelectStmt",
          body: {
            kind: "BlockStmt",
            list: [
              {
                kind: "CommClause",
                comm: { kind: "SendStmt", chan: go.id("ch"), value: go.int(1) },
                body: [],
              },
            ],
          },
        }),
      ),
    );
    const visited: string[] = [];
    walk(f, {
      enter: (n) => {
        visited.push(n.kind);
        return "continue";
      },
    });
    expect(visited).toContain("SelectStmt");
    expect(visited).toContain("CommClause");
    expect(visited).toContain("SendStmt");
  });

  it("LabeledStmt", () => {
    const f = go.file(
      "main",
      go.function_(
        "foo",
        [],
        undefined,
        go.block({
          kind: "LabeledStmt",
          label: "loop",
          stmt: go.return_(go.id("x")),
        }),
      ),
    );
    const visited: string[] = [];
    walk(f, {
      enter: (n) => {
        visited.push(n.kind);
        return "continue";
      },
    });
    expect(visited).toContain("LabeledStmt");
    expect(visited).toContain("ReturnStmt");
    expect(visited).toContain("Ident");
  });

  it("BranchStmt", () => {
    const f = go.file("main", go.function_("foo", [], undefined, go.block(go.branch("break"))));
    const visited: string[] = [];
    walk(f, {
      enter: (n) => {
        visited.push(n.kind);
        return "continue";
      },
    });
    expect(visited).toContain("BranchStmt");
  });

  it("MapType", () => {
    const f = go.file(
      "main",
      go.genDecl("type", go.typeSpec("M", go.mapType(go.id("string"), go.id("int")))),
    );
    const visited: string[] = [];
    walk(f, {
      enter: (n) => {
        visited.push(n.kind);
        return "continue";
      },
    });
    expect(visited).toContain("MapType");
    expect(visited).toContain("Ident");
  });

  it("ArrayType", () => {
    const f = go.file(
      "main",
      go.genDecl("type", go.typeSpec("Arr", go.array(go.int(5), go.id("int")))),
    );
    const visited: string[] = [];
    walk(f, {
      enter: (n) => {
        visited.push(n.kind);
        return "continue";
      },
    });
    expect(visited).toContain("ArrayType");
    expect(visited).toContain("BasicLit");
    expect(visited).toContain("Ident");
  });

  it("SliceType", () => {
    const f = go.file("main", go.genDecl("type", go.typeSpec("S", go.sliceType(go.id("byte")))));
    const visited: string[] = [];
    walk(f, {
      enter: (n) => {
        visited.push(n.kind);
        return "continue";
      },
    });
    expect(visited).toContain("SliceType");
    expect(visited).toContain("Ident");
  });

  it("ChanType", () => {
    const f = go.file("main", go.genDecl("type", go.typeSpec("Ch", go.chan("both", go.id("int")))));
    const visited: string[] = [];
    walk(f, {
      enter: (n) => {
        visited.push(n.kind);
        return "continue";
      },
    });
    expect(visited).toContain("ChanType");
    expect(visited).toContain("Ident");
  });

  it("FuncLit with type and body", () => {
    const f = go.file(
      "main",
      go.genDecl(
        "var",
        go.valueSpec(
          ["fn"],
          go.funcLit(
            go.funcType([go.field(["x"], go.id("int"))], [go.field([], go.id("int"))]),
            go.block(go.return_(go.id("x"))),
          ),
        ),
      ),
    );
    const visited: string[] = [];
    walk(f, {
      enter: (n) => {
        visited.push(n.kind);
        return "continue";
      },
    });
    expect(visited).toContain("FuncLit");
    expect(visited).toContain("FuncType");
    expect(visited).toContain("BlockStmt");
    expect(visited).toContain("ReturnStmt");
    expect(visited).toContain("Ident");
  });

  it("CompositeLit visits elts", () => {
    const f = go.file(
      "main",
      go.genDecl("var", go.valueSpec(["v"], go.elt(go.id("T"), go.kv("key", go.str("val"))))),
    );
    const visited: string[] = [];
    walk(f, {
      enter: (n) => {
        visited.push(n.kind);
        return "continue";
      },
    });
    expect(visited).toContain("CompositeLit");
    expect(visited).toContain("KeyValueExpr");
    expect(visited).toContain("Ident");
    expect(visited).toContain("BasicLit");
  });
});
