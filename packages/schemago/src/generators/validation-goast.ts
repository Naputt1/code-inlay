import * as go from "@schemago/goast";
import type { SchemaLike } from "../types/index.js";
import { typeName } from "../schema/extras.js";
import { validationTypeToGoExpr, isValidationType } from "../schema/extras.js";
import { httpStatusConsts } from "./errors-goast.js";
export type BindingErrorConfig = {
  httpStatus: number;
  bodySchema?: SchemaLike;
};

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

function compileSchema(schema: SchemaLike): go.Expression {
  const tn = typeName(schema);

  if (tn === "ZodObject") return compileObject(schema);
  if (tn === "ZodArray") return compileArray(schema);
  if (tn === "ZodOptional" || tn === "ZodNullable") return compileOptional(schema);
  if (isValidationType(tn)) return compileValidationType(tn);
  if (tn === "ZodLiteral") return compileLiteral(schema);
  if (tn === "ZodString") return go.str("");
  if (tn === "ZodNumber") return go.int(0);
  if (tn === "ZodBoolean") return go.id("false");
  return go.id("nil");
}

function compileObject(schema: SchemaLike): go.Expression {
  const def = (schema as unknown as Record<string, unknown>)._def as
    | Record<string, unknown>
    | undefined;
  const rawShape =
    (typeof def?.shape === "function"
      ? (def.shape as () => Record<string, unknown>)()
      : (def?.shape as Record<string, unknown> | undefined)) ?? {};

  const elts: go.KeyValueExpr[] = [];
  for (const [key, fieldSchema] of Object.entries(rawShape)) {
    elts.push(go.kv(go.str(key), compileSchema(fieldSchema as SchemaLike)));
  }

  return go.elt(go.mapType(go.id("string"), go.id("any")), ...elts);
}

function compileArray(schema: SchemaLike): go.Expression {
  const def = (schema as unknown as Record<string, unknown>)._def as
    | Record<string, unknown>
    | undefined;
  const element = (def?.type as SchemaLike | undefined) ?? (def?.element as SchemaLike | undefined);
  if (!element) return go.id("nil");

  const itemExpr = compileSchema(element);

  const lines: string[] = [
    `func() any {`,
    `\titems := make([]any, 0, len(ve))`,
    `\tfor _, fe := range ve {`,
    `\t\titems = append(items, ${printExpr(itemExpr)})`,
    `\t}`,
    `\treturn items`,
    `}()`,
  ];
  return go.id(lines.join("\n"));
}

function compileOptional(schema: SchemaLike): go.Expression {
  const def = (schema as unknown as Record<string, unknown>)._def as
    | Record<string, unknown>
    | undefined;
  const innerSchema = def?.innerType as SchemaLike | undefined;
  if (!innerSchema) return go.id("nil");

  const tn = typeName(innerSchema);
  if (isValidationType(tn)) {
    const expr = validationTypeToGoExpr(tn, "fe");
    return go.id(`func() any { if v := ${expr}; v != "" { return v }; return nil }()`);
  }
  return compileSchema(innerSchema);
}

function compileValidationType(tn: string): go.Expression {
  return go.id(validationTypeToGoExpr(tn, "fe"));
}

function compileLiteral(schema: SchemaLike): go.Expression {
  const def = (schema as unknown as Record<string, unknown>)._def as
    | Record<string, unknown>
    | undefined;
  const value = def?.value;
  if (typeof value === "string") return go.str(value as string);
  if (typeof value === "number") return go.int(value as number);
  if (typeof value === "boolean") return go.id(value ? "true" : "false");
  return go.id("nil");
}

function printExpr(expr: go.Expression): string {
  const sb = new go.StringBuilder();
  go.printExpr(sb, expr, 0, 0);
  return sb.toString();
}

export function generateBindingErrorFunction(config: BindingErrorConfig): string {
  const statusCode = config.httpStatus ?? 400;
  const statusConst = httpStatusConsts[statusCode] ?? String(statusCode);

  if (!config.bodySchema) {
    const decl = go.function_(
      "ResolveBindingError",
      [go.field(["err"], go.id("error"))],
      [go.field([], go.id("int")), go.field([], go.id("any"))],
      go.block(go.return_(go.id(statusConst), go.id('gin.H{"error": err.Error()}'))),
    );
    const sb = new go.StringBuilder();
    go.printDeclaration(sb, decl, 0);
    return sb.toString().trimEnd();
  }

  const bodyExpr = compileSchema(config.bodySchema);

  const decl = go.function_(
    "ResolveBindingError",
    [go.field(["err"], go.id("error"))],
    [go.field([], go.id("int")), go.field([], go.id("any"))],
    go.block(
      go.declStmt(
        go.genDecl("var", go.valueSpec(["ve"], go.qual("validator", "ValidationErrors"))),
      ),
      go.ifStmt(
        go.call(go.sel(go.id("errors"), "As"), go.id("err"), go.addr(go.id("ve"))),
        go.block(go.return_(go.id(statusConst), bodyExpr)),
      ),
      go.return_(go.id("http.StatusBadRequest"), go.id('gin.H{"error": err.Error()}')),
    ),
  );
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, decl, 0);
  return sb.toString().trimEnd();
}
