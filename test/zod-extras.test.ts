import { describe, expect, it } from "vitest";
import { z, hasEntityPlaceholder } from "../src/index.js";

describe("z.int32", () => {
  it("creates an int32 type", () => {
    const schema = z.int32();
    expect(schema).toBeDefined();
    expect((schema._def as { typeName?: string }).typeName).toBe("ZodInt32");
  });
});

describe("z.int64", () => {
  it("creates an int64 type", () => {
    const schema = z.int64();
    expect(schema).toBeDefined();
    expect((schema._def as { typeName?: string }).typeName).toBe("ZodInt64");
  });
});

describe("z.float32", () => {
  it("creates a float32 type", () => {
    const schema = z.float32();
    expect(schema).toBeDefined();
    expect((schema._def as { typeName?: string }).typeName).toBe("ZodFloat32");
  });
});

describe("z.float64", () => {
  it("creates a float64 type (zod number)", () => {
    const schema = z.float64();
    expect(schema).toBeDefined();
    expect((schema._def as { typeName?: string }).typeName).toBe("ZodNumber");
  });
});

describe("ZodInt32 validation", () => {
  it("accepts integers", () => {
    const schema = z.int32();
    expect(schema.safeParse(42).success).toBe(true);
    expect(schema.safeParse(0).success).toBe(true);
    expect(schema.safeParse(-1).success).toBe(true);
  });

  it("rejects non-numbers", () => {
    const schema = z.int32();
    expect(schema.safeParse("abc").success).toBe(false);
  });

  it("rejects non-integer numbers", () => {
    const schema = z.int32();
    expect(schema.safeParse(1.5).success).toBe(false);
  });
});

describe("ZodInt64 validation", () => {
  it("accepts integers", () => {
    const schema = z.int64();
    expect(schema.safeParse(42).success).toBe(true);
  });

  it("rejects non-numbers", () => {
    const schema = z.int64();
    expect(schema.safeParse(true).success).toBe(false);
  });

  it("rejects non-integer numbers", () => {
    const schema = z.int64();
    expect(schema.safeParse(3.14).success).toBe(false);
  });
});

describe("ZodEntity validation", () => {
  it("accepts any value", () => {
    const schema = z.entity();
    expect(schema.safeParse("anything").success).toBe(true);
    expect(schema.safeParse(42).success).toBe(true);
    expect(schema.safeParse(null).success).toBe(true);
  });
});

describe("ZodFloat32 validation", () => {
  it("accepts numbers", () => {
    const schema = z.float32();
    const result = schema.safeParse(3.14);
    expect(result.success).toBe(true);
  });

  it("rejects non-numbers", () => {
    const schema = z.float32();
    const result = schema.safeParse(true);
    expect(result.success).toBe(false);
  });
});

describe("hasEntityPlaceholder", () => {
  it("detects entity in object with function-shaped def", () => {
    const schema = z.object({ data: z.entity() });
    expect(hasEntityPlaceholder(schema)).toBe(true);
  });

  it("returns false for plain object without entity", () => {
    const schema = z.object({ name: z.string() });
    expect(hasEntityPlaceholder(schema)).toBe(false);
  });

  it("detects entity in nested object", () => {
    const schema = z.object({ nested: z.object({ inner: z.entity() }) });
    expect(hasEntityPlaceholder(schema)).toBe(true);
  });
});
