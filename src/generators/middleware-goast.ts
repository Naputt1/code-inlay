import type { AppAst, GeneratedFilePatch } from "../types/index.js";
import { snakeCase } from "../utils/naming.js";
import * as go from "@schemago/go-ast";

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

    const importSpec = go.importSpec("github.com/gin-gonic/gin");
    const importDecl = go.genDecl("import", importSpec);
    const importSb = new go.StringBuilder();
    go.printDeclaration(importSb, importDecl, 0);

    const params = [go.field(["c"], go.star(go.qual("gin", "Context")))];
    const ft = go.funcType(params);
    const decl = go.funcDecl(funcName, undefined, ft, go.block());
    const sigSb = new go.StringBuilder();
    go.printDeclaration(sigSb, decl, 0);
    const sig = sigSb.toString().split("\n")[0].replace(" {", "");

    const bodySb = new go.StringBuilder();
    go.printStatement(bodySb, go.expr(go.call(go.sel(go.id("c"), "Next"))), 1);

    return {
      path: `internal/middleware/${fileName}.go`,
      regions: [
        {
          id: `middleware.${mw.name}.0imports`,
          stableHash: `middleware:${mw.name}:imports`,
          owner: "schemago",
          language: "go",
          kind: "imports",
          imports: ["github.com/gin-gonic/gin"],
          content: importSb.toString().trimEnd(),
        },
        {
          id: `middleware.${mw.name}.1func`,
          stableHash: `middleware:${mw.name}:func`,
          owner: "schemago",
          language: "go",
          content: `\t// TODO: implement ${funcName}\n${bodySb.toString().trimEnd()}`,
          symbolName: funcName,
          kind: "function",
          signature: sig,
          isStub: true,
        },
      ],
    };
  });
}
