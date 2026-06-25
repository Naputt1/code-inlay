import { z as zod, type ZodNumber, type ZodTypeAny } from "zod";
import type { SchemaLike } from "./types.js";

function int32(): ZodNumber {
  const s = zod.number().int();
  (s._def as { checks: Array<{ kind: string }> }).checks.push({ kind: "int32" });
  return s;
}

function int64(): ZodNumber {
  const s = zod.number().int();
  (s._def as { checks: Array<{ kind: string }> }).checks.push({ kind: "int64" });
  return s;
}

function float32(): ZodNumber {
  const s = zod.number();
  (s._def as { checks: Array<{ kind: string }> }).checks.push({ kind: "float32" });
  return s;
}

function float64(): ZodNumber {
  return zod.number();
}

function entity(): ZodTypeAny {
  const s = zod.any();
  (s._def as unknown as Record<string, unknown>).typeName = "ZodEntity";
  return s;
}

function isEntityPlaceholder(schema: SchemaLike): boolean {
  return (schema._def as unknown as Record<string, unknown>).typeName === "ZodEntity";
}

function hasEntityPlaceholder(schema: SchemaLike): boolean {
  const schemaObj = schema as unknown as Record<string, unknown>;
  const def = schemaObj._def as Record<string, unknown>;
  const typeName = def.typeName as string;
  if (typeName === "ZodEntity") return true;
  if (typeName === "ZodObject") {
    const shape = (schemaObj.shape ??
      (typeof def.shape === "function" ? def.shape() : def.shape)) as Record<string, unknown>;
    return Object.values(shape).some((val) => hasEntityPlaceholder(val as SchemaLike));
  }
  if (typeName === "ZodArray") {
    const element = schemaObj.element ?? def.type ?? def.element;
    return hasEntityPlaceholder(element as SchemaLike);
  }
  if (typeName === "ZodOptional" || typeName === "ZodNullable") {
    return hasEntityPlaceholder((schemaObj.innerType ?? def.innerType) as SchemaLike);
  }
  return false;
}

const extras = {
  int32,
  int64,
  float32,
  float64,
  entity,
  isEntityPlaceholder,
  hasEntityPlaceholder,
};

export const z: typeof zod & typeof extras = Object.assign(Object.create(zod), extras);

export { isEntityPlaceholder, hasEntityPlaceholder };
