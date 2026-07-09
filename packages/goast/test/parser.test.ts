import { describe, it, expect, beforeAll } from "vitest";
import * as go from "../src/index.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { File, FuncDecl, GenDecl, StructType, Field, TypeSpec, ReturnStmt, AssignStmt, IfStmt, RangeStmt, ForStmt, SwitchStmt, CallExpr, CompositeLit, Ident, BasicLit } from "../src/nodes.js";

const TEST_BINARY = join(import.meta.dirname, "..", "tools", "decl-parser", "decl-parser");

let parser: go.GoParser;

beforeAll(() => {
  parser = go.createParser(existsSync(TEST_BINARY) ? TEST_BINARY : undefined);
});

function skipIfNoParser() {
  if (!parser.hasParser()) {
    console.warn("Skipping: decl-parser binary not found. Build with: cd tools/decl-parser && go build -o decl-parser .");
  }
  return !parser.hasParser();
}

describe("parseSource — basic constructs", () => {
  const simpleSrc = `package foo

import "fmt"

type User struct {
  Name string \`json:"name"\`
  Age  int
}

func Greet(name string) string {
  return fmt.Sprint("Hello, ", name)
}
`;

  it("parses a simple file and returns a File node", () => {
    if (skipIfNoParser()) return;
    const result = parser.parse(simpleSrc);
    if (result.kind === "ParseError") {
      expect.fail(result.message);
    }
    expect(result.file.kind).toBe("File");
    expect(result.file.packageName).toBe("foo");
  });

  it("extracts imports", () => {
    if (skipIfNoParser()) return;
    const result = parser.parse(simpleSrc);
    if (result.kind === "ParseError") expect.fail(result.message);
    expect(result.file.imports).toHaveLength(1);
    expect(result.file.imports[0].path).toBe("fmt");
  });

  it("extracts type declarations", () => {
    if (skipIfNoParser()) return;
    const result = parser.parse(simpleSrc);
    if (result.kind === "ParseError") expect.fail(result.message);
    const decls = result.file.decls;
    expect(decls.length).toBeGreaterThanOrEqual(1);

    const genDecl = decls.find((d): d is GenDecl => d.kind === "GenDecl" && d.token === "type");
    expect(genDecl).toBeDefined();
    if (!genDecl) return;

    const typeSpec = genDecl.specs[0];
    if (typeSpec.kind !== "TypeSpec") { expect.fail("expected TypeSpec"); return; }
    expect(typeSpec.name).toBe("User");
    expect(typeSpec.type.kind).toBe("StructType");

    const st = typeSpec.type as StructType;
    expect(st.fields).toHaveLength(2);
    expect(st.fields[0].names).toEqual(["Name"]);
    expect(st.fields[0].type.kind).toBe("Ident");
    expect((st.fields[0].type as Ident).name).toBe("string");
    expect(st.fields[0].tag).toContain("json");
  });

  it("parses functions with params and return types", () => {
    if (skipIfNoParser()) return;
    const result = parser.parse(simpleSrc);
    if (result.kind === "ParseError") expect.fail(result.message);
    const funcDecl = result.file.decls.find((d): d is FuncDecl => d.kind === "FuncDecl");
    expect(funcDecl).toBeDefined();
    if (!funcDecl) return;

    expect(funcDecl.name).toBe("Greet");
    expect(funcDecl.type.params).toHaveLength(1);
    expect(funcDecl.type.params[0].names).toEqual(["name"]);
    expect(funcDecl.type.params[0].type.kind).toBe("Ident");
    expect((funcDecl.type.params[0].type as Ident).name).toBe("string");
    expect(funcDecl.type.results).toHaveLength(1);
    expect(funcDecl.body).toBeDefined();
  });

  it("round-trips: parse to AST, print back", () => {
    if (skipIfNoParser()) return;
    const result = parser.parse(simpleSrc);
    if (result.kind === "ParseError") expect.fail(result.message);

    const printed = go.printFile(result.file);
    expect(printed).toContain("package foo");
    expect(printed).toContain('import "fmt"');
    expect(printed).toContain("type User struct");
    expect(printed).toContain("Name string");
    expect(printed).toContain("Age int");
    expect(printed).toContain("func Greet(name string) string {");
    expect(printed).toContain("return");
    expect(printed).toContain("fmt.Sprint");
  });
});

describe("parseSource — methods", () => {
  const methodSrc = `package handler

import "net/http"

type Handler struct{}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
  w.Write([]byte("ok"))
}
`;

  it("parses method with receiver", () => {
    if (skipIfNoParser()) return;
    const result = parser.parse(methodSrc);
    if (result.kind === "ParseError") expect.fail(result.message);

    const funcDecl = result.file.decls.find((d): d is FuncDecl => d.kind === "FuncDecl");
    expect(funcDecl).toBeDefined();
    if (!funcDecl) return;

    expect(funcDecl.name).toBe("ServeHTTP");
    expect(funcDecl.recv).toBeDefined();
    expect(funcDecl.recv!.names).toEqual(["h"]);
    expect(funcDecl.recv!.type.kind).toBe("StarExpr");
    expect(funcDecl.type.params).toHaveLength(2);
    expect(funcDecl.body).toBeDefined();
  });
});

