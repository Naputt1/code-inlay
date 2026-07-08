import * as go from "@schemago/go-ast";
import type { AppAst, AppServiceDef, ArchitectureAst } from "../types/index.js";
import type { GoModuleInfo } from "../utils/env.js";
import { featuresPath, lowerIdent, pascalCase, serviceTypeName } from "../utils/naming.js";

function printStmt(stmt: go.Statement): string {
  const sb = new go.StringBuilder();
  go.printStatement(sb, stmt, 0);
  return sb.toString().replace(/\n$/, "");
}

export function generateHandlerInitLines(
  mod: AppAst["modules"][number],
  moduleServices: AppServiceDef[],
  architectureRoutes: ArchitectureAst["routes"],
  moduleInfo: GoModuleInfo | undefined,
  featuresDir: string | undefined,
  repositoryModules: Set<string>,
): { moduleImports: string[]; handlerInitLines: string[] } {
  const moduleImports: string[] = [];
  const handlerInitLines: string[] = [];
  const modPkg = mod.name;
  const layerKinds = new Set(
    architectureRoutes
      .filter((r) => r.route.moduleName === modPkg)
      .flatMap((r) => r.layers.map((l) => l.kind)),
  );

  if (!layerKinds.has("handler") && !layerKinds.has("usecase")) {
    return { moduleImports, handlerInitLines };
  }

  if (moduleInfo) {
    moduleImports.push(
      `"${moduleInfo.modulePath}/${featuresPath(`internal/${modPkg}`, featuresDir)}"`,
    );
  }
  if (moduleServices.length > 0 && moduleInfo) {
    moduleImports.push(`"${moduleInfo.modulePath}/internal/service"`);
  }

  const dbProvider = moduleServices.find((s) => s.dbAccessor);
  const hasRepo = repositoryModules.has(modPkg);
  const svcsForUsecase =
    hasRepo && dbProvider ? moduleServices.filter((s) => s !== dbProvider) : moduleServices;
  const repoVarName = `${lowerIdent(modPkg)}Repo`;

  const addSection = (stmts: go.Statement[]) => {
    if (stmts.length === 0) return;
    if (handlerInitLines.length > 0) handlerInitLines.push("");
    for (const stmt of stmts) {
      handlerInitLines.push(printStmt(stmt));
    }
  };

  const nilChecks: go.Statement[] = [];
  for (const svc of moduleServices) {
    const svcVar = `${lowerIdent(svc.name)}Svc`;
    nilChecks.push(
      go.ifStmt(
        go.binary(go.id(svcVar), "==", go.id("nil")),
        go.block(go.expr(go.call(go.id("panic"), go.str(`${svcVar} must not be nil`)))),
      ),
    );
  }
  addSection(nilChecks);

  const repoStmts: go.Statement[] = [];
  if (hasRepo && dbProvider) {
    repoStmts.push(
      go.def(
        go.id(repoVarName),
        go.call(
          go.sel(go.id(modPkg), `New${pascalCase(modPkg)}Repository`),
          go.call(go.sel(go.id(`${lowerIdent(dbProvider.name)}Svc`), dbProvider.dbAccessor!)),
        ),
      ),
    );
  } else if (moduleServices.length === 0 && hasRepo) {
    repoStmts.push(
      go.def(
        go.id(repoVarName),
        go.call(go.sel(go.id(modPkg), `New${pascalCase(modPkg)}Repository`)),
      ),
    );
  }
  addSection(repoStmts);

  const usecaseFields: go.KeyValueExpr[] = [];
  for (const expansion of architectureRoutes) {
    if (expansion.route.moduleName !== modPkg) continue;
    if (expansion.route.kind !== "Route") continue;
    const layers = new Set(expansion.layers.map((l) => l.kind));
    if (!layers.has("handler") && !layers.has("usecase")) continue;
    const handlerName = expansion.route.handlerName;
    const newUsecaseArgs: go.Expression[] = [];
    if (moduleServices.length > 0) {
      if (hasRepo) {
        newUsecaseArgs.push(dbProvider ? go.id(repoVarName) : go.id("nil /*repo TODO*/"));
      }
      for (const s of svcsForUsecase) {
        newUsecaseArgs.push(go.id(`${lowerIdent(s.name)}Svc`));
      }
    } else if (hasRepo) {
      newUsecaseArgs.push(go.id(repoVarName));
    }
    usecaseFields.push(
      go.kv(
        go.id(`${handlerName}Usecase`),
        go.call(go.sel(go.id(modPkg), `New${handlerName}Usecase`), ...newUsecaseArgs),
      ),
    );
  }

  const handlerStmts: go.Statement[] = [];
  if (usecaseFields.length > 0) {
    const handlerType = `${pascalCase(modPkg)}Handler`;
    const handlerVar = `${lowerIdent(modPkg)}Handler`;
    handlerStmts.push(
      go.def(
        go.id(handlerVar),
        go.addr(go.elt(go.sel(go.id(modPkg), handlerType), ...usecaseFields)),
      ),
    );
  }
  addSection(handlerStmts);

  return { moduleImports, handlerInitLines };
}

