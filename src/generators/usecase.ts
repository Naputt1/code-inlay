import { createHash } from "node:crypto";
import type { RouteAst } from "../types/index.js";
import { extractEntityContext, requestType, responseType } from "../schema/index.js";
import { extractPathParams, lowerIdent, pascalCase } from "../utils/naming.js";
import type { ScaffoldPart } from "./types.js";

function shortHash(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, 8);
}

export function generateUsecaseInterface(route: RouteAst, hasDomain?: boolean): string {
  const respType = responseType(route);
  let executeParams: string;
  if (hasDomain) {
    const domainParams = usecaseDomainInputParams(route, route.moduleName);
    if (domainParams) {
      if (domainParams.params === "") {
        executeParams = `ctx context.Context) (${respType}, error`;
      } else {
        executeParams = `ctx context.Context, ${domainParams.params}) (${respType}, error`;
      }
    } else {
      executeParams = `ctx context.Context, input ${requestType(route)}) (${respType}, error`;
    }
  } else {
    executeParams = `ctx context.Context, input ${requestType(route)}) (${respType}, error`;
  }
  return [`type ${route.handlerName}Usecase interface {`, `\tExecute(${executeParams})`, `}`].join(
    "\n",
  );
}

export function generateUsecaseScaffold(
  route: RouteAst,
  moduleName: string,
  hasRepository: boolean,
  serviceTypes: string[],
  hasDomain?: boolean,
): ScaffoldPart[] {
  const ifaceName = `${route.handlerName}Usecase`;
  const structName = `${lowerIdent(route.handlerName)}UsecaseImpl`;
  const repoType = hasRepository ? `${pascalCase(moduleName)}Repository` : undefined;
  const reqType = requestType(route);
  const respType = responseType(route);

  const structFields: string[] = [];
  const ctorParams: string[] = [];
  const ctorBody: string[] = [];
  const assignFields: string[] = [];

  if (repoType) {
    structFields.push(`\trepo ${repoType}`);
    ctorParams.push(`repo ${repoType}`);
    assignFields.push(`\t\trepo: repo`);
  }
  for (let i = 0; i < serviceTypes.length; i++) {
    const st = serviceTypes[i];
    const svcName = st.replace(/Service$/, "");
    const varName = `${lowerIdent(svcName)}Svc`;
    structFields.push(`\t${varName} service.${st}`);
    ctorParams.push(`${varName} service.${st}`);
    assignFields.push(`\t\t${varName}: ${varName}`);
  }

  const parts: ScaffoldPart[] = [];

  const structDecl = (() => {
    if (structFields.length === 0) {
      return `type ${structName} struct {}`;
    }
    return [`type ${structName} struct {`, ...structFields, `}`].join("\n");
  })();
  parts.push({
    kind: "struct",
    symbolName: structName,
    content: structDecl,
    expectsUserCode: false,
    isStub: false,
  });

  const ctorBodyLines =
    structFields.length === 0
      ? [`\treturn &${structName}{}`]
      : [
          ...ctorBody,
          `\treturn &${structName}{`,
          assignFields.map((f) => `${f},`).join("\n"),
          `\t}`,
        ];
  const ctorParamsStr = structFields.length === 0 ? "" : ctorParams.join(", ");
  const ctorSig = `func New${ifaceName}(${ctorParamsStr}) *${structName}`;
  parts.push({
    kind: "function",
    symbolName: `New${ifaceName}`,
    signature: ctorSig,
    content: ctorBodyLines.join("\n"),
    expectsUserCode: false,
    isStub: false,
  });

  let executeSig: string;
  let executeContent: string;
  if (hasDomain && repoType) {
    const domainParams = usecaseDomainInputParams(route, moduleName);
    if (domainParams) {
      const context = extractEntityContext(route.id);
      const baseEntity = pascalCase(moduleName);
      const verb = [
        "List",
        "Get",
        "Create",
        "New",
        "Update",
        "Edit",
        "Delete",
        "Remove",
        "Set",
      ].find((v) => route.handlerName.startsWith(v));
      if (domainParams.params === "") {
        executeSig = `func (uc *${structName}) Execute(ctx context.Context) (${respType}, error)`;
      } else {
        executeSig = `func (uc *${structName}) Execute(ctx context.Context, ${domainParams.params}) (${respType}, error)`;
      }
      const executeSh = shortHash(`${route.moduleName}.${route.handlerName}.execute`);
      if (verb) {
        executeContent = scaffoldExecuteContent(
          verb,
          context,
          baseEntity,
          route.handlerName,
          respType,
          executeSh,
        );
      } else {
        executeContent = `\t// TODO: implement ${ifaceName}\n\treturn ${respType}{}, nil`;
      }
    } else {
      executeSig = `func (uc *${structName}) Execute(ctx context.Context, input ${reqType}) (${respType}, error)`;
      executeContent = `\t// TODO: implement ${ifaceName}\n\treturn ${respType}{}, nil`;
    }
  } else {
    executeSig = `func (uc *${structName}) Execute(ctx context.Context, input ${reqType}) (${respType}, error)`;
    executeContent = `\t// TODO: implement ${ifaceName}\n\treturn ${respType}{}, nil`;
  }
  parts.push({
    kind: "method",
    symbolName: `${structName}.Execute`,
    receiver: `*${structName}`,
    signature: executeSig,
    content: executeContent,
    expectsUserCode: true,
    isStub: true,
  });

  return parts;
}

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

