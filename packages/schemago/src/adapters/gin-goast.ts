import { createHash } from "node:crypto";
import * as go from "@schemago/goast";
import { toGoType } from "../utils/goast.js";
import type {
  AdapterPlugin,
  AdapterTarget,
  Diagnostic,
  GeneratedRegion,
  ResolvedCodec,
  ResolvedCodecSingle,
  RouteAst,
  SSEAst,
  WSAst,
  SchemaLike,
  SSEFieldMapping,
} from "../types/index.js";
import {
  defaultFileForLayer,
  defaultRegionId,
  extractPathParams,
  lowerIdent,
  pascalCase,
  routeTypeName,
} from "../utils/naming.js";
import { requestType } from "../schema/index.js";

function shortHash(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, 8);
}

export const ginAdapter: AdapterPlugin = {
  name: "gin",
  transport: "http",
  generateRoute(ctx) {
    const receiver = `${lowerIdent(ctx.route.moduleName)}Handler`;
    const method = ctx.route.kind === "Route" ? ctx.route.method : "GET";
    return [
      {
        id: defaultRegionId(ctx.route, "route"),
        language: "go",
        content: `api.${methodName(method)}("${ctx.route.path}", ${receiver}.${ctx.route.handlerName})`,
      },
    ];
  },
  generateMiddleware() {
    return [];
  },
  generateServer() {
    return [];
  },
};

export const adapterRegistry: Record<string, AdapterPlugin> = {
  gin: ginAdapter,
};

export function resolveAdapters(
  targets: AdapterTarget[],
  diagnostics: Diagnostic[],
): AdapterPlugin[] {
  const adapters: AdapterPlugin[] = [];
  for (const target of targets) {
    const adapter = adapterRegistry[target.name];
    if (adapter) {
      adapters.push(adapter);
    } else {
      diagnostics.push({
        level: "error",
        code: "unknown-adapter",
        message: `Unknown adapter "${target.name}".`,
      });
    }
  }
  return adapters;
}

function fieldInSchema(schema: SchemaLike, fieldName: string): boolean {
  const def = (schema as unknown as Record<string, unknown>)._def as
    | Record<string, unknown>
    | undefined;
  if (!def) return false;
  const shapeFn = def.shape as (() => Record<string, unknown>) | undefined;
  if (!shapeFn) return false;
  return fieldName in shapeFn();
}

function getSchemaFieldNames(schema: SchemaLike): string[] {
  const def = (schema as unknown as Record<string, unknown>)._def as
    | Record<string, unknown>
    | undefined;
  if (!def) return [];
  const shapeFn = def.shape as (() => Record<string, unknown>) | undefined;
  if (!shapeFn) return [];
  return Object.keys(shapeFn());
}

function verbForHandler(handlerName: string): string | undefined {
  return ["List", "Get", "Create", "New", "Update", "Edit", "Delete", "Remove", "Set"].find((v) =>
    handlerName.startsWith(v),
  );
}

// ─── Go-AST helpers ────────────────────────────────────────

/** Helper: create an expression like `chan T` for use in make() arguments */
function makeChanType(typeStr: string): go.Ident {
  return go.id(`chan ${typeStr}`);
}

