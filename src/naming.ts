import type { RouteAst } from "./types.js";

export function pascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function lowerIdent(value: string): string {
  const pascal = pascalCase(value);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export function routeTypeName(route: RouteAst, suffix: string): string {
  return `${pascalCase(route.id)}${pascalCase(route.moduleName)}${suffix}`;
}

export function defaultFileForLayer(route: RouteAst, layer: string): string {
  switch (layer) {
    case "types":
    case "domain":
      return `internal/${route.moduleName}/types.go`;
    case "handler":
      return `internal/${route.moduleName}/handler.go`;
    case "usecase":
      return `internal/${route.moduleName}/usecase.go`;
    case "repository":
      return `internal/${route.moduleName}/repo.go`;
    case "route":
    case "server":
      return `internal/http/routes.go`;
    default:
      return `internal/${route.moduleName}/${layer}.go`;
  }
}

export function defaultRegionId(route: RouteAst, layer: string): string {
  return `${route.moduleName}.${route.id}.${layer}`;
}

export function joinPath(prefix: string, path: string): string {
  if (!path) return prefix;
  const normalizedPrefix = prefix.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedPrefix}${normalizedPath}` || "/";
}
