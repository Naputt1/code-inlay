import type { LoggerConfig, GeneratedFilePatch } from "../types/index.js";
import * as go from "@schemago/goast";

const loggerImplId = "runtime.logger.impl";
const loggerFilePath = "pkg/runtime/logger.go";

function printDecl(decl: go.Declaration): string {
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, decl, 0);
  return sb.toString().replace(/\n$/, "");
}

export function generateLoggerCode(loggerConfig: LoggerConfig): GeneratedFilePatch[] {
  const patches: GeneratedFilePatch[] = [];
  const content = generateLoggerFileContent(loggerConfig);
  patches.push({
    path: loggerFilePath,
    regions: [
      {
        id: loggerImplId,
        stableHash: `runtime:logger:impl:${loggerConfig.provider}:${loggerConfig.level ?? "info"}:${loggerConfig.format ?? "json"}`,
        owner: "runtime",
        language: "go",
        content,
      },
    ],
  });
  return patches;
}

function generateLoggerFileContent(cfg: LoggerConfig): string {
  const parts: string[] = [];
  parts.push("package runtime");

  const importStr = generateImports(cfg);
  if (importStr) parts.push("", importStr);

  const configStr = generateLoggerConfigParts();
  if (configStr) parts.push("", configStr);

  const implStr = generateLoggerImpl(cfg);
  if (implStr) parts.push("", implStr);

  return parts.join("\n");
}

export function getLoggerGoModules(loggerConfig: LoggerConfig): string[] {
  switch (loggerConfig.provider) {
    case "zerolog":
      return ["github.com/rs/zerolog"];
    case "logrus":
      return ["github.com/sirupsen/logrus"];
    default:
      return [];
  }
}

function generateImports(cfg: LoggerConfig): string {
  switch (cfg.provider) {
    case "slog":
      return printDecl(
        go.genDecl(
          "import",
          go.importSpec("context"),
          go.importSpec("log/slog"),
          go.importSpec("os"),
        ),
      );
    case "zerolog":
      return printDecl(
        go.genDecl(
          "import",
          go.importSpec("context"),
          go.importSpec("os"),
          go.importSpec("github.com/rs/zerolog"),
        ),
      );
    case "logrus":
      return printDecl(
        go.genDecl(
          "import",
          go.importSpec("context"),
          go.importSpec("os"),
          go.importSpec("github.com/sirupsen/logrus"),
        ),
      );
    default:
      return printDecl(go.genDecl("import", go.importSpec("context")));
  }
}

function generateLoggerConfigParts(): string {
  const lines: string[] = [];
  const indent = "\t";

  lines.push("// LoggerConfig configures the logger level and output format.");
  lines.push("type LoggerConfig struct {");
  lines.push(`${indent}Level    string \`json:"level"    yaml:"level"\``);
  lines.push(`${indent}Format   string \`json:"format"   yaml:"format"\``);
  lines.push("}");
  lines.push("");
  lines.push("type ctxKey string");
  lines.push("");
  lines.push("const (");
  lines.push(`${indent}ctxKeyRequestID ctxKey = "request_id"`);
  lines.push(`${indent}ctxKeyRoute     ctxKey = "route"`);
  lines.push(`${indent}ctxKeyMethod    ctxKey = "method"`);
  lines.push(")");
  lines.push("");
  lines.push("type noopLogger struct{}");
  lines.push("");
  lines.push("func (l *noopLogger) Info(msg string, keysAndValues ...any)  {}");
  lines.push("func (l *noopLogger) Error(msg string, keysAndValues ...any) {}");
  lines.push("func (l *noopLogger) With(keysAndValues ...any) Logger       { return l }");
  lines.push("");
  lines.push("var defaultLogger Logger = &noopLogger{}");
  lines.push("");
  lines.push("// SetDefaultLogger sets the package-level default logger.");
  lines.push("// Handlers and usecases can access it via L().");
  lines.push("func SetDefaultLogger(l Logger) { defaultLogger = l }");
  lines.push("");
  lines.push("// L returns the package-level default logger.");
  lines.push("func L() Logger { return defaultLogger }");
  lines.push("");
  lines.push("// CtxLogger returns a Logger enriched with request-scoped values from ctx.");
  lines.push(
    "// Use this in handlers and usecases instead of L() to get route, method, and request_id in log output.",
  );
  lines.push("func CtxLogger(ctx context.Context) Logger {");
  lines.push(`${indent}l := L()`);
  lines.push(`${indent}if ctx == nil { return l }`);

  const ctxKeys: [string, string, string][] = [
    ["id", "ctxKeyRequestID", "request_id"],
    ["route", "ctxKeyRoute", "route"],
    ["method", "ctxKeyMethod", "method"],
  ];
  for (const [varName, keyName, label] of ctxKeys) {
    const ta = `ctx.Value(${keyName}).(string)`;
    lines.push(`${indent}if ${varName}, ok := ${ta}; ok && ${varName} != "" {`);
    lines.push(`${indent}${indent}l = l.With("${label}", ${varName})`);
    lines.push(`${indent}}`);
  }

  lines.push(`${indent}return l`);
  lines.push("}");

  return lines.join("\n");
}