describe("parseSource — control flow", () => {
  const ctrlSrc = `package control

func example(x int) string {
  if x > 0 {
    return "positive"
  } else {
    return "non-positive"
  }
}

func loop() {
  for i := 0; i < 10; i++ {
    println(i)
  }
}

func iterate(items []string) {
  for _, item := range items {
    if item == "" {
      continue
    }
    println(item)
  }
}
`;

  it("parses if/else", () => {
    if (skipIfNoParser()) return;
    const result = parser.parse(ctrlSrc);
    if (result.kind === "ParseError") expect.fail(result.message);

    const funcDecl = result.file.decls.find((d): d is FuncDecl => d.kind === "FuncDecl" && d.name === "example");
    expect(funcDecl).toBeDefined();
    if (!funcDecl || !funcDecl.body) return;

    const ifStmt = funcDecl.body.list[0] as IfStmt;
    expect(ifStmt.kind).toBe("IfStmt");
    expect(ifStmt.cond.kind).toBe("BinaryExpr");
    expect(ifStmt.elseStmt).toBeDefined();
  });

  it("parses for loop with init/cond/post", () => {
    if (skipIfNoParser()) return;
    const result = parser.parse(ctrlSrc);
    if (result.kind === "ParseError") expect.fail(result.message);

    const funcDecl = result.file.decls.find((d): d is FuncDecl => d.kind === "FuncDecl" && d.name === "loop");
    expect(funcDecl).toBeDefined();
    if (!funcDecl || !funcDecl.body) return;

    const forStmt = funcDecl.body.list[0] as ForStmt;
    expect(forStmt.kind).toBe("ForStmt");
    expect(forStmt.init).toBeDefined();
    expect(forStmt.cond).toBeDefined();
    expect(forStmt.post).toBeDefined();
  });

  it("parses range loop", () => {
    if (skipIfNoParser()) return;
    const result = parser.parse(ctrlSrc);
    if (result.kind === "ParseError") expect.fail(result.message);

    const funcDecl = result.file.decls.find((d): d is FuncDecl => d.kind === "FuncDecl" && d.name === "iterate");
    expect(funcDecl).toBeDefined();
    if (!funcDecl || !funcDecl.body) return;

    const rangeStmt = funcDecl.body.list[0] as RangeStmt;
    expect(rangeStmt.kind).toBe("RangeStmt");
    expect(rangeStmt.key).toBeDefined();
    expect(rangeStmt.key!.kind).toBe("Ident");
    expect((rangeStmt.key! as Ident).name).toBe("_");
    expect(rangeStmt.value).toBeDefined();
    expect(rangeStmt.token).toBe(":=");
  });
});

describe("parseSource — switch and defer", () => {
  const switchSrc = `package sw

import "fmt"

func handle(code int) {
  switch code {
  case 200:
    fmt.Println("ok")
  default:
    fmt.Println("error")
  }
}

func cleanup() {
  defer fmt.Println("done")
}
`;

  it("parses switch statement", () => {
    if (skipIfNoParser()) return;
    const result = parser.parse(switchSrc);
    if (result.kind === "ParseError") expect.fail(result.message);

    const funcDecl = result.file.decls.find((d): d is FuncDecl => d.kind === "FuncDecl" && d.name === "handle");
    expect(funcDecl).toBeDefined();
    if (!funcDecl || !funcDecl.body) return;

    const switchStmt = funcDecl.body.list[0] as SwitchStmt;
    expect(switchStmt.kind).toBe("SwitchStmt");
    expect(switchStmt.tag).toBeDefined();
    expect(switchStmt.body.list.length).toBeGreaterThanOrEqual(1);
  });

  it("parses defer statement", () => {
    if (skipIfNoParser()) return;
    const result = parser.parse(switchSrc);
    if (result.kind === "ParseError") expect.fail(result.message);

    const funcDecl = result.file.decls.find((d): d is FuncDecl => d.kind === "FuncDecl" && d.name === "cleanup");
    expect(funcDecl).toBeDefined();
    if (!funcDecl || !funcDecl.body) return;

    const deferStmt = funcDecl.body.list[0];
    expect(deferStmt.kind).toBe("DeferStmt");
  });
});

describe("parseSource — grouped imports and multi-spec", () => {
  const importSrc = `package multi

import (
  "fmt"
  "os"
)

var (
  x = 1
  y = 2
)
`;

  it("parses grouped imports", () => {
    if (skipIfNoParser()) return;
    const result = parser.parse(importSrc);
    if (result.kind === "ParseError") expect.fail(result.message);

    expect(result.file.imports).toHaveLength(2);
  });

  it("parses var declarations", () => {
    if (skipIfNoParser()) return;
    const result = parser.parse(importSrc);
    if (result.kind === "ParseError") expect.fail(result.message);

    const genDecl = result.file.decls.find((d): d is GenDecl => d.kind === "GenDecl" && d.token === "var");
    expect(genDecl).toBeDefined();
    if (!genDecl) return;
    expect(genDecl.specs).toHaveLength(2);
    const spec = genDecl.specs[0];
    if (spec.kind !== "ValueSpec") { expect.fail("expected ValueSpec"); return; }
    expect(spec.names).toEqual(["x"]);
    expect(spec.values).toHaveLength(1);
  });
});

describe("parseSource — error handling", () => {
  it("returns ParseError for invalid Go source", () => {
    if (skipIfNoParser()) return;
    const result = parser.parse("package !invalid");
    expect(result.kind).toBe("ParseError");
  });

  it("parses empty file", () => {
    if (skipIfNoParser()) return;
    const result = parser.parse("package empty\n");
    if (result.kind === "ParseError") expect.fail(result.message);
    expect(result.file.decls).toHaveLength(0);
    expect(result.file.imports).toHaveLength(0);
  });
});

describe("parseSource — ParseResult includes File", () => {
  it("exposes the file node", () => {
    if (skipIfNoParser()) return;
    const result = parser.parse("package pkg\nconst a = 1");
    if (result.kind === "ParseError") expect.fail(result.message);
    expect(result.file).toBeDefined();
    expect(result.file.kind).toBe("File");
  });
});
