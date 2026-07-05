import { createHash } from "node:crypto";
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

function sseMarshalExpr(codec: ResolvedCodecSingle, eventType: string): string {
  if (codec.kind === "preset") {
    return `func(v ${eventType}) ([]byte, error) { return json.Marshal(v) }`;
  }
  return `func(v ${eventType}) ([]byte, error) { return ${codec.marshal}(v) }`;
}

function generateSSENegotiationPreamble(
  route: SSEAst,
  codec: ResolvedCodec & { kind: "negotiated" },
  eventType: string,
): string[] {
  const lines: string[] = [];
  const defaultExpr = sseMarshalExpr(
    codec.codecs[codec.defaultKey] ?? codec.codecs[Object.keys(codec.codecs)[0]],
    eventType,
  );
  const strategy = codec.strategy[0];
  const marshalVar = "marshalEvent";

  if (strategy === "accept-header") {
    lines.push(`accept := c.GetHeader("Accept")`);
    lines.push(`${marshalVar} := ${defaultExpr}`);
    lines.push(`switch {`);
    for (const [key, cd] of Object.entries(codec.codecs)) {
      if (key === codec.defaultKey) continue;
      lines.push(`case strings.Contains(accept, "application/x-${key}"):`);
      lines.push(`\t${marshalVar} = ${sseMarshalExpr(cd, eventType)}`);
    }
    lines.push(`}`);
  } else if (strategy === "query-param") {
    lines.push(`format := c.Query("format")`);
    lines.push(`${marshalVar} := ${defaultExpr}`);
    lines.push(`switch format {`);
    for (const [key, cd] of Object.entries(codec.codecs)) {
      if (key === codec.defaultKey) continue;
      lines.push(`case "${key}":`);
      lines.push(`\t${marshalVar} = ${sseMarshalExpr(cd, eventType)}`);
    }
    lines.push(`}`);
  } else if (strategy === "subprotocol") {
    // SSE doesn't have subprotocol negotiation, fall back to accept-header
    lines.push(`accept := c.GetHeader("Accept")`);
    lines.push(`${marshalVar} := ${defaultExpr}`);
    lines.push(`switch {`);
    for (const [key, cd] of Object.entries(codec.codecs)) {
      if (key === codec.defaultKey) continue;
      lines.push(`case strings.Contains(accept, "application/x-${key}"):`);
      lines.push(`\t${marshalVar} = ${sseMarshalExpr(cd, eventType)}`);
    }
    lines.push(`}`);
  }

  return lines;
}

function generateSSEMarshalLines(
  eventType: string,
  marshalVar?: string,
  sseFields?: SSEFieldMapping,
): string[] {
  const lines: string[] = [];
  if (marshalVar) {
    lines.push(`data, err := ${marshalVar}(event)`);
  } else {
    lines.push(`data, err := json.Marshal(event)`);
  }
  lines.push(`if err != nil { return false }`);
  if (sseFields) {
    if (sseFields.eventField) {
      lines.push(
        `if event.${sseFields.eventField} != "" { fmt.Fprintf(w, "event: %s\\\\n", event.${sseFields.eventField}) }`,
      );
    }
    if (sseFields.idField) {
      lines.push(
        `if event.${sseFields.idField} != "" { fmt.Fprintf(w, "id: %s\\\\n", event.${sseFields.idField}) }`,
      );
    }
  }
  lines.push(`fmt.Fprintf(w, "data: %s\\\\n\\\\n", data)`);
  return lines;
}

