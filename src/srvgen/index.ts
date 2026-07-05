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

  const routeArgs = ["api"];
  const mainBody: string[] = [];

  if (hasConfig) {
    mainBody.push(`\tcfg := config.Load()`);
    mainBody.push(``);
  }

  if (hasLogger) {
    mainBody.push(...generateLoggerInit(runtimeConfig!.logger!));
    mainBody.push(``);
  }

  for (const svc of ast.services) {
    const ctorName = serviceConstructorName(svc.name);
    const varName = lowerSvcVar(svc.name);
    const needsCfg = hasConfig && svc.env && svc.env.length > 0;
    const ctorArgs = needsCfg ? "cfg" : "";
    mainBody.push(`\t${varName}, err := service.${ctorName}(${ctorArgs})`);
    mainBody.push(`\tif err != nil {`);
    mainBody.push(`\t\tpanic(err)`);
    mainBody.push(`\t}`);
    if (svc.close) {
      mainBody.push(`\tdefer ${varName}.Close()`);
    }
    routeArgs.push(varName);
  }

  if (adapter?.name === "gin") {
    mainBody.push(``);
    mainBody.push(`\t// Configure validator`);
    mainBody.push(`\tif v, ok := binding.Validator.Engine().(*validator.Validate); ok {`);
    mainBody.push(`\t\tv.RegisterTagNameFunc(func(fld reflect.StructField) string {`);
    mainBody.push(`\t\t\tname := strings.SplitN(fld.Tag.Get("json"), ",", 2)[0]`);
    mainBody.push(`\t\t\tif name == "-" || name == "" {`);
    mainBody.push(`\t\t\t\treturn fld.Name`);
    mainBody.push(`\t\t\t}`);
    mainBody.push(`\t\t\treturn name`);
    mainBody.push(`\t\t})`);
    mainBody.push(`\t}`);
  }

  mainBody.push(``);
  mainBody.push(`\tr := gin.Default()`);

  if (hasLogger) {
    mainBody.push(`\tr.Use(runtime.RequestContextMiddleware())`);
    mainBody.push(``);
  }

  if (ast.router.cors) {
    const c = ast.router.cors;
    mainBody.push(`\tr.Use(cors.New(cors.Config{`);
    mainBody.push(
      `\t\tAllowOrigins:     []string{${c.allowOrigins.map((o) => renderEnvString(o, ast.env)).join(", ")}},`,
    );
    mainBody.push(
      `\t\tAllowMethods:     []string{${c.allowMethods.map((m) => renderEnvString(m, ast.env)).join(", ")}},`,
    );
    mainBody.push(
      `\t\tAllowHeaders:     []string{${c.allowHeaders.map((h) => renderEnvString(h, ast.env)).join(", ")}},`,
    );
    if (c.allowCredentials !== undefined) {
      mainBody.push(`\t\tAllowCredentials: ${c.allowCredentials},`);
    }
    if (c.exposeHeaders && c.exposeHeaders.length > 0) {
      mainBody.push(
        `\t\tExposeHeaders:    []string{${c.exposeHeaders.map((h) => renderEnvString(h, ast.env)).join(", ")}},`,
      );
    }
    if (c.maxAge !== undefined) {
      mainBody.push(`\t\tMaxAge:           ${c.maxAge},`);
    }
    mainBody.push(`\t}))`);
    mainBody.push(``);
  }

  const hc = ast.options.runtime?.healthCheck;
  const hcEnabled = hc?.enabled ?? true;
  const livenessPath = hc?.livenessPath ?? "/healthz";
  const readinessPath = hc?.readinessPath ?? "/readyz";

  if (hcEnabled) {
    mainBody.push(``);
    mainBody.push(`\tr.GET("${livenessPath}", func(c *gin.Context) {`);
    mainBody.push(`\t\tc.JSON(http.StatusOK, gin.H{"status": "ok"})`);
    mainBody.push(`\t})`);
    mainBody.push(`\tr.GET("${readinessPath}", func(c *gin.Context) {`);
    mainBody.push(`\t\tc.JSON(http.StatusOK, gin.H{"status": "ready"})`);
    mainBody.push(`\t})`);
  }

  mainBody.push(`\tapi := r.Group("${ast.router.prefix}")`);
  mainBody.push(`\t${routesPkg}.RegisterRoutes(${routeArgs.join(", ")})`);

  if (!hasConfig) {
    mainBody.push(``);
    mainBody.push(`\taddr := os.Getenv("PORT")`);
    mainBody.push(`\tif addr == "" {`);
    mainBody.push(`\t\taddr = ":8080"`);
    mainBody.push(`\t}`);
    mainBody.push(`\tif !strings.HasPrefix(addr, ":") {`);
    mainBody.push(`\t\taddr = ":" + addr`);
    mainBody.push(`\t}`);
  }
  mainBody.push(``);
  mainBody.push(`\tsrv := &http.Server{`);
  mainBody.push(`\t\tAddr:    ${hasConfig ? "cfg.PORT" : "addr"},`);
  mainBody.push(`\t\tHandler: r,`);
  mainBody.push(`\t}`);
  mainBody.push(``);
  mainBody.push(`\tgo func() {`);
  mainBody.push(`\t\tif err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {`);
  mainBody.push(`\t\t\tpanic(err)`);
  mainBody.push(`\t\t}`);
  mainBody.push(`\t}()`);
  mainBody.push(``);
  mainBody.push(`\tquit := make(chan os.Signal, 1)`);
  mainBody.push(`\tsignal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)`);
  mainBody.push(`\t<-quit`);
  mainBody.push(``);
  const shutdownTimeout = ast.options.runtime?.shutdownTimeout ?? 5;
  mainBody.push(
    `\tctx, cancel := context.WithTimeout(context.Background(), ${shutdownTimeout}*time.Second)`,
  );
  mainBody.push(`\tdefer cancel()`);
  mainBody.push(`\tif err := srv.Shutdown(ctx); err != nil {`);
  mainBody.push(`\t\tpanic(err)`);
  mainBody.push(`\t}`);

  return {
    path: serverFilePath,
    regions: [
      {
        id: `${serverMainRegionId}.0imports`,
        stableHash: `${serverFilePath}:${serverMainRegionId}:imports`,
        owner: adapter?.name ?? "schemago",
        language: "go",
        content: `import (\n${[...new Set(imports)]
          .sort()
          .map((i) => `\t${i}`)
          .join("\n")}\n)`,
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
