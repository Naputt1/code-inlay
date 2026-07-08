import * as go from "@schemago/go-ast";
import { serviceConstructorName } from "../utils/naming.js";
import type {
  AppAst,
  ArchitectureAst,
  GeneratedFilePatch,
  AdapterPlugin,
  EnvVarInfo,
  RuntimeConfig,
} from "../types/index.js";
import type { GoModuleInfo } from "../utils/env.js";

function renderEnvString(s: string, env?: Record<string, EnvVarInfo>): string {
  if (!env) return JSON.stringify(s);
  const parts = s.split(/(\$\{[^}]+\})/);
  if (parts.length === 1) return JSON.stringify(s);
  const exprs = parts
    .map((p) => {
      const match = p.match(/^\$\{([^}]+)\}$/);
      if (match && match[1] in env) return `cfg.${match[1]}`;
      const quoted = JSON.stringify(p);
      if (quoted === '""') return null;
      return quoted;
    })
    .filter((e): e is string => e !== null);
  if (exprs.length === 1) return exprs[0];
  return exprs.join(" + ");
}

function lowerSvcVar(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1) + "Svc";
}

function generateLoggerInit(loggerConfig: NonNullable<RuntimeConfig["logger"]>): string[] {
  const level = loggerConfig.level ?? "info";
  const format = loggerConfig.format ?? "json";

  return [
    `\tlogger := runtime.NewLogger(runtime.LoggerConfig{`,
    `\t\tLevel:    "${level}",`,
    `\t\tFormat:   "${format}",`,
    `\t})`,
    `\truntime.SetDefaultLogger(logger)`,
  ];
}

export const serverFilePath = "cmd/server/main.go";
export const serverMainRegionId = "server.main";

function parseImport(s: string): { name?: string; path: string } {
  const trimmed = s.replace(/^"|"$/g, "");
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx !== -1) {
    return {
      name: trimmed.slice(0, spaceIdx),
      path: trimmed.slice(spaceIdx + 1).replace(/^"|"$/g, ""),
    };
  }
  return { path: trimmed };
}

function renderImportsContent(imports: string[]): string {
  const specs = [...new Set(imports)].sort().map((i) => {
    const { name, path } = parseImport(i);
    return go.importSpec(path, name);
  });
  const decl: go.GenDecl = { kind: "GenDecl", token: "import", specs, lparen: true };
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, decl, 0);
  return sb.toString().trimEnd();
}