function generateLoggerImpl(cfg: LoggerConfig): string {
  switch (cfg.provider) {
    case "slog":
      return slogImpl(cfg);
    case "zerolog":
      return zerologImpl(cfg);
    case "logrus":
      return logrusImpl(cfg);
    case "none":
      return noneImpl();
  }
  return "";
}

function noneImpl(): string {
  return `// NewLogger creates a no-op Logger that discards all output.
func NewLogger(cfg LoggerConfig) Logger {
\treturn &noopLogger{}
}`;
}

function slogImpl(cfg: LoggerConfig): string {
  const format = cfg.format ?? "json";

  const structDecl = go.genDecl(
    "type",
    go.typeSpec(
      "slogLogger",
      go.structType(go.field(["logger"], go.star(go.qual("slog", "Logger")))),
    ),
  );

  const bodyStmts: go.Statement[] = [];

  bodyStmts.push(go.declStmt(go.genDecl("var", go.valueSpec(["level"], go.qual("slog", "Level")))));

  bodyStmts.push(
    go.switchStmt(
      undefined,
      go.sel(go.id("cfg"), "Level"),
      go.caseClause(
        [go.str("debug")],
        go.assign([go.id("level")], "=", [go.qual("slog", "LevelDebug")]),
      ),
      go.caseClause(
        [go.str("warn")],
        go.assign([go.id("level")], "=", [go.qual("slog", "LevelWarn")]),
      ),
      go.caseClause(
        [go.str("error")],
        go.assign([go.id("level")], "=", [go.qual("slog", "LevelError")]),
      ),
      go.defaultClause(go.assign([go.id("level")], "=", [go.qual("slog", "LevelInfo")])),
    ),
  );

  const handlerOpts = go.addr(
    go.elt(
      go.qual("slog", "HandlerOptions"),
      go.kv("Level", go.id("level")),
      go.kv("AddSource", go.id("true")),
    ),
  );

  const handlerExpr: go.Expression =
    format === "text"
      ? go.call(go.qual("slog", "NewTextHandler"), go.qual("os", "Stdout"), handlerOpts)
      : go.call(go.qual("slog", "NewJSONHandler"), go.qual("os", "Stdout"), handlerOpts);

  bodyStmts.push(go.def(go.id("handler"), handlerExpr));

  bodyStmts.push(
    go.return_(
      go.addr(
        go.elt(
          go.id("slogLogger"),
          go.kv("logger", go.call(go.qual("slog", "New"), go.id("handler"))),
        ),
      ),
    ),
  );

  const newLogger = go.function_(
    "NewLogger",
    [go.field(["cfg"], go.id("LoggerConfig"))],
    [go.field([], go.id("Logger"))],
    go.block(...bodyStmts),
  );
  newLogger.doc = {
    kind: "CommentGroup",
    list: [{ kind: "Comment", text: "// NewLogger creates a new Logger backed by slog." }],
  };

  function variadicField(name: string, typ: go.Type): go.Field {
    const t = typ.kind === "SliceType" ? typ : go.sliceType(typ);
    return { kind: "Field", names: [name], type: t, variadic: true };
  }

  function callWithEllipsis(func: go.Expression, args: go.Expression[]): go.CallExpr {
    const c = go.call(func, ...args);
    c.ellipsis = true;
    return c;
  }

  const infoMethod = go.method(
    go.field(["l"], go.star(go.id("slogLogger"))),
    "Info",
    [go.field(["msg"], go.id("string")), variadicField("keysAndValues", go.id("any"))],
    undefined,
    go.block(
      go.expr(
        callWithEllipsis(go.sel(go.sel(go.id("l"), "logger"), "Info"), [
          go.id("msg"),
          go.id("keysAndValues"),
        ]),
      ),
    ),
  );

  const errorMethod = go.method(
    go.field(["l"], go.star(go.id("slogLogger"))),
    "Error",
    [go.field(["msg"], go.id("string")), variadicField("keysAndValues", go.id("any"))],
    undefined,
    go.block(
      go.expr(
        callWithEllipsis(go.sel(go.sel(go.id("l"), "logger"), "Error"), [
          go.id("msg"),
          go.id("keysAndValues"),
        ]),
      ),
    ),
  );

  const withMethod = go.method(
    go.field(["l"], go.star(go.id("slogLogger"))),
    "With",
    [variadicField("keysAndValues", go.id("any"))],
    [go.field([], go.id("Logger"))],
    go.block(
      go.return_(
        go.addr(
          go.elt(
            go.id("slogLogger"),
            go.kv(
              "logger",
              callWithEllipsis(go.sel(go.sel(go.id("l"), "logger"), "With"), [
                go.id("keysAndValues"),
              ]),
            ),
          ),
        ),
      ),
    ),
  );

  const sb = new go.StringBuilder();
  go.printDeclaration(sb, structDecl, 0);
  sb.pushLine("");
  go.printDeclaration(sb, newLogger, 0);
  sb.pushLine("");
  go.printDeclaration(sb, infoMethod, 0);
  go.printDeclaration(sb, errorMethod, 0);
  go.printDeclaration(sb, withMethod, 0);

  return sb.toString().replace(/\n$/, "");
}

