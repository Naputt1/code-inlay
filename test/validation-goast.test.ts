import { describe, it, expect } from "vitest";
import { validationZ } from "../src/schema/extras.js";
import { z } from "../src/index.js";
import { generateBindingErrorFunction } from "../src/generators/validation.js";

describe("go-ast validation — output contains expected Go constructs", () => {
  it("1. no body schema", () => {
    const result = generateBindingErrorFunction({ httpStatus: 400 });
    expect(result).toContain("func ResolveBindingError(err error) (int, any) {");
    expect(result).toContain(`return http.StatusBadRequest, gin.H{"error": err.Error()}`);
    expect(result).not.toContain("validator.ValidationErrors");
  });

  it("2. empty object schema", () => {
    const result = generateBindingErrorFunction({
      httpStatus: 422,
      bodySchema: validationZ.object({}),
    });
    expect(result).toContain("func ResolveBindingError(err error) (int, any) {");
    expect(result).toContain("var ve validator.ValidationErrors");
    expect(result).toContain("return http.StatusUnprocessableEntity, map[string]any{}");
    expect(result).toContain(`return http.StatusBadRequest, gin.H{"error": err.Error()}`);
  });

  it("3. object with string, number, boolean fields", () => {
    const result = generateBindingErrorFunction({
      httpStatus: 400,
      bodySchema: validationZ.object({
        name: z.string(),
        count: z.number(),
        active: z.boolean(),
      }),
    });
    expect(result).toContain('"name": ""');
    expect(result).toContain('"count": 0');
    expect(result).toContain('"active": false');
    expect(result).toContain("map[string]any{");
    expect(result).toContain("}");
  });

  it("4. nested object", () => {
    const result = generateBindingErrorFunction({
      httpStatus: 422,
      bodySchema: validationZ.object({
        meta: validationZ.object({
          key: z.string(),
        }),
      }),
    });
    expect(result).toContain('"meta": map[string]any{');
    expect(result).toContain('"key": ""');
  });

  it("5. array field", () => {
    const result = generateBindingErrorFunction({
      httpStatus: 400,
      bodySchema: validationZ.object({
        tags: validationZ.array(z.string()),
      }),
    });
    expect(result).toContain("func() any {");
    expect(result).toContain("items := make([]any, 0, len(ve))");
    expect(result).toContain("for _, fe := range ve {");
    expect(result).toContain('items = append(items, "")');
    expect(result).toContain("return items");
    expect(result).toContain("}()");
  });

  it("6. optional field unwraps to inner type", () => {
    const result = generateBindingErrorFunction({
      httpStatus: 422,
      bodySchema: validationZ.object({
        desc: z.string().optional(),
      }),
    });
    expect(result).toContain('"desc": ""');
  });

  it("7. nullable field unwraps to inner type", () => {
    const result = generateBindingErrorFunction({
      httpStatus: 400,
      bodySchema: validationZ.object({
        value: z.string().nullable(),
      }),
    });
    expect(result).toContain('"value": ""');
  });

  it("8. ZodLiteral fields", () => {
    const result = generateBindingErrorFunction({
      httpStatus: 422,
      bodySchema: validationZ.object({
        msg: z.literal("hello"),
        count: z.literal(42),
        flag: z.literal(true),
      }),
    });
    expect(result).toContain('"msg": "hello"');
    expect(result).toContain('"count": 42');
    expect(result).toContain('"flag": true');
  });

  it("9. mixed field types", () => {
    const result = generateBindingErrorFunction({
      httpStatus: 400,
      bodySchema: validationZ.object({
        id: z.string(),
        tags: validationZ.array(z.string()),
        meta: validationZ.object({
          key: z.string(),
          val: z.literal("x"),
        }),
      }),
    });
    expect(result).toContain('"id": ""');
    expect(result).toContain("func() any {");
    expect(result).toContain('"meta": map[string]any{');
    expect(result).toContain('"val": "x"');
  });

  it("10. custom HTTP status code (422)", () => {
    const result = generateBindingErrorFunction({
      httpStatus: 422,
      bodySchema: validationZ.object({
        msg: z.literal("validation failed"),
      }),
    });
    expect(result).toContain("http.StatusUnprocessableEntity");
    expect(result).toContain('"msg": "validation failed"');
  });

  it("11. HTTP status not in consts map (falls back to raw number)", () => {
    const result = generateBindingErrorFunction({
      httpStatus: 299,
      bodySchema: validationZ.object({
        msg: z.literal("custom"),
      }),
    });
    expect(result).toContain("return 299, map[string]any{");
    expect(result).toContain('"msg": "custom"');
  });

  it("12. validation error placeholders", () => {
    const result = generateBindingErrorFunction({
      httpStatus: 400,
      bodySchema: validationZ.object({
        field: validationZ.field(),
        tag: validationZ.tag(),
        param: validationZ.param(),
        value: validationZ.value(),
        kind: validationZ.kind(),
        actual: validationZ.actual(),
      }),
    });
    expect(result).toContain("fe.Field()");
    expect(result).toContain("fe.Tag()");
    expect(result).toContain("fe.Param()");
    expect(result).toContain('fmt.Sprintf("%v", fe.Value())');
    expect(result).toContain("fe.Kind().String()");
    expect(result).toContain("fe.ActualTag()");
  });

  it("13. optional validation type uses closure", () => {
    const result = generateBindingErrorFunction({
      httpStatus: 400,
      bodySchema: validationZ.object({
        err: validationZ.optional(validationZ.field()),
      }),
    });
    expect(result).toContain(
      'func() any { if v := fe.Field(); v != "" { return v }; return nil }()',
    );
  });

  it("14. nullable validation type uses closure", () => {
    const result = generateBindingErrorFunction({
      httpStatus: 422,
      bodySchema: validationZ.object({
        err: validationZ.nullable(validationZ.value()),
      }),
    });
    expect(result).toContain(
      'func() any { if v := fmt.Sprintf("%v", fe.Value()); v != "" { return v }; return nil }()',
    );
  });
});
