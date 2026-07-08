import { describe, it, expect } from "vitest";
import * as go from "../src/index.js";

describe("@schemago/goast", () => {
  it("builds a simple struct and prints it", () => {
    const f = go.file(
      "entity",
      go.genDecl("import", go.importSpec("time")),
      go.genDecl(
        "type",
        go.typeSpec(
          "User",
          go.structType(
            go.field(["ID"], go.id("string"), go.tag({ json: "id" })),
            go.field(["Name"], go.id("string"), go.tag({ json: "name" })),
            go.field(["Age"], go.id("int")),
          ),
        ),
      ),
    );

    const source = go.printFile(f);
    expect(source).toContain("package entity");
    expect(source).toContain("type User struct {");
    expect(source).toContain(`ID string`);
    expect(source).toContain("Name string");
    expect(source).toContain("Age int");
  });

  it("builds a function declaration and prints it", () => {
    const fn = go.function_(
      "NewHandler",
      [go.field(["name"], go.id("string"))],
      [go.field([], go.star(go.qual("handler", "Handler")))],
      go.block(go.return_(go.addr(go.elt(go.id("Handler"), go.kv("name", go.id("name")))))),
    );

    const f = go.file("handler", fn);
    const source = go.printFile(f);
    expect(source).toContain("func NewHandler(name string) *handler.Handler {");
    expect(source).toContain("return &Handler{");
    expect(source).toContain("\t\tname: name,");
  });

  it("builds a method with receiver", () => {
    const m = go.method(
      go.field(["h"], go.star(go.id("Handler"))),
      "Serve",
      [go.field([], go.id("string"))],
      undefined,
      go.block(go.return_(go.str("ok"))),
    );

    const f = go.file("handler", m);
    const source = go.printFile(f);
    expect(source).toContain("func (h *Handler) Serve(string) {");
  });

  it("generates a Gin-style handler", () => {
    const handler = go.function_(
      "GetUser",
      [go.field(["c"], go.star(go.qual("gin", "Context")))],
      undefined,
      go.block(
        go.def(
          [go.id("input")],
          [go.call(go.sel(go.id("c"), "ShouldBindQuery"), go.addr(go.id("input")))],
        ),
        go.ifStmt(
          go.binary(go.id("input"), "==", go.id("nil")),
          go.block(
            go.expr(go.call(go.sel(go.id("c"), "JSON"), go.int(400), go.qual("gin", "H"))),
            go.return_(),
          ),
        ),
        go.return_(go.call(go.sel(go.id("h"), "usecase"), go.id("input"))),
      ),
    );

    const f = go.file(
      "handler",
      go.genDecl("import", go.importSpec("github.com/gin-gonic/gin")),
      handler,
    );

    const source = go.printFile(f);
    expect(source).toContain("func GetUser(c *gin.Context)");
    expect(source).toContain("input := c.ShouldBindQuery(&input)");
  });

  it("walks and finds nodes", () => {
    const f = go.file(
      "test",
      go.genDecl(
        "type",
        go.typeSpec("Foo", go.structType(go.field(["x"], go.id("string")))),
        go.typeSpec("Bar", go.structType(go.field(["y"], go.id("int")))),
      ),
    );

    const structs = go.find(f, "StructType");
    expect(structs).toHaveLength(2);
  });

  it("transforms node tree", () => {
    const f = go.file(
      "test",
      go.genDecl("type", go.typeSpec("User", go.structType(go.field(["Name"], go.id("string"))))),
    );

    const result = go.transform(f, {
      leave: (node) => {
        if (node.kind === "Field") {
          return go.field(["Name", "Age"], go.id("string"));
        }
        return node;
      },
    });

    const source = go.printFile(result as go.File);
    expect(source).toContain("Name, Age string");
  });

  it("parses and serializes tags", () => {
    const tag = go.tag({ json: "name,omitempty", gorm: "column:name" });
    expect(tag).toBe(`json:"name,omitempty" gorm:"column:name"`);

    const parsed = go.parseTag(tag);
    expect(parsed.json).toBe("name,omitempty");
    expect(parsed.gorm).toBe("column:name");

    const set = go.setTag(tag, "binding", "required");
    expect(set).toContain(`binding:"required"`);
  });
});
