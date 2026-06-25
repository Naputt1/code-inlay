import {
  z as zod,
  ZodType,
  type ZodParsedType,
  type ZodTypeDef,
  type ZodTypeAny,
  OK,
  INVALID,
  addIssueToContext,
  ZodIssueCode,
  type ParseInput,
  type ParseReturnType,
} from "zod";
import type { SchemaLike } from "./types.js";

interface ZodEntityDef extends ZodTypeDef {
  typeName: "ZodEntity";
}

class ZodEntity extends ZodType<unknown, ZodEntityDef, unknown> {
  _parse(input: ParseInput): ParseReturnType<unknown> {
    return OK(input.data);
  }
  static create(): ZodEntity {
    return new ZodEntity({ typeName: "ZodEntity" });
  }
}

interface ZodInt32Def extends ZodTypeDef {
  typeName: "ZodInt32";
}

class ZodInt32 extends ZodType<number, ZodInt32Def, number> {
  _parse(input: ParseInput): ParseReturnType<number> {
    const parsedType = this._getType(input) as ZodParsedType;
    if (parsedType !== "number") {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: "number",
        received: parsedType,
      });
      return INVALID;
    }
    if (!Number.isInteger(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: "integer",
        received: "float",
      });
      return INVALID;
    }
    return OK(input.data);
  }
  static create(): ZodInt32 {
    return new ZodInt32({ typeName: "ZodInt32" });
  }
}

interface ZodInt64Def extends ZodTypeDef {
  typeName: "ZodInt64";
}

class ZodInt64 extends ZodType<number, ZodInt64Def, number> {
  _parse(input: ParseInput): ParseReturnType<number> {
    const parsedType = this._getType(input) as ZodParsedType;
    if (parsedType !== "number") {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: "number",
        received: parsedType,
      });
      return INVALID;
    }
    if (!Number.isInteger(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: "integer",
        received: "float",
      });
      return INVALID;
    }
    return OK(input.data);
  }
  static create(): ZodInt64 {
    return new ZodInt64({ typeName: "ZodInt64" });
  }
}

interface ZodFloat32Def extends ZodTypeDef {
  typeName: "ZodFloat32";
}

class ZodFloat32 extends ZodType<number, ZodFloat32Def, number> {
  _parse(input: ParseInput): ParseReturnType<number> {
    const parsedType = this._getType(input) as ZodParsedType;
    if (parsedType !== "number") {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: "number",
        received: parsedType,
      });
      return INVALID;
    }
    return OK(input.data);
  }
  static create(): ZodFloat32 {
    return new ZodFloat32({ typeName: "ZodFloat32" });
  }
}

function int32(): ZodInt32 {
  return ZodInt32.create();
}

function int64(): ZodInt64 {
  return ZodInt64.create();
}

function float32(): ZodFloat32 {
  return ZodFloat32.create();
}

function float64(): ZodTypeAny {
  return zod.number();
}

function entity(): ZodTypeAny {
  return ZodEntity.create();
}

function isEntityPlaceholder(schema: SchemaLike): boolean {
  return (schema._def as { typeName?: string }).typeName === "ZodEntity";
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
