import type { AppAst, RuntimeConfig, GeneratedFilePatch } from "../types/index.js";
import { contentHash } from "../utils/hash.js";
import { generateLoggerCode } from "./loggers-goast.js";
import * as go from "@schemago/go-ast";

function printDecl(decl: go.Declaration): string {
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, decl, 0);
  return sb.toString().replace(/\n$/, "");
}

function generateRuntimeTypes(): GeneratedFilePatch {
  const importDecl = go.genDecl("import", go.importSpec("context"));

  const contextSpec = go.typeSpec("Context", go.interfaceType(
    go.embedded(go.qual("context", "Context")),
    go.field(["Logger"], go.funcType([], [go.field([], go.id("Logger"))])),
    go.field(["RequestID"], go.funcType([], [go.field([], go.id("string"))])),
    go.field(["Param"], go.funcType([go.field(["name"], go.id("string"))], [go.field([], go.id("string"))])),
  ));
  contextSpec.doc = go.lineComment("Context carries request-scoped values, tracing, and logging.");
  const contextType = go.genDecl("type", contextSpec);

  const loggerSpec = go.typeSpec("Logger", go.interfaceType(
    go.field(["Info"], go.funcType(
      [go.field(["msg"], go.id("string")), { kind: "Field", names: ["keysAndValues"], type: go.sliceType(go.id("any")), variadic: true } as go.Field],
    )),
    go.field(["Error"], go.funcType(
      [go.field(["msg"], go.id("string")), { kind: "Field", names: ["keysAndValues"], type: go.sliceType(go.id("any")), variadic: true } as go.Field],
    )),
    go.field(["With"], go.funcType(
      [{ kind: "Field", names: ["keysAndValues"], type: go.sliceType(go.id("any")), variadic: true } as go.Field],
      [go.field([], go.id("Logger"))],
    )),
  ));
  loggerSpec.doc = go.lineComment("Logger is a structured logging interface.");
  const loggerType = go.genDecl("type", loggerSpec);

  const middlewareSpec = go.typeSpec("Middleware", go.funcType(
    [go.field(["ctx"], go.id("Context")), go.field(["next"], go.funcType(
      [go.field(["ctx"], go.id("Context"))],
      [go.field([], go.id("error"))],
    ))],
    [go.field([], go.id("error"))],
  ));
  middlewareSpec.doc = go.lineComment("Middleware is a request pipeline function.");
  const middlewareType = go.genDecl("type", middlewareSpec);

  const handlerSpec = go.typeSpec("Handler", go.funcType(
    [go.field(["ctx"], go.id("Context")), go.field(["req"], go.id("Req"))],
    [go.field([], go.id("Res")), go.field([], go.id("error"))],
  ), [go.field(["Req", "Res"], go.id("any"))]);
  handlerSpec.doc = go.lineComment("Handler is a typed request handler.");
  const handlerType = go.genDecl("type", handlerSpec);

  const sb = new go.StringBuilder();
  sb.pushLine("package runtime");
  sb.pushLine("");
  go.printDeclaration(sb, importDecl, 0);
  sb.pushLine("");
  go.printDeclaration(sb, contextType, 0);
  sb.pushLine("");
  go.printDeclaration(sb, loggerType, 0);
  sb.pushLine("");
  go.printDeclaration(sb, middlewareType, 0);
  sb.pushLine("");
  go.printDeclaration(sb, handlerType, 0);

  const content = sb.toString().replace(/\n$/, "");

  return {
    path: "pkg/runtime/context.go",
    regions: [{
      id: "runtime.context.types",
      stableHash: `runtime:context:types:${contentHash(content)}`,
      owner: "runtime",
      language: "go",
      content,
    }],
  };
}

function generateHTTPError(): GeneratedFilePatch {
  const httpErrorSpec = go.typeSpec("HTTPError", go.interfaceType(
    go.embedded(go.id("error")),
    go.field(["HTTPStatus"], go.funcType([], [go.field([], go.id("int"))])),
  ));
  httpErrorSpec.doc = go.lineComment("HTTPError is an error that carries an HTTP status code.\n// Return this from a usecase to control the HTTP response status.");
  const httpErrorType = go.genDecl("type", httpErrorSpec);

  const statusErrorSpec = go.typeSpec("StatusError", go.structType(
    go.field(["Msg"], go.id("string"), go.tag({ json: "error" })),
    go.field(["Status"], go.id("int"), go.tag({ json: "-" })),
  ));
  statusErrorSpec.doc = go.lineComment("StatusError is a simple implementation of HTTPError.");
  const statusErrorType = go.genDecl("type", statusErrorSpec);

  const errorMethod = go.method(
    go.field(["e"], go.star(go.id("StatusError"))),
    "Error",
    [],
    [go.field([], go.id("string"))],
    go.block(go.return_(go.sel(go.id("e"), "Msg"))),
  );

  const httpStatusMethod = go.method(
    go.field(["e"], go.star(go.id("StatusError"))),
    "HTTPStatus",
    [],
    [go.field([], go.id("int"))],
    go.block(go.return_(go.sel(go.id("e"), "Status"))),
  );

  const newStatusErrorFn = go.function_("NewStatusError",
    [go.field(["msg"], go.id("string")), go.field(["status"], go.id("int"))],
    [go.field([], go.star(go.id("StatusError")))],
    go.block(go.return_(go.addr(go.elt(go.id("StatusError"),
      go.kv("Msg", go.id("msg")),
      go.kv("Status", go.id("status")),
    )))),
  );
  newStatusErrorFn.doc = go.lineComment("NewStatusError creates a new StatusError.");

  const sb = new go.StringBuilder();
  sb.pushLine("package runtime");
  sb.pushLine("");
  go.printDeclaration(sb, httpErrorType, 0);
  sb.pushLine("");
  go.printDeclaration(sb, statusErrorType, 0);
  sb.pushLine("");
  go.printDeclaration(sb, errorMethod, 0);
  go.printDeclaration(sb, httpStatusMethod, 0);
  sb.pushLine("");
  go.printDeclaration(sb, newStatusErrorFn, 0);

  const content = sb.toString().replace(/\n$/, "");

  return {
    path: "pkg/runtime/errors.go",
    regions: [{
      id: "runtime.errors.types",
      stableHash: `runtime:errors:types:${contentHash(content)}`,
      owner: "runtime",
      language: "go",
      content,
    }],
  };
}

