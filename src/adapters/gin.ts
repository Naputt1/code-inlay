import { createHash } from "node:crypto";
import type {
  AdapterPlugin,
  AdapterTarget,
  Diagnostic,
  GeneratedRegion,
  RouteAst,
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
    return [
      {
        id: defaultRegionId(ctx.route, "route"),
        language: "go",
        content: `api.${methodName(ctx.route.method)}("${ctx.route.path}", ${receiver}.${ctx.route.handlerName})`,
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
    body.push(`\tc.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})`);
    body.push(`\treturn`);
    body.push(`}`);
    body.push(`_ = output`);
    body.push(`c.Status(http.StatusNoContent)`);
  } else {
    body.push(`if err != nil {`);
    body.push(`\tc.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})`);
    body.push(`\treturn`);
    body.push(`}`);
    body.push(`c.JSON(http.StatusOK, output)`);
  }
}

function emitBindQuery(body: string[], reqType: string, pathParams: string[], route: RouteAst) {
  body.push(`var input ${reqType}`);
  body.push(`if err := c.ShouldBindQuery(&input); err != nil {`);
  body.push(`\tc.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})`);
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
  body.push(`\tc.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})`);
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
        body.push(`\tc.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})`);
        body.push(`\treturn`);
        body.push(`}`);
        body.push(`var requestBody ${bn}`);
        body.push(`if err := c.ShouldBindJSON(&requestBody); err != nil {`);
        body.push(`\tc.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})`);
        body.push(`\treturn`);
        body.push(`}`);
        body.push(`// @gen:start ${handlerSh}`);
        body.push(`// TODO: construct ${modulePascal} entity from query + body`);
        body.push(`entity := ${modulePascal}{}`);
        body.push(`// @gen:end ${handlerSh}`);
      } else if (hasBody) {
        body.push(`var binding ${reqType}`);
        body.push(`if err := c.ShouldBindJSON(&binding); err != nil {`);
        body.push(`\tc.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})`);
        body.push(`\treturn`);
        body.push(`}`);
        body.push(`// @gen:start ${handlerSh}`);
        body.push(`// TODO: construct ${modulePascal} entity from binding`);
        body.push(`entity := ${modulePascal}{}`);
        body.push(`// @gen:end ${handlerSh}`);
      } else if (hasQuery) {
        body.push(`var binding ${reqType}`);
        body.push(`if err := c.ShouldBindQuery(&binding); err != nil {`);
        body.push(`\tc.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})`);
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
      body.push(`\tc.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})`);
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
      body.push(`\tc.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})`);
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
        body.push(`\tc.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})`);
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
        body.push(`\tc.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})`);
        body.push(`\treturn`);
        body.push(`}`);
        body.push(`var requestBody ${bodyType}`);
        body.push(`if err := c.ShouldBindJSON(&requestBody); err != nil {`);
        body.push(`\tc.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})`);
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
      body.push(`\tc.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})`);
      body.push(`\treturn`);
      body.push(`}`);
      body.push(`var requestBody ${bodyType}`);
      body.push(`if err := c.ShouldBindJSON(&requestBody); err != nil {`);
      body.push(`\tc.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})`);
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
