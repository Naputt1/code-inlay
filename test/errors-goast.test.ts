import { describe, it, expect } from "vitest";
import { renderStandardErrors, renderModuleErrors } from "../src/generators/errors-goast.js";
import { httpStatusConsts } from "../src/generators/errors-goast.js";

describe("go-ast errors generation — standard errors", () => {
  it("1. single standard error — BadRequest", () => {
    const structs = [
      {
        name: "BadRequest",
        fields: [{ name: "Message", type: "string", jsonName: "message" }],
        httpStatus: 400,
      },
    ];
    const result = renderStandardErrors(structs);
    const expected = `import "net/http"

type BadRequest struct {
\tMessage string \`json:"message"\`
}
func (e *BadRequest) Error() string {
\treturn e.Message
}
func (e *BadRequest) HTTPStatus() int {
\treturn http.StatusBadRequest
}`;
    expect(result).toBe(expected);
  });

  it("2. all 29 standard errors", () => {
    const httpStatusCodes = Object.keys(httpStatusConsts).map(Number);
    const allNames: { name: string; status: number }[] = [
      { name: "BadRequest", status: 400 },
      { name: "Unauthorized", status: 401 },
      { name: "PaymentRequired", status: 402 },
      { name: "Forbidden", status: 403 },
      { name: "NotFound", status: 404 },
      { name: "MethodNotAllowed", status: 405 },
      { name: "NotAcceptable", status: 406 },
      { name: "RequestTimeout", status: 408 },
      { name: "Conflict", status: 409 },
      { name: "Gone", status: 410 },
      { name: "LengthRequired", status: 411 },
      { name: "PreconditionFailed", status: 412 },
      { name: "PayloadTooLarge", status: 413 },
      { name: "URITooLong", status: 414 },
      { name: "UnsupportedMediaType", status: 415 },
      { name: "RangeNotSatisfiable", status: 416 },
      { name: "ExpectationFailed", status: 417 },
      { name: "ImATeapot", status: 418 },
      { name: "MisdirectedRequest", status: 421 },
      { name: "UnprocessableEntity", status: 422 },
      { name: "Locked", status: 423 },
      { name: "FailedDependency", status: 424 },
      { name: "UpgradeRequired", status: 426 },
      { name: "PreconditionRequired", status: 428 },
      { name: "TooManyRequests", status: 429 },
      { name: "RequestHeaderFieldsTooLarge", status: 431 },
      { name: "UnavailableForLegalReasons", status: 451 },
      { name: "InternalServerError", status: 500 },
      { name: "NotImplemented", status: 501 },
      { name: "BadGateway", status: 502 },
      { name: "ServiceUnavailable", status: 503 },
      { name: "GatewayTimeout", status: 504 },
    ];
    const structs = allNames.map((s) => ({
      name: s.name,
      fields: [{ name: "Message", type: "string", jsonName: "message" }],
      httpStatus: s.status,
    }));
    const result = renderStandardErrors(structs);

    expect(result).toContain('import "net/http"');
    expect(result).toContain("type BadRequest struct");
    expect(result).toContain("type GatewayTimeout struct");

    // Struct declarations themselves should be identical
    for (const s of allNames) {
      expect(result).toContain(`type ${s.name} struct {`);
      expect(result).toContain('Message string `json:"message"`');
      expect(result).toContain(`func (e *${s.name}) Error() string {`);
      expect(result).toContain("return e.Message");
      expect(result).toContain(`func (e *${s.name}) HTTPStatus() int {`);
      const statusConst = httpStatusConsts[s.status];
      if (statusConst) {
        expect(result).toContain(`return ${statusConst}`);
      }
    }

    // Check first and last struct in detail against known legacy struct format
    const firstStructLine = `type BadRequest struct {\n\tMessage string \`json:"message"\`\n}`;
    expect(result).toContain(firstStructLine);

    const lastStructLine = `type GatewayTimeout struct {\n\tMessage string \`json:"message"\`\n}`;
    expect(result).toContain(lastStructLine);

    // Ensure no empty structs (all have Message field)
    expect(result).not.toContain("struct{}");
  });
});

describe("go-ast errors generation — module errors", () => {
  it("3. module error with no fields", () => {
    const structs = [{ name: "NotFound", fields: [], httpStatus: 404 }];
    const result = renderModuleErrors("test", structs);
    const expected = `import "net/http"

type NotFound struct{}
func (e *NotFound) Error() string {
\treturn "NotFound"
}
func (e *NotFound) HTTPStatus() int {
\treturn http.StatusNotFound
}`;
    expect(result).toBe(expected);
  });

  it("4. module error with single field", () => {
    const structs = [
      {
        name: "ValidationError",
        fields: [{ name: "Field", type: "string", jsonName: "field" }],
        httpStatus: 422,
      },
    ];
    const result = renderModuleErrors("test", structs);
    expect(result).toContain("type ValidationError struct {");
    expect(result).toContain('Field string `json:"field"`');
    expect(result).toContain('return "ValidationError"');
    expect(result).toContain("return http.StatusUnprocessableEntity");
  });

  it("5. module error with multiple fields", () => {
    const structs = [
      {
        name: "ApiError",
        fields: [
          { name: "Code", type: "int32", jsonName: "code" },
          { name: "Message", type: "string", jsonName: "message" },
        ],
        httpStatus: 400,
      },
    ];
    const result = renderModuleErrors("test", structs);
    expect(result).toContain("type ApiError struct {");
    expect(result).toContain('Code int32 `json:"code"`');
    expect(result).toContain('Message string `json:"message"`');
    expect(result).toContain('return "ApiError"');
    expect(result).toContain("return http.StatusBadRequest");
  });

  it("6. module error with various types via toGoType", () => {
    const structs = [
      {
        name: "RichError",
        fields: [
          { name: "Code", type: "int32", jsonName: "code" },
          { name: "Tags", type: "[]string", jsonName: "tags" },
          { name: "Meta", type: "map[string]string", jsonName: "meta" },
          { name: "Active", type: "bool", jsonName: "active" },
        ],
        httpStatus: 500,
      },
    ];
    const result = renderModuleErrors("test", structs);
    expect(result).toContain("RichError struct {");
    expect(result).toContain('Code int32 `json:"code"`');
    expect(result).toContain('Tags []string `json:"tags"`');
    expect(result).toContain('Meta map[string]string `json:"meta"`');
    expect(result).toContain('Active bool `json:"active"`');
    expect(result).toContain("return http.StatusInternalServerError");
  });

  it("7. empty module errors list returns empty array from generateModuleErrors", () => {
    // The renderModuleErrors function should still return valid output for empty list
    const result = renderModuleErrors("test", []);
    const expected = `import "net/http"`;
    expect(result).toBe(expected);
  });

  it("8. module error with HTTP status not in consts map (falls back to raw number)", () => {
    const structs = [
      {
        name: "CustomError",
        fields: [],
        httpStatus: 299,
      },
    ];
    const result = renderModuleErrors("test", structs);
    const expected = `import "net/http"

type CustomError struct{}
func (e *CustomError) Error() string {
\treturn "CustomError"
}
func (e *CustomError) HTTPStatus() int {
\treturn 299
}`;
    expect(result).toBe(expected);
  });
});