function toHandlerStmts(
  handlerName: string,
  modulePascal: string,
  pathParams: string[],
  hasDomain: boolean | undefined,
  hasQuery: boolean,
  hasBody: boolean,
  route: RouteAst,
): go.Statement[] {
  const usecaseField = `${handlerName}Usecase`;
  const reqType = requestType(route);
  const stmts: go.Statement[] = [];

  if (hasDomain) {
    const verb = verbForHandler(handlerName);
    const baseID = `${modulePascal}ID`;

    if (verb === "Get" || verb === "Delete" || verb === "Remove") {
      if (hasQuery) {
        stmts.push(...emitBindQueryStmts(reqType, pathParams, route));
        if (hasDomain && pathParams.length > 0) {
          stmts.push(
            go.def(
              go.id("id"),
              go.call(go.id(baseID), go.call(go.sel(go.id("c"), "Param"), go.str(pathParams[0]))),
            ),
          );
          stmts.push(
            go.def(
              [go.id("output"), go.id("err")],
              go.call(
                go.sel(go.sel(go.id("h"), usecaseField), "Execute"),
                go.call(go.sel(go.sel(go.id("c"), "Request"), "Context")),
                go.id("id"),
              ),
            ),
          );
        } else {
          stmts.push(
            go.def(
              [go.id("output"), go.id("err")],
              go.call(
                go.sel(go.sel(go.id("h"), usecaseField), "Execute"),
                go.call(go.sel(go.sel(go.id("c"), "Request"), "Context")),
                go.id("input"),
              ),
            ),
          );
        }
      } else if (hasBody) {
        stmts.push(...emitBindJSONStmts(reqType, pathParams, route));
        if (hasDomain && pathParams.length > 0) {
          stmts.push(
            go.def(
              go.id("id"),
              go.call(go.id(baseID), go.call(go.sel(go.id("c"), "Param"), go.str(pathParams[0]))),
            ),
          );
          stmts.push(
            go.def(
              [go.id("output"), go.id("err")],
              go.call(
                go.sel(go.sel(go.id("h"), usecaseField), "Execute"),
                go.call(go.sel(go.sel(go.id("c"), "Request"), "Context")),
                go.id("id"),
              ),
            ),
          );
        } else {
          stmts.push(
            go.def(
              [go.id("output"), go.id("err")],
              go.call(
                go.sel(go.sel(go.id("h"), usecaseField), "Execute"),
                go.call(go.sel(go.sel(go.id("c"), "Request"), "Context")),
                go.id("input"),
              ),
            ),
          );
        }
      } else if (pathParams.length > 0) {
        stmts.push(
          go.def(
            go.id("id"),
            go.call(go.id(baseID), go.call(go.sel(go.id("c"), "Param"), go.str(pathParams[0]))),
          ),
        );
        stmts.push(
          go.def(
            [go.id("output"), go.id("err")],
            go.call(
              go.sel(go.sel(go.id("h"), usecaseField), "Execute"),
              go.call(go.sel(go.sel(go.id("c"), "Request"), "Context")),
              go.id("id"),
            ),
          ),
        );
      } else {
        stmts.push(
          go.def(
            [go.id("output"), go.id("err")],
            go.call(
              go.sel(go.sel(go.id("h"), usecaseField), "Execute"),
              go.call(go.sel(go.sel(go.id("c"), "Request"), "Context")),
            ),
          ),
        );
      }
      stmts.push(...emitErrAndRespStmts(route.method));
    } else if (verb === "Create" || verb === "New") {
      const handlerSh = shortHash(defaultRegionId(route, "handler"));
      if (hasQuery && hasBody) {
        const qn = routeTypeName(route, "Query");
        const bn = routeTypeName(route, "Body");
        stmts.push(go.declStmt(go.genDecl("var", go.valueSpec(["query"], toGoType(qn)))));
        stmts.push({
          kind: "IfStmt",
          init: go.def(
            go.id("err"),
            go.call(go.sel(go.id("c"), "ShouldBindQuery"), go.addr(go.id("query"))),
          ),
          cond: go.neq(go.id("err"), go.id("nil")),
          body: go.block(...emitBindErrorResponseStmts(), go.return_()),
        } as go.IfStmt);
        stmts.push(go.declStmt(go.genDecl("var", go.valueSpec(["requestBody"], toGoType(bn)))));
        stmts.push({
          kind: "IfStmt",
          init: go.def(
            go.id("err"),
            go.call(go.sel(go.id("c"), "ShouldBindJSON"), go.addr(go.id("requestBody"))),
          ),
          cond: go.neq(go.id("err"), go.id("nil")),
          body: go.block(...emitBindErrorResponseStmts(), go.return_()),
        } as go.IfStmt);
        stmts.push(go.commentStmt(` @gen:start ${handlerSh}`));
        stmts.push(go.commentStmt(` TODO: construct ${modulePascal} entity from query + body`));
        stmts.push(go.def(go.id("entity"), go.elt(toGoType(modulePascal))));
        stmts.push(go.commentStmt(` @gen:end ${handlerSh}`));
      } else if (hasBody) {
        stmts.push(go.declStmt(go.genDecl("var", go.valueSpec(["binding"], toGoType(reqType)))));
        stmts.push({
          kind: "IfStmt",
          init: go.def(
            go.id("err"),
            go.call(go.sel(go.id("c"), "ShouldBindJSON"), go.addr(go.id("binding"))),
          ),
          cond: go.neq(go.id("err"), go.id("nil")),
          body: go.block(...emitBindErrorResponseStmts(), go.return_()),
        } as go.IfStmt);
        stmts.push(go.commentStmt(` @gen:start ${handlerSh}`));
        stmts.push(go.commentStmt(` TODO: construct ${modulePascal} entity from binding`));
        stmts.push(go.def(go.id("entity"), go.elt(toGoType(modulePascal))));
        stmts.push(go.commentStmt(` @gen:end ${handlerSh}`));
      } else if (hasQuery) {
        stmts.push(go.declStmt(go.genDecl("var", go.valueSpec(["binding"], toGoType(reqType)))));
        stmts.push({
          kind: "IfStmt",
          init: go.def(
            go.id("err"),
            go.call(go.sel(go.id("c"), "ShouldBindQuery"), go.addr(go.id("binding"))),
          ),
          cond: go.neq(go.id("err"), go.id("nil")),
          body: go.block(...emitBindErrorResponseStmts(), go.return_()),
        } as go.IfStmt);
        stmts.push(go.commentStmt(` @gen:start ${handlerSh}`));
        stmts.push(go.commentStmt(` TODO: construct ${modulePascal} entity from binding`));
        stmts.push(go.def(go.id("entity"), go.elt(toGoType(modulePascal))));
        stmts.push(go.commentStmt(` @gen:end ${handlerSh}`));
      } else {
        stmts.push(go.commentStmt(` @gen:start ${handlerSh}`));
        stmts.push(go.commentStmt(` TODO: construct ${modulePascal} entity`));
        stmts.push(go.def(go.id("entity"), go.elt(toGoType(modulePascal))));
        stmts.push(go.commentStmt(` @gen:end ${handlerSh}`));
      }
      stmts.push(
        go.def(
          [go.id("output"), go.id("err")],
          go.call(
            go.sel(go.sel(go.id("h"), usecaseField), "Execute"),
            go.call(go.sel(go.sel(go.id("c"), "Request"), "Context")),
            go.id("entity"),
          ),
        ),
      );
      stmts.push(...emitErrAndRespStmts(route.method));
    } else if (verb === "Update" || verb === "Edit") {
      const handlerSh = shortHash(defaultRegionId(route, "handler"));
      stmts.push(go.declStmt(go.genDecl("var", go.valueSpec(["binding"], toGoType(reqType)))));
      stmts.push({
        kind: "IfStmt",
        init: go.def(
          go.id("err"),
          go.call(go.sel(go.id("c"), "ShouldBindJSON"), go.addr(go.id("binding"))),
        ),
        cond: go.neq(go.id("err"), go.id("nil")),
        body: go.block(...emitBindErrorResponseStmts(), go.return_()),
      } as go.IfStmt);
      if (pathParams.length > 0) {
        stmts.push(
          go.def(
            go.id("id"),
            go.call(go.id(baseID), go.call(go.sel(go.id("c"), "Param"), go.str(pathParams[0]))),
          ),
        );
      } else {
        stmts.push(go.declStmt(go.genDecl("var", go.valueSpec(["id"], toGoType(baseID)))));
      }
      stmts.push(go.commentStmt(` @gen:start ${handlerSh}`));
      stmts.push(go.commentStmt(` TODO: construct ${modulePascal} entity from binding`));
      stmts.push(go.def(go.id("entity"), go.elt(toGoType(modulePascal))));
      stmts.push(go.commentStmt(` @gen:end ${handlerSh}`));
      stmts.push(
        go.def(
          [go.id("output"), go.id("err")],
          go.call(
            go.sel(go.sel(go.id("h"), usecaseField), "Execute"),
            go.call(go.sel(go.sel(go.id("c"), "Request"), "Context")),
            go.id("id"),
            go.id("entity"),
          ),
        ),
      );
      stmts.push(...emitErrAndRespStmts(route.method));
    } else if (verb === "Set") {
      stmts.push(go.declStmt(go.genDecl("var", go.valueSpec(["binding"], toGoType(reqType)))));
      stmts.push({
        kind: "IfStmt",
        init: go.def(
          go.id("err"),
          go.call(go.sel(go.id("c"), "ShouldBindJSON"), go.addr(go.id("binding"))),
        ),
        cond: go.neq(go.id("err"), go.id("nil")),
        body: go.block(...emitBindErrorResponseStmts(), go.return_()),
      } as go.IfStmt);
      if (pathParams.length > 0) {
        stmts.push(
          go.def(
            go.id("id"),
            go.call(go.id(baseID), go.call(go.sel(go.id("c"), "Param"), go.str(pathParams[0]))),
          ),
        );
        stmts.push(
          go.def(
            [go.id("output"), go.id("err")],
            go.call(
              go.sel(go.sel(go.id("h"), usecaseField), "Execute"),
              go.call(go.sel(go.sel(go.id("c"), "Request"), "Context")),
              go.id("id"),
            ),
          ),
        );
      } else {
        stmts.push(
          go.def(
            [go.id("output"), go.id("err")],
            go.call(
              go.sel(go.sel(go.id("h"), usecaseField), "Execute"),
              go.call(go.sel(go.sel(go.id("c"), "Request"), "Context")),
            ),
          ),
        );
      }
      stmts.push(...emitErrAndRespStmts(route.method));
    } else if (verb === "List") {
      if (hasQuery) {
        stmts.push(go.declStmt(go.genDecl("var", go.valueSpec(["input"], toGoType(reqType)))));
        stmts.push({
          kind: "IfStmt",
          init: go.def(
            go.id("err"),
            go.call(go.sel(go.id("c"), "ShouldBindQuery"), go.addr(go.id("input"))),
          ),
          cond: go.neq(go.id("err"), go.id("nil")),
          body: go.block(...emitBindErrorResponseStmts(), go.return_()),
        } as go.IfStmt);
        stmts.push(
          go.def(
            [go.id("output"), go.id("err")],
            go.call(
              go.sel(go.sel(go.id("h"), usecaseField), "Execute"),
              go.call(go.sel(go.sel(go.id("c"), "Request"), "Context")),
              go.id("input"),
            ),
          ),
        );
      } else {
        stmts.push(
          go.def(
            [go.id("output"), go.id("err")],
            go.call(
              go.sel(go.sel(go.id("h"), usecaseField), "Execute"),
              go.call(go.sel(go.sel(go.id("c"), "Request"), "Context")),
            ),
          ),
        );
      }
      stmts.push(...emitErrAndRespStmts(route.method));
    } else {
      stmts.push(...emitGenericStmts(hasQuery, hasBody, pathParams, route, reqType, usecaseField));
    }
  } else {
    stmts.push(...emitGenericStmts(hasQuery, hasBody, pathParams, route, reqType, usecaseField));
  }

  return stmts;
}