function zerologImpl(cfg: LoggerConfig): string {
  const format = cfg.format ?? "json";

  const structDecl = go.genDecl(
    "type",
    go.typeSpec("zerologLogger", go.structType(go.field(["logger"], go.qual("zerolog", "Logger")))),
  );

  const bodyStmts: go.Statement[] = [];
  bodyStmts.push(
    go.declStmt(go.genDecl("var", go.valueSpec(["level"], go.qual("zerolog", "Level")))),
  );

  bodyStmts.push(
    go.switchStmt(
      undefined,
      go.sel(go.id("cfg"), "Level"),
      go.caseClause(
        [go.str("debug")],
        go.assign([go.id("level")], "=", [go.qual("zerolog", "DebugLevel")]),
      ),
      go.caseClause(
        [go.str("warn")],
        go.assign([go.id("level")], "=", [go.qual("zerolog", "WarnLevel")]),
      ),
      go.caseClause(
        [go.str("error")],
        go.assign([go.id("level")], "=", [go.qual("zerolog", "ErrorLevel")]),
      ),
      go.defaultClause(go.assign([go.id("level")], "=", [go.qual("zerolog", "InfoLevel")])),
    ),
  );

  const chain: go.Expression =
    format === "text"
      ? go.call(
          go.qual("zerolog", "New"),
          go.elt(go.qual("zerolog", "ConsoleWriter"), go.kv("Out", go.qual("os", "Stdout"))),
        )
      : go.call(go.qual("zerolog", "New"), go.qual("os", "Stdout"));

  const levelCall = go.call(go.sel(chain, "Level"), go.id("level"));
  const withCall = go.call(go.sel(levelCall, "With"));
  const callerCall = go.call(go.sel(withCall, "Caller"));
  const loggerCall = go.call(go.sel(callerCall, "Logger"));

  bodyStmts.push(go.return_(go.addr(go.elt(go.id("zerologLogger"), go.kv("logger", loggerCall)))));

  const newLogger = go.function_(
    "NewLogger",
    [go.field(["cfg"], go.id("LoggerConfig"))],
    [go.field([], go.id("Logger"))],
    go.block(...bodyStmts),
  );
  newLogger.doc = {
    kind: "CommentGroup",
    list: [{ kind: "Comment", text: "// NewLogger creates a new Logger backed by zerolog." }],
  };

  const infoBody = `func (l *zerologLogger) Info(msg string, keysAndValues ...any) {
\tl.logger.Info().Fields(toZerologFields(keysAndValues...)).Msg(msg)
}`;

  const errorBody = `func (l *zerologLogger) Error(msg string, keysAndValues ...any) {
\tl.logger.Error().Fields(toZerologFields(keysAndValues...)).Msg(msg)
}`;

  const withBody = `func (l *zerologLogger) With(keysAndValues ...any) Logger {
\treturn &zerologLogger{logger: l.logger.With().Fields(toZerologFields(keysAndValues...)).Logger()}
}`;

  const toZerologFieldsBody = `func toZerologFields(keysAndValues ...any) map[string]any {
\tfields := make(map[string]any, len(keysAndValues)/2)
\tfor i := 0; i < len(keysAndValues)-1; i += 2 {
\t\tif key, ok := keysAndValues[i].(string); ok {
\t\t\tfields[key] = keysAndValues[i+1]
\t\t}
\t}
\treturn fields
}`;

  const sb = new go.StringBuilder();
  go.printDeclaration(sb, structDecl, 0);
  sb.pushLine("");
  go.printDeclaration(sb, newLogger, 0);
  sb.pushLine("");
  sb.pushLine(infoBody);
  sb.pushLine(errorBody);
  sb.pushLine(withBody);
  sb.pushLine(toZerologFieldsBody);

  return sb.toString().replace(/\n$/, "");
}

