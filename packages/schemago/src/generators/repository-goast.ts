import * as go from "@schemago/goast";
import { toGoType } from "../utils/goast.js";
import type {
  AppServiceDef,
  BackendExtension,
  RepositoryMethod,
  RouteAst,
} from "../types/index.js";
import { extractPathParams, lowerIdent, pascalCase } from "../utils/naming.js";
import { extractEntityContext } from "../schema/index.js";
import type { ScaffoldPart } from "./types.js";

function renderRepoInterface(typeName: string, methods: RepositoryMethod[]): string {
  if (methods.length === 0) {
    return [
      `type ${typeName}Repository interface {`,
      `\t// Add developer-owned persistence methods outside generated regions as needed.`,
      `}`,
    ].join("\n");
  }
  const body = methods.map((m) => `\t${m.name}(${m.params}) ${m.results}`).join("\n");
  return [`type ${typeName}Repository interface {`, body, `}`].join("\n");
}

function renderRepoStruct(implName: string, dbType: string | undefined): string {
  if (!dbType) {
    return `type ${implName} struct {}`;
  }
  const f = go.field(["db"], toGoType(dbType));
  const st = go.structType(f);
  const spec = go.typeSpec(implName, st);
  const decl = go.genDecl("type", spec);
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, decl, 0);
  return sb.toString().trimEnd();
}

function renderCtorSignature(
  typeName: string,
  implName: string,
  dbType: string | undefined,
): string {
  const params = dbType ? [go.field(["db"], toGoType(dbType))] : [];
  const results = [go.field([], go.star(go.id(implName)))];
  const fn = go.function_(`New${typeName}Repository`, params, results);
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, fn, 0);
  return sb.toString().trimEnd();
}

export function generateRepository(
  routes: RouteAst[],
  moduleName: string,
  dbProvider: AppServiceDef | undefined,
  extensions: BackendExtension[],
): ScaffoldPart[] {
  const typeName = pascalCase(moduleName);
  const baseEntity = typeName;
  const implName = `${lowerIdent(moduleName)}RepositoryImpl`;
  const dbType = dbProvider?.dbType ?? "*gorm.DB";
  const dbTypePkg = dbProvider?.dbTypePkg ?? "";
  const dialect = dbProvider?.extension;
  const seen = new Map<string, RepositoryMethod>();

  for (const route of routes) {
    const method = inferRepositoryMethod(route, moduleName);
    if (!method) continue;
    const key = `${method.name}(${method.params})`;
    if (!seen.has(key)) {
      seen.set(key, method);
    }
  }

  const parts: ScaffoldPart[] = [];

  if (dbProvider) {
    const importLines = [`import (`, `\t"context"`];
    if (dbTypePkg) importLines.push(`\t"${dbTypePkg}"`);
    importLines.push(`)`);
    parts.push({
      kind: "imports" as const,
      symbolName: "",
      content: importLines.join("\n"),
      expectsUserCode: false,
      isStub: false,
      imports: [...(dbTypePkg ? ["context", dbTypePkg] : ["context"])],
    });
  }

  if (seen.size === 0) {
    parts.push({
      kind: "interface" as const,
      symbolName: `${typeName}Repository`,
      content: renderRepoInterface(typeName, []),
      expectsUserCode: false,
      isStub: false,
    });

    parts.push({
      kind: "struct" as const,
      symbolName: implName,
      content: renderRepoStruct(implName, undefined),
      expectsUserCode: false,
      isStub: false,
    });

    const ctorSig = renderCtorSignature(typeName, implName, undefined);
    parts.push({
      kind: "function" as const,
      symbolName: `New${typeName}Repository`,
      signature: ctorSig,
      content: `\treturn &${implName}{}`,
      expectsUserCode: false,
      isStub: false,
    });
  } else {
    parts.push({
      kind: "interface" as const,
      symbolName: `${typeName}Repository`,
      content: renderRepoInterface(typeName, [...seen.values()]),
      expectsUserCode: false,
      isStub: false,
    });

    if (dbProvider) {
      parts.push({
        kind: "struct" as const,
        symbolName: implName,
        content: renderRepoStruct(implName, dbType),
        expectsUserCode: false,
        isStub: false,
      });

      const ctorSig = renderCtorSignature(typeName, implName, dbType);
      parts.push({
        kind: "function" as const,
        symbolName: `New${typeName}Repository`,
        signature: ctorSig,
        content: `\treturn &${implName}{db: db}`,
        expectsUserCode: false,
        isStub: false,
      });

      for (const method of seen.values()) {
        const methodPart = generateDialectMethodPart(
          method,
          baseEntity,
          implName,
          dialect,
          extensions,
          dbProvider.extensionOptions,
        );
        if (methodPart) parts.push(methodPart);
      }
    }
  }

  return parts;
}

