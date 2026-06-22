import type { Diagnostic, RouteAst, SchemaLike } from "./types.js";
import { extractPathParams, pascalCase, routeTypeName } from "./naming.js";

export type GoField = {
  name: string;
  type: string;
  jsonName: string;
  optional: boolean;
};

export type GoStruct = {
  name: string;
  fields: GoField[];
};

function typeName(schema: SchemaLike): string {
  return (schema._def as { typeName?: string }).typeName ?? "";
}

function isZodOptional(schema: SchemaLike): schema is SchemaLike & { unwrap(): SchemaLike } {
  return typeName(schema) === "ZodOptional";
}

function isZodNullable(schema: SchemaLike): schema is SchemaLike & { unwrap(): SchemaLike } {
  return typeName(schema) === "ZodNullable";
}

function isZodObject(
  schema: SchemaLike,
): schema is SchemaLike & { shape: Record<string, SchemaLike> } {
  return typeName(schema) === "ZodObject";
}

function isZodString(schema: SchemaLike): boolean {
  return typeName(schema) === "ZodString";
}

function isZodEnum(schema: SchemaLike): boolean {
  return typeName(schema) === "ZodEnum";
}

function isZodNumber(schema: SchemaLike): boolean {
  return typeName(schema) === "ZodNumber";
}

function isZodBoolean(schema: SchemaLike): boolean {
  return typeName(schema) === "ZodBoolean";
}

function isZodArray(schema: SchemaLike): schema is SchemaLike & { element: SchemaLike } {
  return typeName(schema) === "ZodArray";
}

export function generateRouteTypes(route: RouteAst, diagnostics: Diagnostic[]): string {
  const structs: GoStruct[] = [];
  const subStructs = new Map<string, GoStruct>();

  const registerSub = (name: string, schema: SchemaLike) => {
    if (subStructs.has(name)) return;
    const unwrapped = unwrap(schema);
    if (!isZodObject(unwrapped)) return;
    const shape = unwrapped.shape;
    const fields = Object.keys(shape)
      .sort()
      .map((fieldName) => {
        const fieldSchema = shape[fieldName] as SchemaLike;
        const optional = isZodOptional(fieldSchema);
        const inner = unwrap(fieldSchema);
        if (isZodObject(inner)) {
          const childName = `${name}${pascalCase(fieldName)}`;
          registerSub(childName, inner);
          return {
            name: pascalCase(fieldName),
            type: childName,
            jsonName: fieldName,
            optional,
          };
        }
        if (isZodArray(inner)) {
          const elem = unwrap(inner.element);
          if (isZodObject(elem)) {
            const childName = `${name}${pascalCase(fieldName)}Item`;
            registerSub(childName, elem);
            return {
              name: pascalCase(fieldName),
              type: `[]${childName}`,
              jsonName: fieldName,
              optional,
            };
          }
        }
        return {
          name: pascalCase(fieldName),
          type: schemaToGoType(fieldSchema, diagnostics),
          jsonName: fieldName,
          optional,
        };
      });
    subStructs.set(name, { name, fields });
  };

  const processSchema = (prefix: string, schema: SchemaLike): GoStruct | undefined => {
    const unwrapped = unwrap(schema);
    if (!isZodObject(unwrapped)) return undefined;
    const shape = unwrapped.shape;
    const fields = Object.keys(shape)
      .sort()
      .map((fieldName) => {
        const fieldSchema = shape[fieldName] as SchemaLike;
        const optional = isZodOptional(fieldSchema);
        const inner = unwrap(fieldSchema);
        if (isZodObject(inner)) {
          const childName = `${prefix}${pascalCase(fieldName)}`;
          registerSub(childName, inner);
          return {
            name: pascalCase(fieldName),
            type: childName,
            jsonName: fieldName,
            optional,
          };
        }
        if (isZodArray(inner)) {
          const elem = unwrap(inner.element);
          if (isZodObject(elem)) {
            const childName = `${prefix}${pascalCase(fieldName)}Item`;
            registerSub(childName, elem);
            return {
              name: pascalCase(fieldName),
              type: `[]${childName}`,
              jsonName: fieldName,
              optional,
            };
          }
        }
        return {
          name: pascalCase(fieldName),
          type: schemaToGoType(fieldSchema, diagnostics),
          jsonName: fieldName,
          optional,
        };
      });
    return { name: prefix, fields };
  };

  const pathParams = extractPathParams(route.path);
  const hasQuery = !!route.query;
  const hasBody = !!route.body;

  let queryStruct: GoStruct | undefined;
  if (route.query) {
    queryStruct = processSchema(routeTypeName(route, "Query"), route.query);
  }

  let bodyStruct: GoStruct | undefined;
  if (route.body) {
    bodyStruct = processSchema(routeTypeName(route, "Body"), route.body);
  }

  if (hasQuery && hasBody) {
    if (queryStruct) {
      structs.push({ name: queryStruct.name, fields: [...queryStruct.fields] });
    }
    if (bodyStruct) {
      structs.push({ name: bodyStruct.name, fields: [...bodyStruct.fields] });
    }
    const requestFields: GoField[] = [];
    if (queryStruct) requestFields.push(...queryStruct.fields);
    if (bodyStruct) requestFields.push(...bodyStruct.fields);
    for (const param of pathParams) {
      const fieldName = pascalCase(param);
      if (!requestFields.find((f) => f.name === fieldName)) {
        requestFields.push({ name: fieldName, type: "string", jsonName: param, optional: false });
      }
    }
    requestFields.sort((a, b) => a.name.localeCompare(b.name));
    structs.push({ name: routeTypeName(route, "Request"), fields: requestFields });
  } else if (hasQuery || hasBody) {
    const source = queryStruct || bodyStruct;
    if (source) {
      for (const param of pathParams) {
        const fieldName = pascalCase(param);
        if (!source.fields.find((f) => f.name === fieldName)) {
          source.fields.push({
            name: fieldName,
            type: "string",
            jsonName: param,
            optional: false,
          });
        }
      }
      source.fields.sort((a, b) => a.name.localeCompare(b.name));
      source.name = routeTypeName(route, "Request");
      structs.push(source);
    }
  } else if (pathParams.length > 0) {
    const fields: GoField[] = pathParams.map((param) => ({
      name: pascalCase(param),
      type: "string",
      jsonName: param,
      optional: false,
    }));
    fields.sort((a, b) => a.name.localeCompare(b.name));
    structs.push({ name: routeTypeName(route, "Request"), fields });
  }

  const responseStructName = routeTypeName(route, "Response");
  if (route.response) {
    const response = processSchema(responseStructName, route.response);
    if (response) structs.push(response);
  } else {
    structs.push({ name: responseStructName, fields: [] });
  }

  for (const sub of subStructs.values()) {
    if (!structs.find((s) => s.name === sub.name)) {
      structs.push(sub);
    }
  }

  return structs
    .map((s) => renderStruct(s, s.name === responseStructName || s.name.startsWith(responseStructName)))
    .join("\n\n");
}

