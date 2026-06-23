import type { RouteAst, UsecaseOrganization } from "./types.js";

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

export function snakeCase(value: string): string {
  return value
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
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
      return fileForUsecaseGroup(route.moduleName, "default");
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

export function resolveUsecaseOrg(
  route: RouteAst,
  moduleOrg?: UsecaseOrganization,
  appOrg?: UsecaseOrganization,
): UsecaseOrganization {
  const org = moduleOrg ?? appOrg;
  if (org?.strategy === "single") return org;
  if (org?.strategy === "grouped") return org;
  return { strategy: "merged", scaffold: org?.scaffold };
}

export function resolveUsecaseGroupKey(route: RouteAst, org: UsecaseOrganization): string {
  if (route.usecaseGroup) return route.usecaseGroup;

  if (org.strategy === "merged") return "default";
  if (org.strategy === "single") return route.id;

  const groupBy = org.groupBy ?? "path";

  if (typeof groupBy === "function") {
    const result = groupBy(route);
    return result || "default";
  }

  switch (groupBy) {
    case "path":
      return resolvePathGroup(route);
    case "operation":
      return route.method === "GET" ? "read" : "write";
    case "handler":
      return resolveHandlerGroup(route);
    case "module":
      return route.moduleName;
    default:
      return "default";
  }
}

function resolvePathGroup(route: RouteAst): string {
  const base = (route.metadata?._group as string) || "";
  let relativePath = route.path;
  if (base && route.path.startsWith(base)) {
    relativePath = route.path.slice(base.length);
  }
  relativePath = relativePath.replace(/^\/+/, "");
  if (!relativePath) return "default";

  const segments = relativePath.split("/");
  for (const segment of segments) {
    if (segment.startsWith(":")) continue;
    if (segment === "") continue;
    return segment;
  }
  return "default";
}

function resolveHandlerGroup(route: RouteAst): string {
  const name = route.handlerName;
  const parts = name.split(/(?=[A-Z])/).filter(Boolean);
  if (parts.length === 0) return "default";
  return parts[0].toLowerCase();
}

export function extractPathParams(path: string): string[] {
  const params: string[] = [];
  const re = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    params.push(m[1]);
  }
  return params;
}

export function fileForUsecaseGroup(moduleName: string, groupKey: string): string {
  if (groupKey === "default" || groupKey === moduleName) {
    return `internal/${moduleName}/usecase.go`;
  }
  const safeKey = snakeCase(groupKey);
  return `internal/${moduleName}/${safeKey}_usecase.go`;
}

export function regionIdForUsecase(route: RouteAst, groupKey: string): string {
  if (groupKey === "default") {
    return defaultRegionId(route, "usecase");
  }
  return `${route.moduleName}.${groupKey}.${route.id}.usecase`;
}

export function fileForModuleRoutes(moduleName: string): string {
  return `internal/http/${moduleName}_routes.go`;
}

export function regionIdForUsecaseImports(moduleName: string, groupKey: string): string {
  if (groupKey === "default") {
    return `${moduleName}.0usecase.imports`;
  }
  return `${moduleName}.${groupKey}.0usecase.imports`;
}

export function regionIdForUsecaseImpl(route: RouteAst, groupKey: string): string {
  if (groupKey === "default") {
    return `${route.moduleName}.${route.id}.usecase.impl`;
  }
  return `${route.moduleName}.${groupKey}.${route.id}.usecase.impl`;
}