function generateRuntimeContext(
  loggerConfig: NonNullable<RuntimeConfig["logger"]>,
): GeneratedFilePatch[] {
  const hasNewLogger = loggerConfig.provider !== "none";

  const importDecl = go.genDecl("import", go.importSpec("context"));

  const structFields: go.Field[] = [
    go.embedded(go.qual("context", "Context")),
  ];
  if (hasNewLogger) {
    structFields.push(go.field(["logger"], go.id("Logger")));
  }
  structFields.push(go.field(["requestID"], go.id("string")));
  structFields.push(go.field(["params"], go.mapType(go.id("string"), go.id("string"))));

  const ctxSpec = go.typeSpec("runtimeContext", go.structType(...structFields));
  const runtimeContextType = go.genDecl("type", ctxSpec);

  const newContextParams: go.Field[] = [go.field(["ctx"], go.qual("context", "Context"))];
  const newContextKVs: go.KeyValueExpr[] = [go.kv("Context", go.id("ctx"))];
  if (hasNewLogger) {
    newContextParams.push(go.field(["logger"], go.id("Logger")));
    newContextKVs.push(go.kv("logger", go.id("logger")));
  }

  const newContextFn = go.function_("NewContext",
    newContextParams,
    [go.field([], go.id("Context"))],
    go.block(go.return_(go.addr(go.elt(go.id("runtimeContext"), ...newContextKVs)))),
  );

  const loggerReturn: go.Expression = hasNewLogger
    ? go.sel(go.id("c"), "logger")
    : go.addr(go.elt(go.id("noopLogger")));

  const loggerMethod = go.method(
    go.field(["c"], go.star(go.id("runtimeContext"))),
    "Logger",
    [],
    [go.field([], go.id("Logger"))],
    go.block(go.return_(loggerReturn)),
  );

  const requestIDMethod = go.method(
    go.field(["c"], go.star(go.id("runtimeContext"))),
    "RequestID",
    [],
    [go.field([], go.id("string"))],
    go.block(go.return_(go.sel(go.id("c"), "requestID"))),
  );

  const paramMethod = go.method(
    go.field(["c"], go.star(go.id("runtimeContext"))),
    "Param",
    [go.field(["name"], go.id("string"))],
    [go.field([], go.id("string"))],
    go.block(go.return_(go.index(go.sel(go.id("c"), "params"), go.id("name")))),
  );

  const sb = new go.StringBuilder();
  sb.pushLine("package runtime");
  sb.pushLine("");
  go.printDeclaration(sb, importDecl, 0);
  sb.pushLine("");
  go.printDeclaration(sb, runtimeContextType, 0);
  sb.pushLine("");
  go.printDeclaration(sb, newContextFn, 0);
  sb.pushLine("");
  go.printDeclaration(sb, loggerMethod, 0);
  sb.pushLine("");
  go.printDeclaration(sb, requestIDMethod, 0);
  sb.pushLine("");
  go.printDeclaration(sb, paramMethod, 0);

  const content = sb.toString();

  return [{
    path: "pkg/runtime/runtime_context.go",
    regions: [{
      id: "runtime.context.impl",
      stableHash: `runtime:context:impl:${contentHash(content)}`,
      owner: "runtime",
      language: "go",
      content,
    }],
  }];
}

