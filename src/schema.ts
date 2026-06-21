import type { Diagnostic, RouteAst, SchemaLike } from "./types.js";
import { pascalCase, routeTypeName } from "./naming.js";

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

  const processSchema = (prefix: string, schema: SchemaLike) => {
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

  if (route.input) {
    const input = processSchema(routeTypeName(route, "Request"), route.input);
    if (input) structs.push(input);
  }

  if (route.response) {
    const response = processSchema(routeTypeName(route, "Response"), route.response);
    if (response) structs.push(response);
  }

  if (!route.response) {
    const name = routeTypeName(route, "Response");
    structs.push({ name, fields: [] });
  }

  for (const sub of subStructs.values()) {
    if (!structs.find((s) => s.name === sub.name)) {
      structs.push(sub);
    }
  }

  return structs.map(renderStruct).join("\n\n");
}

export function requestType(route: RouteAst): string {
  return route.input ? routeTypeName(route, "Request") : "struct{}";
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
    const isInt = checks?.some((c: { kind: string }) => c.kind === "int");
    type = isInt ? "int64" : "float64";
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

function renderStruct(goStruct: GoStruct): string {
  if (goStruct.fields.length === 0) {
    return `type ${goStruct.name} struct{}`;
  }

  const fields = goStruct.fields
    .map((field) => {
      const omitempty = field.optional ? ",omitempty" : "";
      return `\t${field.name} ${field.type} \`json:"${field.jsonName}${omitempty}"\``;
    })
    .join("\n");

  return `type ${goStruct.name} struct {\n${fields}\n}`;
}

function unwrap(schema: SchemaLike): SchemaLike {
  let current = schema;
  while (isZodOptional(current) || isZodNullable(current)) {
    current = current.unwrap();
  }
  return current;
}
