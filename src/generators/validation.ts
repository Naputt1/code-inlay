import type { SchemaLike } from "../types/index.js";
import { typeName } from "../schema/extras.js";

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

export { generateBindingErrorFunction } from "./validation-goast.js";