function emitGenericStmts(
  hasQuery: boolean,
  hasBody: boolean,
  pathParams: string[],
  route: RouteAst,
  reqType: string,
  usecaseField: string,
): go.Statement[] {
  const stmts: go.Statement[] = [];
  if (hasQuery && hasBody) {
    const queryType = routeTypeName(route, "Query");
    const bodyType = routeTypeName(route, "Body");
    stmts.push(go.declStmt(go.genDecl("var", go.valueSpec(["input"], toGoType(reqType)))));
    stmts.push(go.declStmt(go.genDecl("var", go.valueSpec(["query"], toGoType(queryType)))));
    stmts.push({
      kind: "IfStmt",
      init: go.def(
        go.id("err"),
        go.call(go.sel(go.id("c"), "ShouldBindQuery"), go.addr(go.id("query"))),
      ),
      cond: go.neq(go.id("err"), go.id("nil")),
      body: go.block(...emitBindErrorResponseStmts(), go.return_()),
    } as go.IfStmt);
    stmts.push(go.declStmt(go.genDecl("var", go.valueSpec(["requestBody"], toGoType(bodyType)))));
    stmts.push({
      kind: "IfStmt",
      init: go.def(
        go.id("err"),
        go.call(go.sel(go.id("c"), "ShouldBindJSON"), go.addr(go.id("requestBody"))),
      ),
      cond: go.neq(go.id("err"), go.id("nil")),
      body: go.block(...emitBindErrorResponseStmts(), go.return_()),
    } as go.IfStmt);
    const queryFields = getSchemaFieldNames(route.query!);
    const bodyFields = getSchemaFieldNames(route.body!);
    for (const f of queryFields) {
      stmts.push(
        go.assign(
          go.sel(go.id("input"), pascalCase(f)),
          "=",
          go.sel(go.id("query"), pascalCase(f)),
        ),
      );
    }
    for (const f of bodyFields) {
      stmts.push(
        go.assign(
          go.sel(go.id("input"), pascalCase(f)),
          "=",
          go.sel(go.id("requestBody"), pascalCase(f)),
        ),
      );
    }
    for (const param of pathParams) {
      stmts.push(
        go.assign(
          go.sel(go.id("input"), pascalCase(param)),
          "=",
          go.call(go.sel(go.id("c"), "Param"), go.str(param)),
        ),
      );
    }
  } else if (hasQuery) {
    stmts.push(...emitBindQueryStmts(reqType, pathParams, route));
  } else if (hasBody) {
    stmts.push(...emitBindJSONStmts(reqType, pathParams, route));
  } else if (pathParams.length > 0) {
    stmts.push(go.declStmt(go.genDecl("var", go.valueSpec(["input"], toGoType(reqType)))));
    for (const param of pathParams) {
      stmts.push(
        go.assign(
          go.sel(go.id("input"), pascalCase(param)),
          "=",
          go.call(go.sel(go.id("c"), "Param"), go.str(param)),
        ),
      );
    }
  } else {
    stmts.push(go.def(go.id("input"), go.elt(go.structType())));
  }
  stmts.push(
    go.def(
      [go.id("output"), go.id("err")],
      go.call(
        go.sel(go.sel(go.id("h"), usecaseField), "Execute"),
        go.call(go.sel(go.sel(go.id("c"), "Request"), "Context")),
        go.id("input"),
      ),
    ),
  );
  stmts.push(...emitErrAndRespStmts(route.method));
  return stmts;
}

function emitErrAndRespStmts(method: string): go.Statement[] {
  const httpErrType = go.interfaceType(
    go.field(["HTTPStatus"], go.funcType([], [go.field([], go.id("int"))])),
  );
  const varHttpErr = go.declStmt(go.genDecl("var", go.valueSpec(["httpErr"], httpErrType)));
  const innerIf: go.IfStmt = {
    kind: "IfStmt",
    cond: go.call(go.qual("errors", "As"), go.id("err"), go.addr(go.id("httpErr"))),
    body: go.block(),
    elseStmt: go.block(),
  } as go.IfStmt;
  const retStmt = go.return_();
  const ifStmt: go.IfStmt = {
    kind: "IfStmt",
    cond: go.neq(go.id("err"), go.id("nil")),
    body: go.block(varHttpErr, innerIf, retStmt),
  } as go.IfStmt;

  if (method === "DELETE") {
    (innerIf.body as go.BlockStmt).list.push(
      go.expr(
        go.call(go.sel(go.id("c"), "Status"), go.call(go.sel(go.id("httpErr"), "HTTPStatus"))),
      ),
    );
    (innerIf.elseStmt as go.BlockStmt).list.push(
      go.expr(go.call(go.sel(go.id("c"), "Status"), go.qual("http", "StatusInternalServerError"))),
    );
    return [
      ifStmt,
      go.assign(go.id("_"), "=", go.id("output")),
      go.expr(go.call(go.sel(go.id("c"), "Status"), go.qual("http", "StatusNoContent"))),
    ];
  } else {
    (innerIf.body as go.BlockStmt).list.push(
      go.expr(
        go.call(
          go.sel(go.id("c"), "JSON"),
          go.call(go.sel(go.id("httpErr"), "HTTPStatus")),
          go.id("err"),
        ),
      ),
    );
    (innerIf.elseStmt as go.BlockStmt).list.push(
      go.expr(
        go.call(
          go.sel(go.id("c"), "JSON"),
          go.qual("http", "StatusInternalServerError"),
          go.elt(
            go.qual("gin", "H"),
            go.kv(go.str("error"), go.call(go.sel(go.id("err"), "Error"))),
          ),
        ),
      ),
    );
    return [
      ifStmt,
      go.expr(go.call(go.sel(go.id("c"), "JSON"), go.qual("http", "StatusOK"), go.id("output"))),
    ];
  }
}

function emitBindErrorResponseStmts(): go.Statement[] {
  return [
    go.def(
      [go.id("status"), go.id("body")],
      go.call(go.qual("httperr", "ResolveBindingError"), go.id("err")),
    ),
    go.expr(go.call(go.sel(go.id("c"), "JSON"), go.id("status"), go.id("body"))),
  ];
}

function emitBindQueryStmts(
  reqType: string,
  pathParams: string[],
  route: RouteAst,
): go.Statement[] {
  const stmts: go.Statement[] = [];
  stmts.push(go.declStmt(go.genDecl("var", go.valueSpec(["input"], toGoType(reqType)))));
  stmts.push({
    kind: "IfStmt",
    init: go.def(
      go.id("err"),
      go.call(go.sel(go.id("c"), "ShouldBindQuery"), go.addr(go.id("input"))),
    ),
    cond: go.neq(go.id("err"), go.id("nil")),
    body: go.block(...emitBindErrorResponseStmts(), go.return_()),
  } as go.IfStmt);
  for (const param of pathParams) {
    const fn = pascalCase(param);
    if (route.query && !fieldInSchema(route.query, param)) {
      stmts.push(
        go.assign(
          go.sel(go.id("input"), fn),
          "=",
          go.call(go.sel(go.id("c"), "Param"), go.str(param)),
        ),
      );
    }
  }
  return stmts;
}

