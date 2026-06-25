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

  if (ast.services.length > 0) {
    const svcPath = `"${moduleInfo.modulePath}/internal/service"`;
    if (!imports.includes(svcPath)) {
      imports.push(svcPath);
    }
  }

  const routeArgs = ["api"];
  const mainBody: string[] = [];
  for (const svc of ast.services) {
    const ctorName = serviceConstructorName(svc.name);
    const varName = lowerSvcVar(svc.name);
    mainBody.push(`\t${varName}, err := service.${ctorName}()`);
    mainBody.push(`\tif err != nil {`);
    mainBody.push(`\t\tpanic(err)`);
    mainBody.push(`\t}`);
    if (svc.close) {
      mainBody.push(`\tdefer ${varName}.Close()`);
    }
    routeArgs.push(varName);
  }

  mainBody.push(``);
  mainBody.push(`\tr := gin.Default()`);
  mainBody.push(`\tapi := r.Group("${ast.router.prefix}")`);
  mainBody.push(`\t${routesPkg}.RegisterRoutes(${routeArgs.join(", ")})`);
  mainBody.push(`\tif err := r.Run(); err != nil {`);
  mainBody.push(`\t\tpanic(err)`);
  mainBody.push(`\t}`);

  return {
    path: serverFilePath,
    regions: [
      {
        id: `${serverMainRegionId}.0imports`,
        stableHash: `${serverFilePath}:${serverMainRegionId}:imports`,
        owner: adapter?.name ?? "code-inlay",
        language: "go",
        content: `import (\n${[...new Set(imports)]
          .sort()
          .map((i) => `\t${i}`)
          .join("\n")}\n)`,
      },
      {
        id: `${serverMainRegionId}.1main`,
        stableHash: `${serverFilePath}:${serverMainRegionId}:main:${adapter?.name ?? "code-inlay"}`,
        owner: adapter?.name ?? "code-inlay",
        language: "go",
        content: mainBody.join("\n"),
        symbolName: "main",
        kind: "function",
        signature: "func main()",
      },
    ],
  };
}

function lowerSvcVar(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1) + "Svc";
}
