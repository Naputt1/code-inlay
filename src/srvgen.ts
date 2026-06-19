import type { AppAst, ArchitectureAst, GeneratedFilePatch, GeneratedRegion, AdapterPlugin } from "./types.js";
import { pascalCase, lowerIdent } from "./naming.js";
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
  const handlerInitLines: string[] = [];

  for (const module of ast.modules) {
    const modPkg = module.name;
    const importPath = `"${moduleInfo.modulePath}/internal/${modPkg}"`;
    if (!imports.includes(importPath)) {
      imports.push(importPath);
    }

    if (adapter?.name === "gin" && !imports.includes(`"github.com/gin-gonic/gin"`)) {
      imports.push(`"github.com/gin-gonic/gin"`);
    }

    const handlerType = `${pascalCase(modPkg)}Handler`;
    const handlerVar = `${lowerIdent(modPkg)}Handler`;
    const layerKinds = new Set(architecture.routes
      .filter((r) => r.route.moduleName === modPkg)
      .flatMap((r) => r.layers.map((l) => l.kind)));

    if (layerKinds.has("handler") || layerKinds.has("usecase")) {
      const usecaseFields: string[] = [];
      for (const expansion of architecture.routes) {
        if (expansion.route.moduleName !== modPkg) continue;
        const layers = new Set(expansion.layers.map((l) => l.kind));
        if (!layers.has("handler") && !layers.has("usecase")) continue;
        usecaseFields.push(`\t${expansion.route.handlerName}Usecase: nil, // TODO: inject`);
      }

      handlerInitLines.push(`${handlerVar} := &${modPkg}.${handlerType}{`);
      handlerInitLines.push(...usecaseFields);
      handlerInitLines.push(`}`);
    }
  }

  const routeLines: string[] = [];
  const prefix = ast.router.prefix;
  for (const expansion of architecture.routes) {
    const route = expansion.route;
    const handlerVar = `${lowerIdent(route.moduleName)}Handler`;
    routeLines.push(`api.${route.method}("${route.fullPath}", ${handlerVar}.${route.handlerName})`);
  }

  const content: string[] = [];
  content.push(`import (`);
  for (const imp of [...new Set(imports)].sort()) {
    content.push(`\t${imp}`);
  }
  content.push(`)`);
  content.push("");
  content.push("func main() {");
  content.push(`\tr := gin.Default()`);
  content.push("");
  for (const line of handlerInitLines) {
    content.push(`\t${line}`);
  }
  content.push("");
  content.push(`\tapi := r.Group("${prefix}")`);
  content.push(`\t{`);
  for (const line of routeLines) {
    content.push(`\t\t${line}`);
  }
  content.push(`\t}`);
  content.push("");
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