function emitBindJSONStmts(reqType: string, pathParams: string[], route: RouteAst): go.Statement[] {
  const stmts: go.Statement[] = [];
  stmts.push(go.declStmt(go.genDecl("var", go.valueSpec(["input"], toGoType(reqType)))));
  stmts.push({
    kind: "IfStmt",
    init: go.def(
      go.id("err"),
      go.call(go.sel(go.id("c"), "ShouldBindJSON"), go.addr(go.id("input"))),
    ),
    cond: go.neq(go.id("err"), go.id("nil")),
    body: go.block(...emitBindErrorResponseStmts(), go.return_()),
  } as go.IfStmt);
  for (const param of pathParams) {
    const fn = pascalCase(param);
    if (route.body && !fieldInSchema(route.body, param)) {
      stmts.push(
        go.assign(
          go.sel(go.id("input"), fn),
          "=",
          go.call(go.sel(go.id("c"), "Param"), go.str(param)),
        ),
      );
    }
  }
  return stmts;
}

export function generateGinHandler(
  route: RouteAst,
  diagnostics: Diagnostic[],
  owner: string,
  hasDomain?: boolean,
): GeneratedRegion {
  const modulePascal = pascalCase(route.moduleName);
  const handlerName = route.handlerName;
  const pathParams = extractPathParams(route.path);
  const hasQuery = !!route.query;
  const hasBody = !!route.body;

  const stmts = toHandlerStmts(
    handlerName,
    modulePascal,
    pathParams,
    hasDomain,
    hasQuery,
    hasBody,
    route,
  );

  const methodDecl = go.method(
    go.field(["h"], go.star(go.id(`${modulePascal}Handler`))),
    handlerName,
    [go.field(["c"], go.star(go.qual("gin", "Context")))],
    undefined,
    go.block(...stmts),
  );

  const sb = new go.StringBuilder();
  go.printDeclaration(sb, methodDecl, 0);
  const content = sb.toString().trimEnd();
  return {
    id: defaultRegionId(route, "handler"),
    stableHash: `${route.stableId}:${owner}:handler:${defaultFileForLayer(route, "handler")}`,
    owner,
    language: "go",
    content,
  };
}

function methodName(method: string): string {
  switch (method) {
    case "GET":
      return "GET";
    case "POST":
      return "POST";
    case "PUT":
      return "PUT";
    case "PATCH":
      return "PATCH";
    case "DELETE":
      return "DELETE";
    default:
      return method;
  }
}

function sseMarshalExpr(codec: ResolvedCodecSingle, eventType: string): go.Expression {
  const params = [go.field(["v"], toGoType(eventType))];
  const results = [go.field([], go.sliceType(go.id("byte"))), go.field([], go.id("error"))];
  if (codec.kind === "preset") {
    return go.funcLit(
      go.funcType(params, results),
      go.block(go.return_(go.call(go.qual("json", "Marshal"), go.id("v")))),
    );
  }
  return go.funcLit(
    go.funcType(params, results),
    go.block(go.return_(go.call(go.id(codec.marshal), go.id("v")))),
  );
}

function generateSSENegotiationPreamble(
  route: SSEAst,
  codec: ResolvedCodec & { kind: "negotiated" },
  eventType: string,
): go.Statement[] {
  const stmts: go.Statement[] = [];
  const defaultCodec = codec.codecs[codec.defaultKey] ?? codec.codecs[Object.keys(codec.codecs)[0]];
  const strategy = codec.strategy[0];
  const marshalVar = "marshalEvent";

  if (strategy === "accept-header") {
    stmts.push(go.def(go.id("accept"), go.call(go.sel(go.id("c"), "GetHeader"), go.str("Accept"))));
    stmts.push(go.def(go.id(marshalVar), sseMarshalExpr(defaultCodec, eventType)));
    const cases: go.CaseClause[] = [];
    for (const [key, cd] of Object.entries(codec.codecs)) {
      if (key === codec.defaultKey) continue;
      cases.push(
        go.caseClause(
          [
            go.call(
              go.qual("strings", "Contains"),
              go.id("accept"),
              go.str(`application/x-${key}`),
            ),
          ],
          go.assign(go.id(marshalVar), "=", sseMarshalExpr(cd, eventType)),
        ),
      );
    }
    stmts.push(go.switchStmt(undefined, undefined, ...cases));
  } else if (strategy === "query-param") {
    stmts.push(go.def(go.id("format"), go.call(go.sel(go.id("c"), "Query"), go.str("format"))));
    stmts.push(go.def(go.id(marshalVar), sseMarshalExpr(defaultCodec, eventType)));
    const cases: go.CaseClause[] = [];
    for (const [key, cd] of Object.entries(codec.codecs)) {
      if (key === codec.defaultKey) continue;
      cases.push(
        go.caseClause(
          [go.str(key)],
          go.assign(go.id(marshalVar), "=", sseMarshalExpr(cd, eventType)),
        ),
      );
    }
    stmts.push(go.switchStmt(undefined, go.id("format"), ...cases));
  } else if (strategy === "subprotocol") {
    stmts.push(go.def(go.id("accept"), go.call(go.sel(go.id("c"), "GetHeader"), go.str("Accept"))));
    stmts.push(go.def(go.id(marshalVar), sseMarshalExpr(defaultCodec, eventType)));
    const cases: go.CaseClause[] = [];
    for (const [key, cd] of Object.entries(codec.codecs)) {
      if (key === codec.defaultKey) continue;
      cases.push(
        go.caseClause(
          [
            go.call(
              go.qual("strings", "Contains"),
              go.id("accept"),
              go.str(`application/x-${key}`),
            ),
          ],
          go.assign(go.id(marshalVar), "=", sseMarshalExpr(cd, eventType)),
        ),
      );
    }
    stmts.push(go.switchStmt(undefined, undefined, ...cases));
  }

  return stmts;
}

function generateSSEMarshalLines(
  eventType: string,
  marshalVar?: string,
  sseFields?: SSEFieldMapping,
): go.Statement[] {
  const stmts: go.Statement[] = [];
  if (marshalVar) {
    stmts.push(go.def([go.id("data"), go.id("err")], go.call(go.id(marshalVar), go.id("event"))));
  } else {
    stmts.push(
      go.def([go.id("data"), go.id("err")], go.call(go.qual("json", "Marshal"), go.id("event"))),
    );
  }
  stmts.push(go.ifStmt(go.neq(go.id("err"), go.id("nil")), go.block(go.return_(go.id("false")))));
  if (sseFields) {
    if (sseFields.eventField) {
      stmts.push(
        go.ifStmt(
          go.neq(go.sel(go.id("event"), pascalCase(sseFields.eventField)), go.str("")),
          go.block(
            go.expr(
              go.call(
                go.qual("fmt", "Fprintf"),
                go.id("w"),
                go.str(`event: %s\\n`),
                go.sel(go.id("event"), pascalCase(sseFields.eventField)),
              ),
            ),
          ),
        ),
      );
    }
    if (sseFields.idField) {
      stmts.push(
        go.ifStmt(
          go.neq(go.sel(go.id("event"), pascalCase(sseFields.idField)), go.str("")),
          go.block(
            go.expr(
              go.call(
                go.qual("fmt", "Fprintf"),
                go.id("w"),
                go.str(`id: %s\\n`),
                go.sel(go.id("event"), pascalCase(sseFields.idField)),
              ),
            ),
          ),
        ),
      );
    }
  }
  stmts.push(
    go.expr(
      go.call(go.qual("fmt", "Fprintf"), go.id("w"), go.str(`data: %s\\n\\n`), go.id("data")),
    ),
  );
  return stmts;
}