function scaffoldExecuteContent(
  verb: string,
  context: string,
  baseEntity: string,
  handlerName: string,
  respType: string,
  executeSh: string,
): string {
  const rmn = repoMethodName(verb, context, baseEntity, handlerName);
  const withMarkers = (resultVar: string, lines: string[]): string =>
    [
      ...lines,
      `\t// @gen:start ${executeSh}`,
      `\t// TODO: map ${resultVar} to ${respType}`,
      `\t_ = ${resultVar}`,
      `\tvar resp ${respType}`,
      `\t// @gen:end ${executeSh}`,
      `\treturn resp, nil`,
    ].join("\n");
  switch (verb) {
    case "Get":
      return withMarkers("result", [
        `\tresult, err := uc.repo.${rmn}(ctx, id)`,
        `\tif err != nil {`,
        `\t\treturn ${respType}{}, err`,
        `\t}`,
      ]);
    case "Create":
    case "New":
      return withMarkers("created", [
        `\tcreated, err := uc.repo.${rmn}(ctx, entity)`,
        `\tif err != nil {`,
        `\t\treturn ${respType}{}, err`,
        `\t}`,
      ]);
    case "Update":
    case "Edit":
      return withMarkers("updated", [
        `\tupdated, err := uc.repo.${rmn}(ctx, id, entity)`,
        `\tif err != nil {`,
        `\t\treturn ${respType}{}, err`,
        `\t}`,
      ]);
    case "Delete":
    case "Remove":
      return [
        `\tif err := uc.repo.${rmn}(ctx, id); err != nil {`,
        `\t\treturn ${respType}{}, err`,
        `\t}`,
        `\treturn ${respType}{}, nil`,
      ].join("\n");
    case "List":
      return withMarkers("results", [
        `\tresults, err := uc.repo.${rmn}(ctx)`,
        `\tif err != nil {`,
        `\t\treturn ${respType}{}, err`,
        `\t}`,
      ]);
    case "Set":
      return [
        `\tif err := uc.repo.${rmn}(ctx, id); err != nil {`,
        `\t\treturn ${respType}{}, err`,
        `\t}`,
        `\treturn ${respType}{}, nil`,
      ].join("\n");
    default:
      return `\t// TODO: implement\n\treturn ${respType}{}, nil`;
  }
}

function repoMethodName(
  verb: string,
  context: string,
  baseEntity: string,
  handlerName: string,
): string {
  switch (verb) {
    case "List":
      return context ? `FindAll${pascalCase(context)}` : "FindAll";
    case "Get":
      return context ? `Find${pascalCase(context)}ByID` : "FindByID";
    case "Create":
    case "New":
      return context ? `Create${pascalCase(context)}` : "Create";
    case "Update":
    case "Edit":
      return context ? `Update${pascalCase(context)}` : "Update";
    case "Delete":
    case "Remove":
      return context ? `Delete${pascalCase(context)}` : "Delete";
    case "Set": {
      let field = handlerName.slice("Set".length);
      if (field.startsWith(baseEntity)) field = field.slice(baseEntity.length);
      if (!field) field = handlerName.slice("Set".length);
      return `Set${field}`;
    }
    default:
      return "";
  }
}
