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

  describe("import preservation", () => {
    it("preserves imports from skeleton through symbol-aware reconstruction", () => {
      // Simulates: buildSymbolSkeleton creates this, then injectGoFile processes it
      const skeleton = `package main

import (
\t"context"
\t"net/http"
\t"github.com/gin-gonic/gin"
)

func main() {
\t_ = gin.Default()
}`;
      const patch: GeneratedFilePatch = {
        path: "cmd/server/main.go",
        regions: [
          {
            id: "server.main.0imports",
            kind: "imports",
            imports: ['"context"', '"net/http"', '"github.com/gin-gonic/gin"'],
            language: "go",
            content: 'import (\n\t"context"\n\t"net/http"\n\t"github.com/gin-gonic/gin"\n)',
          },
          {
            id: "server.main.1main",
            symbolName: "main",
            kind: "function",
            signature: "func main()",
            language: "go",
            content: "_ = gin.Default()",
          },
        ],
      };
      const diagnostics: Diagnostic[] = [];
      const result = injectGoFile(skeleton, patch, emptyCache(), diagnostics);

      expect(result).toContain("import (");
      expect(result).toContain('"context"');
      expect(result).toContain('"net/http"');
      expect(result).toContain('"github.com/gin-gonic/gin"');
      expect(result).toContain("func main()");
    });

    it("preserves imports for handler files through symbol-aware reconstruction", () => {
      const skeleton = `package auth

import (
\t"errors"
\t"net/http"
\t"github.com/gin-gonic/gin"
\t"petconnect/internal/features/httperr"
)

type AuthHandler struct {
\tLoginUsecase LoginUsecase
}`;
      const patch: GeneratedFilePatch = {
        path: "internal/features/auth/handler.go",
        regions: [
          {
            id: "auth.0handler.imports",
            kind: "imports",
            imports: [
              '"errors"',
              '"net/http"',
              '"petconnect/internal/features/httperr"',
              '"github.com/gin-gonic/gin"',
            ],
            language: "go",
            content:
              'import (\n\t"errors"\n\t"net/http"\n\t"petconnect/internal/features/httperr"\n\n\t"github.com/gin-gonic/gin"\n)',
          },
          {
            id: "auth.0handler.struct",
            symbolName: "AuthHandler",
            kind: "struct",
            language: "go",
            content: "type AuthHandler struct {\n\tLoginUsecase LoginUsecase\n}",
          },
        ],
      };
      const diagnostics: Diagnostic[] = [];
      const result = injectGoFile(skeleton, patch, emptyCache(), diagnostics);

      expect(result).toContain("import (");
      expect(result).toContain('"errors"');
      expect(result).toContain('"net/http"');
      expect(result).toContain('"github.com/gin-gonic/gin"');
      expect(result).toContain("type AuthHandler struct");
    });

    it("preserves imports for middleware files", () => {
      const skeleton = `package middleware

import (
\t"github.com/gin-gonic/gin"
)

func JwtAuth(c *gin.Context) {
\tc.Next()
}`;
      const patch: GeneratedFilePatch = {
        path: "internal/middleware/jwt_auth.go",
        regions: [
          {
            id: "middleware.JwtAuth.0imports",
            kind: "imports",
            imports: ['"github.com/gin-gonic/gin"'],
            language: "go",
            content: 'import "github.com/gin-gonic/gin"',
          },
          {
            id: "middleware.JwtAuth.1func",
            symbolName: "JwtAuth",
            kind: "function",
            signature: "func JwtAuth(c *gin.Context)",
            language: "go",
            content: "\tc.Next()",
            isStub: true,
          },
        ],
      };
      const diagnostics: Diagnostic[] = [];
      const result = injectGoFile(skeleton, patch, emptyCache(), diagnostics);

      expect(result).toContain("import (");
      expect(result).toContain('"github.com/gin-gonic/gin"');
      expect(result).toContain("func JwtAuth");
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

  it("copies import block from fileText to text when text has no imports (skeleton fix)", () => {
    // Simulates: skeleton has imports, reconstructed text does not
    const fileText = `package main

import (
\t"context"
\t"net/http"
\t"github.com/gin-gonic/gin"
)

func main() {
\t_ = gin.Default()
}`;
    // Reconstructed text has no import block (injectGoFile skipped imports)
    const text = `package main

func main() {
\t_ = gin.Default()
}`;
    const p = {
      path: "main.go",
      regions: [
        {
          id: "server.main.0imports",
          kind: "imports" as const,
          imports: ['"context"', '"net/http"', '"github.com/gin-gonic/gin"'],
          language: "go" as const,
          content: 'import (\n\t"context"\n\t"net/http"\n\t"github.com/gin-gonic/gin"\n)',
        },
      ],
    };
    const result = mergeImports(text, p, fileText);
    expect(result).toContain("import (");
    expect(result).toContain('"context"');
    expect(result).toContain('"net/http"');
    expect(result).toContain('"github.com/gin-gonic/gin"');
    expect(result).toContain("func main()");
  });

  it("adds new imports when fileText has imports but text needs more", () => {
    const fileText = `package main

import (
\t"fmt"
)

func main() {}`;
    const text = `package main

func main() {}`;
    const p = {
      path: "main.go",
      regions: [
        {
          id: "imports",
          kind: "imports" as const,
          imports: ['"fmt"', '"os"'],
          language: "go" as const,
          content: "",
        },
      ],
    };
    const result = mergeImports(text, p, fileText);
    expect(result).toContain('"fmt"');
    expect(result).toContain('"os"');
    expect(result).toContain("func main()");
  });

  it("collects imports from regions with content but no imports array", () => {
    const fileText = `package main

func main() {}`;
    const text = `package main

func main() {}`;
    const p = {
      path: "main.go",
      regions: [
        {
          id: "handler.imports",
          kind: "imports" as const,
          language: "go" as const,
          content: 'import (\n\t"errors"\n\t"net/http"\n\t"github.com/gin-gonic/gin"\n)',
        },
      ],
    };
    const result = mergeImports(text, p, fileText);
    expect(result).toContain("import (");
    expect(result).toContain('"errors"');
    expect(result).toContain('"net/http"');
    expect(result).toContain('"github.com/gin-gonic/gin"');
  });

  it("deduplicates imports from multiple regions", () => {
    const fileText = `package main

func main() {}`;
    const text = `package main

func main() {}`;
    const p = {
      path: "main.go",
      regions: [
        {
          id: "handler.imports",
          kind: "imports" as const,
          imports: ['"context"', '"net/http"'],
          language: "go" as const,
          content: "",
        },
        {
          id: "usecase.imports",
          kind: "imports" as const,
          imports: ['"context"', '"github.com/gin-gonic/gin"'],
          language: "go" as const,
          content: "",
        },
      ],
    };
    const result = mergeImports(text, p, fileText);
    // "context" should appear only once
    const contextCount = (result.match(/"context"/g) ?? []).length;
    expect(contextCount).toBe(1);
    expect(result).toContain('"net/http"');
    expect(result).toContain('"github.com/gin-gonic/gin"');
  });

  it("preserves existing imports in text and adds new ones", () => {
    const fileText = `package main

import (
\t"fmt"
)

func main() {}`;
    const text = `package main

import (
\t"fmt"
)

func main() {}`;
    const p = {
      path: "main.go",
      regions: [
        {
          id: "imports",
          kind: "imports" as const,
          imports: ['"fmt"', '"os"'],
          language: "go" as const,
          content: "",
        },
      ],
    };
    const result = mergeImports(text, p, fileText);
    expect(result).toContain('"fmt"');
    expect(result).toContain('"os"');
  });
});
