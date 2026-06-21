import type {
  AdapterPlugin,
  AdapterTarget,
  Diagnostic,
  GeneratedRegion,
  RouteAst,
} from "./types.js";
import {
  defaultFileForLayer,
  defaultRegionId,
  extractPathParams,
  lowerIdent,
  pascalCase,
} from "./naming.js";
import { requestType, responseType } from "./schema.js";

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

function fieldInInputSchema(route: RouteAst, fieldName: string): boolean {
  const input = route.input;
  if (!input || typeof input !== "object") return false;
  const def = (input as unknown as Record<string, unknown>)._def as
    | Record<string, unknown>
    | undefined;
  if (!def) return false;
  const shapeFn = def.shape as (() => Record<string, unknown>) | undefined;
  if (!shapeFn) return false;
  return fieldName in shapeFn();
}

export function generateGinHandler(
  route: RouteAst,
  diagnostics: Diagnostic[],
  owner: string,
): GeneratedRegion {
  const receiverType = `*${pascalCase(route.moduleName)}Handler`;
  const usecaseField = `${route.handlerName}Usecase`;
  const reqType = requestType(route);
  const resType = responseType(route);
  const pathParams = extractPathParams(route.path);
  const body: string[] = [];

  if (route.input) {
    body.push(`var input ${reqType}`);
    body.push(`if err := c.ShouldBindJSON(&input); err != nil {`);
    body.push(`\tc.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})`);
    body.push(`\treturn`);
    body.push(`}`);
    for (const param of pathParams) {
      const fieldName = pascalCase(param);
      if (!fieldInInputSchema(route, param)) {
        body.push(`input.${fieldName} = c.Param("${param}")`);
      }
    }
  } else if (pathParams.length > 0) {
    const fields = pathParams.map((p) => `${pascalCase(p)}: c.Param("${p}")`).join(", ");
    body.push(`input := ${reqType}{${fields}}`);
  } else {
    body.push(`input := struct{}{}`);
  }

  body.push(`output, err := h.${usecaseField}.Execute(c.Request.Context(), input)`);
  body.push(`if err != nil {`);
  body.push(`\tc.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})`);
  body.push(`\treturn`);
  body.push(`}`);
  body.push(`c.JSON(http.StatusOK, output)`);

  return {
    id: defaultRegionId(route, "handler"),
    stableHash: `${route.stableId}:${owner}:handler:${defaultFileForLayer(route, "handler")}`,
    owner,
    language: "go",
    content: [
      `func (h ${receiverType}) ${route.handlerName}(c *gin.Context) {`,
      ...body.map((line) => (line.length > 0 ? `\t${line}` : "")),
      `}`,
      "",
      `var _ ${resType}`,
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
