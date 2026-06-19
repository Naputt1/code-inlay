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

function isZodObject(schema: SchemaLike): schema is SchemaLike & { shape: Record<string, SchemaLike> } {
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

  if (route.input) {
    const input = schemaToStruct(routeTypeName(route, "Request"), route.input, diagnostics);
    if (input) structs.push(input);
  }

  if (route.response) {
    const response = schemaToStruct(routeTypeName(route, "Response"), route.response, diagnostics);
    if (response) structs.push(response);
  }

  if (!route.response) {
    structs.push({ name: routeTypeName(route, "Response"), fields: [] });
  }

  return structs.map(renderStruct).join("\n\n");
}

export function requestType(route: RouteAst): string {
  return route.input ? routeTypeName(route, "Request") : "struct{}";
}

export function responseType(route: RouteAst): string {
  return routeTypeName(route, "Response");
}

function schemaToStruct(
  name: string,
  schema: SchemaLike,
  diagnostics: Diagnostic[],
): GoStruct | undefined {
  const unwrapped = unwrap(schema);
  if (!isZodObject(unwrapped)) {
    diagnostics.push({
      level: "error",
      code: "unsupported-schema",
      message: `Schema for ${name} must be a Zod object.`,
    });
    return undefined;
  }

  const shape = unwrapped.shape;
  const fields = Object.keys(shape)
    .sort()
    .map((fieldName) => {
      const fieldSchema = shape[fieldName] as SchemaLike;
      const optional = isZodOptional(fieldSchema);
      return {
        name: pascalCase(fieldName),
        type: schemaToGoType(fieldSchema, diagnostics),
        jsonName: fieldName,
        optional,
      };
    });

  return { name, fields };
}

function schemaToGoType(schema: SchemaLike, diagnostics: Diagnostic[]): string {
  const optional = isZodOptional(schema);
  const nullable = isZodNullable(schema);
  const unwrapped = unwrap(schema);
  let type: string;

  if (isZodString(unwrapped) || isZodEnum(unwrapped)) {
    type = "string";
  } else if (isZodNumber(unwrapped)) {
    type = "float64";
  } else if (isZodBoolean(unwrapped)) {
    type = "bool";
  } else if (isZodArray(unwrapped)) {
    type = `[]${schemaToGoType(unwrapped.element, diagnostics)}`;
  } else if (isZodObject(unwrapped)) {
    type = "map[string]any";
    diagnostics.push({
      level: "warning",
      code: "nested-object-map",
      message: "Nested object fields are emitted as map[string]any in the MVP.",
    });
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