export function generateRegisterModuleRoutes(
  moduleName: string,
  moduleImports: string[],
  handlerInitLines: string[],
  funcParams: string,
  routeLines: Array<{ content: string; group: string }>,
  groupMwByPrefix: Map<string, Set<string>>,
): string[] {
  const body: string[] = [];

  body.push(`import (`);
  body.push(`\t"github.com/gin-gonic/gin"`);
  for (const imp of moduleImports.sort()) {
    body.push(`\t${imp}`);
  }
  body.push(`)`);
  body.push(``);

  const funcName = `register${pascalCase(moduleName)}Routes`;
  body.push(`func ${funcName}(${funcParams}) {`);
  body.push(...handlerInitLines.map((l) => (l === "" ? l : `\t${l}`)));
  body.push(``);

  const groups = new Map<string, typeof routeLines>();
  const ungrouped: typeof routeLines = [];
  for (const rl of routeLines) {
    if (rl.group) {
      const g = groups.get(rl.group) ?? [];
      g.push(rl);
      groups.set(rl.group, g);
    } else {
      ungrouped.push(rl);
    }
  }

  const groupVar = (prefix: string) => {
    const cleaned = prefix.replace(/^\/+/, "").replace(/\/+/g, "_");
    return cleaned || "root";
  };

  const stripPath = (full: string, prefix: string) => {
    if (!prefix) return full;
    const base = full.startsWith(prefix) ? full.slice(prefix.length) : full;
    return base || "";
  };

  for (const rl of ungrouped) {
    body.push(`\t${rl.content}`);
  }
  if (ungrouped.length > 0 && groups.size > 0) {
    body.push(``);
  }
  for (const [prefix, lines] of groups) {
    const gv = groupVar(prefix);
    const gMw = groupMwByPrefix.get(prefix);
    const gMwArgsStr =
      gMw && gMw.size > 0
        ? [...gMw]
            .sort()
            .map((n) => `middleware.${n}`)
            .join(", ")
        : "";

    const groupStmts: go.Statement[] = [];
    const groupCallArgs: go.Expression[] = [go.str(prefix)];
    if (gMwArgsStr) {
      for (const mw of gMwArgsStr.split(", ")) {
        const parts = mw.split(".");
        groupCallArgs.push(go.sel(go.id(parts[0]), parts[1]));
      }
    }
    groupStmts.push(go.def(go.id(gv), go.call(go.sel(go.id("api"), "Group"), ...groupCallArgs)));

    const bodySb = new go.StringBuilder();
    for (const stmt of groupStmts) {
      go.printStatement(bodySb, stmt, 1);
    }

    body.push(bodySb.toString().replace(/\n$/, ""));
    body.push(`\t{`);
    for (const rl of lines) {
      const lineWithGv = rl.content.replace(/^api\./, `${gv}.`);
      const pathMatch = lineWithGv.match(/^(\w+)\.(\w+)\((".*?")/);
      if (pathMatch) {
        const oldPath = pathMatch[3].slice(1, -1);
        const newPath = stripPath(oldPath, prefix);
        const fixed = lineWithGv.replace(pathMatch[3], JSON.stringify(newPath));
        body.push(`\t\t${fixed}`);
      } else {
        body.push(`\t\t${lineWithGv}`);
      }
    }
    body.push(`\t}`);
    body.push(``);
  }
  if (body[body.length - 1] === "") body.pop();
  body.push(`}`);

  return body;
}

export function generateCombinedRegisterRoutes(
  moduleNamesInOrder: string[],
  services: AppServiceDef[],
  moduleInfo: GoModuleInfo | undefined,
  getModuleServices: (name: string) => AppServiceDef[],
): string[] {
  const serviceImports = new Set<string>();
  const combinedParams: string[] = [`api *gin.RouterGroup`];
  for (const svc of services) {
    const svcName = serviceTypeName(svc.name);
    combinedParams.push(`${lowerIdent(svc.name)}Svc service.${svcName}`);
    if (moduleInfo) {
      serviceImports.add(`"${moduleInfo.modulePath}/internal/service"`);
    }
  }

  const body: string[] = [];
  body.push(`import (`);
  body.push(`\t"github.com/gin-gonic/gin"`);
  for (const imp of [...serviceImports].sort()) {
    body.push(`\t${imp}`);
  }
  body.push(`)`);
  body.push(``);
  body.push(`func RegisterRoutes(${combinedParams.join(", ")}) {`);
  for (const modName of moduleNamesInOrder) {
    const funcName = `register${pascalCase(modName)}Routes`;
    const callArgs = [`api`];
    for (const s of getModuleServices(modName)) {
      callArgs.push(`${lowerIdent(s.name)}Svc`);
    }
    body.push(`\t${funcName}(${callArgs.join(", ")})`);
  }
  body.push(`}`);

  return body;
}
