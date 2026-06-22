import type { AppAst, ArchitectureAst, GeneratedFilePatch, AdapterPlugin } from "./types.js";
import type { GoModuleInfo } from "./env.js";

export const serverFilePath = "cmd/server/main.go";
export const serverMainRegionId = "server.main";

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
  content.push(`\t${routesPkg}.RegisterRoutes(api)`);
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