export function inferRepositoryMethod(
  route: RouteAst,
  moduleName: string,
): RepositoryMethod | null {
  const handler = route.handlerName;
  const pathParams = extractPathParams(route.path);
  const hasID = pathParams.length > 0;
  const baseEntity = pascalCase(moduleName);
  const context = extractEntityContext(route.id);
  const entityName = context ? `${baseEntity}${pascalCase(context)}` : baseEntity;

  const verb = ["List", "Get", "Create", "New", "Update", "Edit", "Delete", "Remove", "Set"].find(
    (v) => handler.startsWith(v),
  );
  if (!verb) return null;

  const entityPart = handler.slice(verb.length);

  switch (verb) {
    case "List":
      return {
        name: context ? `FindAll${pascalCase(context)}` : "FindAll",
        params: "ctx context.Context",
        results: `([]${entityName}, error)`,
        entityName,
      };
    case "Get":
      if (!hasID) return null;
      return {
        name: context ? `Find${pascalCase(context)}ByID` : "FindByID",
        params: `ctx context.Context, id ${baseEntity}ID`,
        results: `(${entityName}, error)`,
        entityName,
      };
    case "Create":
    case "New":
      return {
        name: context ? `Create${pascalCase(context)}` : "Create",
        params: `ctx context.Context, entity ${entityName}`,
        results: `(${entityName}, error)`,
        entityName,
      };
    case "Update":
    case "Edit":
      if (!hasID) return null;
      return {
        name: context ? `Update${pascalCase(context)}` : "Update",
        params: `ctx context.Context, id ${baseEntity}ID, entity ${entityName}`,
        results: `(${entityName}, error)`,
        entityName,
      };
    case "Delete":
    case "Remove":
      if (!hasID) return null;
      return {
        name: context ? `Delete${pascalCase(context)}` : "Delete",
        params: `ctx context.Context, id ${baseEntity}ID`,
        results: "error",
        entityName,
      };
    case "Set": {
      let field = entityPart;
      if (field.startsWith(baseEntity)) field = field.slice(baseEntity.length);
      if (!field) field = entityPart;
      return {
        name: `Set${field}`,
        params: hasID ? `ctx context.Context, id ${baseEntity}ID` : "ctx context.Context",
        results: "error",
        entityName,
      };
    }
    default:
      return null;
  }
}

export function generateDialectMethodPart(
  method: RepositoryMethod,
  baseEntity: string,
  implName: string,
  dialect?: string,
  extensions?: BackendExtension[],
  extensionOptions?: Record<string, unknown>,
): ScaffoldPart | null {
  if (dialect && extensions) {
    const ext = extensions.find((e) => e.name === dialect);
    if (ext?.service?.generateDialectMethod) {
      const ctx = { method, baseEntity, implName, options: extensionOptions ?? {} };
      const content = ext.service.generateDialectMethod(ctx);
      return {
        kind: "method" as const,
        symbolName: `${implName}.${method.name}`,
        receiver: `*${implName}`,
        content,
        expectsUserCode: false,
        isStub: true,
      };
    }
  }
  return generateDefaultStubPart(method, implName);
}

export function generateDefaultStubPart(method: RepositoryMethod, implName: string): ScaffoldPart {
  const sigBase = `func (r *${implName}) ${method.name}(${method.params})`;
  const sig = `${sigBase} ${method.results}`;
  const content = `\t// TODO: implement ${method.name}\n\treturn ${getZeroValue(method.results)}`;
  return {
    kind: "method" as const,
    symbolName: `${implName}.${method.name}`,
    receiver: `*${implName}`,
    signature: sig,
    content,
    expectsUserCode: false,
    isStub: true,
  };
}

function getZeroValue(results: string): string {
  if (results === "error") return "nil";
  if (results.startsWith("(") && results.endsWith(", error)")) {
    const inner = results.slice(1, -", error)".length);
    if (inner.includes("[]")) return "nil, nil";
    return `${inner}{}, nil`;
  }
  return "nil, nil";
}
