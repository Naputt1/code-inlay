import { describe, it, expect } from "vitest";
import * as go from "../src/index.js";

describe("printer – file / declarations / comments", () => {
  /* ═══════════════════════════════════════════════════════════
     Imports
     ═══════════════════════════════════════════════════════════ */

  describe("imports", () => {
    it('single import – import "fmt"', () => {
      const f = go.file("main", go.genDecl("import", go.importSpec("fmt")));
      // printFile: package\n\n + import "fmt"\n + separator \n
      expect(go.printFile(f)).toBe('package main\n\nimport "fmt"\n\n');
    });

    it('single import with alias – import alias "fmt"', () => {
      const f = go.file("main", go.genDecl("import", go.importSpec("fmt", "alias")));
      expect(go.printFile(f)).toBe('package main\n\nimport alias "fmt"\n\n');
    });

    it("multiple imports (paren-grouped)", () => {
      const f = go.file("main", go.genDecl("import", go.importSpec("fmt"), go.importSpec("os")));
      // printImports produces "import (\n\t...\n\t...\n)" then separator \n
      expect(go.printFile(f)).toBe('package main\n\nimport (\n\t"fmt"\n\t"os"\n)\n\n');
    });

    it("mixed named imports", () => {
      const f = go.file(
        "main",
        go.genDecl("import", go.importSpec("bar", "foo"), go.importSpec("baz")),
      );
      expect(go.printFile(f)).toBe('package main\n\nimport (\n\tfoo "bar"\n\t"baz"\n)\n\n');
    });

    it("no imports – no decls", () => {
      const f = go.file("main");
      expect(go.printFile(f)).toBe("package main\n\n");
    });
  });

  /* ═══════════════════════════════════════════════════════════
     Type declarations
     ═══════════════════════════════════════════════════════════ */

  describe("type declarations", () => {
    it("single type decl – type Foo struct { … }", () => {
      const f = go.file(
        "main",
        go.genDecl("type", go.typeSpec("Foo", go.structType(go.field(["Bar"], go.id("int"))))),
      );
      expect(go.printFile(f)).toBe("package main\n\ntype Foo struct {\n\tBar int\n}\n");
    });

    it("multiple type decls (paren-grouped)", () => {
      const f = go.file(
        "main",
        go.genDecl(
          "type",
          go.typeSpec("Foo", go.structType()),
          go.typeSpec("Bar", go.structType()),
        ),
      );
      expect(go.printFile(f)).toBe("package main\n\ntype (\n\tFoo struct{}\n\tBar struct{}\n)\n");
    });

    it("alias type – type Foo = string", () => {
      const f = go.file("main", go.genDecl("type", go.aliasSpec("Foo", go.id("string"))));
      expect(go.printFile(f)).toBe("package main\n\ntype Foo = string\n");
    });

    it("embedded fields – type Foo struct { Bar }", () => {
      const f = go.file(
        "main",
        go.genDecl("type", go.typeSpec("Foo", go.structType(go.embedded(go.id("Bar"))))),
      );
      expect(go.printFile(f)).toBe("package main\n\ntype Foo struct {\n\tBar\n}\n");
    });

    it("empty struct – type Foo struct{}", () => {
      const f = go.file("main", go.genDecl("type", go.typeSpec("Foo", go.structType())));
      expect(go.printFile(f)).toBe("package main\n\ntype Foo struct{}\n");
    });

    it('fields with tags – Name string `json:"name"`', () => {
      const f = go.file(
        "main",
        go.genDecl(
          "type",
          go.typeSpec(
            "Foo",
            go.structType(go.field(["Name"], go.id("string"), go.tag({ json: "name" }))),
          ),
        ),
      );
      expect(go.printFile(f)).toBe(
        'package main\n\ntype Foo struct {\n\tName string `json:"name"`\n}\n',
      );
    });
  });

  /* ═══════════════════════════════════════════════════════════
     Const / var declarations
     ═══════════════════════════════════════════════════════════ */

  describe("const / var declarations", () => {
    it("const block with parens – const (\n\tx = 1\n)", () => {
      const gd = go.genDecl("const", go.valueSpec(["x"], undefined, [go.int(1)]));
      gd.lparen = true;
      const f = go.file("main", gd);
      expect(go.printFile(f)).toBe("package main\n\nconst (\n\tx = 1\n)\n");
    });

    it("var with type – var x int", () => {
      const f = go.file("main", go.genDecl("var", go.valueSpec(["x"], go.id("int"))));
      expect(go.printFile(f)).toBe("package main\n\nvar x int\n");
    });

    it("var with multiple names and type – var x, y int", () => {
      const f = go.file("main", go.genDecl("var", go.valueSpec(["x", "y"], go.id("int"))));
      expect(go.printFile(f)).toBe("package main\n\nvar x, y int\n");
    });

    it("var with value – var x = 1", () => {
      const f = go.file("main", go.genDecl("var", go.valueSpec(["x"], undefined, [go.int(1)])));
      expect(go.printFile(f)).toBe("package main\n\nvar x = 1\n");
    });

    it("var with multiple names and values – var x, y = 1, 2", () => {
      const f = go.file(
        "main",
        go.genDecl("var", go.valueSpec(["x", "y"], undefined, [go.int(1), go.int(2)])),
      );
      expect(go.printFile(f)).toBe("package main\n\nvar x, y = 1, 2\n");
    });
  });

  /* ═══════════════════════════════════════════════════════════
     Function declarations
     ═══════════════════════════════════════════════════════════ */

  describe("function declarations", () => {
    it("generic function – func Foo[T any](x T)", () => {
      const fn = go.funcDecl("Foo", undefined, {
        kind: "FuncType",
        params: [go.field(["x"], go.id("T"))],
        typeParams: [go.field(["T"], go.id("any"))],
      });
      const f = go.file("main", fn);
      expect(go.printFile(f)).toBe("package main\n\nfunc Foo[T any](x T)\n");
    });

    it("generic type – type List[T any] []T", () => {
      const f = go.file(
        "main",
        go.genDecl(
          "type",
          go.typeSpec("List", go.sliceType(go.id("T")), [go.field(["T"], go.id("any"))]),
        ),
      );
      expect(go.printFile(f)).toBe("package main\n\ntype List[T any] []T\n");
    });

    it("method – func (r *Receiver) Method()", () => {
      const m = go.method(go.field(["r"], go.star(go.id("Receiver"))), "Method", [], undefined);
      const f = go.file("main", m);
      expect(go.printFile(f)).toBe("package main\n\nfunc (r *Receiver) Method()\n");
    });
  });

  /* ═══════════════════════════════════════════════════════════
     Multiple declarations — blank lines between sections
     ═══════════════════════════════════════════════════════════ */

  describe("multiple declarations", () => {
    it("blank line between func and type", () => {
      const f = go.file(
        "main",
        go.function_("Foo", [], undefined),
        go.genDecl("type", go.typeSpec("Bar", go.structType())),
      );
      expect(go.printFile(f)).toBe("package main\n\nfunc Foo()\n\ntype Bar struct{}\n");
    });

    it("blank line between type and const", () => {
      const f = go.file(
        "main",
        go.genDecl("type", go.typeSpec("Foo", go.structType())),
        go.genDecl("const", go.valueSpec(["x"], undefined, [go.int(1)])),
      );
      expect(go.printFile(f)).toBe("package main\n\ntype Foo struct{}\n\nconst x = 1\n");
    });
  });

  /* ═══════════════════════════════════════════════════════════
     Comments
     ═══════════════════════════════════════════════════════════ */

  describe("comments", () => {
    it("doc comment on func – // Foo does x\nfunc Foo()", () => {
      const fn = go.function_("Foo", [], undefined);
      fn.doc = go.commentGroup(go.comment("// Foo does x"));
      const f = go.file("main", fn);
      expect(go.printFile(f)).toBe("package main\n\n// Foo does x\nfunc Foo()\n");
    });

    it("doc comment on gen decl – // Foo is a type\ntype Foo struct{}", () => {
      const ts = go.typeSpec("Foo", go.structType());
      const gd = go.genDecl("type", ts);
      gd.doc = go.commentGroup(go.comment("// Foo is a type"));
      const f = go.file("main", gd);
      expect(go.printFile(f)).toBe("package main\n\n// Foo is a type\ntype Foo struct{}\n");
    });

    it("doc comment on type spec in grouped decl", () => {
      const ts = go.typeSpec("Foo", go.structType());
      ts.doc = go.commentGroup(go.comment("// Foo is a type"));
      const gd = go.genDecl("type", ts);
      gd.lparen = true;
      const f = go.file("main", gd);
      expect(go.printFile(f)).toBe(
        "package main\n\ntype (\n\t// Foo is a type\n\tFoo struct{}\n)\n",
      );
    });

    it("comment group on var block spec – // x is a constant", () => {
      const vs = go.valueSpec(["x"], undefined, [go.int(1)]);
      vs.doc = go.commentGroup(go.comment("// x is a constant"));
      const gd = go.genDecl("const", vs);
      gd.lparen = true;
      const f = go.file("main", gd);
      expect(go.printFile(f)).toBe("package main\n\nconst (\n\t// x is a constant\n\tx = 1\n)\n");
    });

    it("line comment on specs in grouped type decl", () => {
      const ts1 = go.typeSpec("Foo", go.structType());
      ts1.doc = go.commentGroup(go.comment("// Foo is a foo"));
      const ts2 = go.typeSpec("Bar", go.structType());
      ts2.doc = go.commentGroup(go.comment("// Bar is a bar"));
      const gd = go.genDecl("type", ts1, ts2);
      const f = go.file("main", gd);
      expect(go.printFile(f)).toBe(
        "package main\n\ntype (\n\t// Foo is a foo\n\tFoo struct{}\n\t// Bar is a bar\n\tBar struct{}\n)\n",
      );
    });

    it("doc comment on gen decl – // Types before type", () => {
      const ts = go.typeSpec("Foo", go.structType());
      const gd = go.genDecl("type", ts);
      gd.doc = go.commentGroup(go.comment("// Types"));
      const f = go.file("main", gd);
      expect(go.printFile(f)).toBe("package main\n\n// Types\ntype Foo struct{}\n");
    });
  });

  /* ═══════════════════════════════════════════════════════════
     Mixed file output
     ═══════════════════════════════════════════════════════════ */

  describe("mixed file", () => {
    it("package, imports, type decls, func decls", () => {
      const f = go.file(
        "main",
        go.genDecl("import", go.importSpec("fmt"), go.importSpec("os")),
        go.genDecl("type", go.typeSpec("Foo", go.structType(go.field(["Bar"], go.id("string"))))),
        go.function_("Baz", [], undefined),
      );
      expect(go.printFile(f)).toBe(
        'package main\n\nimport (\n\t"fmt"\n\t"os"\n)\n\ntype Foo struct {\n\tBar string\n}\n\nfunc Baz()\n',
      );
    });
  });
});