export function generateGinSSEHandler(route: SSEAst): GeneratedRegion {
  const modulePascal = pascalCase(route.moduleName);
  const eventType = `${route.handlerName}${pascalCase(route.moduleName)}Event`;
  const codec = route.codec;
  const stmts: go.Statement[] = [];

  stmts.push(
    go.expr(
      go.call(
        go.sel(go.call(go.sel(go.sel(go.id("c"), "Writer"), "Header")), "Set"),
        go.str("Content-Type"),
        go.str("text/event-stream"),
      ),
    ),
  );
  stmts.push(
    go.expr(
      go.call(
        go.sel(go.call(go.sel(go.sel(go.id("c"), "Writer"), "Header")), "Set"),
        go.str("Cache-Control"),
        go.str("no-cache"),
      ),
    ),
  );
  stmts.push(
    go.expr(
      go.call(
        go.sel(go.call(go.sel(go.sel(go.id("c"), "Writer"), "Header")), "Set"),
        go.str("Connection"),
        go.str("keep-alive"),
      ),
    ),
  );

  const hasMarshalVar =
    codec &&
    (codec.kind === "negotiated" ||
      codec.kind === "custom" ||
      (codec.kind === "preset" && codec.preset !== "json" && codec.preset !== "sse"));

  if (codec?.kind === "negotiated") {
    const preamble = generateSSENegotiationPreamble(route, codec, eventType);
    stmts.push(...preamble);
  } else if (
    codec?.kind === "custom" ||
    (codec?.kind === "preset" && codec.preset !== "json" && codec.preset !== "sse")
  ) {
    stmts.push(go.def(go.id("marshalEvent"), sseMarshalExpr(codec, eventType)));
  }

  if (route.usecaseCodec && !hasMarshalVar) {
    const params = [go.field(["v"], toGoType(eventType))];
    const results = [go.field([], go.sliceType(go.id("byte"))), go.field([], go.id("error"))];
    stmts.push(
      go.def(
        go.id("marshalEvent"),
        go.funcLit(
          go.funcType(params, results),
          go.block(go.return_(go.call(go.qual("json", "Marshal"), go.id("v")))),
        ),
      ),
    );
  }

  stmts.push(go.def(go.id("ch"), go.call(go.id("make"), makeChanType(eventType))));
  const usecaseArgs = route.usecaseCodec
    ? [
        go.call(go.sel(go.sel(go.id("c"), "Request"), "Context")),
        go.id("ch"),
        go.id("marshalEvent"),
      ]
    : [go.call(go.sel(go.sel(go.id("c"), "Request"), "Context")), go.id("ch")];
  stmts.push(
    go.goStmt(
      go.call(go.sel(go.sel(go.id("h"), `${route.handlerName}Usecase`), "Execute"), ...usecaseArgs),
    ),
  );

  const useMarshalVar = hasMarshalVar || route.usecaseCodec;
  const streamBody: go.Statement[] = [];
  streamBody.push(
    go.def([go.id("event"), go.id("ok")], { kind: "UnaryExpr", op: "<-", x: go.id("ch") }),
  );
  streamBody.push(go.ifStmt(go.not(go.id("ok")), go.block(go.return_(go.id("false")))));

  const marshalLines = generateSSEMarshalLines(
    eventType,
    useMarshalVar ? "marshalEvent" : undefined,
    route.sseFields,
  );
  streamBody.push(...marshalLines);
  streamBody.push(go.return_(go.id("true")));

  stmts.push(
    go.expr(
      go.call(
        go.sel(go.id("c"), "Stream"),
        go.funcLit(
          go.funcType([go.field(["w"], go.id("io.Writer"))], [go.field([], go.id("bool"))]),
          go.block(...streamBody),
        ),
      ),
    ),
  );

  const methodDecl = go.method(
    go.field(["h"], go.star(go.id(`${modulePascal}Handler`))),
    route.handlerName,
    [go.field(["c"], go.star(go.qual("gin", "Context")))],
    undefined,
    go.block(...stmts),
  );

  const sb = new go.StringBuilder();
  go.printDeclaration(sb, methodDecl, 0);
  const content = sb.toString().trimEnd();
  return {
    id: defaultRegionId(route, "handler"),
    stableHash: `${route.stableId}:sse:handler:${defaultFileForLayer(route, "handler")}`,
    owner: "gin",
    language: "go",
    content,
  };
}

// ─── WS helpers ─────────────────────────────────────────────

function wsMarshalExpr(codec: ResolvedCodecSingle, eventType: string): go.Expression {
  const params = [go.field(["v"], toGoType(eventType))];
  const results = [go.field([], go.sliceType(go.id("byte"))), go.field([], go.id("error"))];
  if (codec.kind === "preset") {
    return go.funcLit(
      go.funcType(params, results),
      go.block(go.return_(go.call(go.qual("json", "Marshal"), go.id("v")))),
    );
  }
  return go.funcLit(
    go.funcType(params, results),
    go.block(go.return_(go.call(go.id(codec.marshal), go.id("v")))),
  );
}

function wsProtoMarshalExpr(eventType: string): go.Expression {
  const params = [go.field(["v"], toGoType(eventType))];
  const results = [go.field([], go.sliceType(go.id("byte"))), go.field([], go.id("error"))];
  return go.funcLit(
    go.funcType(params, results),
    go.block(go.return_(go.call(go.id(`${eventType}ToProtoBytes`), go.id("v")), go.id("nil"))),
  );
}

function wsUnmarshalExpr(codec: ResolvedCodecSingle, msgType: string): go.Expression {
  const params = [
    go.field(["data"], go.sliceType(go.id("byte"))),
    go.field(["msg"], go.star(toGoType(msgType))),
  ];
  const results = [go.field([], go.id("error"))];
  if (codec.kind === "preset") {
    return go.funcLit(
      go.funcType(params, results),
      go.block(go.return_(go.call(go.qual("json", "Unmarshal"), go.id("data"), go.id("msg")))),
    );
  }
  const unmarshalFn = codec.unmarshal ?? codec.marshal;
  return go.funcLit(
    go.funcType(params, results),
    go.block(go.return_(go.call(go.id(unmarshalFn), go.id("data"), go.id("msg")))),
  );
}

function wsProtoUnmarshalExpr(msgType: string): go.Expression {
  const params = [
    go.field(["data"], go.sliceType(go.id("byte"))),
    go.field(["msg"], go.star(toGoType(msgType))),
  ];
  const results = [go.field([], go.id("error"))];
  return go.funcLit(
    go.funcType(params, results),
    go.block(
      go.assign(
        go.star(go.id("msg")),
        "=",
        go.call(go.id(`${msgType}FromProtoBytes`), go.id("data")),
      ),
      go.return_(go.id("nil")),
    ),
  );
}