export function requestType(route: RouteAst): string {
  if (route.query || route.body || extractPathParams(route.path).length > 0) {
    return routeTypeName(route, "Request");
  }
  return "struct{}";
}

export function responseType(route: RouteAst): string {
  return routeTypeName(route, "Response");
}

function schemaToGoType(schema: SchemaLike, diagnostics: Diagnostic[]): string {
  const optional = isZodOptional(schema);
  const nullable = isZodNullable(schema);
  const unwrapped = unwrap(schema);
  let type: string;

  if (isZodString(unwrapped) || isZodEnum(unwrapped)) {
    type = "string";
  } else if (isZodNumber(unwrapped)) {
    const checks = (
      (unwrapped as unknown as Record<string, unknown>)._def as Record<string, unknown>
    )?.checks as Array<{ kind: string }> | undefined;
    type = numberType(checks);
  } else if (isZodBoolean(unwrapped)) {
    type = "bool";
  } else if (isZodArray(unwrapped)) {
    type = `[]${schemaToGoType(unwrapped.element, diagnostics)}`;
  } else if (isZodObject(unwrapped)) {
    type = "any";
  } else {
    type = "any";
    diagnostics.push({
      level: "error",
      code: "unsupported-schema",
      message: `Unsupported Zod schema kind "${typeName(unwrapped)}".`,
    });
  }

  if ((optional || nullable) && !type.startsWith("[]")) {
    return `*${type}`;
  }
  return type;
}

function renderStruct(goStruct: GoStruct, responseContext: boolean = false): string {
  if (goStruct.fields.length === 0) {
    return `type ${goStruct.name} struct{}`;
  }

  const fields = goStruct.fields
    .map((field) => {
      const omitempty = field.optional ? ",omitempty" : "";
      const tag = responseContext
        ? `json:"${field.jsonName}${omitempty}"`
        : `json:"${field.jsonName}${omitempty}" form:"${field.jsonName}"`;
      return `\t${field.name} ${field.type} \`${tag}\``;
    })
    .join("\n");

  return `type ${goStruct.name} struct {\n${fields}\n}`;
}

function numberType(checks: Array<{ kind: string }> | undefined): string {
  if (!checks) return "float64";
  const has = (kind: string) => checks.some((c) => c.kind === kind);
  if (has("float32")) return "float32";
  if (has("float64")) return "float64";
  if (has("int32")) return "int32";
  if (has("int64")) return "int64";
  if (has("int")) return "int64";
  return "float64";
}

function unwrap(schema: SchemaLike): SchemaLike {
  let current = schema;
  while (isZodOptional(current) || isZodNullable(current)) {
    current = current.unwrap();
  }
  return current;
}
