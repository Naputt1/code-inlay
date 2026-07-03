import type { AppAst, RuntimeConfig, GeneratedFilePatch } from "../types/index.js";
import { contentHash } from "../utils/hash.js";
import { generateLoggerCode } from "./loggers.js";

export function generateRuntimeCode(
  ast: AppAst,
  runtimeConfig: RuntimeConfig,
): GeneratedFilePatch[] {
  if (!runtimeConfig.enabled) return [];

  const patches: GeneratedFilePatch[] = [];
  const middlewareNames = runtimeConfig.middleware ?? [];
  const loggerConfig = runtimeConfig.logger;

  patches.push(generateRuntimeTypes());
  patches.push(generateHTTPError());

  if (loggerConfig) {
    const loggerPatches = generateLoggerCode(loggerConfig);
    patches.push(...loggerPatches);

    patches.push(...generateRuntimeContext(loggerConfig));

    const hasGin = ast.router.adapter === "gin";
    if (hasGin) {
      patches.push(generateRequestContextMiddleware());
    }
  }

  if (middlewareNames.length > 0) {
    patches.push(generateMiddlewareChain());
  }

  return patches;
}

function generateHTTPError(): GeneratedFilePatch {
  const content = [
    `package runtime`,
    ``,
    `// HTTPError is an error that carries an HTTP status code.`,
    `// Return this from a usecase to control the HTTP response status.`,
    `type HTTPError interface {`,
    `\terror`,
    `\tHTTPStatus() int`,
    `}`,
    ``,
    `// StatusError is a simple implementation of HTTPError.`,
    `type StatusError struct {`,
    `\tMsg    string \`json:"error"\``,
    `\tStatus int    \`json:"-"\``,
    `}`,
    ``,
    `func (e *StatusError) Error() string { return e.Msg }`,
    ``,
    `func (e *StatusError) HTTPStatus() int { return e.Status }`,
    ``,
    `// NewStatusError creates a new StatusError.`,
    `func NewStatusError(msg string, status int) *StatusError {`,
    `\treturn &StatusError{Msg: msg, Status: status}`,
    `}`,
  ].join("\n");

  return {
    path: "pkg/runtime/errors.go",
    regions: [
      {
        id: "runtime.errors.types",
        stableHash: `runtime:errors:types:${contentHash(content)}`,
        owner: "runtime",
        language: "go",
        content,
      },
    ],
  };
}

function generateRuntimeTypes(): GeneratedFilePatch {
  const content = [
    `package runtime`,
    ``,
    `import "context"`,
    ``,
    `// Context carries request-scoped values, tracing, and logging.`,
    `type Context interface {`,
    `\tcontext.Context`,
    `\tLogger() Logger`,
    `\tRequestID() string`,
    `\tParam(name string) string`,
    `}`,
    ``,
    `// Logger is a structured logging interface.`,
    `type Logger interface {`,
    `\tInfo(msg string, keysAndValues ...any)`,
    `\tError(msg string, keysAndValues ...any)`,
    `\tWith(keysAndValues ...any) Logger`,
    `}`,
    ``,
    `// Middleware is a request pipeline function.`,
    `type Middleware func(ctx Context, next func(Context) error) error`,
    ``,
    `// Handler is a typed request handler.`,
    `type Handler[Req, Res any] func(ctx Context, req Req) (Res, error)`,
  ].join("\n");

  return {
    path: "pkg/runtime/context.go",
    regions: [
      {
        id: "runtime.context.types",
        stableHash: `runtime:context:types:${contentHash(content)}`,
        owner: "runtime",
        language: "go",
        content,
      },
    ],
  };
}

function generateRuntimeContext(
  loggerConfig: NonNullable<RuntimeConfig["logger"]>,
): GeneratedFilePatch[] {
  const hasNewLogger = loggerConfig.provider !== "none";
  const body = [
    `package runtime`,
    ``,
    `import "context"`,
    ``,
    `// runtimeContext is a concrete implementation of Context.`,
    `type runtimeContext struct {`,
    `\tcontext.Context`,
    hasNewLogger ? `\tlogger    Logger` : ``,
    `\trequestID string`,
    `\tparams    map[string]string`,
    `}`,
    ``,
    hasNewLogger
      ? `// NewContext creates a new Context with the given logger.
func NewContext(ctx context.Context, logger Logger) Context {
\treturn &runtimeContext{
\t\tContext: ctx,
\t\tlogger:  logger,
\t}
}`
      : `// NewContext creates a new Context.
func NewContext(ctx context.Context) Context {
\treturn &runtimeContext{
\t\tContext: ctx,
\t}
}`,
    ``,
    hasNewLogger
      ? `func (c *runtimeContext) Logger() Logger { return c.logger }`
      : `func (c *runtimeContext) Logger() Logger { return &noopLogger{} }`,
    `func (c *runtimeContext) RequestID() string { return c.requestID }`,
    `func (c *runtimeContext) Param(name string) string { return c.params[name] }`,
  ].join("\n");

  return [
    {
      path: "pkg/runtime/runtime_context.go",
      regions: [
        {
          id: "runtime.context.impl",
          stableHash: `runtime:context:impl:${contentHash(body)}`,
          owner: "runtime",
          language: "go",
          content: body,
        },
      ],
    },
  ];
}