function logrusImpl(_cfg: LoggerConfig): string {
  const levelSwitch = [
    `\tvar ll logrus.Level`,
    `\tswitch cfg.Level {`,
    `\tcase "debug":`,
    `\t\tll = logrus.DebugLevel`,
    `\tcase "warn":`,
    `\t\tll = logrus.WarnLevel`,
    `\tcase "error":`,
    `\t\tll = logrus.ErrorLevel`,
    `\tdefault:`,
    `\t\tll = logrus.InfoLevel`,
    `\t}`,
  ].join("\n");

  return [
    `type logrusLogger struct {`,
    `\tentry *logrus.Entry`,
    `}`,
    ``,
    `// NewLogger creates a new Logger backed by logrus.`,
    `func NewLogger(cfg LoggerConfig) Logger {`,
    `\tl := logrus.New()`,
    `\tl.SetOutput(os.Stdout)`,
    levelSwitch,
    `\tl.SetLevel(ll)`,
    `\tl.SetReportCaller(true)`,
    `\tif cfg.Format == "text" {`,
    `\t\tl.SetFormatter(&logrus.TextFormatter{})`,
    `\t} else {`,
    `\t\tl.SetFormatter(&logrus.JSONFormatter{})`,
    `\t}`,
    `\treturn &logrusLogger{entry: logrus.NewEntry(l)}`,
    `}`,
    ``,
    `func (l *logrusLogger) Info(msg string, keysAndValues ...any) {`,
    `\tl.entry.WithFields(toLogrusFields(keysAndValues...)).Info(msg)`,
    `}`,
    ``,
    `func (l *logrusLogger) Error(msg string, keysAndValues ...any) {`,
    `\tl.entry.WithFields(toLogrusFields(keysAndValues...)).Error(msg)`,
    `}`,
    ``,
    `func (l *logrusLogger) With(keysAndValues ...any) Logger {`,
    `\treturn &logrusLogger{entry: l.entry.WithFields(toLogrusFields(keysAndValues...))}`,
    `}`,
    ``,
    `func toLogrusFields(keysAndValues ...any) logrus.Fields {`,
    `\tfields := make(logrus.Fields, len(keysAndValues)/2)`,
    `\tfor i := 0; i < len(keysAndValues)-1; i += 2 {`,
    `\t\tif key, ok := keysAndValues[i].(string); ok {`,
    `\t\t\tfields[key] = keysAndValues[i+1]`,
    `\t\t}`,
    `\t}`,
    `\treturn fields`,
    `}`,
  ].join("\n");
}
