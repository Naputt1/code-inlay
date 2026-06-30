import type { SchemaLike } from "../types/index.js";
import { typeName } from "../schema/extras.js";
import { validationTypeToGoExpr, isValidationType } from "../schema/extras.js";
import { httpStatusConsts } from "./errors.js";

export function doesSchemaNeedFmt(schema?: SchemaLike): boolean {
  if (!schema) return false;
  return walkForType(schema, "ZodValue");
}

function walkForType(schema: SchemaLike, target: string): boolean {
  const tn = typeName(schema);
  if (tn === target) return true;
  if (tn === "ZodObject") {
    const def = (schema as unknown as Record<string, unknown>)._def as
      | Record<string, unknown>
      | undefined;
    const shape =
      (typeof def?.shape === "function"
        ? (def.shape as () => Record<string, unknown>)()
        : (def?.shape as Record<string, unknown> | undefined)) ?? {};
    return Object.values(shape).some((s) => walkForType(s as SchemaLike, target));
  }
  if (tn === "ZodArray") {
    const def = (schema as unknown as Record<string, unknown>)._def as
      | Record<string, unknown>
      | undefined;
    const element =
      (def?.type as SchemaLike | undefined) ?? (def?.element as SchemaLike | undefined);
    if (element) return walkForType(element, target);
  }
  if (tn === "ZodOptional" || tn === "ZodNullable") {
    const def = (schema as unknown as Record<string, unknown>)._def as
      | Record<string, unknown>
      | undefined;
    const inner = def?.innerType as SchemaLike | undefined;
    if (inner) return walkForType(inner, target);
  }
  return false;
}

export type BindingErrorConfig = {
  httpStatus: number;
  bodySchema?: SchemaLike;
};

export function generateBindingErrorFunction(config: BindingErrorConfig): string {
  const statusCode = config.httpStatus ?? 400;
  const statusConst = httpStatusConsts[statusCode] ?? String(statusCode);

  if (!config.bodySchema) {
    return [
      `func ResolveBindingError(err error) (int, any) {`,
      `\treturn ${statusConst}, gin.H{"error": err.Error()}`,
      `}`,
    ].join("\n");
  }

  const bodyExpr = compileSchema(config.bodySchema, 4);

  return [
    `func ResolveBindingError(err error) (int, any) {`,
    `\tvar ve validator.ValidationErrors`,
    `\tif errors.As(err, &ve) {`,
    `\t\treturn ${statusConst}, ${bodyExpr}`,
    `\t}`,
    `\treturn http.StatusBadRequest, gin.H{"error": err.Error()}`,
    `}`,
  ].join("\n");
}

function tabs(n: number): string {
  return Array(n + 1).join("\t");
}

function compileSchema(schema: SchemaLike, depth: number): string {
  const tn = typeName(schema);

  if (tn === "ZodObject") {
    return compileObject(schema, depth);
  }
  if (tn === "ZodArray") {
    return compileArray(schema, depth);
  }
  if (tn === "ZodOptional" || tn === "ZodNullable") {
    return compileOptional(schema, depth);
  }
  if (isValidationType(tn)) {
    return validationTypeToGoExpr(tn, "fe");
  }
  if (tn === "ZodLiteral") {
    return compileLiteral(schema);
  }
  if (tn === "ZodString") {
    return `""`;
  }
  if (tn === "ZodNumber") {
    return `0`;
  }
  if (tn === "ZodBoolean") {
    return `false`;
  }
  return `nil`;
}

function compileObject(schema: SchemaLike, depth: number): string {
  const def = (schema as unknown as Record<string, unknown>)._def as
    | Record<string, unknown>
    | undefined;
  const rawShape =
    (typeof def?.shape === "function"
      ? (def.shape as () => Record<string, unknown>)()
      : (def?.shape as Record<string, unknown> | undefined)) ?? {};

  const fields: string[] = [];
  for (const [key, fieldSchema] of Object.entries(rawShape)) {
    const compiled = compileSchema(fieldSchema as SchemaLike, depth + 1);
    fields.push(`${tabs(depth + 1)}"${key}": ${compiled},`);
  }

  return `map[string]any{\n${fields.join("\n")}\n${tabs(depth)}}`;
}

function compileArray(schema: SchemaLike, depth: number): string {
  const def = (schema as unknown as Record<string, unknown>)._def as
    | Record<string, unknown>
    | undefined;
  const element = (def?.type as SchemaLike | undefined) ?? (def?.element as SchemaLike | undefined);
  if (!element) return `nil`;
  const itemExpr = compileSchema(element, depth + 2);

  const lines: string[] = [
    `func() any {`,
    `${tabs(depth + 1)}items := make([]any, 0, len(ve))`,
    `${tabs(depth + 1)}for _, fe := range ve {`,
    `${tabs(depth + 2)}items = append(items, ${itemExpr})`,
    `${tabs(depth + 1)}}`,
    `${tabs(depth + 1)}return items`,
    `${tabs(depth)}}()`,
  ];
  return lines.join("\n");
}

function compileOptional(schema: SchemaLike, depth: number): string {
  const def = (schema as unknown as Record<string, unknown>)._def as
    | Record<string, unknown>
    | undefined;
  const innerSchema = def?.innerType as SchemaLike | undefined;
  if (!innerSchema) return `nil`;

  const tn = typeName(innerSchema);
  if (isValidationType(tn)) {
    const expr = validationTypeToGoExpr(tn, "fe");
    return `func() any { if v := ${expr}; v != "" { return v }; return nil }()`;
  }
  return compileSchema(innerSchema, depth);
}

function compileLiteral(schema: SchemaLike): string {
  const def = (schema as unknown as Record<string, unknown>)._def as
    | Record<string, unknown>
    | undefined;
  const value = def?.value;
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return `nil`;
}
