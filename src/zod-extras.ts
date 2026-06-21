import { z as zod, type ZodNumber } from "zod";

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

const extras = { int32, int64, float32, float64 };

export const z: typeof zod & typeof extras = Object.assign(
  Object.create(zod),
  extras,
);