function wsReadExpr(codec: ResolvedCodecSingle, msgType: string): go.Expression {
  if (codec.kind === "preset") {
    return go.funcLit(
      go.funcType([], [go.field([], toGoType(msgType)), go.field([], go.id("error"))]),
      go.block(
        go.declStmt(go.genDecl("var", go.valueSpec(["msg"], toGoType(msgType)))),
        go.def(go.id("err"), go.call(go.sel(go.id("conn"), "ReadJSON"), go.addr(go.id("msg")))),
        go.return_(go.id("msg"), go.id("err")),
      ),
    );
  }
  const unmarshalFn = codec.unmarshal ?? codec.marshal;
  return go.funcLit(
    go.funcType([], [go.field([], toGoType(msgType)), go.field([], go.id("error"))]),
    go.block(
      go.def(
        [go.id("_"), go.id("data"), go.id("err")],
        go.call(go.sel(go.id("conn"), "ReadMessage")),
      ),
      go.ifStmt(
        go.neq(go.id("err"), go.id("nil")),
        go.block(
          go.declStmt(go.genDecl("var", go.valueSpec(["z"], toGoType(msgType)))),
          go.return_(go.id("z"), go.id("err")),
        ),
      ),
      go.declStmt(go.genDecl("var", go.valueSpec(["msg"], toGoType(msgType)))),
      go.assign(
        go.id("err"),
        "=",
        go.call(go.id(unmarshalFn), go.id("data"), go.addr(go.id("msg"))),
      ),
      go.return_(go.id("msg"), go.id("err")),
    ),
  );
}

function wsProtoReadExpr(msgType: string): go.Expression {
  return go.funcLit(
    go.funcType([], [go.field([], toGoType(msgType)), go.field([], go.id("error"))]),
    go.block(
      go.def(
        [go.id("_"), go.id("data"), go.id("err")],
        go.call(go.sel(go.id("conn"), "ReadMessage")),
      ),
      go.ifStmt(
        go.neq(go.id("err"), go.id("nil")),
        go.block(
          go.declStmt(go.genDecl("var", go.valueSpec(["z"], toGoType(msgType)))),
          go.return_(go.id("z"), go.id("err")),
        ),
      ),
      go.return_(go.call(go.id(`${msgType}FromProtoBytes`), go.id("data")), go.id("nil")),
    ),
  );
}

function wsWriteExpr(codec: ResolvedCodecSingle, eventType: string): go.Expression {
  if (codec.kind === "preset") {
    return go.funcLit(
      go.funcType([go.field(["v"], toGoType(eventType))], [go.field([], go.id("error"))]),
      go.block(go.return_(go.call(go.sel(go.id("conn"), "WriteJSON"), go.id("v")))),
    );
  }
  return go.funcLit(
    go.funcType([go.field(["v"], toGoType(eventType))], [go.field([], go.id("error"))]),
    go.block(
      go.def([go.id("data"), go.id("err")], go.call(go.id(codec.marshal), go.id("v"))),
      go.ifStmt(go.neq(go.id("err"), go.id("nil")), go.block(go.return_(go.id("err")))),
      go.return_(
        go.call(
          go.sel(go.id("conn"), "WriteMessage"),
          go.qual("websocket", "TextMessage"),
          go.id("data"),
        ),
      ),
    ),
  );
}

function wsProtoWriteExpr(eventType: string): go.Expression {
  return go.funcLit(
    go.funcType([go.field(["v"], toGoType(eventType))], [go.field([], go.id("error"))]),
    go.block(
      go.return_(
        go.call(
          go.sel(go.id("conn"), "WriteMessage"),
          go.qual("websocket", "BinaryMessage"),
          go.call(go.id(`${eventType}ToProtoBytes`), go.id("v")),
        ),
      ),
    ),
  );
}

function wsIsProto(codec: ResolvedCodecSingle): boolean {
  return codec.kind === "preset" && codec.preset === "protobuf";
}

function wsChooseReadFn(cd: ResolvedCodecSingle, msgType: string): go.Expression {
  return wsIsProto(cd) ? wsProtoReadExpr(msgType) : wsReadExpr(cd, msgType);
}

function wsChooseWriteFn(cd: ResolvedCodecSingle, eventType: string): go.Expression {
  return wsIsProto(cd) ? wsProtoWriteExpr(eventType) : wsWriteExpr(cd, eventType);
}

function wsChooseMarshalFn(cd: ResolvedCodecSingle, eventType: string): go.Expression {
  return wsIsProto(cd) ? wsProtoMarshalExpr(eventType) : wsMarshalExpr(cd, eventType);
}

function wsChooseUnmarshalFn(cd: ResolvedCodecSingle, msgType: string): go.Expression {
  return wsIsProto(cd) ? wsProtoUnmarshalExpr(msgType) : wsUnmarshalExpr(cd, msgType);
}

