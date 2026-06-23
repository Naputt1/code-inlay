import { serviceConstructorName } from "./naming.js";
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

  const svcPath = `"${moduleInfo.modulePath}/internal/service"`;
  if (!imports.includes(svcPath)) {
    imports.push(svcPath);
  }

  const content: string[] = [];
  content.push(`import (`);
  for (const imp of [...new Set(imports)].sort()) {
    content.push(`\t${imp}`);
  }
  content.push(`)`);
  content.push("");
  content.push("func main() {");

  const routeArgs = ["api"];
  for (const svc of ast.services) {
    const ctorName = serviceConstructorName(svc.name);
    const varName = lowerSvcVar(svc.name);
    content.push(`\t${varName}, err := service.${ctorName}()`);
    content.push(`\tif err != nil {`);
    content.push(`\t\tpanic(err)`);
    content.push(`\t}`);
    if (svc.close) {
      content.push(`\tdefer ${varName}.Close()`);
    }
    routeArgs.push(varName);
  }

  content.push(``);
  content.push(`\tr := gin.Default()`);
  content.push(`\tapi := r.Group("${ast.router.prefix}")`);
  content.push(`\t${routesPkg}.RegisterRoutes(${routeArgs.join(", ")})`);
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

function lowerSvcVar(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1) + "Svc";
}
