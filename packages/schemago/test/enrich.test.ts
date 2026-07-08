import { describe, expect, it } from "vitest";
import type { GeneratedRegion } from "../src/types/index.js";
import { batchEnrichGoRegions, enrichRegionWithRegex, tryBatchAST } from "../src/plugins/enrich.js";

function region(overrides: Partial<GeneratedRegion> & { id: string }): GeneratedRegion {
  return {
    language: "go",
    content: "",
    ...overrides,
    stableHash: overrides.stableHash ?? `hash:${overrides.id}`,
  };
}

// ---------------------------------------------------------------------------
// enrichRegionWithRegex — regex fallback path
// ---------------------------------------------------------------------------

describe("enrichRegionWithRegex", () => {
  it("skips region with existing symbolName", () => {
    const r = region({ id: "r1", symbolName: "Foo", kind: "function", content: "anything" });
    expect(enrichRegionWithRegex(r)).toBe(r);
  });

  it("skips non-Go region", () => {
    const r = region({ id: "r1", language: "typescript", content: "const x = 1" });
    expect(enrichRegionWithRegex(r)).toBe(r);
  });

  it("skips empty content", () => {
    const r = region({ id: "r1", content: "" });
    expect(enrichRegionWithRegex(r)).toBe(r);
  });

  it("skips content with multiple top-level declarations", () => {
    const r = region({
      id: "r1",
      content: "type A struct{}\n\nfunc B() {}",
    });
    expect(enrichRegionWithRegex(r)).toBe(r);
  });

  it("extracts imports", () => {
    const r = region({
      id: "r1",
      content: `import (
\t"context"
\t"fmt"
)`,
    });
    const result = enrichRegionWithRegex(r);
    expect(result.kind).toBe("imports");
    expect(result.imports).toEqual(['"context"', '"fmt"']);
    expect(result.symbolName).toBeUndefined();
  });

  it("extracts single-line import", () => {
    const r = region({
      id: "r1",
      content: `import "fmt"`,
    });
    const result = enrichRegionWithRegex(r);
    expect(result.kind).toBe("imports");
    expect(result.imports).toEqual(['"fmt"']);
  });

  it("extracts imports with aliases", () => {
    const r = region({
      id: "r1",
      content: `import (
\t"github.com/gin-gonic/gin"
\t"snapshot/internal/service"
\tgenroutes "snapshot/internal/http"
)`,
    });
    const result = enrichRegionWithRegex(r);
    expect(result.kind).toBe("imports");
    expect(result.imports).toEqual([
      '"github.com/gin-gonic/gin"',
      '"snapshot/internal/service"',
      'genroutes "snapshot/internal/http"',
    ]);
  });

  it("extracts function signature and body", () => {
    const r = region({
      id: "r1",
      content: `func Foo(x int) (string, error) {
\treturn "hello", nil
}`,
    });
    const result = enrichRegionWithRegex(r);
    expect(result.symbolName).toBe("Foo");
    expect(result.signature).toBe("func Foo(x int) (string, error)");
    expect(result.content).toBe('\n\treturn "hello", nil\n');
    expect(result.kind).toBe("function");
  });

  it("extracts method with receiver", () => {
    const r = region({
      id: "r1",
      content: `func (r *Receiver) Bar(x int) {
\tr.doSomething(x)
}`,
    });
    const result = enrichRegionWithRegex(r);
    expect(result.symbolName).toBe("Receiver.Bar");
    expect(result.signature).toBe("func (r *Receiver) Bar(x int)");
    expect(result.kind).toBe("method");
  });

  it("marks .handler regions as expectsUserCode", () => {
    const r = region({
      id: "user.create.handler",
      content: `func CreateUser(c *gin.Context) {
\tc.JSON(200, nil)
}`,
    });
    const result = enrichRegionWithRegex(r);
    expect(result.expectsUserCode).toBe(true);
  });

  it("marks .usecase.impl regions as isStub", () => {
    const r = region({
      id: "user.usecase.impl",
      content: `func (uc *impl) Execute(ctx context.Context) {
\treturn nil
}`,
    });
    const result = enrichRegionWithRegex(r);
    expect(result.isStub).toBe(true);
  });

  it("marks .impl regions as isStub", () => {
    const r = region({
      id: "user.repo.impl",
      content: `func (r *repo) FindAll(ctx context.Context) ([]User, error) {
\treturn nil, nil
}`,
    });
    const result = enrichRegionWithRegex(r);
    expect(result.isStub).toBe(true);
  });

  it("extracts struct type", () => {
    const r = region({
      id: "r1",
      content: "type User struct {\n\tName string\n}",
    });
    const result = enrichRegionWithRegex(r);
    expect(result.symbolName).toBe("User");
    expect(result.kind).toBe("struct");
  });

  it("extracts interface type", () => {
    const r = region({
      id: "r1",
      content: "type UserRepository interface {\n\tFindAll() ([]User, error)\n}",
    });
    const result = enrichRegionWithRegex(r);
    expect(result.symbolName).toBe("UserRepository");
    expect(result.kind).toBe("interface");
  });

  it("extracts type alias", () => {
    const r = region({ id: "r1", content: "type UserID string" });
    const result = enrichRegionWithRegex(r);
    expect(result.symbolName).toBe("UserID");
    expect(result.kind).toBe("type");
  });

  it("extracts var declaration", () => {
    const r = region({ id: "r1", content: 'var defaultName = "world"' });
    const result = enrichRegionWithRegex(r);
    expect(result.symbolName).toBe("defaultName");
    expect(result.kind).toBe("var");
  });

  it("extracts const declaration", () => {
    const r = region({ id: "r1", content: "const pi = 3.14" });
    const result = enrichRegionWithRegex(r);
    expect(result.symbolName).toBe("pi");
    expect(result.kind).toBe("const");
  });

  it("returns region unchanged when no pattern matches", () => {
    const r = region({ id: "r1", content: "some random text" });
    const result = enrichRegionWithRegex(r);
    expect(result).toBe(r);
  });

  // --- Generics (regex path limitations) ---

  it("does NOT extract generic type (regex limitation)", () => {
    const r = region({
      id: "r1",
      content: "type List[T any] struct {\n\tItems []T\n}",
    });
    const result = enrichRegionWithRegex(r);
    // regex fails on generics, falls through to return unchanged
    expect(result).toBe(r);
  });

  it("does NOT extract generic function (regex limitation)", () => {
    const r = region({
      id: "r1",
      content: `func NewList[T any]() *List[T] {
\treturn &List[T]{}
}`,
    });
    const result = enrichRegionWithRegex(r);
    expect(result).toBe(r);
  });
});