function generateWSNegotiationPreamble(
  route: WSAst,
  codec: ResolvedCodec & { kind: "negotiated" },
  msgType: string,
  eventType: string,
): { upgraderFields: go.KeyValueExpr[]; bodyStmts: go.Statement[] } {
  const upgraderFields: go.KeyValueExpr[] = [];
  const bodyStmts: go.Statement[] = [];

  const defaultKey = codec.defaultKey;
  const defaultCodec = codec.codecs[defaultKey] ?? codec.codecs[Object.keys(codec.codecs)[0]];
  const strategy = codec.strategy[0];
  const hasUsecaseCodec = route.usecaseCodec;

  const emitSwitchBodies = (cd: ResolvedCodecSingle): go.Statement[] => {
    const s: go.Statement[] = [];
    s.push(go.assign(go.id("readMessage"), "=", wsChooseReadFn(cd, msgType)));
    s.push(go.assign(go.id("writeEvent"), "=", wsChooseWriteFn(cd, eventType)));
    if (hasUsecaseCodec) {
      s.push(go.assign(go.id("marshalEvent"), "=", wsChooseMarshalFn(cd, eventType)));
      s.push(go.assign(go.id("unmarshalMessage"), "=", wsChooseUnmarshalFn(cd, msgType)));
    }
    return s;
  };

  const defaultRead = wsChooseReadFn(defaultCodec, msgType);
  const defaultWrite = wsChooseWriteFn(defaultCodec, eventType);
  const defaultMarshal = hasUsecaseCodec ? wsChooseMarshalFn(defaultCodec, eventType) : undefined;
  const defaultUnmarshal = hasUsecaseCodec ? wsChooseUnmarshalFn(defaultCodec, msgType) : undefined;

  if (hasUsecaseCodec) {
    if (strategy === "subprotocol") {
      upgraderFields.push(
        go.kv(
          go.id("Subprotocols"),
          go.elt(go.sliceType(go.id("string")), ...Object.keys(codec.codecs).map((k) => go.str(k))),
        ),
      );
      bodyStmts.push(go.def(go.id("subproto"), go.call(go.sel(go.id("conn"), "Subprotocol"))));
      bodyStmts.push(go.def(go.id("readMessage"), defaultRead));
      bodyStmts.push(go.def(go.id("writeEvent"), defaultWrite));
      bodyStmts.push(go.def(go.id("marshalEvent"), defaultMarshal!));
      bodyStmts.push(go.def(go.id("unmarshalMessage"), defaultUnmarshal!));
      const cases: go.CaseClause[] = [];
      for (const [key, cd] of Object.entries(codec.codecs)) {
        if (key === defaultKey) continue;
        cases.push(go.caseClause([go.str(key)], ...emitSwitchBodies(cd)));
      }
      bodyStmts.push(go.switchStmt(undefined, go.id("subproto"), ...cases));
    } else if (strategy === "query-param") {
      bodyStmts.push(
        go.def(go.id("format"), go.call(go.sel(go.id("c"), "Query"), go.str("format"))),
      );
      bodyStmts.push(go.def(go.id("readMessage"), defaultRead));
      bodyStmts.push(go.def(go.id("writeEvent"), defaultWrite));
      bodyStmts.push(go.def(go.id("marshalEvent"), defaultMarshal!));
      bodyStmts.push(go.def(go.id("unmarshalMessage"), defaultUnmarshal!));
      const cases: go.CaseClause[] = [];
      for (const [key, cd] of Object.entries(codec.codecs)) {
        if (key === defaultKey) continue;
        cases.push(go.caseClause([go.str(key)], ...emitSwitchBodies(cd)));
      }
      bodyStmts.push(go.switchStmt(undefined, go.id("format"), ...cases));
    } else {
      bodyStmts.push(
        go.def(go.id("accept"), go.call(go.sel(go.id("c"), "GetHeader"), go.str("Accept"))),
      );
      bodyStmts.push(go.def(go.id("readMessage"), defaultRead));
      bodyStmts.push(go.def(go.id("writeEvent"), defaultWrite));
      bodyStmts.push(go.def(go.id("marshalEvent"), defaultMarshal!));
      bodyStmts.push(go.def(go.id("unmarshalMessage"), defaultUnmarshal!));
      const cases: go.CaseClause[] = [];
      for (const [key, cd] of Object.entries(codec.codecs)) {
        if (key === defaultKey) continue;
        cases.push(
          go.caseClause(
            [
              go.call(
                go.qual("strings", "Contains"),
                go.id("accept"),
                go.str(`application/x-${key}`),
              ),
            ],
            ...emitSwitchBodies(cd),
          ),
        );
      }
      bodyStmts.push(go.switchStmt(undefined, undefined, ...cases));
    }
  } else {
    if (strategy === "subprotocol") {
      upgraderFields.push(
        go.kv(
          go.id("Subprotocols"),
          go.elt(go.sliceType(go.id("string")), ...Object.keys(codec.codecs).map((k) => go.str(k))),
        ),
      );
      bodyStmts.push(go.def(go.id("subproto"), go.call(go.sel(go.id("conn"), "Subprotocol"))));
      bodyStmts.push(go.def(go.id("readMessage"), defaultRead));
      bodyStmts.push(go.def(go.id("writeEvent"), defaultWrite));
      const cases: go.CaseClause[] = [];
      for (const [key, cd] of Object.entries(codec.codecs)) {
        if (key === defaultKey) continue;
        cases.push(go.caseClause([go.str(key)], ...emitSwitchBodies(cd)));
      }
      bodyStmts.push(go.switchStmt(undefined, go.id("subproto"), ...cases));
    } else if (strategy === "query-param") {
      bodyStmts.push(
        go.def(go.id("format"), go.call(go.sel(go.id("c"), "Query"), go.str("format"))),
      );
      bodyStmts.push(go.def(go.id("readMessage"), defaultRead));
      bodyStmts.push(go.def(go.id("writeEvent"), defaultWrite));
      const cases: go.CaseClause[] = [];
      for (const [key, cd] of Object.entries(codec.codecs)) {
        if (key === defaultKey) continue;
        cases.push(go.caseClause([go.str(key)], ...emitSwitchBodies(cd)));
      }
      bodyStmts.push(go.switchStmt(undefined, go.id("format"), ...cases));
    } else {
      bodyStmts.push(
        go.def(go.id("accept"), go.call(go.sel(go.id("c"), "GetHeader"), go.str("Accept"))),
      );
      bodyStmts.push(go.def(go.id("readMessage"), defaultRead));
      bodyStmts.push(go.def(go.id("writeEvent"), defaultWrite));
      const cases: go.CaseClause[] = [];
      for (const [key, cd] of Object.entries(codec.codecs)) {
        if (key === defaultKey) continue;
        cases.push(
          go.caseClause(
            [
              go.call(
                go.qual("strings", "Contains"),
                go.id("accept"),
                go.str(`application/x-${key}`),
              ),
            ],
            ...emitSwitchBodies(cd),
          ),
        );
      }
      bodyStmts.push(go.switchStmt(undefined, undefined, ...cases));
    }
  }

  return { upgraderFields, bodyStmts };
}

