import type { AppAst, RuntimeConfig, GeneratedFilePatch } from "../types/index.js";
import { contentHash } from "../utils/hash.js";

export function generateRuntimeCode(
  ast: AppAst,
  runtimeConfig: RuntimeConfig,
): GeneratedFilePatch[] {
  if (!runtimeConfig.enabled) return [];

  const patches: GeneratedFilePatch[] = [];
  const middlewareNames = runtimeConfig.middleware ?? [];

  patches.push(generateRuntimeTypes());
  patches.push(generateHTTPError());

  if (middlewareNames.length > 0) {
    patches.push(generateMiddlewareChain());
  }

  return patches;
}

function generateHTTPError(): GeneratedFilePatch {
  const content = [
    `package runtime`,
    ``,
    `import "net/http"`,
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
    path: "runtime/errors.go",
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
    path: "runtime/context.go",
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
    path: "runtime/middleware.go",
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
