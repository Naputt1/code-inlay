import { createHash } from "node:crypto";
import * as go from "@schemago/go-ast";
import { toGoType } from "../utils/go-ast.js";
import type { RouteAst } from "../types/index.js";
import { extractEntityContext, requestType, responseType } from "../schema/index.js";
import { lowerIdent, pascalCase } from "../utils/naming.js";
import type { ScaffoldPart } from "./types.js";
import { usecaseDomainInputParams } from "./usecase.js";

function shortHash(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, 8);
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

function parseParams(paramsStr: string): go.Field[] {
  if (!paramsStr || paramsStr.trim() === "") return [];
  return paramsStr
    .split(",")
    .map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return null;
      const parts = trimmed.split(/\s+/);
      if (parts.length === 0) return null;
      if (parts.length === 1) {
        return go.field([], toGoType(parts[0]));
      }
      return go.field(parts.slice(0, -1), toGoType(parts[parts.length - 1]));
    })
    .filter((f): f is go.Field => f !== null);
}

function parseExecuteSig(
  fullParams: string,
): { params: go.Field[]; results: go.Field[] } {
  const parenResults = fullParams.lastIndexOf(") (");
  if (parenResults !== -1) {
    let resultsStr = fullParams.slice(parenResults + 2);
    if (resultsStr.startsWith("(")) {
      resultsStr = resultsStr.slice(1);
    }
    return {
      params: parseParams(fullParams.slice(0, parenResults)),
      results: parseParams(resultsStr),
    };
  }
  return { params: parseParams(fullParams), results: [] };
}

function renderTypeSpec(name: string, type: go.Type): string {
  const spec = go.typeSpec(name, type);
  const decl = go.genDecl("type", spec);
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, decl, 0);
  return sb.toString().trimEnd();
}

function renderFuncDecl(decl: go.FuncDecl): string {
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, decl, 0);
  return sb.toString().trimEnd();
}

export function generateUsecaseInterface(
  route: RouteAst,
  hasDomain?: boolean,
): string {
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

  const { params, results } = parseExecuteSig(executeParams);
  const methodType = go.funcType(params, results.length > 0 ? results : undefined);
  const iface = go.interfaceType(go.field(["Execute"], methodType));
  const spec = go.typeSpec(`${route.handlerName}Usecase`, iface);
  const decl = go.genDecl("type", spec);
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, decl, 0);
  let content = sb.toString().trimEnd();
  content = content.replace(/^(\t+)(\w+)\s+func\(/gm, "$1$2(");
  return content;
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

  const structFields: go.Field[] = [];
  const ctorParamFields: go.Field[] = [];
  const assignFields: string[] = [];

  if (repoType) {
    structFields.push(go.field(["repo"], toGoType(repoType)));
    ctorParamFields.push(go.field(["repo"], toGoType(repoType)));
    assignFields.push(`\t\trepo: repo`);
  }
  for (let i = 0; i < serviceTypes.length; i++) {
    const st = serviceTypes[i];
    const svcName = st.replace(/Service$/, "");
    const varName = `${lowerIdent(svcName)}Svc`;
    structFields.push(go.field([varName], go.qual("service", st)));
    ctorParamFields.push(go.field([varName], go.qual("service", st)));
    assignFields.push(`\t\t${varName}: ${varName}`);
  }

  const parts: ScaffoldPart[] = [];

  const structContent =
    structFields.length === 0
      ? `type ${structName} struct {}`
      : renderTypeSpec(structName, go.structType(...structFields));
  parts.push({
    kind: "struct",
    symbolName: structName,
    content: structContent,
    expectsUserCode: false,
    isStub: false,
  });

  const ctorFn = go.function_(`New${ifaceName}`, ctorParamFields, [
    go.field([], go.star(go.id(structName))),
  ]);
  const ctorSig = renderFuncDecl(ctorFn);
  const ctorBodyLines =
    structFields.length === 0
      ? [`\treturn &${structName}{}`]
      : [
          `\treturn &${structName}{`,
          assignFields.map((f) => `${f},`).join("\n"),
          `\t}`,
        ];
  parts.push({
    kind: "function",
    symbolName: `New${ifaceName}`,
    signature: ctorSig,
    content: ctorBodyLines.join("\n"),
    expectsUserCode: false,
    isStub: false,
  });

  let executeContent: string;
  let executeParamFields: go.Field[];
  const results: go.Field[] = [
    go.field([], toGoType(respType)),
    go.field([], go.id("error")),
  ];

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
        executeParamFields = [go.field(["ctx"], go.qual("context", "Context"))];
      } else {
        executeParamFields = [
          go.field(["ctx"], go.qual("context", "Context")),
          ...parseParams(domainParams.params),
        ];
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
      executeParamFields = [
        go.field(["ctx"], go.qual("context", "Context")),
        go.field(["input"], toGoType(reqType)),
      ];
      executeContent = `\t// TODO: implement ${ifaceName}\n\treturn ${respType}{}, nil`;
    }
  } else {
    executeParamFields = [
      go.field(["ctx"], go.qual("context", "Context")),
      go.field(["input"], toGoType(reqType)),
    ];
    executeContent = `\t// TODO: implement ${ifaceName}\n\treturn ${respType}{}, nil`;
  }

  const executeFn = go.method(
    go.field(["uc"], go.star(go.id(structName))),
    "Execute",
    executeParamFields,
    results,
  );
  const executeSig = renderFuncDecl(executeFn);

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