function generateRequestContextMiddleware(): GeneratedFilePatch {
  const importDecl = go.genDecl("import",
    go.importSpec("context"),
    go.importSpec("crypto/rand"),
    go.importSpec("encoding/hex"),
    go.importSpec("time"),
    go.importSpec("github.com/gin-gonic/gin"),
  );

  const innerFuncLit = go.funcLit(
    go.funcType([go.field(["c"], go.star(go.qual("gin", "Context")))]),
    go.block(
      go.def(go.id("start"), go.call(go.sel(go.id("time"), "Now"))),
      go.def(go.id("reqID"), go.call(go.id("generateRequestID"))),

      go.def(go.id("ctx"), go.call(go.sel(go.sel(go.id("c"), "Request"), "Context"))),
      go.assign([go.id("ctx")], "=", [go.call(go.qual("context", "WithValue"), go.id("ctx"), go.id("ctxKeyRequestID"), go.id("reqID"))]),
      go.assign([go.id("ctx")], "=", [go.call(go.qual("context", "WithValue"), go.id("ctx"), go.id("ctxKeyRoute"), go.call(go.sel(go.id("c"), "FullPath")))]),
      go.assign([go.id("ctx")], "=", [go.call(go.qual("context", "WithValue"), go.id("ctx"), go.id("ctxKeyMethod"), go.sel(go.sel(go.id("c"), "Request"), "Method"))]),
      go.assign([go.sel(go.id("c"), "Request")], "=", [go.call(go.sel(go.sel(go.id("c"), "Request"), "WithContext"), go.id("ctx"))]),

      go.expr(go.call(go.sel(go.id("c"), "Next"))),

      go.expr(go.call(
        go.sel(go.call(go.id("CtxLogger"), go.id("ctx")), "Info"),
        go.str("request completed"),
        go.str("status"),
        go.call(go.sel(go.sel(go.id("c"), "Writer"), "Status")),
        go.str("duration_ms"),
        go.call(go.sel(go.call(go.qual("time", "Since"), go.id("start")), "Milliseconds")),
      )),
    ),
  );

  const reqCtxMiddleware = go.function_("RequestContextMiddleware",
    [],
    [go.field([], go.qual("gin", "HandlerFunc"))],
    go.block(go.return_(innerFuncLit)),
  );
  reqCtxMiddleware.doc = go.lineComment("RequestContextMiddleware enriches the request context with request_id, route, and method.\n// It also logs an access log entry with duration and status when the request completes.");

  const genReqIDStr = `func generateRequestID() string {
\tb := make([]byte, 8)
\t_, _ = rand.Read(b)
\treturn hex.EncodeToString(b)
}`;

  const sb = new go.StringBuilder();
  sb.pushLine("package runtime");
  sb.pushLine("");
  go.printDeclaration(sb, importDecl, 0);
  sb.pushLine("");
  go.printDeclaration(sb, reqCtxMiddleware, 0);
  sb.pushLine("");
  sb.pushLine(genReqIDStr);

  const content = sb.toString().replace(/\n$/, "");

  return {
    path: "pkg/runtime/request_context.go",
    regions: [{
      id: "runtime.request_context.middleware",
      stableHash: `runtime:request_context:middleware`,
      owner: "runtime",
      language: "go",
      content,
    }],
  };
}

function generateMiddlewareChain(): GeneratedFilePatch {
  const chainFuncLit = go.funcLit(
    go.funcType(
      [go.field(["ctx"], go.id("Context"))],
      [go.field([], go.id("error"))],
    ),
    go.block(go.return_(go.call(go.id("next"), go.id("ctx")))),
  );

  const innerBody = go.block(
    go.def(go.id("chain"), chainFuncLit),
    go.forStmt(
      go.def(go.id("i"), go.binary(go.call(go.id("len"), go.id("middleware")), "-", go.int(1))),
      go.binary(go.id("i"), ">=", go.int(0)),
      go.incDec(go.id("i"), "--"),
      go.block(
        go.def(go.id("m"), go.index(go.id("middleware"), go.id("i"))),
        go.def(go.id("current"), go.id("chain")),
        go.def(go.id("chain"), go.funcLit(
          go.funcType(
            [go.field(["ctx"], go.id("Context"))],
            [go.field([], go.id("error"))],
          ),
          go.block(go.return_(go.call(go.id("m"), go.id("ctx"), go.id("current")))),
        )),
      ),
    ),
    go.return_(go.call(go.id("chain"), go.id("ctx"))),
  );

  const outerFuncLit = go.funcLit(
    go.funcType(
      [go.field(["ctx"], go.id("Context")), go.field(["next"], go.funcType(
        [go.field(["ctx"], go.id("Context"))],
        [go.field([], go.id("error"))],
      ))],
      [go.field([], go.id("error"))],
    ),
    innerBody,
  );

  const chainMw = go.function_("ChainMiddleware",
    [{ kind: "Field", names: ["middleware"], type: go.sliceType(go.id("Middleware")), variadic: true } as go.Field],
    [go.field([], go.id("Middleware"))],
    go.block(go.return_(outerFuncLit)),
  );
  chainMw.doc = go.lineComment("ChainMiddleware composes multiple middleware functions into one.");

  const sb = new go.StringBuilder();
  sb.pushLine("package runtime");
  sb.pushLine("");
  go.printDeclaration(sb, chainMw, 0);

  const content = sb.toString().replace(/\n$/, "");

  return {
    path: "pkg/runtime/middleware.go",
    regions: [{
      id: "runtime.middleware.chain",
      stableHash: "runtime:middleware:chain",
      owner: "runtime",
      language: "go",
      content,
    }],
  };
}

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