export function generateGinSSEHandler(route: SSEAst): GeneratedRegion {
  const receiver = `*${pascalCase(route.moduleName)}Handler`;
  const eventType = `${route.handlerName}${pascalCase(route.moduleName)}Event`;
  const codec = route.codec;
  const body: string[] = [];

  body.push(`c.Writer.Header().Set("Content-Type", "text/event-stream")`);
  body.push(`c.Writer.Header().Set("Cache-Control", "no-cache")`);
  body.push(`c.Writer.Header().Set("Connection", "keep-alive")`);

  const hasMarshalVar =
    codec &&
    (codec.kind === "negotiated" ||
      codec.kind === "custom" ||
      (codec.kind === "preset" && codec.preset !== "json" && codec.preset !== "sse"));

  if (codec?.kind === "negotiated") {
    body.push(``);
    const preamble = generateSSENegotiationPreamble(route, codec, eventType);
    body.push(...preamble);
  } else if (
    codec?.kind === "custom" ||
    (codec?.kind === "preset" && codec.preset !== "json" && codec.preset !== "sse")
  ) {
    body.push(``);
    body.push(`marshalEvent := ${sseMarshalExpr(codec, eventType)}`);
  }

  // If usecaseCodec is true but no marshalEvent declared yet, create one
  if (route.usecaseCodec && !hasMarshalVar) {
    body.push(``);
    body.push(`marshalEvent := func(v ${eventType}) ([]byte, error) { return json.Marshal(v) }`);
  }

  body.push(``);
  body.push(`ch := make(chan ${eventType})`);
  const usecaseArgs = route.usecaseCodec
    ? `c.Request.Context(), ch, marshalEvent`
    : `c.Request.Context(), ch`;
  body.push(`go h.${route.handlerName}Usecase.Execute(${usecaseArgs})`);
  body.push(``);

  const useMarshalVar = hasMarshalVar || route.usecaseCodec;

  body.push(`c.Stream(func(w io.Writer) bool {`);
  body.push(`\tevent, ok := <-ch`);
  body.push(`\tif !ok { return false }`);

  const marshalLines = generateSSEMarshalLines(
    eventType,
    useMarshalVar ? "marshalEvent" : undefined,
    route.sseFields,
  );
  for (const line of marshalLines) {
    body.push(`\t${line}`);
  }

  body.push(`\treturn true`);
  body.push(`})`);

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

function wsMarshalExpr(codec: ResolvedCodecSingle, eventType: string): string {
  if (codec.kind === "preset") {
    return `func(v ${eventType}) ([]byte, error) { return json.Marshal(v) }`;
  }
  return `func(v ${eventType}) ([]byte, error) { return ${codec.marshal}(v) }`;
}

function wsProtoMarshalExpr(eventType: string): string {
  return `func(v ${eventType}) ([]byte, error) { return ${eventType}ToProtoBytes(v), nil }`;
}

function wsUnmarshalExpr(codec: ResolvedCodecSingle, msgType: string): string {
  if (codec.kind === "preset") {
    return `func(data []byte, msg *${msgType}) error { return json.Unmarshal(data, msg) }`;
  }
  const unmarshalFn = codec.unmarshal ?? codec.marshal;
  return `func(data []byte, msg *${msgType}) error { return ${unmarshalFn}(data, msg) }`;
}

function wsProtoUnmarshalExpr(msgType: string): string {
  return `func(data []byte, msg *${msgType}) error { *msg = ${msgType}FromProtoBytes(data); return nil }`;
}

function wsReadExpr(codec: ResolvedCodecSingle, msgType: string): string {
  if (codec.kind === "preset") {
    return `func() (${msgType}, error) { var msg ${msgType}; err := conn.ReadJSON(&msg); return msg, err }`;
  }
  const unmarshalFn = codec.unmarshal ?? codec.marshal;
  return `func() (${msgType}, error) { _, data, err := conn.ReadMessage(); if err != nil { var z ${msgType}; return z, err }; var msg ${msgType}; err = ${unmarshalFn}(data, &msg); return msg, err }`;
}

function wsProtoReadExpr(msgType: string): string {
  return `func() (${msgType}, error) { _, data, err := conn.ReadMessage(); if err != nil { var z ${msgType}; return z, err }; return ${msgType}FromProtoBytes(data), nil }`;
}

function wsWriteExpr(codec: ResolvedCodecSingle, eventType: string): string {
  if (codec.kind === "preset") {
    return `func(v ${eventType}) error { return conn.WriteJSON(v) }`;
  }
  return `func(v ${eventType}) error { data, err := ${codec.marshal}(v); if err != nil { return err }; return conn.WriteMessage(websocket.TextMessage, data) }`;
}

function wsProtoWriteExpr(eventType: string): string {
  return `func(v ${eventType}) error { return conn.WriteMessage(websocket.BinaryMessage, ${eventType}ToProtoBytes(v)) }`;
}

function wsIsProto(codec: ResolvedCodecSingle): boolean {
  return codec.kind === "preset" && codec.preset === "protobuf";
}

function wsChooseReadFn(cd: ResolvedCodecSingle, msgType: string): string {
  return wsIsProto(cd) ? wsProtoReadExpr(msgType) : wsReadExpr(cd, msgType);
}

function wsChooseWriteFn(cd: ResolvedCodecSingle, eventType: string): string {
  return wsIsProto(cd) ? wsProtoWriteExpr(eventType) : wsWriteExpr(cd, eventType);
}

function wsChooseMarshalFn(cd: ResolvedCodecSingle, eventType: string): string {
  return wsIsProto(cd) ? wsProtoMarshalExpr(eventType) : wsMarshalExpr(cd, eventType);
}

function wsChooseUnmarshalFn(cd: ResolvedCodecSingle, msgType: string): string {
  return wsIsProto(cd) ? wsProtoUnmarshalExpr(msgType) : wsUnmarshalExpr(cd, msgType);
}

function generateWSNegotiationPreamble(
  route: WSAst,
  codec: ResolvedCodec & { kind: "negotiated" },
  msgType: string,
  eventType: string,
): { upgraderFields: string[]; bodyLines: string[] } {
  const upgraderFields: string[] = [];
  const bodyLines: string[] = [];

  const defaultKey = codec.defaultKey;
  const defaultCodec = codec.codecs[defaultKey] ?? codec.codecs[Object.keys(codec.codecs)[0]];
  const strategy = codec.strategy[0];

  const defaultRead = wsChooseReadFn(defaultCodec, msgType);
  const defaultWrite = wsChooseWriteFn(defaultCodec, eventType);
  const hasUsecaseCodec = route.usecaseCodec;

  const emitSwitchBodies = (
    bodyLines: string[],
    strategyBody: string[],
    cd: ResolvedCodecSingle,
  ) => {
    bodyLines.push(`\treadMessage = ${wsChooseReadFn(cd, msgType)}`);
    bodyLines.push(`\twriteEvent = ${wsChooseWriteFn(cd, eventType)}`);
    if (hasUsecaseCodec) {
      bodyLines.push(`\tmarshalEvent = ${wsChooseMarshalFn(cd, eventType)}`);
      bodyLines.push(`\tunmarshalMessage = ${wsChooseUnmarshalFn(cd, msgType)}`);
    }
  };

  if (hasUsecaseCodec) {
    const defaultMarshal = wsChooseMarshalFn(defaultCodec, eventType);
    const defaultUnmarshal = wsChooseUnmarshalFn(defaultCodec, msgType);

    if (strategy === "subprotocol") {
      upgraderFields.push(
        `Subprotocols: []string{${Object.keys(codec.codecs)
          .map((k) => `"${k}"`)
          .join(", ")}}`,
      );
      bodyLines.push(`subproto := conn.Subprotocol()`);
      bodyLines.push(`readMessage := ${defaultRead}`);
      bodyLines.push(`writeEvent := ${defaultWrite}`);
      bodyLines.push(`marshalEvent := ${defaultMarshal}`);
      bodyLines.push(`unmarshalMessage := ${defaultUnmarshal}`);
      bodyLines.push(`switch subproto {`);
      for (const [key, cd] of Object.entries(codec.codecs)) {
        if (key === defaultKey) continue;
        bodyLines.push(`case "${key}":`);
        emitSwitchBodies(bodyLines, [], cd);
      }
      bodyLines.push(`}`);
    } else if (strategy === "query-param") {
      bodyLines.push(`format := c.Query("format")`);
      bodyLines.push(`readMessage := ${defaultRead}`);
      bodyLines.push(`writeEvent := ${defaultWrite}`);
      bodyLines.push(`marshalEvent := ${defaultMarshal}`);
      bodyLines.push(`unmarshalMessage := ${defaultUnmarshal}`);
      bodyLines.push(`switch format {`);
      for (const [key, cd] of Object.entries(codec.codecs)) {
        if (key === defaultKey) continue;
        bodyLines.push(`case "${key}":`);
        emitSwitchBodies(bodyLines, [], cd);
      }
      bodyLines.push(`}`);
    } else {
      bodyLines.push(`accept := c.GetHeader("Accept")`);
      bodyLines.push(`readMessage := ${defaultRead}`);
      bodyLines.push(`writeEvent := ${defaultWrite}`);
      bodyLines.push(`marshalEvent := ${defaultMarshal}`);
      bodyLines.push(`unmarshalMessage := ${defaultUnmarshal}`);
      bodyLines.push(`switch {`);
      for (const [key, cd] of Object.entries(codec.codecs)) {
        if (key === defaultKey) continue;
        bodyLines.push(`case strings.Contains(accept, "application/x-${key}"):`);
        emitSwitchBodies(bodyLines, [], cd);
      }
      bodyLines.push(`}`);
    }
  } else {
    if (strategy === "subprotocol") {
      upgraderFields.push(
        `Subprotocols: []string{${Object.keys(codec.codecs)
          .map((k) => `"${k}"`)
          .join(", ")}}`,
      );
      bodyLines.push(`subproto := conn.Subprotocol()`);
      bodyLines.push(`readMessage := ${defaultRead}`);
      bodyLines.push(`writeEvent := ${defaultWrite}`);
      bodyLines.push(`switch subproto {`);
      for (const [key, cd] of Object.entries(codec.codecs)) {
        if (key === defaultKey) continue;
        bodyLines.push(`case "${key}":`);
        emitSwitchBodies(bodyLines, [], cd);
      }
      bodyLines.push(`}`);
    } else if (strategy === "query-param") {
      bodyLines.push(`format := c.Query("format")`);
      bodyLines.push(`readMessage := ${defaultRead}`);
      bodyLines.push(`writeEvent := ${defaultWrite}`);
      bodyLines.push(`switch format {`);
      for (const [key, cd] of Object.entries(codec.codecs)) {
        if (key === defaultKey) continue;
        bodyLines.push(`case "${key}":`);
        emitSwitchBodies(bodyLines, [], cd);
      }
      bodyLines.push(`}`);
    } else {
      bodyLines.push(`accept := c.GetHeader("Accept")`);
      bodyLines.push(`readMessage := ${defaultRead}`);
      bodyLines.push(`writeEvent := ${defaultWrite}`);
      bodyLines.push(`switch {`);
      for (const [key, cd] of Object.entries(codec.codecs)) {
        if (key === defaultKey) continue;
        bodyLines.push(`case strings.Contains(accept, "application/x-${key}"):`);
        emitSwitchBodies(bodyLines, [], cd);
      }
      bodyLines.push(`}`);
    }
  }

  return { upgraderFields, bodyLines };
}

export function generateGinWSHandler(route: WSAst): GeneratedRegion {
  const receiver = `*${pascalCase(route.moduleName)}Handler`;
  const msgType = `${route.handlerName}${pascalCase(route.moduleName)}Message`;
  const eventType = route.events
    ? `${route.handlerName}${pascalCase(route.moduleName)}Event`
    : "struct{}";
  const codec = route.codec;
  const body: string[] = [];

  // Upgrader
  const upgraderLines: string[] = [];
  const hasNegotiation = codec?.kind === "negotiated";
  if (hasNegotiation) {
    const neg = generateWSNegotiationPreamble(
      route,
      codec as ResolvedCodec & { kind: "negotiated" },
      msgType,
      eventType,
    );
    if (neg.upgraderFields.length > 0) {
      upgraderLines.push(`upgrader := websocket.Upgrader{`);
      for (const f of neg.upgraderFields) {
        upgraderLines.push(`\t${f},`);
      }
      upgraderLines.push(`}`);
    } else {
      upgraderLines.push(`upgrader := websocket.Upgrader{}`);
    }
  } else {
    upgraderLines.push(`upgrader := websocket.Upgrader{}`);
  }

  body.push(...upgraderLines);
  body.push(`conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)`);
  body.push(`if err != nil { return }`);
  body.push(`defer conn.Close()`);

  if (hasNegotiation) {
    const neg = generateWSNegotiationPreamble(
      route,
      codec as ResolvedCodec & { kind: "negotiated" },
      msgType,
      eventType,
    );
    body.push(``);
    body.push(...neg.bodyLines);
  }

  // Add usecase codec vars for non-negotiated codecs
  if (route.usecaseCodec && !hasNegotiation) {
    if (
      codec &&
      (codec.kind === "custom" ||
        (codec.kind === "preset" && codec.preset !== "json" && codec.preset !== "sse"))
    ) {
      const isProto = codec.kind === "preset" && codec.preset === "protobuf";
      body.push(``);
      body.push(
        `marshalEvent := ${isProto ? wsProtoMarshalExpr(eventType) : wsMarshalExpr(codec, eventType)}`,
      );
      body.push(
        `unmarshalMessage := ${isProto ? wsProtoUnmarshalExpr(msgType) : wsUnmarshalExpr(codec, msgType)}`,
      );
    } else if (codec?.kind === "preset" || !codec) {
      // Default json codec
      body.push(``);
      body.push(`marshalEvent := func(v ${eventType}) ([]byte, error) { return json.Marshal(v) }`);
      body.push(
        `unmarshalMessage := func(data []byte, msg *${msgType}) error { return json.Unmarshal(data, msg) }`,
      );
    }
  }

  body.push(``);
  body.push(`readCh := make(chan ${msgType})`);
  body.push(`writeCh := make(chan ${eventType}, 8)`);
  body.push(``);

  const usecaseArgs = route.usecaseCodec
    ? `c.Request.Context(), readCh, writeCh, marshalEvent, unmarshalMessage`
    : `c.Request.Context(), readCh, writeCh`;
  body.push(`go h.${route.handlerName}Usecase.Execute(${usecaseArgs})`);

  body.push(``);

  if (hasNegotiation) {
    body.push(`go func() {`);
    body.push(`\tdefer close(readCh)`);
    body.push(`\tfor {`);
    body.push(`\t\tmsg, err := readMessage()`);
    body.push(`\t\tif err != nil { break }`);
    body.push(`\t\treadCh <- msg`);
    body.push(`\t}`);
    body.push(`}()`);
    body.push(``);
    body.push(`for event := range writeCh {`);
    body.push(`\tif err := writeEvent(event); err != nil { break }`);
    body.push(`}`);
  } else if (
    codec &&
    (codec.kind === "custom" ||
      (codec.kind === "preset" && codec.preset !== "json" && codec.preset !== "sse"))
  ) {
    // For protobuf or custom single codec
    const readExpr =
      codec.kind === "preset" && codec.preset === "protobuf"
        ? wsProtoReadExpr(msgType)
        : wsReadExpr(codec, msgType);
    const writeExpr =
      codec.kind === "preset" && codec.preset === "protobuf"
        ? wsProtoWriteExpr(eventType)
        : wsWriteExpr(codec, eventType);
    body.push(`readMessage := ${readExpr}`);
    body.push(`writeEvent := ${writeExpr}`);
    body.push(``);
    body.push(`go func() {`);
    body.push(`\tdefer close(readCh)`);
    body.push(`\tfor {`);
    body.push(`\t\tmsg, err := readMessage()`);
    body.push(`\t\tif err != nil { break }`);
    body.push(`\t\treadCh <- msg`);
    body.push(`\t}`);
    body.push(`}()`);
    body.push(``);
    body.push(`for event := range writeCh {`);
    body.push(`\tif err := writeEvent(event); err != nil { break }`);
    body.push(`}`);
  } else {
    // Default: json preset or no codec - keep original behavior
    body.push(`go func() {`);
    body.push(`\tdefer close(readCh)`);
    body.push(`\tfor {`);
    body.push(`\t\tvar msg ${msgType}`);
    body.push(`\t\tif err := conn.ReadJSON(&msg); err != nil { break }`);
    body.push(`\t\treadCh <- msg`);
    body.push(`\t}`);
    body.push(`}()`);
    body.push(``);
    body.push(`for event := range writeCh {`);
    body.push(`\tif err := conn.WriteJSON(event); err != nil { break }`);
    body.push(`}`);
  }

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
