import { describe, it, expect } from "vitest";
import * as go from "@schemago/go-ast";
import { generateLoggerCode, getLoggerGoModules } from "../src/runtime/loggers-goast.js";
import type { LoggerConfig } from "../src/types/index.js";

function contentFor(cfg: LoggerConfig): string {
  return generateLoggerCode(cfg)[0].regions[0].content;
}

describe("generateLoggerCode (go-ast)", () => {
  it("generates runtime/logger.go patch", () => {
    const patches = generateLoggerCode({ provider: "slog", level: "info", format: "json" });
    expect(patches).toHaveLength(1);
    expect(patches[0].path).toBe("pkg/runtime/logger.go");
  });

  it("starts with package runtime", () => {
    const c = contentFor({ provider: "slog" });
    expect(c).toMatch(/^package runtime/);
  });

  describe("imports", () => {
    it("slog imports context, log/slog, os", () => {
      const c = contentFor({ provider: "slog" });
      expect(c).toContain('"context"');
      expect(c).toContain('"log/slog"');
      expect(c).toContain('"os"');
    });

    it("zerolog imports context, os, rs/zerolog", () => {
      const c = contentFor({ provider: "zerolog" });
      expect(c).toContain('"context"');
      expect(c).toContain('"os"');
      expect(c).toContain('"github.com/rs/zerolog"');
    });

    it("logrus imports context, os, sirupsen/logrus", () => {
      const c = contentFor({ provider: "logrus" });
      expect(c).toContain('"context"');
      expect(c).toContain('"os"');
      expect(c).toContain('"github.com/sirupsen/logrus"');
    });

    it("none imports only context", () => {
      const c = contentFor({ provider: "none" });
      expect(c).toContain('"context"');
      expect(c).not.toContain('"log/slog"');
      expect(c).not.toContain('"github.com/rs/zerolog"');
      expect(c).not.toContain('"github.com/sirupsen/logrus"');
    });
  });

  describe("shared config parts", () => {
    it("has LoggerConfig struct with Level and Format", () => {
      const c = contentFor({ provider: "slog" });
      expect(c).toContain("type LoggerConfig struct");
      expect(c).toContain("Level");
      expect(c).toContain("Format");
    });

    it("has json and yaml tags on LoggerConfig", () => {
      const c = contentFor({ provider: "slog" });
      expect(c).toContain('json:"level"');
      expect(c).toContain('yaml:"level"');
      expect(c).toContain('json:"format"');
      expect(c).toContain('yaml:"format"');
    });

    it("has ctxKey type and const block", () => {
      const c = contentFor({ provider: "slog" });
      expect(c).toContain("type ctxKey string");
      expect(c).toContain("ctxKeyRequestID");
      expect(c).toContain("ctxKeyRoute");
      expect(c).toContain("ctxKeyMethod");
    });

    it("has noopLogger struct with Info, Error, With", () => {
      const c = contentFor({ provider: "slog" });
      expect(c).toContain("type noopLogger struct{}");
      expect(c).toContain("func (l *noopLogger) Info(msg string, keysAndValues ...any)");
      expect(c).toContain("func (l *noopLogger) Error(msg string, keysAndValues ...any)");
      expect(c).toContain("func (l *noopLogger) With(keysAndValues ...any) Logger");
    });

    it("has defaultLogger variable", () => {
      const c = contentFor({ provider: "slog" });
      expect(c).toContain("var defaultLogger Logger = &noopLogger{}");
    });

    it("has SetDefaultLogger", () => {
      const c = contentFor({ provider: "slog" });
      expect(c).toContain("func SetDefaultLogger(l Logger)");
    });

    it("has L()", () => {
      const c = contentFor({ provider: "slog" });
      expect(c).toContain("func L() Logger");
    });

    it("has CtxLogger with context extraction", () => {
      const c = contentFor({ provider: "slog" });
      expect(c).toContain("func CtxLogger(ctx context.Context) Logger");
      expect(c).toContain("ctx.Value(ctxKeyRequestID).(string)");
      expect(c).toContain('l.With("request_id"');
      expect(c).toContain('l.With("route"');
      expect(c).toContain('l.With("method"');
    });
  });

  describe("slog implementation", () => {
    it("has slogLogger struct", () => {
      const c = contentFor({ provider: "slog" });
      expect(c).toContain("type slogLogger struct");
      expect(c).toContain("logger *slog.Logger");
    });

    it("has NewLogger with level switch", () => {
      const c = contentFor({ provider: "slog" });
      expect(c).toContain("func NewLogger(cfg LoggerConfig) Logger");
      expect(c).toContain("var level slog.Level");
      expect(c).toContain("slog.LevelDebug");
      expect(c).toContain("slog.LevelWarn");
      expect(c).toContain("slog.LevelError");
      expect(c).toContain("slog.LevelInfo");
    });

    it("uses JSON handler by default", () => {
      const c = contentFor({ provider: "slog" });
      expect(c).toContain("slog.NewJSONHandler");
      expect(c).toContain("HandlerOptions");
      expect(c).toContain("Level: level");
      expect(c).toContain("AddSource: true");
    });

    it("uses text handler when format is text", () => {
      const c = contentFor({ provider: "slog", format: "text" });
      expect(c).toContain("slog.NewTextHandler");
    });

    it("has Info method delegating to slog", () => {
      const c = contentFor({ provider: "slog" });
      expect(c).toContain("func (l *slogLogger) Info(msg string, keysAndValues ...any)");
      expect(c).toContain("l.logger.Info(msg, keysAndValues...)");
    });

    it("has Error method delegating to slog", () => {
      const c = contentFor({ provider: "slog" });
      expect(c).toContain("func (l *slogLogger) Error(msg string, keysAndValues ...any)");
      expect(c).toContain("l.logger.Error(msg, keysAndValues...)");
    });

    it("has With method delegating to slog", () => {
      const c = contentFor({ provider: "slog" });
      expect(c).toContain("func (l *slogLogger) With(keysAndValues ...any) Logger");
      expect(c).toContain("l.logger.With(keysAndValues...)");
    });
  });

  describe("zerolog implementation", () => {
    it("has zerologLogger struct", () => {
      const c = contentFor({ provider: "zerolog" });
      expect(c).toContain("type zerologLogger struct");
      expect(c).toContain("logger zerolog.Logger");
    });

    it("has NewLogger with level switch", () => {
      const c = contentFor({ provider: "zerolog" });
      expect(c).toContain("func NewLogger(cfg LoggerConfig) Logger");
      expect(c).toContain("var level zerolog.Level");
      expect(c).toContain("zerolog.DebugLevel");
      expect(c).toContain("zerolog.InfoLevel");
    });

    it("uses JSON output by default", () => {
      const c = contentFor({ provider: "zerolog" });
      expect(c).toContain("zerolog.New(os.Stdout)");
    });

    it("uses ConsoleWriter for text format", () => {
      const c = contentFor({ provider: "zerolog", format: "text" });
      expect(c).toContain("zerolog.ConsoleWriter");
      expect(c).toContain("os.Stdout");
    });

    it("has Info method with method chain", () => {
      const c = contentFor({ provider: "zerolog" });
      expect(c).toContain("func (l *zerologLogger) Info(msg string, keysAndValues ...any)");
      expect(c).toContain("l.logger.Info().Fields(toZerologFields(keysAndValues...)).Msg(msg)");
    });

    it("has Error method with method chain", () => {
      const c = contentFor({ provider: "zerolog" });
      expect(c).toContain("l.logger.Error().Fields(toZerologFields(keysAndValues...)).Msg(msg)");
    });

    it("has With method", () => {
      const c = contentFor({ provider: "zerolog" });
      expect(c).toContain("func (l *zerologLogger) With(keysAndValues ...any) Logger");
    });

    it("has toZerologFields helper", () => {
      const c = contentFor({ provider: "zerolog" });
      expect(c).toContain("func toZerologFields(keysAndValues ...any) map[string]any");
      const lines = c.split("\n");
      const hasMake = lines.some(l => l.includes("make(") && l.includes("map[string]any") && l.includes("len(keysAndValues)/2"));
      expect(hasMake).toBe(true);
      expect(c).toContain("for i := 0; i < len(keysAndValues)-1; i += 2");
      expect(c).toContain("if key, ok := keysAndValues[i].(string); ok");
    });
  });

  describe("logrus implementation", () => {
    it("has logrusLogger struct", () => {
      const c = contentFor({ provider: "logrus" });
      expect(c).toContain("type logrusLogger struct");
      expect(c).toContain("entry *logrus.Entry");
    });

    it("has NewLogger with full setup", () => {
      const c = contentFor({ provider: "logrus" });
      expect(c).toContain("func NewLogger(cfg LoggerConfig) Logger");
      expect(c).toContain("logrus.New()");
      expect(c).toContain("l.SetOutput(os.Stdout)");
      expect(c).toContain("l.SetLevel(ll)");
      expect(c).toContain("l.SetReportCaller(true)");
      expect(c).toContain("&logrus.JSONFormatter{}");
    });

    it("uses text formatter when format is text", () => {
      const c = contentFor({ provider: "logrus", format: "text" });
      expect(c).toContain("&logrus.TextFormatter{}");
    });

    it("has Info method with WithFields chain", () => {
      const c = contentFor({ provider: "logrus" });
      expect(c).toContain("l.entry.WithFields(toLogrusFields(keysAndValues...)).Info(msg)");
    });

    it("has toLogrusFields helper", () => {
      const c = contentFor({ provider: "logrus" });
      expect(c).toContain("func toLogrusFields(keysAndValues ...any) logrus.Fields");
      expect(c).toContain("make(logrus.Fields, len(keysAndValues)/2)");
      expect(c).toContain("if key, ok := keysAndValues[i].(string); ok");
    });
  });

  describe("none implementation", () => {
    it("has simple NewLogger returning &noopLogger{}", () => {
      const c = contentFor({ provider: "none" });
      expect(c).toContain("func NewLogger(cfg LoggerConfig) Logger");
      expect(c).toContain("return &noopLogger{}");
    });
  });
});

describe("getLoggerGoModules (go-ast)", () => {
  it("returns no modules for slog", () => {
    expect(getLoggerGoModules({ provider: "slog" })).toEqual([]);
  });

  it("returns zerolog module", () => {
    expect(getLoggerGoModules({ provider: "zerolog" })).toEqual(["github.com/rs/zerolog"]);
  });

  it("returns logrus module", () => {
    expect(getLoggerGoModules({ provider: "logrus" })).toEqual(["github.com/sirupsen/logrus"]);
  });

  it("returns no modules for none", () => {
    expect(getLoggerGoModules({ provider: "none" })).toEqual([]);
  });
});