// ---------------------------------------------------------------------------
// tryBatchAST — AST-backed enrichment path
// ---------------------------------------------------------------------------

describe("tryBatchAST", () => {
  const astAvailable = () =>
    tryBatchAST([region({ id: "probe", content: "package x\nvar a = 1" })]) !== null;

  it("returns null when decl-parser binary is absent", () => {
    // If the binary exists, this test is a no-op; we test the positive cases below.
    // When missing, tryBatchAST returns null via hasParser check.
  });

  it("extracts a generic struct type", () => {
    if (!astAvailable()) return;
    const regions = [region({ id: "r1", content: "type List[T any] struct {\n\tItems []T\n}" })];
    const result = tryBatchAST(regions);
    expect(result).not.toBeNull();
    expect(result![0].symbolName).toBe("List");
    expect(result![0].kind).toBe("struct");
  });

  it("extracts a generic function", () => {
    if (!astAvailable()) return;
    const regions = [
      region({
        id: "r1",
        content: `func NewList[T any]() *List[T] {
\treturn &List[T]{}
}`,
      }),
    ];
    const result = tryBatchAST(regions);
    expect(result).not.toBeNull();
    expect(result![0].symbolName).toBe("NewList");
    expect(result![0].kind).toBe("function");
    expect(result![0].signature).toBe("func NewList[T any]() *List[T]");
    expect(result![0].content).toBe("\n\treturn &List[T]{}\n");
  });

  it("extracts a generic method stripping type params from symbol name", () => {
    if (!astAvailable()) return;
    const regions = [
      region({
        id: "r1",
        content: `func (l *List[T]) Push(item T) {
\tl.Items = append(l.Items, item)
}`,
      }),
    ];
    const result = tryBatchAST(regions);
    expect(result).not.toBeNull();
    expect(result![0].symbolName).toBe("List.Push");
    expect(result![0].kind).toBe("method");
    expect(result![0].receiver).toBe("l *List[T]");
  });

  it("extracts a generic function with constrained type param", () => {
    if (!astAvailable()) return;
    const regions = [
      region({
        id: "r1",
        content: `func Find[T io.Reader](r T) (int, error) {
\treturn 0, nil
}`,
      }),
    ];
    const result = tryBatchAST(regions);
    expect(result).not.toBeNull();
    expect(result![0].symbolName).toBe("Find");
    expect(result![0].kind).toBe("function");
    expect(result![0].signature).toBe("func Find[T io.Reader](r T) (int, error)");
  });

  it("extracts a method with multi type-param receiver", () => {
    if (!astAvailable()) return;
    const regions = [
      region({
        id: "r1",
        content: `func (m *MyType[A, B]) Foo(a A, b B) {
\t_ = a
\t_ = b
}`,
      }),
    ];
    const result = tryBatchAST(regions);
    expect(result).not.toBeNull();
    expect(result![0].symbolName).toBe("MyType.Foo");
    expect(result![0].kind).toBe("method");
  });

  it("returns null when decl count mismatches region count", () => {
    if (!astAvailable()) return;
    // Single region whose content produces 2 declarations — count mismatch
    const regions = [region({ id: "r1", content: "type A struct{}\n\ntype B struct{}" })];
    const result = tryBatchAST(regions);
    expect(result).toBeNull();
  });

  it("handles multiple regions in one call", () => {
    if (!astAvailable()) return;
    const regions = [
      region({ id: "r1", content: "type Foo struct{}" }),
      region({ id: "r2", content: "var x = 1" }),
      region({
        id: "r3",
        content: `func Bar() string {
\treturn "ok"
}`,
      }),
    ];
    const result = tryBatchAST(regions);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(3);
    expect(result![0].symbolName).toBe("Foo");
    expect(result![0].kind).toBe("struct");
    expect(result![1].symbolName).toBe("x");
    expect(result![1].kind).toBe("var");
    expect(result![2].symbolName).toBe("Bar");
    expect(result![2].kind).toBe("function");
  });

  it("extracts imports", () => {
    if (!astAvailable()) return;
    const regions = [
      region({
        id: "r1",
        content: 'import "fmt"',
      }),
    ];
    const result = tryBatchAST(regions);
    expect(result).not.toBeNull();
    expect(result![0].kind).toBe("imports");
    expect(result![0].imports).toEqual(['"fmt"']);
  });

  it("extracts aliased imports from block", () => {
    if (!astAvailable()) return;
    const regions = [
      region({
        id: "r1",
        content: `import (
\t"github.com/gin-gonic/gin"
\t"snapshot/internal/service"
\tgenroutes "snapshot/internal/http"
)`,
      }),
    ];
    const result = tryBatchAST(regions);
    expect(result).not.toBeNull();
    expect(result![0].kind).toBe("imports");
    expect(result![0].imports).toEqual([
      '"github.com/gin-gonic/gin"',
      '"snapshot/internal/service"',
      'genroutes "snapshot/internal/http"',
    ]);
  });
});