function generateRequestContextMiddleware(): GeneratedFilePatch {
  const body = [
    `package runtime`,
    ``,
    `import (`,
    `\t"context"`,
    `\t"crypto/rand"`,
    `\t"encoding/hex"`,
    `\t"time"`,
    ``,
    `\t"github.com/gin-gonic/gin"`,
    `)`,
    ``,
    `// RequestContextMiddleware enriches the request context with request_id, route, and method.`,
    `// It also logs an access log entry with duration and status when the request completes.`,
    `func RequestContextMiddleware() gin.HandlerFunc {`,
    `\treturn func(c *gin.Context) {`,
    `\t\tstart := time.Now()`,
    `\t\treqID := generateRequestID()`,
    ``,
    `\t\tctx := c.Request.Context()`,
    `\t\tctx = context.WithValue(ctx, ctxKeyRequestID, reqID)`,
    `\t\tctx = context.WithValue(ctx, ctxKeyRoute, c.FullPath())`,
    `\t\tctx = context.WithValue(ctx, ctxKeyMethod, c.Request.Method)`,
    `\t\tc.Request = c.Request.WithContext(ctx)`,
    ``,
    `\t\tc.Next()`,
    ``,
    `\t\tCtxLogger(ctx).Info("request completed",`,
    `\t\t\t"status", c.Writer.Status(),`,
    `\t\t\t"duration_ms", time.Since(start).Milliseconds(),`,
    `\t\t)`,
    `\t}`,
    `}`,
    ``,
    `func generateRequestID() string {`,
    `\tb := make([]byte, 8)`,
    `\t_, _ = rand.Read(b)`,
    `\treturn hex.EncodeToString(b)`,
    `}`,
  ].join("\n");

  return {
    path: "pkg/runtime/request_context.go",
    regions: [
      {
        id: "runtime.request_context.middleware",
        stableHash: `runtime:request_context:middleware`,
        owner: "runtime",
        language: "go",
        content: body,
      },
    ],
  };
}

function generateMiddlewareChain(): GeneratedFilePatch {
  const middlewareCode = [
    `package runtime`,
    ``,
    `// ChainMiddleware composes multiple middleware functions into one.`,
    `func ChainMiddleware(middleware ...Middleware) Middleware {`,
    `\treturn func(ctx Context, next func(Context) error) error {`,
    `\t\tchain := func(ctx Context) error { return next(ctx) }`,
    `\t\tfor i := len(middleware) - 1; i >= 0; i-- {`,
    `\t\t\tm := middleware[i]`,
    `\t\t\tcurrent := chain`,
    `\t\t\tchain = func(ctx Context) error { return m(ctx, current) }`,
    `\t\t}`,
    `\t\treturn chain(ctx)`,
    `\t}`,
    `}`,
    ``,
  ].join("\n");

  return {
    path: "pkg/runtime/middleware.go",
    regions: [
      {
        id: "runtime.middleware.chain",
        stableHash: "runtime:middleware:chain",
        owner: "runtime",
        language: "go",
        content: middlewareCode,
      },
    ],
  };
}

export function generateRuntimeConfigCode(config: RuntimeConfig): string {
  const parts: string[] = [];

  if (config.di === "wire") {
    parts.push(`//go:build wireinject`);
    parts.push(`// +build wireinject`);
    parts.push(``);
    parts.push(`package main`);
    parts.push(``);
    parts.push(`import (`);
    parts.push(`\t"github.com/google/wire"`);
    parts.push(`)`);
    parts.push(``);
    parts.push(`func InitializeServer() *Server {`);
    parts.push(`\tpanic(wire.Build(ProviderSet))`);
    parts.push(`}`);
  }

  return parts.join("\n");
}
