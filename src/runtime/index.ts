import type {
  AppAst,
  RuntimeConfig,
  Diagnostic,
  GeneratedFilePatch,
  GeneratedRegion,
} from "../types.js";
import { contentHash } from "../hash.js";

export function generateRuntimeCode(
  ast: AppAst,
  runtimeConfig: RuntimeConfig,
): GeneratedFilePatch[] {
  if (!runtimeConfig.enabled) return [];

  const patches: GeneratedFilePatch[] = [];
  const middlewareNames = runtimeConfig.middleware ?? [];

  patches.push(generateGoModule());

  patches.push(generateRuntimeTypes());

  if (middlewareNames.length > 0) {
    patches.push(generateMiddlewareChain(middlewareNames));
  }

  patches.push(generateMainWrapper(ast, middlewareNames));

  return patches;
}

function generateGoModule(): GeneratedFilePatch {
  const region: GeneratedRegion = {
    id: "runtime.go.mod",
    owner: "runtime",
    language: "go",
    content: [`module github.com/code-inlay/runtime`, ``, `go 1.22`].join("\n"),
  };

  return {
    path: "runtime/go.mod",
    regions: [region],
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

function generateMiddlewareChain(middlewareNames: string[]): GeneratedFilePatch {
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

function generateMainWrapper(ast: AppAst, middlewareNames: string[]): GeneratedFilePatch {
  const content: string[] = [
    `// Auto-generated runtime main wrapper`,
    `package main`,
    ``,
    `import (`,
    `\t"fmt"`,
    `\t"log"`,
    `\t"net/http"`,
    `)`,
    ``,
    `func main() {`,
    `\tlog.Println("Starting server...")`,
    `\t// Generated server setup will be injected here`,
    `\tfmt.Println("Server running")`,
    `}`,
  ];

  return {
    path: "runtime/main.go",
    regions: [
      {
        id: "runtime.main",
        stableHash: "runtime:main",
        owner: "runtime",
        language: "go",
        content: content.join("\n"),
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