export function generateGinWSHandler(route: WSAst): GeneratedRegion {
  const modulePascal = pascalCase(route.moduleName);
  const msgType = `${route.handlerName}${pascalCase(route.moduleName)}Message`;
  const eventType = route.events
    ? `${route.handlerName}${pascalCase(route.moduleName)}Event`
    : "struct{}";
  const codec = route.codec;
  const stmts: go.Statement[] = [];

  const hasNegotiation = codec?.kind === "negotiated";

  // Upgrader
  if (hasNegotiation) {
    const neg = generateWSNegotiationPreamble(
      route,
      codec as ResolvedCodec & { kind: "negotiated" },
      msgType,
      eventType,
    );
    if (neg.upgraderFields.length > 0) {
      stmts.push(
        go.def(go.id("upgrader"), go.elt(go.qual("websocket", "Upgrader"), ...neg.upgraderFields)),
      );
    } else {
      stmts.push(go.def(go.id("upgrader"), go.elt(go.qual("websocket", "Upgrader"))));
    }
  } else {
    stmts.push(go.def(go.id("upgrader"), go.elt(go.qual("websocket", "Upgrader"))));
  }

  stmts.push(
    go.def(
      [go.id("conn"), go.id("err")],
      go.call(
        go.sel(go.id("upgrader"), "Upgrade"),
        go.sel(go.id("c"), "Writer"),
        go.sel(go.id("c"), "Request"),
        go.id("nil"),
      ),
    ),
  );
  stmts.push(go.ifStmt(go.neq(go.id("err"), go.id("nil")), go.block(go.return_())));
  stmts.push(go.defer(go.call(go.sel(go.id("conn"), "Close"))));

  if (hasNegotiation) {
    const neg = generateWSNegotiationPreamble(
      route,
      codec as ResolvedCodec & { kind: "negotiated" },
      msgType,
      eventType,
    );
    stmts.push(...neg.bodyStmts);
  }

  if (route.usecaseCodec && !hasNegotiation) {
    if (
      codec &&
      (codec.kind === "custom" ||
        (codec.kind === "preset" && codec.preset !== "json" && codec.preset !== "sse"))
    ) {
      const isProto = codec.kind === "preset" && codec.preset === "protobuf";
      stmts.push(
        go.def(
          go.id("marshalEvent"),
          isProto ? wsProtoMarshalExpr(eventType) : wsMarshalExpr(codec, eventType),
        ),
      );
      stmts.push(
        go.def(
          go.id("unmarshalMessage"),
          isProto ? wsProtoUnmarshalExpr(msgType) : wsUnmarshalExpr(codec, msgType),
        ),
      );
    } else if (codec?.kind === "preset" || !codec) {
      const params1 = [go.field(["v"], toGoType(eventType))];
      const results1 = [go.field([], go.sliceType(go.id("byte"))), go.field([], go.id("error"))];
      stmts.push(
        go.def(
          go.id("marshalEvent"),
          go.funcLit(
            go.funcType(params1, results1),
            go.block(go.return_(go.call(go.qual("json", "Marshal"), go.id("v")))),
          ),
        ),
      );
      const params2 = [
        go.field(["data"], go.sliceType(go.id("byte"))),
        go.field(["msg"], go.star(toGoType(msgType))),
      ];
      const results2 = [go.field([], go.id("error"))];
      stmts.push(
        go.def(
          go.id("unmarshalMessage"),
          go.funcLit(
            go.funcType(params2, results2),
            go.block(
              go.return_(go.call(go.qual("json", "Unmarshal"), go.id("data"), go.id("msg"))),
            ),
          ),
        ),
      );
    }
  }

  stmts.push(go.def(go.id("readCh"), go.call(go.id("make"), makeChanType(msgType))));
  stmts.push(go.def(go.id("writeCh"), go.call(go.id("make"), makeChanType(eventType), go.int(8))));

  const usecaseArgs = route.usecaseCodec
    ? [
        go.call(go.sel(go.sel(go.id("c"), "Request"), "Context")),
        go.id("readCh"),
        go.id("writeCh"),
        go.id("marshalEvent"),
        go.id("unmarshalMessage"),
      ]
    : [
        go.call(go.sel(go.sel(go.id("c"), "Request"), "Context")),
        go.id("readCh"),
        go.id("writeCh"),
      ];
  stmts.push(
    go.goStmt(
      go.call(go.sel(go.sel(go.id("h"), `${route.handlerName}Usecase`), "Execute"), ...usecaseArgs),
    ),
  );

  if (hasNegotiation) {
    const readLoop: go.Statement[] = [];
    readLoop.push(go.defer(go.call(go.id("close"), go.id("readCh"))));
    readLoop.push(
      go.forStmt(
        undefined,
        undefined,
        undefined,
        go.block(
          go.def([go.id("msg"), go.id("err")], go.call(go.id("readMessage"))),
          go.ifStmt(go.neq(go.id("err"), go.id("nil")), go.block(go.branch("break"))),
          { kind: "SendStmt", chan: go.id("readCh"), value: go.id("msg") },
        ),
      ),
    );
    stmts.push(go.goStmt(go.call(go.funcLit(go.funcType([], undefined), go.block(...readLoop)))));
    stmts.push(
      go.rangeStmt(
        go.id("event"),
        undefined,
        ":=",
        go.id("writeCh"),
        go.block({
          kind: "IfStmt",
          init: go.def(go.id("err"), go.call(go.id("writeEvent"), go.id("event"))),
          cond: go.neq(go.id("err"), go.id("nil")),
          body: go.block(go.branch("break")),
        } as go.IfStmt),
      ),
    );
  } else if (
    codec &&
    (codec.kind === "custom" ||
      (codec.kind === "preset" && codec.preset !== "json" && codec.preset !== "sse"))
  ) {
    const isProto = codec.kind === "preset" && codec.preset === "protobuf";
    const readExpr = isProto ? wsProtoReadExpr(msgType) : wsReadExpr(codec, msgType);
    const writeExpr = isProto ? wsProtoWriteExpr(eventType) : wsWriteExpr(codec, eventType);
    stmts.push(go.def(go.id("readMessage"), readExpr));
    stmts.push(go.def(go.id("writeEvent"), writeExpr));

    const readLoop: go.Statement[] = [];
    readLoop.push(go.defer(go.call(go.id("close"), go.id("readCh"))));
    readLoop.push(
      go.forStmt(
        undefined,
        undefined,
        undefined,
        go.block(
          go.def([go.id("msg"), go.id("err")], go.call(go.id("readMessage"))),
          go.ifStmt(go.neq(go.id("err"), go.id("nil")), go.block(go.branch("break"))),
          { kind: "SendStmt", chan: go.id("readCh"), value: go.id("msg") },
        ),
      ),
    );
    stmts.push(go.goStmt(go.call(go.funcLit(go.funcType([], undefined), go.block(...readLoop)))));
    stmts.push(
      go.rangeStmt(
        go.id("event"),
        undefined,
        ":=",
        go.id("writeCh"),
        go.block({
          kind: "IfStmt",
          init: go.def(go.id("err"), go.call(go.id("writeEvent"), go.id("event"))),
          cond: go.neq(go.id("err"), go.id("nil")),
          body: go.block(go.branch("break")),
        } as go.IfStmt),
      ),
    );
  } else {
    const readLoop: go.Statement[] = [];
    readLoop.push(go.defer(go.call(go.id("close"), go.id("readCh"))));
    readLoop.push(
      go.forStmt(
        undefined,
        undefined,
        undefined,
        go.block(
          go.declStmt(go.genDecl("var", go.valueSpec(["msg"], toGoType(msgType)))),
          go.ifStmt(
            go.neq(go.call(go.sel(go.id("conn"), "ReadJSON"), go.addr(go.id("msg"))), go.id("nil")),
            go.block(go.branch("break")),
          ),
          { kind: "SendStmt", chan: go.id("readCh"), value: go.id("msg") },
        ),
      ),
    );
    stmts.push(go.goStmt(go.call(go.funcLit(go.funcType([], undefined), go.block(...readLoop)))));
    stmts.push(
      go.rangeStmt(
        go.id("event"),
        undefined,
        ":=",
        go.id("writeCh"),
        go.block({
          kind: "IfStmt",
          init: go.def(go.id("err"), go.call(go.sel(go.id("conn"), "WriteJSON"), go.id("event"))),
          cond: go.neq(go.id("err"), go.id("nil")),
          body: go.block(go.branch("break")),
        } as go.IfStmt),
      ),
    );
  }

  const methodDecl = go.method(
    go.field(["h"], go.star(go.id(`${modulePascal}Handler`))),
    route.handlerName,
    [go.field(["c"], go.star(go.qual("gin", "Context")))],
    undefined,
    go.block(...stmts),
  );

  const sb = new go.StringBuilder();
  go.printDeclaration(sb, methodDecl, 0);
  const content = sb.toString().trimEnd();
  return {
    id: defaultRegionId(route, "handler"),
    stableHash: `${route.stableId}:ws:handler:${defaultFileForLayer(route, "handler")}`,
    owner: "gin",
    language: "go",
    content,
  };
}

// ─── Codec helpers ─────────────────────────────────────────

function codecNeedsImport(imp: string, codec: ResolvedCodec | undefined): boolean {
  if (!codec) return imp === "encoding/json";
  if (codec.kind === "preset") {
    if (imp === "encoding/json") return true;
    return false;
  }
  if (codec.kind === "custom") {
    return false;
  }
  if (codec.kind === "negotiated") {
    if (imp === "encoding/json")
      return Object.values(codec.codecs).some((c) => c.kind === "preset");
    if (imp === "strings" && codec.strategy.includes("accept-header")) return true;
  }
  return false;
}

export function codecUsesProtobuf(codec: ResolvedCodec | undefined): boolean {
  if (!codec) return false;
  if (codec.kind === "preset") return codec.preset === "protobuf";
  if (codec.kind === "negotiated") {
    return Object.values(codec.codecs).some((c) => c.kind === "preset" && c.preset === "protobuf");
  }
  return false;
}

export function handlerImportsForCodec(codec: ResolvedCodec | undefined): string[] {
  const imports: string[] = [];
  if (codecNeedsImport("encoding/json", codec)) imports.push("encoding/json");
  if (codecNeedsImport("strings", codec)) imports.push("strings");
  return imports;
}
