import type { RouteAst } from "../types/index.js";
import { extractEntityContext } from "../schema/index.js";
import { extractPathParams, pascalCase } from "../utils/naming.js";

export function usecaseDomainInputParams(
  route: RouteAst,
  moduleName: string,
): { params: string; paramNames: string[] } | null {
  const verb = ["List", "Get", "Create", "New", "Update", "Edit", "Delete", "Remove", "Set"].find(
    (v) => route.handlerName.startsWith(v),
  );
  if (!verb) return null;

  const baseID = `${pascalCase(moduleName)}ID`;
  const baseEntity = pascalCase(moduleName);
  const context = extractEntityContext(route.id);
  const entityName = context ? `${baseEntity}${pascalCase(context)}` : baseEntity;

  switch (verb) {
    case "List": {
      const hasParams = !!route.query || !!route.body || extractPathParams(route.path).length > 0;
      if (hasParams) return null;
      return { params: "", paramNames: [] };
    }
    case "Get":
      return { params: `id ${baseID}`, paramNames: ["id"] };
    case "Create":
    case "New":
      return { params: `entity ${entityName}`, paramNames: ["entity"] };
    case "Update":
    case "Edit":
      return { params: `id ${baseID}, entity ${entityName}`, paramNames: ["id", "entity"] };
    case "Delete":
    case "Remove":
      return { params: `id ${baseID}`, paramNames: ["id"] };
    case "Set":
      return { params: `id ${baseID}`, paramNames: ["id"] };
    default:
      return null;
  }
}

export { generateUsecaseInterface, generateUsecaseScaffold } from "./usecase-goast.js";