export function generateServer(
  ast: AppAst,
  architecture: ArchitectureAst,
  moduleInfo: GoModuleInfo,
  adapter?: AdapterPlugin,
): GeneratedFilePatch {
  const imports: string[] = [];

  if (adapter?.name === "gin") {
    imports.push(
      `"reflect"`,
      `"strings"`,
      `"github.com/gin-gonic/gin"`,
      `"github.com/gin-gonic/gin/binding"`,
      `"github.com/go-playground/validator/v10"`,
      `"context"`,
      `"net/http"`,
      `"os"`,
      `"os/signal"`,
      `"syscall"`,
      `"time"`,
    );

    if (ast.router.cors) {
      imports.push(`cors "github.com/gin-contrib/cors"`);
    }
  }

  const routesPkg = "genroutes";
  imports.push(`genroutes "${moduleInfo.modulePath}/internal/http"`);

  if (ast.services.length > 0) {
    const svcPath = `"${moduleInfo.modulePath}/internal/service"`;
    if (!imports.includes(svcPath)) {
      imports.push(svcPath);
    }
  }

  const hasConfig = ast.env && Object.keys(ast.env).length > 0;
  if (hasConfig) {
    const cfgPath = `"${moduleInfo.modulePath}/internal/config"`;
    if (!imports.includes(cfgPath)) {
      imports.push(cfgPath);
    }
  }

  const runtimeConfig = ast.options.runtime;
  const hasLogger = runtimeConfig?.enabled && runtimeConfig?.logger != null;

  if (hasLogger) {
    const runtimePath = `"${moduleInfo.modulePath}/pkg/runtime"`;
    if (!imports.includes(runtimePath)) {
      imports.push(runtimePath);
    }
  }

  const sortedImports = [...new Set(imports)].sort();
  const routeArgs: string[] = ["api"];
  const mainBody: string[] = [];

  function addStmt(s: go.Statement) {
    const sb = new go.StringBuilder();
    go.printStatement(sb, s, 1);
    mainBody.push(sb.toString().trimEnd());
  }

  function addRaw(text: string) {
    mainBody.push(text);
  }

  // ── Config loading ──
  if (hasConfig) {
    addStmt(go.def(go.id("cfg"), go.call(go.qual("config", "Load"))));
    addRaw("");
  }

  // ── Logger init ──
  if (hasLogger) {
    for (const line of generateLoggerInit(runtimeConfig!.logger!)) {
      addRaw(line);
    }
    addRaw("");
  }

  // ── Service init ──
  for (const svc of ast.services) {
    const ctorName = serviceConstructorName(svc.name);
    const varName = lowerSvcVar(svc.name);
    const needsCfg = hasConfig && svc.env && svc.env.length > 0;
    const ctorArgs: go.Expression[] = needsCfg ? [go.id("cfg")] : [];
    addStmt(
      go.def(
        [go.id(varName), go.id("err")],
        [go.call(go.sel(go.id("service"), ctorName), ...ctorArgs)],
      ),
    );
    addStmt(
      go.ifStmt(
        go.binary(go.id("err"), "!=", go.id("nil")),
        go.block(go.expr(go.call(go.id("panic"), go.id("err")))),
      ),
    );
    if (svc.close) {
      addStmt(go.defer(go.call(go.sel(go.id(varName), "Close"))));
    }
    routeArgs.push(varName);
  }

  // ── Validator (gin only) ──
  if (adapter?.name === "gin") {
    addRaw("");
    addRaw(`\t// Configure validator`);
    addRaw(`\tif v, ok := binding.Validator.Engine().(*validator.Validate); ok {`);
    addRaw(`\t\tv.RegisterTagNameFunc(func(fld reflect.StructField) string {`);
    addRaw(`\t\t\tname := strings.SplitN(fld.Tag.Get("json"), ",", 2)[0]`);
    addRaw(`\t\t\tif name == "-" || name == "" {`);
    addRaw(`\t\t\t\treturn fld.Name`);
    addRaw(`\t\t\t}`);
    addRaw(`\t\t\treturn name`);
    addRaw(`\t\t})`);
    addRaw(`\t}`);
  }

  // ── Router ──
  addRaw("");
  addStmt(go.def(go.id("r"), go.call(go.qual("gin", "Default"))));

  // ── Middleware ──
  if (hasLogger) {
    addStmt(
      go.expr(
        go.call(go.sel(go.id("r"), "Use"), go.call(go.qual("runtime", "RequestContextMiddleware"))),
      ),
    );
    addRaw("");
  }

  // ── CORS ──
  if (ast.router.cors) {
    const c = ast.router.cors;
    addRaw(`\tr.Use(cors.New(cors.Config{`);
    addRaw(
      `\t\tAllowOrigins:     []string{${c.allowOrigins.map((o) => renderEnvString(o, ast.env)).join(", ")}},`,
    );
    addRaw(
      `\t\tAllowMethods:     []string{${c.allowMethods.map((m) => renderEnvString(m, ast.env)).join(", ")}},`,
    );
    addRaw(
      `\t\tAllowHeaders:     []string{${c.allowHeaders.map((h) => renderEnvString(h, ast.env)).join(", ")}},`,
    );
    if (c.allowCredentials !== undefined) {
      addRaw(`\t\tAllowCredentials: ${c.allowCredentials},`);
    }
    if (c.exposeHeaders && c.exposeHeaders.length > 0) {
      addRaw(
        `\t\tExposeHeaders:    []string{${c.exposeHeaders.map((h) => renderEnvString(h, ast.env)).join(", ")}},`,
      );
    }
    if (c.maxAge !== undefined) {
      addRaw(`\t\tMaxAge:           ${c.maxAge},`);
    }
    addRaw(`\t}))`);
    addRaw("");
  }

  // ── Health check ──
  const hc = ast.options.runtime?.healthCheck;
  const hcEnabled = hc?.enabled ?? true;
  const livenessPath = hc?.livenessPath ?? "/healthz";
  const readinessPath = hc?.readinessPath ?? "/readyz";

  if (hcEnabled) {
    addRaw("");
    addRaw(`\tr.GET("${livenessPath}", func(c *gin.Context) {`);
    addRaw(`\t\tc.JSON(http.StatusOK, gin.H{"status": "ok"})`);
    addRaw(`\t})`);
    addRaw(`\tr.GET("${readinessPath}", func(c *gin.Context) {`);
    addRaw(`\t\tc.JSON(http.StatusOK, gin.H{"status": "ready"})`);
    addRaw(`\t})`);
  }

  // ── Route registration ──
  addRaw(`\tapi := r.Group("${ast.router.prefix}")`);
  addRaw(`\t${routesPkg}.RegisterRoutes(${routeArgs.join(", ")})`);

  // ── PORT handling (no config) ──
  if (!hasConfig) {
    addRaw("");
    addStmt(go.def(go.id("addr"), go.call(go.qual("os", "Getenv"), go.str("PORT"))));
    addStmt(
      go.ifStmt(
        go.binary(go.id("addr"), "==", go.str("")),
        go.block(go.assign(go.id("addr"), "=", go.str(":8080"))),
      ),
    );
    addStmt(
      go.ifStmt(
        go.not(go.call(go.qual("strings", "HasPrefix"), go.id("addr"), go.str(":"))),
        go.block(go.assign(go.id("addr"), "=", go.binary(go.str(":"), "+", go.id("addr")))),
      ),
    );
  }

  // ── HTTP Server ──
  addRaw("");
  addRaw(`\tsrv := &http.Server{`);
  addRaw(`\t\tAddr:    ${hasConfig ? "cfg.PORT" : "addr"},`);
  addRaw(`\t\tHandler: r,`);
  addRaw(`\t}`);

  // ── Goroutine ──
  addRaw("");
  addRaw(`\tgo func() {`);
  addRaw(`\t\tif err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {`);
  addRaw(`\t\t\tpanic(err)`);
  addRaw(`\t\t}`);
  addRaw(`\t}()`);

  // ── Signal handling ──
  addRaw("");
  addRaw(`\tquit := make(chan os.Signal, 1)`);
  addStmt(
    go.expr(
      go.call(
        go.qual("signal", "Notify"),
        go.id("quit"),
        go.qual("syscall", "SIGINT"),
        go.qual("syscall", "SIGTERM"),
      ),
    ),
  );
  addStmt({
    kind: "ExprStmt",
    expr: { kind: "UnaryExpr", op: "<-", x: go.id("quit") },
  });

  // ── Graceful shutdown ──
  addRaw("");
  const shutdownTimeout = ast.options.runtime?.shutdownTimeout ?? 5;
  addRaw(
    `\tctx, cancel := context.WithTimeout(context.Background(), ${shutdownTimeout}*time.Second)`,
  );
  addStmt(go.defer(go.call(go.id("cancel"))));
  addStmt({
    kind: "IfStmt",
    init: go.def(go.id("err"), go.call(go.sel(go.id("srv"), "Shutdown"), go.id("ctx"))),
    cond: go.binary(go.id("err"), "!=", go.id("nil")),
    body: go.block(go.expr(go.call(go.id("panic"), go.id("err")))),
  });

  return {
    path: serverFilePath,
    regions: [
      {
        id: `${serverMainRegionId}.0imports`,
        stableHash: `${serverFilePath}:${serverMainRegionId}:imports`,
        owner: adapter?.name ?? "schemago",
        language: "go",
        kind: "imports",
        imports: sortedImports,
        content: renderImportsContent(sortedImports),
      },
      {
        id: `${serverMainRegionId}.1main`,
        stableHash: `${serverFilePath}:${serverMainRegionId}:main:${adapter?.name ?? "schemago"}`,
        owner: adapter?.name ?? "schemago",
        language: "go",
        content: mainBody.join("\n"),
        symbolName: "main",
        kind: "function",
        signature: "func main()",
      },
    ],
  };
}
