import { createHash } from "node:crypto";
import type {
  AdapterPlugin,
  AdapterTarget,
  Diagnostic,
  GeneratedRegion,
  RouteAst,
  SSEAst,
  WSAst,
  SchemaLike,
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

function emitErrAndResp(body: string[], method: string) {
  if (method === "DELETE") {
    body.push(`if err != nil {`);
    body.push(`\tvar httpErr interface{ HTTPStatus() int }`);
    body.push(`\tif errors.As(err, &httpErr) {`);
    body.push(`\t\tc.Status(httpErr.HTTPStatus())`);
    body.push(`\t} else {`);
    body.push(`\t\tc.Status(http.StatusInternalServerError)`);
    body.push(`\t}`);
    body.push(`\treturn`);
    body.push(`}`);
    body.push(`_ = output`);
    body.push(`c.Status(http.StatusNoContent)`);
  } else {
    body.push(`if err != nil {`);
    body.push(`\tvar httpErr interface{ HTTPStatus() int }`);
    body.push(`\tif errors.As(err, &httpErr) {`);
    body.push(`\t\tc.JSON(httpErr.HTTPStatus(), err)`);
    body.push(`\t} else {`);
    body.push(`\t\tc.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})`);
    body.push(`\t}`);
    body.push(`\treturn`);
    body.push(`}`);
    body.push(`c.JSON(http.StatusOK, output)`);
  }
}

function emitBindErrorResponse(body: string[]) {
  body.push(`\tstatus, body := httperr.ResolveBindingError(err)`);
  body.push(`\tc.JSON(status, body)`);
}

function emitBindQuery(body: string[], reqType: string, pathParams: string[], route: RouteAst) {
  body.push(`var input ${reqType}`);
  body.push(`if err := c.ShouldBindQuery(&input); err != nil {`);
  emitBindErrorResponse(body);
  body.push(`\treturn`);
  body.push(`}`);
  for (const param of pathParams) {
    const fn = pascalCase(param);
    if (route.query && !fieldInSchema(route.query, param)) {
      body.push(`input.${fn} = c.Param("${param}")`);
    }
  }
}

function emitBindJSON(body: string[], reqType: string, pathParams: string[], route: RouteAst) {
  body.push(`var input ${reqType}`);
  body.push(`if err := c.ShouldBindJSON(&input); err != nil {`);
  emitBindErrorResponse(body);
  body.push(`\treturn`);
  body.push(`}`);
  for (const param of pathParams) {
    const fn = pascalCase(param);
    if (route.body && !fieldInSchema(route.body, param)) {
      body.push(`input.${fn} = c.Param("${param}")`);
    }
  }
}

export function generateGinHandler(
  route: RouteAst,
  diagnostics: Diagnostic[],
  owner: string,
  hasDomain?: boolean,
): GeneratedRegion {
  const modulePascal = pascalCase(route.moduleName);
  const receiverType = `*${modulePascal}Handler`;
  const usecaseField = `${route.handlerName}Usecase`;
  const reqType = requestType(route);
  const pathParams = extractPathParams(route.path);
  const body: string[] = [];

  const hasQuery = !!route.query;
  const hasBody = !!route.body;

  if (hasDomain) {
    const verb = verbForHandler(route.handlerName);
    const baseID = `${modulePascal}ID`;

    if (verb === "Get" || verb === "Delete" || verb === "Remove") {
      if (hasQuery) {
        emitBindQuery(body, reqType, pathParams, route);
        if (hasDomain && pathParams.length > 0) {
          body.push(`id := ${baseID}(c.Param("${pathParams[0]}"))`);
          body.push(`output, err := h.${usecaseField}.Execute(c.Request.Context(), id)`);
        } else {
          body.push(`output, err := h.${usecaseField}.Execute(c.Request.Context(), input)`);
        }
      } else if (hasBody) {
        emitBindJSON(body, reqType, pathParams, route);
        if (hasDomain && pathParams.length > 0) {
          body.push(`id := ${baseID}(c.Param("${pathParams[0]}"))`);
          body.push(`output, err := h.${usecaseField}.Execute(c.Request.Context(), id)`);
        } else {
          body.push(`output, err := h.${usecaseField}.Execute(c.Request.Context(), input)`);
        }
      } else if (pathParams.length > 0) {
        body.push(`id := ${baseID}(c.Param("${pathParams[0]}"))`);
        body.push(`output, err := h.${usecaseField}.Execute(c.Request.Context(), id)`);
      } else {
        body.push(`output, err := h.${usecaseField}.Execute(c.Request.Context())`);
      }
      emitErrAndResp(body, route.method);
    } else if (verb === "Create" || verb === "New") {
      const handlerSh = shortHash(defaultRegionId(route, "handler"));
      if (hasQuery && hasBody) {
        const qn = routeTypeName(route, "Query");
        const bn = routeTypeName(route, "Body");
        body.push(`var query ${qn}`);
        body.push(`if err := c.ShouldBindQuery(&query); err != nil {`);
        emitBindErrorResponse(body);
        body.push(`\treturn`);
        body.push(`}`);
        body.push(`var requestBody ${bn}`);
        body.push(`if err := c.ShouldBindJSON(&requestBody); err != nil {`);
        emitBindErrorResponse(body);
        body.push(`\treturn`);
        body.push(`}`);
        body.push(`// @gen:start ${handlerSh}`);
        body.push(`// TODO: construct ${modulePascal} entity from query + body`);
        body.push(`entity := ${modulePascal}{}`);
        body.push(`// @gen:end ${handlerSh}`);
      } else if (hasBody) {
        body.push(`var binding ${reqType}`);
        body.push(`if err := c.ShouldBindJSON(&binding); err != nil {`);
        emitBindErrorResponse(body);
        body.push(`\treturn`);
        body.push(`}`);
        body.push(`// @gen:start ${handlerSh}`);
        body.push(`// TODO: construct ${modulePascal} entity from binding`);
        body.push(`entity := ${modulePascal}{}`);
        body.push(`// @gen:end ${handlerSh}`);
      } else if (hasQuery) {
        body.push(`var binding ${reqType}`);
        body.push(`if err := c.ShouldBindQuery(&binding); err != nil {`);
        emitBindErrorResponse(body);
        body.push(`\treturn`);
        body.push(`}`);
        body.push(`// @gen:start ${handlerSh}`);
        body.push(`// TODO: construct ${modulePascal} entity from binding`);
        body.push(`entity := ${modulePascal}{}`);
        body.push(`// @gen:end ${handlerSh}`);
      } else {
        body.push(`// @gen:start ${handlerSh}`);
        body.push(`// TODO: construct ${modulePascal} entity`);
        body.push(`entity := ${modulePascal}{}`);
        body.push(`// @gen:end ${handlerSh}`);
      }
      body.push(`output, err := h.${usecaseField}.Execute(c.Request.Context(), entity)`);
      emitErrAndResp(body, route.method);
    } else if (verb === "Update" || verb === "Edit") {
      const handlerSh = shortHash(defaultRegionId(route, "handler"));
      body.push(`var binding ${reqType}`);
      body.push(`if err := c.ShouldBindJSON(&binding); err != nil {`);
      emitBindErrorResponse(body);
      body.push(`\treturn`);
      body.push(`}`);
      if (pathParams.length > 0) {
        body.push(`id := ${baseID}(c.Param("${pathParams[0]}"))`);
      } else {
        body.push(`var id ${baseID}`);
      }
      body.push(`// @gen:start ${handlerSh}`);
      body.push(`// TODO: construct ${modulePascal} entity from binding`);
      body.push(`entity := ${modulePascal}{}`);
      body.push(`// @gen:end ${handlerSh}`);
      body.push(`output, err := h.${usecaseField}.Execute(c.Request.Context(), id, entity)`);
      emitErrAndResp(body, route.method);
    } else if (verb === "Set") {
      body.push(`var binding ${reqType}`);
      body.push(`if err := c.ShouldBindJSON(&binding); err != nil {`);
      emitBindErrorResponse(body);
      body.push(`\treturn`);
      body.push(`}`);
      if (pathParams.length > 0) {
        body.push(`id := ${baseID}(c.Param("${pathParams[0]}"))`);
        body.push(`output, err := h.${usecaseField}.Execute(c.Request.Context(), id)`);
      } else {
        body.push(`output, err := h.${usecaseField}.Execute(c.Request.Context())`);
      }
      emitErrAndResp(body, route.method);
    } else if (verb === "List") {
      if (hasQuery) {
        body.push(`var input ${reqType}`);
        body.push(`if err := c.ShouldBindQuery(&input); err != nil {`);
        emitBindErrorResponse(body);
        body.push(`\treturn`);
        body.push(`}`);
        body.push(`output, err := h.${usecaseField}.Execute(c.Request.Context(), input)`);
      } else {
        body.push(`output, err := h.${usecaseField}.Execute(c.Request.Context())`);
      }
      emitErrAndResp(body, route.method);
    } else {
      if (hasQuery && hasBody) {
        const queryType = routeTypeName(route, "Query");
        const bodyType = routeTypeName(route, "Body");
        body.push(`var input ${reqType}`);
        body.push(`var query ${queryType}`);
        body.push(`if err := c.ShouldBindQuery(&query); err != nil {`);
        emitBindErrorResponse(body);
        body.push(`\treturn`);
        body.push(`}`);
        body.push(`var requestBody ${bodyType}`);
        body.push(`if err := c.ShouldBindJSON(&requestBody); err != nil {`);
        emitBindErrorResponse(body);
        body.push(`\treturn`);
        body.push(`}`);
        const queryFields = getSchemaFieldNames(route.query!);
        const bodyFields = getSchemaFieldNames(route.body!);
        for (const f of queryFields) {
          body.push(`input.${pascalCase(f)} = query.${pascalCase(f)}`);
        }
        for (const f of bodyFields) {
          body.push(`input.${pascalCase(f)} = requestBody.${pascalCase(f)}`);
        }
        for (const param of pathParams) {
          body.push(`input.${pascalCase(param)} = c.Param("${param}")`);
        }
      } else if (hasQuery) {
        emitBindQuery(body, reqType, pathParams, route);
      } else if (hasBody) {
        emitBindJSON(body, reqType, pathParams, route);
      } else if (pathParams.length > 0) {
        body.push(`var input ${reqType}`);
        for (const param of pathParams) {
          body.push(`input.${pascalCase(param)} = c.Param("${param}")`);
        }
      } else {
        body.push(`input := struct{}{}`);
      }
      body.push(`output, err := h.${usecaseField}.Execute(c.Request.Context(), input)`);
      emitErrAndResp(body, route.method);
    }
  } else {
    if (hasQuery && hasBody) {
      const queryType = routeTypeName(route, "Query");
      const bodyType = routeTypeName(route, "Body");
      body.push(`var input ${reqType}`);
      body.push(`var query ${queryType}`);
      body.push(`if err := c.ShouldBindQuery(&query); err != nil {`);
      emitBindErrorResponse(body);
      body.push(`\treturn`);
      body.push(`}`);
      body.push(`var requestBody ${bodyType}`);
      body.push(`if err := c.ShouldBindJSON(&requestBody); err != nil {`);
      emitBindErrorResponse(body);
      body.push(`\treturn`);
      body.push(`}`);
      const queryFields = getSchemaFieldNames(route.query!);
      const bodyFields = getSchemaFieldNames(route.body!);
      for (const f of queryFields) {
        body.push(`input.${pascalCase(f)} = query.${pascalCase(f)}`);
      }
      for (const f of bodyFields) {
        body.push(`input.${pascalCase(f)} = requestBody.${pascalCase(f)}`);
      }
      for (const param of pathParams) {
        body.push(`input.${pascalCase(param)} = c.Param("${param}")`);
      }
    } else if (hasQuery) {
      emitBindQuery(body, reqType, pathParams, route);
    } else if (hasBody) {
      emitBindJSON(body, reqType, pathParams, route);
    } else if (pathParams.length > 0) {
      body.push(`var input ${reqType}`);
      for (const param of pathParams) {
        body.push(`input.${pascalCase(param)} = c.Param("${param}")`);
      }
    } else {
      body.push(`input := struct{}{}`);
    }
    body.push(`output, err := h.${usecaseField}.Execute(c.Request.Context(), input)`);
    emitErrAndResp(body, route.method);
  }

  return {
    id: defaultRegionId(route, "handler"),
    stableHash: `${route.stableId}:${owner}:handler:${defaultFileForLayer(route, "handler")}`,
    owner,
    language: "go",
    content: [
      `func (h ${receiverType}) ${route.handlerName}(c *gin.Context) {`,
      ...body.map((line) => (line.length > 0 ? `\t${line}` : "")),
      `}`,
    ].join("\n"),
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

export function generateGinSSEHandler(route: SSEAst): GeneratedRegion {
  const receiver = `*${pascalCase(route.moduleName)}Handler`;
  const body = [
    `c.Writer.Header().Set("Content-Type", "text/event-stream")`,
    `c.Writer.Header().Set("Cache-Control", "no-cache")`,
    `c.Writer.Header().Set("Connection", "keep-alive")`,
    ``,
    `ch := make(chan ${route.handlerName}${pascalCase(route.moduleName)}Event)`,
    `go h.${route.handlerName}Usecase.Execute(c.Request.Context(), ch)`,
    ``,
    `c.Stream(func(w io.Writer) bool {`,
    `\tevent, ok := <-ch`,
    `\tif !ok { return false }`,
    `\t// TODO: marshal event to SSE format`,
    `\tfmt.Fprintf(w, "data: %s\\\\n\\\\n", event)`,
    `\treturn true`,
    `})`,
  ];
  return {
    id: defaultRegionId(route, "handler"),
    stableHash: `${route.stableId}:sse:handler:${defaultFileForLayer(route, "handler")}`,
    owner: "gin",
    language: "go",
    content: [
      `func (h ${receiver}) ${route.handlerName}(c *gin.Context) {`,
      ...body.map((line) => (line.length > 0 ? `\t${line}` : "")),
      `}`,
    ].join("\n"),
  };
}

export function generateGinWSHandler(route: WSAst): GeneratedRegion {
  const receiver = `*${pascalCase(route.moduleName)}Handler`;
  const body = [
    `upgrader := websocket.Upgrader{}`,
    `conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)`,
    `if err != nil { return }`,
    `defer conn.Close()`,
    ``,
    `readCh := make(chan ${route.handlerName}${pascalCase(route.moduleName)}Message)`,
    `writeCh := make(chan ${route.handlerName}${pascalCase(route.moduleName)}Event, 8)`,
    ``,
    `go h.${route.handlerName}Usecase.Execute(c.Request.Context(), readCh, writeCh)`,
    ``,
    `go func() {`,
    `\tdefer close(readCh)`,
    `\tfor {`,
    `\t\tvar msg ${route.handlerName}${pascalCase(route.moduleName)}Message`,
    `\t\tif err := conn.ReadJSON(&msg); err != nil { break }`,
    `\t\treadCh <- msg`,
    `\t}`,
    `}()`,
    ``,
    `for event := range writeCh {`,
    `\tif err := conn.WriteJSON(event); err != nil { break }`,
    `}`,
  ];
  return {
    id: defaultRegionId(route, "handler"),
    stableHash: `${route.stableId}:ws:handler:${defaultFileForLayer(route, "handler")}`,
    owner: "gin",
    language: "go",
    content: [
      `func (h ${receiver}) ${route.handlerName}(c *gin.Context) {`,
      ...body.map((line) => (line.length > 0 ? `\t${line}` : "")),
      `}`,
    ].join("\n"),
  };
}
