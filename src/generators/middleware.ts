import type { AppAst, GeneratedFilePatch } from "../types/index.js";
import { snakeCase } from "../utils/naming.js";

export function collectAllMiddlewareInfo(ast: AppAst): Array<{ name: string; handler?: string }> {
  const seen = new Set<string>();
  const result: Array<{ name: string; handler?: string }> = [];
  for (const mod of ast.modules) {
    for (const mw of mod.middleware) {
      if (!seen.has(mw.name)) {
        seen.add(mw.name);
        result.push({ name: mw.name, handler: mw.handler });
      }
    }
    for (const route of mod.routes) {
      for (const mw of route.middleware) {
        if (!seen.has(mw.name)) {
          seen.add(mw.name);
          result.push({ name: mw.name, handler: mw.handler });
        }
      }
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export function generateMiddlewareFiles(ast: AppAst): GeneratedFilePatch[] {
  const mws = collectAllMiddlewareInfo(ast);
  return mws.map((mw) => {
    const fileName = snakeCase(mw.name);
    const funcName = mw.handler ?? mw.name;
    const funcSig = `func ${funcName}(c *gin.Context)`;

    return {
      path: `internal/middleware/${fileName}.go`,
      regions: [
        {
          id: `middleware.${mw.name}.0imports`,
          stableHash: `middleware:${mw.name}:imports`,
          owner: "schemago",
          language: "go",
          content: `import "github.com/gin-gonic/gin"`,
        },
        {
          id: `middleware.${mw.name}.1func`,
          stableHash: `middleware:${mw.name}:func`,
          owner: "schemago",
          language: "go",
          content: `\t// TODO: implement ${funcName}\n\tc.Next()`,
          symbolName: funcName,
          kind: "function",
          signature: funcSig,
          isStub: true,
        },
      ],
    };
  });
}
