import type { AppAst, ArchitectureAst, GeneratedFilePatch, AdapterPlugin } from "./types.js";
import type { GoModuleInfo } from "./env.js";

export const serverFilePath = "cmd/server/main.go";
export const serverMainRegionId = "server.main";

function collectAllMiddleware(ast: AppAst): string[] {
  const names = new Set<string>();
  for (const mod of ast.modules) {
    for (const mw of mod.middleware) {
      names.add(mw.name);
    }
    for (const route of mod.routes) {
      for (const mw of route.middleware) {
        names.add(mw.name);
      }
    }
  }
  return [...names].sort();
}

function mwToParamName(name: string): string {
  if (!name) return "";
  return name.charAt(0).toLowerCase() + name.slice(1);
}

export function generateServer(
  ast: AppAst,
  architecture: ArchitectureAst,
  moduleInfo: GoModuleInfo,
  adapter?: AdapterPlugin,
): GeneratedFilePatch {
  const imports: string[] = [];

  if (adapter?.name === "gin") {
    imports.push(`"github.com/gin-gonic/gin"`);
  }

  const routesPkg = "genroutes";
  imports.push(`genroutes "${moduleInfo.modulePath}/internal/http"`);

  const mwNames = collectAllMiddleware(ast);
  const mwArgs = mwNames.map((n) => `nil /* TODO: ${mwToParamName(n)} */`).join(", ");
  const callArgs = mwArgs ? `api, ${mwArgs}` : "api";

  const content: string[] = [];
  content.push(`import (`);
  for (const imp of [...new Set(imports)].sort()) {
    content.push(`\t${imp}`);
  }
  content.push(`)`);
  content.push("");
  content.push("func main() {");
  content.push(`\tr := gin.Default()`);
  content.push(`\tapi := r.Group("${ast.router.prefix}")`);
  content.push(`\t${routesPkg}.RegisterRoutes(${callArgs})`);
  content.push(`\tif err := r.Run(); err != nil {`);
  content.push(`\t\tpanic(err)`);
  content.push(`\t}`);
  content.push(`}`);

  return {
    path: serverFilePath,
    regions: [
      {
        id: serverMainRegionId,
        stableHash: `${serverFilePath}:${serverMainRegionId}:${adapter?.name ?? "code-inlay"}`,
        owner: adapter?.name ?? "code-inlay",
        language: "go",
        content: content.join("\n"),
      },
    ],
  };
}
