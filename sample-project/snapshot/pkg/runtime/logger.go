package runtime

import (
	"context"
	"log/slog"
	"os"
)

// LoggerConfig configures the logger level and output format.
type LoggerConfig struct {
	Level  string `json:"level"    yaml:"level"`
	Format string `json:"format"   yaml:"format"`
}

type ctxKey string

const (
	ctxKeyRequestID ctxKey = "request_id"
	ctxKeyRoute     ctxKey = "route"
	ctxKeyMethod    ctxKey = "method"
)

type noopLogger struct{}

func (l *noopLogger) Info(msg string, keysAndValues ...any)  {}
func (l *noopLogger) Error(msg string, keysAndValues ...any) {}
func (l *noopLogger) With(keysAndValues ...any) Logger       { return l }

var defaultLogger Logger = &noopLogger{}

// SetDefaultLogger sets the package-level default logger.
// Handlers and usecases can access it via L().
func SetDefaultLogger(l Logger) { defaultLogger = l }

// L returns the package-level default logger.
func L() Logger { return defaultLogger }

// CtxLogger returns a Logger enriched with request-scoped values from ctx.
// Use this in handlers and usecases instead of L() to get route, method, and request_id in log output.
func CtxLogger(ctx context.Context) Logger {
	l := L()
	if ctx == nil {
		return l
	}
	if id, ok := ctx.Value(ctxKeyRequestID).(string); ok && id != "" {
		l = l.With("request_id", id)
	}
	if route, ok := ctx.Value(ctxKeyRoute).(string); ok && route != "" {
		l = l.With("route", route)
	}
	if method, ok := ctx.Value(ctxKeyMethod).(string); ok && method != "" {
		l = l.With("method", method)
	}
	return l
}

type slogLogger struct {
	logger *slog.Logger
}

// NewLogger creates a new Logger backed by slog.
func NewLogger(cfg LoggerConfig) Logger {
	var level slog.Level
	switch cfg.Level {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	default:
		level = slog.LevelInfo
	}
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level:     level,
		AddSource: true,
	})
	return &slogLogger{
		logger: slog.New(handler),
	}
}

func (l *slogLogger) Info(msg string, keysAndValues ...any) {
	l.logger.Info(msg, keysAndValues...)
}
func (l *slogLogger) Error(msg string, keysAndValues ...any) {
	l.logger.Error(msg, keysAndValues...)
}
func (l *slogLogger) With(keysAndValues ...any) Logger {
	return &slogLogger{
		logger: l.logger.With(keysAndValues...),
	}
}
