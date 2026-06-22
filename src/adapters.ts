import type {
  AdapterPlugin,
  AdapterTarget,
  Diagnostic,
  GeneratedRegion,
  RouteAst,
  SchemaLike,
} from "./types.js";
import {
  defaultFileForLayer,
  defaultRegionId,
  extractPathParams,
  lowerIdent,
  pascalCase,
  routeTypeName,
} from "./naming.js";
import { requestType } from "./schema.js";

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

export function generateGinHandler(
  route: RouteAst,
  diagnostics: Diagnostic[],
  owner: string,
): GeneratedRegion {
  const receiverType = `*${pascalCase(route.moduleName)}Handler`;
  const usecaseField = `${route.handlerName}Usecase`;
  const reqType = requestType(route);
  const pathParams = extractPathParams(route.path);
  const body: string[] = [];

  const hasQuery = !!route.query;
  const hasBody = !!route.body;

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
    body.push(`var input ${reqType}`);
    body.push(`if err := c.ShouldBindQuery(&input); err != nil {`);
    body.push(`\tc.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})`);
    body.push(`\treturn`);
    body.push(`}`);
    for (const param of pathParams) {
      const fieldName = pascalCase(param);
      if (!fieldInSchema(route.query!, param)) {
        body.push(`input.${fieldName} = c.Param("${param}")`);
      }
    }
  } else if (hasBody) {
    body.push(`var input ${reqType}`);
    body.push(`if err := c.ShouldBindJSON(&input); err != nil {`);
    body.push(`\tc.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})`);
    body.push(`\treturn`);
    body.push(`}`);
    for (const param of pathParams) {
      const fieldName = pascalCase(param);
      if (!fieldInSchema(route.body!, param)) {
        body.push(`input.${fieldName} = c.Param("${param}")`);
      }
    }
  } else if (pathParams.length > 0) {
    body.push(`var input ${reqType}`);
    for (const param of pathParams) {
      body.push(`input.${pascalCase(param)} = c.Param("${param}")`);
    }
  } else {
    body.push(`input := struct{}{}`);
  }

  body.push(`output, err := h.${usecaseField}.Execute(c.Request.Context(), input)`);
  body.push(`if err != nil {`);
  body.push(`\tc.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})`);
  body.push(`\treturn`);
  body.push(`}`);
  if (route.method === "DELETE") {
    body.push(`_ = output`);
    body.push(`c.Status(http.StatusNoContent)`);
  } else {
    body.push(`c.JSON(http.StatusOK, output)`);
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
