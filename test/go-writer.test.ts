import { describe, expect, it } from "vitest";
import { injectGoFile, mergeImports } from "../src/writer/go-writer.js";
import type { CompilerCache, Diagnostic, GeneratedFilePatch } from "../src/index.js";

function patch(imports: string[]): GeneratedFilePatch {
  return {
    path: "main.go",
    regions: [
      { id: "server.main.0imports", kind: "imports", imports, language: "go", content: "" },
    ],
  };
}

function emptyCache(): CompilerCache {
  return {
    compilerVersion: "",
    astVersion: "2.0",
    pluginManifestHash: "",
    dependencyGraph: { nodes: {}, edges: [] },
    regions: {},
    symbols: {},
    symbolsByFile: {},
    files: {},
  };
}

describe("injectGoFile", () => {
  describe("orphan blob marker removal", () => {
    it("removes orphan blob markers via the injectAllViaMarkers path", () => {
      const fileText = `package main

// @gen:start config.settings
// some settings content
// @gen:end config.settings

// @gen:start config.routes
// some route content
// @gen:end config.routes
`;
      const patch: GeneratedFilePatch = {
        path: "main.go",
        regions: [
          {
            id: "config.settings",
            content: "// updated settings content",
            language: "go",
          },
        ],
      };
      const diagnostics: Diagnostic[] = [];
      const result = injectGoFile(fileText, patch, emptyCache(), diagnostics);

      expect(result).not.toContain("config.routes");
      expect(result).not.toContain("some route content");
      expect(result).toContain("config.settings");
      expect(result).toContain("updated settings content");
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].code).toBe("orphaned-region-removed");
      expect(diagnostics[0].regionId).toBe("config.routes");
    });

    it("removes multiple orphan blob markers", () => {
      const fileText = `package main

// @gen:start config.a
// content a
// @gen:end config.a

// @gen:start config.b
// content b
// @gen:end config.b

// @gen:start config.c
// content c
// @gen:end config.c
`;
      const patch: GeneratedFilePatch = {
        path: "main.go",
        regions: [
          {
            id: "config.b",
            content: "// updated b",
            language: "go",
          },
        ],
      };
      const diagnostics: Diagnostic[] = [];
      const result = injectGoFile(fileText, patch, emptyCache(), diagnostics);

      expect(result).not.toContain("config.a");
      expect(result).not.toContain("config.c");
      expect(result).toContain("config.b");
      expect(result).toContain("updated b");
      expect(diagnostics).toHaveLength(2);
      expect(diagnostics[0].code).toBe("orphaned-region-removed");
      expect(diagnostics[1].code).toBe("orphaned-region-removed");
    });

    it("preserves blob markers when all are planned", () => {
      const fileText = `package main

// @gen:start config.settings
// original content
// @gen:end config.settings
`;
      const patch: GeneratedFilePatch = {
        path: "main.go",
        regions: [
          {
            id: "config.settings",
            content: "// updated content",
            language: "go",
          },
        ],
      };
      const diagnostics: Diagnostic[] = [];
      const result = injectGoFile(fileText, patch, emptyCache(), diagnostics);

      expect(result).toContain("config.settings");
      expect(result).toContain("updated content");
      expect(diagnostics).toHaveLength(0);
    });

    it("handles file with no blob markers at all", () => {
      const fileText = `package main

func main() {}`;
      const patch: GeneratedFilePatch = {
        path: "main.go",
        regions: [
          {
            id: "config.settings",
            content: "// new content",
            language: "go",
          },
        ],
      };
      const diagnostics: Diagnostic[] = [];
      const result = injectGoFile(fileText, patch, emptyCache(), diagnostics);

      expect(result).toContain("config.settings");
      expect(result).toContain("new content");
      expect(diagnostics).toHaveLength(0);
    });
  });
});

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
