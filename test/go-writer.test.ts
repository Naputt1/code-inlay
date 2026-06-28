import { describe, expect, it } from "vitest";
import { mergeImports } from "../src/writer/go-writer.js";
import type { GeneratedFilePatch } from "../src/index.js";

function patch(imports: string[]): GeneratedFilePatch {
  return {
    path: "main.go",
    regions: [
      { id: "server.main.0imports", kind: "imports", imports, language: "go", content: "" },
    ],
  };
}

describe("mergeImports", () => {
  it("adds a new import to an existing block", () => {
    const fileText = `package main

import (
\t"fmt"
)

func main() {}`;
    const p = patch(['"fmt"', '"os"']);
    const result = mergeImports(fileText, p, fileText);
    expect(result).toContain('\t"fmt"');
    expect(result).toContain('\t"os"');
  });

  it("updates an existing import spec with an alias", () => {
    const fileText = `package main

import (
\t"github.com/gin-gonic/gin"
\t"snapshot/internal/service"
\t"snapshot/internal/http"
)

func main() {}`;
    const p = patch([
      '"github.com/gin-gonic/gin"',
      '"snapshot/internal/service"',
      'genroutes "snapshot/internal/http"',
    ]);
    const result = mergeImports(fileText, p, fileText);
    expect(result).toContain('\tgenroutes "snapshot/internal/http"');
    expect(result).not.toContain('\t"snapshot/internal/http"');
  });

  it("updates an existing import spec with alias in a single-import file", () => {
    const fileText = `package main

import "snapshot/internal/http"

func main() {}`;
    const p = patch(['genroutes "snapshot/internal/http"']);
    const result = mergeImports(fileText, p, fileText);
    expect(result).toContain('\tgenroutes "snapshot/internal/http"');
    expect(result).not.toContain('import "snapshot');
  });

  it("returns text unchanged when planned specs match existing", () => {
    const fileText = `package main

import (
\t"fmt"
\t"os"
)

func main() {}`;
    const p = patch(['"fmt"', '"os"']);
    const result = mergeImports(fileText, p, fileText);
    expect(result).toBe(fileText);
  });

  it("adds a new import and updates an alias in the same call", () => {
    const fileText = `package main

import (
\t"fmt"
\t"snapshot/internal/http"
)

func main() {}`;
    const p = patch(['genroutes "snapshot/internal/http"', '"fmt"', '"os"', '"net/http"']);
    const result = mergeImports(fileText, p, fileText);
    expect(result).toContain('\tgenroutes "snapshot/internal/http"');
    expect(result).toContain('\t"os"');
    expect(result).toContain('\t"net/http"');
    expect(result).not.toContain('\t"snapshot/internal/http"');
  });

  it("handles file with no existing import block", () => {
    const fileText = `package main

func main() {}`;
    const p = patch(['"fmt"']);
    const result = mergeImports(fileText, p, fileText);
    expect(result).toContain("import (");
    expect(result).toContain('\t"fmt"');
    expect(result).toContain("func main() {}");
  });
});