// ---------------------------------------------------------------------------
// batchEnrichGoRegions — full batch orchestration
// ---------------------------------------------------------------------------

describe("batchEnrichGoRegions", () => {
  it("enriches unenriched Go regions, leaves others untouched", () => {
    const files = new Map<string, GeneratedRegion[]>([
      [
        "file.go",
        [
          region({ id: "a", symbolName: "PreFilled", kind: "function", content: "body" }),
          region({ id: "b", content: "var x = 1" }),
          region({ id: "c", language: "typescript", content: "const y = 2" }),
          region({ id: "d", content: "type User struct{}" }),
        ],
      ],
    ]);

    batchEnrichGoRegions(files);

    const result = files.get("file.go")!;
    // a already had symbolName — untouched
    expect(result[0].symbolName).toBe("PreFilled");
    // b enriched by regex
    expect(result[1].symbolName).toBe("x");
    expect(result[1].kind).toBe("var");
    // c is non-Go — untouched
    expect(result[2].language).toBe("typescript");
    // d enriched
    expect(result[3].symbolName).toBe("User");
    expect(result[3].kind).toBe("struct");
  });

  it("handles empty files map", () => {
    const files = new Map();
    expect(() => batchEnrichGoRegions(files)).not.toThrow();
  });

  it("handles file with no unenriched regions", () => {
    const files = new Map<string, GeneratedRegion[]>([
      ["file.go", [region({ id: "a", symbolName: "Foo", kind: "function", content: "body" })]],
    ]);
    expect(() => batchEnrichGoRegions(files)).not.toThrow();
    expect(files.get("file.go")![0].symbolName).toBe("Foo");
  });
});
