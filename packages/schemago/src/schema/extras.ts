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
import type { SchemaLike } from "../types/index.js";

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

// --- Validation error placeholder types ---

interface ZodFieldDef extends ZodTypeDef {
  typeName: "ZodField";
}

class ZodField extends ZodType<string, ZodFieldDef, string> {
  _parse(input: ParseInput): ParseReturnType<string> {
    return OK(String(input.data));
  }
  static create(): ZodField {
    return new ZodField({ typeName: "ZodField" });
  }
}

interface ZodTagDef extends ZodTypeDef {
  typeName: "ZodTag";
}

class ZodTag extends ZodType<string, ZodTagDef, string> {
  _parse(input: ParseInput): ParseReturnType<string> {
    return OK(String(input.data));
  }
  static create(): ZodTag {
    return new ZodTag({ typeName: "ZodTag" });
  }
}

interface ZodParamDef extends ZodTypeDef {
  typeName: "ZodParam";
}

class ZodParam extends ZodType<string, ZodParamDef, string> {
  _parse(input: ParseInput): ParseReturnType<string> {
    return OK(String(input.data));
  }
  static create(): ZodParam {
    return new ZodParam({ typeName: "ZodParam" });
  }
}

interface ZodValueDef extends ZodTypeDef {
  typeName: "ZodValue";
}

class ZodValue extends ZodType<unknown, ZodValueDef, unknown> {
  _parse(input: ParseInput): ParseReturnType<unknown> {
    return OK(input.data);
  }
  static create(): ZodValue {
    return new ZodValue({ typeName: "ZodValue" });
  }
}

interface ZodKindDef extends ZodTypeDef {
  typeName: "ZodKind";
}

class ZodKind extends ZodType<string, ZodKindDef, string> {
  _parse(input: ParseInput): ParseReturnType<string> {
    return OK(String(input.data));
  }
  static create(): ZodKind {
    return new ZodKind({ typeName: "ZodKind" });
  }
}

interface ZodActualDef extends ZodTypeDef {
  typeName: "ZodActual";
}

class ZodActual extends ZodType<string, ZodActualDef, string> {
  _parse(input: ParseInput): ParseReturnType<string> {
    return OK(String(input.data));
  }
  static create(): ZodActual {
    return new ZodActual({ typeName: "ZodActual" });
  }
}

const validationExtras = {
  field: () => ZodField.create(),
  tag: () => ZodTag.create(),
  param: () => ZodParam.create(),
  value: () => ZodValue.create(),
  kind: () => ZodKind.create(),
  actual: () => ZodActual.create(),
  isZodField,
  isZodTag,
  isZodParam,
  isZodValue,
  isZodKind,
  isZodActual,
};

export const validationZ: typeof zod & typeof validationExtras = Object.assign(
  Object.create(zod),
  validationExtras,
);

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

export function typeName(schema: SchemaLike): string {
  return (schema._def as { typeName?: string }).typeName ?? "";
}

export function isZodOptional(schema: SchemaLike): schema is SchemaLike & { unwrap(): SchemaLike } {
  return typeName(schema) === "ZodOptional";
}

export function isZodNullable(schema: SchemaLike): schema is SchemaLike & { unwrap(): SchemaLike } {
  return typeName(schema) === "ZodNullable";
}

export function isZodObject(
  schema: SchemaLike,
): schema is SchemaLike & { shape: Record<string, SchemaLike> } {
  return typeName(schema) === "ZodObject";
}

export function isZodDiscriminatedUnion(schema: SchemaLike): schema is SchemaLike & {
  _def: { discriminator: string; options: SchemaLike[]; optionsMap: Record<string, SchemaLike> };
} {
  return typeName(schema) === "ZodDiscriminatedUnion";
}

export function isZodString(schema: SchemaLike): boolean {
  return typeName(schema) === "ZodString";
}

export function isZodEnum(schema: SchemaLike): boolean {
  return typeName(schema) === "ZodEnum";
}

export function isZodLiteral(schema: SchemaLike): boolean {
  return typeName(schema) === "ZodLiteral";
}

export function isZodNumber(schema: SchemaLike): boolean {
  return typeName(schema) === "ZodNumber";
}

export function isZodBoolean(schema: SchemaLike): boolean {
  return typeName(schema) === "ZodBoolean";
}

export function isZodLazy(
  schema: SchemaLike,
): schema is SchemaLike & { _def: { getter: () => SchemaLike; schema?: SchemaLike } } {
  return typeName(schema) === "ZodLazy";
}

export function resolveLazy(schema: SchemaLike): SchemaLike {
  const def = schema._def as { getter?: () => SchemaLike; schema?: SchemaLike };
  if (!def.schema) {
    def.schema = def.getter!();
  }
  return def.schema!;
}

export function isZodArray(schema: SchemaLike): schema is SchemaLike & { element: SchemaLike } {
  return typeName(schema) === "ZodArray";
}

export function unwrap(schema: SchemaLike): SchemaLike {
  let current = schema;
  while (isZodOptional(current) || isZodNullable(current)) {
    current = current.unwrap();
  }
  return current;
}

export const isZodEntity = isEntityPlaceholder;

const extras = {
  int32,
  int64,
  float32,
  float64,
  entity,
  isEntityPlaceholder,
  hasEntityPlaceholder,
  typeName,
  isZodOptional,
  isZodNullable,
  isZodObject,
  isZodString,
  isZodEnum,
  isZodNumber,
  isZodBoolean,
  isZodArray,
  isZodLazy,
  resolveLazy,
  unwrap,
  isZodEntity,
};

export function isZodField(schema: SchemaLike): boolean {
  return typeName(schema) === "ZodField";
}
export function isZodTag(schema: SchemaLike): boolean {
  return typeName(schema) === "ZodTag";
}
export function isZodParam(schema: SchemaLike): boolean {
  return typeName(schema) === "ZodParam";
}
export function isZodValue(schema: SchemaLike): boolean {
  return typeName(schema) === "ZodValue";
}
export function isZodKind(schema: SchemaLike): boolean {
  return typeName(schema) === "ZodKind";
}
export function isZodActual(schema: SchemaLike): boolean {
  return typeName(schema) === "ZodActual";
}

export function isValidationType(typeName: string): boolean {
  return ["ZodField", "ZodTag", "ZodParam", "ZodValue", "ZodKind", "ZodActual"].includes(typeName);
}

export function validationTypeToGoExpr(typeName: string, idxVar: string): string {
  const map: Record<string, string> = {
    ZodField: `${idxVar}.Field()`,
    ZodTag: `${idxVar}.Tag()`,
    ZodParam: `${idxVar}.Param()`,
    ZodValue: `fmt.Sprintf("%v", ${idxVar}.Value())`,
    ZodKind: `${idxVar}.Kind().String()`,
    ZodActual: `${idxVar}.ActualTag()`,
  };
  return map[typeName] ?? `"${typeName}"`;
}

export const z: typeof zod & typeof extras = Object.assign(Object.create(zod), extras);

export { isEntityPlaceholder, hasEntityPlaceholder };
