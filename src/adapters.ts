import type {
  AdapterRouteContext,
  BuiltInAdapterName,
  Diagnostic,
  GeneratedRegion,
  RouterAdapter,
} from "./types.js";
import { defaultFileForLayer, defaultRegionId, lowerIdent, pascalCase } from "./naming.js";
import { requestType, responseType } from "./schema.js";

export const ginAdapter: RouterAdapter = {
  name: "gin",
  generateRoute(ctx) {
    const receiver = `${lowerIdent(ctx.route.moduleName)}Handler`;
    return [
      {
        id: defaultRegionId(ctx.route, "route"),
        language: "go",
        content: `api.${methodName(ctx.route.method)}("${ctx.route.fullPath}", ${receiver}.${ctx.route.handlerName})`,
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

export const adapterRegistry: Record<BuiltInAdapterName, RouterAdapter> = {
  gin: ginAdapter,
};

export function resolveAdapter(
  ref: BuiltInAdapterName | RouterAdapter,
  diagnostics: Diagnostic[],
): RouterAdapter | undefined {
  if (typeof ref === "string") {
    const adapter = adapterRegistry[ref];
    if (!adapter) {
      diagnostics.push({
        level: "error",
        code: "unknown-adapter",
        message: `Unknown adapter "${ref}".`,
      });
    }
    return adapter;
  }
  return ref;
}

export function generateGinHandler(ctx: AdapterRouteContext): GeneratedRegion {
  const route = ctx.route;
  const receiverType = `*${pascalCase(route.moduleName)}Handler`;
  const usecaseField = `${route.handlerName}Usecase`;
  const reqType = requestType(route);
  const resType = responseType(route);
  const body: string[] = [];

  if (route.input) {
    body.push(`var input ${reqType}`);
    body.push(`if err := c.ShouldBindJSON(&input); err != nil {`);
    body.push(`\tc.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})`);
    body.push(`\treturn`);
    body.push(`}`);
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

export function routeRegionFile(route: AdapterRouteContext["route"]): string {
  return defaultFileForLayer(route, "route");
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
