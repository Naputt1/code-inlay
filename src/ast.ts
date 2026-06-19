import type {
  AppAst,
  AppDefinition,
  Diagnostic,
  MiddlewareAst,
  ModuleAst,
  RouteAst,
} from "./types.js";
import { joinPath } from "./naming.js";

export function buildAst(app: AppDefinition, diagnostics: Diagnostic[]): AppAst {
  const ast: AppAst = {
    kind: "App",
    architecture: app.architecture,
    router: {
      kind: "Router",
      adapter: app.router.adapter,
      prefix: app.router.prefix,
      middleware: app.router.middleware.map(toMiddlewareAst),
    },
    modules: app.modules.map((module): ModuleAst => {
      return {
        kind: "Module",
        name: module.name,
        middleware: module.middleware.map(toMiddlewareAst),
        routes: module.routes.map((route): RouteAst => {
          return {
            kind: "Route",
            id: route.id,
            moduleName: module.name,
            method: route.method,
            path: route.path,
            fullPath: joinPath(app.router.prefix, route.path),
            handlerName: route.handler,
            input: route.input,
            response: route.response,
            middleware: route.middleware.map(toMiddlewareAst),
            metadata: route.metadata,
          };
        }),
      };
    }),
  };

  validateAst(ast, diagnostics);
  return app.transformers.reduce((next, transformer) => transformer.transform(next), ast);
}

function toMiddlewareAst(input: {
  name: string;
  handler?: string;
}): MiddlewareAst {
  return {
    kind: "Middleware",
    name: input.name,
    handler: input.handler,
  };
}

function validateAst(ast: AppAst, diagnostics: Diagnostic[]): void {
  const routeKeys = new Set<string>();

  for (const module of ast.modules) {
    if (!isIdentifierSegment(module.name)) {
      diagnostics.push({
        level: "error",
        code: "invalid-module-name",
        message: `Module name "${module.name}" must contain only letters, numbers, underscores, or hyphens.`,
      });
    }

    const moduleRouteIds = new Set<string>();
    for (const route of module.routes) {
      const key = `${route.moduleName}.${route.id}`;
      if (routeKeys.has(key) || moduleRouteIds.has(route.id)) {
        diagnostics.push({
          level: "error",
          code: "duplicate-route-id",
          message: `Duplicate route id "${route.id}" in module "${route.moduleName}".`,
        });
      }
      routeKeys.add(key);
      moduleRouteIds.add(route.id);

      if (!isIdentifierSegment(route.id)) {
        diagnostics.push({
          level: "error",
          code: "invalid-route-id",
          message: `Route id "${route.id}" must contain only letters, numbers, underscores, or hyphens.`,
        });
      }
    }
  }
}

function isIdentifierSegment(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value);
}
