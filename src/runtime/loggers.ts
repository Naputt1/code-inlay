import type { LoggerConfig, GeneratedFilePatch } from "../types/index.js";

const loggerImplId = "runtime.logger.impl";
const loggerFilePath = "pkg/runtime/logger.go";

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
  const imports = generateImports(cfg);
  const configParts = generateLoggerConfigParts();
  const implParts = generateLoggerImplRaw(cfg);
  const parts = [`package runtime`];
  if (imports) parts.push(``, imports);
  parts.push(``, configParts, ``);
  parts.push(implParts);
  return parts.join("\n");
}

function generateImports(cfg: LoggerConfig): string {
  switch (cfg.provider) {
    case "slog":
      return [`import (`, `\t"context"`, `\t"log/slog"`, `\t"os"`, `)`].join("\n");
    case "zerolog":
      return [`import (`, `\t"context"`, `\t"os"`, ``, `\t"github.com/rs/zerolog"`, `)`].join("\n");
    case "logrus":
      return [`import (`, `\t"context"`, `\t"os"`, ``, `\t"github.com/sirupsen/logrus"`, `)`].join(
        "\n",
      );
    default:
      return `import "context"`;
  }
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

function generateLoggerConfigParts(): string {
  return [
    `// LoggerConfig configures the logger level and output format.`,
    `type LoggerConfig struct {`,
    `\tLevel    string \`json:"level"    yaml:"level"\``,
    `\tFormat   string \`json:"format"   yaml:"format"\``,
    `}`,
    ``,
    `type ctxKey string`,
    ``,
    `const (`,
    `\tctxKeyRequestID ctxKey = "request_id"`,
    `\tctxKeyRoute     ctxKey = "route"`,
    `\tctxKeyMethod    ctxKey = "method"`,
    `)`,
    ``,
    `type noopLogger struct{}`,
    ``,
    `func (l *noopLogger) Info(msg string, keysAndValues ...any)  {}`,
    `func (l *noopLogger) Error(msg string, keysAndValues ...any) {}`,
    `func (l *noopLogger) With(keysAndValues ...any) Logger       { return l }`,
    ``,
    `var defaultLogger Logger = &noopLogger{}`,
    ``,
    `// SetDefaultLogger sets the package-level default logger.`,
    `// Handlers and usecases can access it via L().`,
    `func SetDefaultLogger(l Logger) { defaultLogger = l }`,
    ``,
    `// L returns the package-level default logger.`,
    `func L() Logger { return defaultLogger }`,
    ``,
    `// CtxLogger returns a Logger enriched with request-scoped values from ctx.`,
    `// Use this in handlers and usecases instead of L() to get route, method, and request_id in log output.`,
    `func CtxLogger(ctx context.Context) Logger {`,
    `\tl := L()`,
    `\tif ctx == nil { return l }`,
    `\tif id, ok := ctx.Value(ctxKeyRequestID).(string); ok && id != "" {`,
    `\t\tl = l.With("request_id", id)`,
    `\t}`,
    `\tif route, ok := ctx.Value(ctxKeyRoute).(string); ok && route != "" {`,
    `\t\tl = l.With("route", route)`,
    `\t}`,
    `\tif method, ok := ctx.Value(ctxKeyMethod).(string); ok && method != "" {`,
    `\t\tl = l.With("method", method)`,
    `\t}`,
    `\treturn l`,
    `}`,
  ].join("\n");
}

function generateLoggerImplRaw(cfg: LoggerConfig): string {
  switch (cfg.provider) {
    case "slog":
      return slogImpl(cfg);
    case "zerolog":
      return zerologImpl(cfg);
    case "logrus":
      return logrusImpl(cfg);
    case "none":
      return `// NewLogger creates a no-op Logger that discards all output.
func NewLogger(cfg LoggerConfig) Logger {
\treturn &noopLogger{}
}`;
  }
}

function slogImpl(cfg: LoggerConfig): string {
  const format = cfg.format ?? "json";

  const levelSwitch = [
    `\tvar level slog.Level`,
    `\tswitch cfg.Level {`,
    `\tcase "debug":`,
    `\t\tlevel = slog.LevelDebug`,
    `\tcase "warn":`,
    `\t\tlevel = slog.LevelWarn`,
    `\tcase "error":`,
    `\t\tlevel = slog.LevelError`,
    `\tdefault:`,
    `\t\tlevel = slog.LevelInfo`,
    `\t}`,
  ].join("\n");

  const handlerOpts = `&slog.HandlerOptions{Level: level, AddSource: true}`;
  const handlerInit =
    format === "text"
      ? `\thandler := slog.NewTextHandler(os.Stdout, ${handlerOpts})`
      : `\thandler := slog.NewJSONHandler(os.Stdout, ${handlerOpts})`;

  return [
    `type slogLogger struct {`,
    `\tlogger *slog.Logger`,
    `}`,
    ``,
    `// NewLogger creates a new Logger backed by slog.`,
    `func NewLogger(cfg LoggerConfig) Logger {`,
    levelSwitch,
    handlerInit,
    `\treturn &slogLogger{logger: slog.New(handler)}`,
    `}`,
    ``,
    `func (l *slogLogger) Info(msg string, keysAndValues ...any) {`,
    `\tl.logger.Info(msg, keysAndValues...)`,
    `}`,
    ``,
    `func (l *slogLogger) Error(msg string, keysAndValues ...any) {`,
    `\tl.logger.Error(msg, keysAndValues...)`,
    `}`,
    ``,
    `func (l *slogLogger) With(keysAndValues ...any) Logger {`,
    `\treturn &slogLogger{logger: l.logger.With(keysAndValues...)}`,
    `}`,
  ].join("\n");
}

function zerologImpl(cfg: LoggerConfig): string {
  const format = cfg.format ?? "json";

  const levelSwitch = [
    `\tvar level zerolog.Level`,
    `\tswitch cfg.Level {`,
    `\tcase "debug":`,
    `\t\tlevel = zerolog.DebugLevel`,
    `\tcase "warn":`,
    `\t\tlevel = zerolog.WarnLevel`,
    `\tcase "error":`,
    `\t\tlevel = zerolog.ErrorLevel`,
    `\tdefault:`,
    `\t\tlevel = zerolog.InfoLevel`,
    `\t}`,
  ].join("\n");

  const loggerInit =
    format === "text"
      ? `\treturn &zerologLogger{logger: zerolog.New(zerolog.ConsoleWriter{Out: os.Stdout}).Level(level).With().Caller().Logger()}`
      : `\treturn &zerologLogger{logger: zerolog.New(os.Stdout).Level(level).With().Caller().Logger()}`;

  return [
    `type zerologLogger struct {`,
    `\tlogger zerolog.Logger`,
    `}`,
    ``,
    `// NewLogger creates a new Logger backed by zerolog.`,
    `func NewLogger(cfg LoggerConfig) Logger {`,
    levelSwitch,
    loggerInit,
    `}`,
    ``,
    `func (l *zerologLogger) Info(msg string, keysAndValues ...any) {`,
    `\tl.logger.Info().Fields(toZerologFields(keysAndValues...)).Msg(msg)`,
    `}`,
    ``,
    `func (l *zerologLogger) Error(msg string, keysAndValues ...any) {`,
    `\tl.logger.Error().Fields(toZerologFields(keysAndValues...)).Msg(msg)`,
    `}`,
    ``,
    `func (l *zerologLogger) With(keysAndValues ...any) Logger {`,
    `\treturn &zerologLogger{logger: l.logger.With().Fields(toZerologFields(keysAndValues...)).Logger()}`,
    `}`,
    ``,
    `func toZerologFields(keysAndValues ...any) map[string]any {`,
    `\tfields := make(map[string]any, len(keysAndValues)/2)`,
    `\tfor i := 0; i < len(keysAndValues)-1; i += 2 {`,
    `\t\tif key, ok := keysAndValues[i].(string); ok {`,
    `\t\t\tfields[key] = keysAndValues[i+1]`,
    `\t\t}`,
    `\t}`,
    `\treturn fields`,
    `}`,
  ].join("\n");
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
