import type { ErrorDefinition, GeneratedFilePatch, RouteAst, SchemaLike } from "../types/index.js";
import { featuresPath, pascalCase } from "../utils/naming.js";
import {
  renderStandardErrors as renderStandardErrorsAST,
  renderModuleErrors as renderModuleErrorsAST,
} from "./errors-goast.js";

const standardErrors: { name: string; httpStatus: number }[] = [
  { name: "BadRequest", httpStatus: 400 },
  { name: "Unauthorized", httpStatus: 401 },
  { name: "PaymentRequired", httpStatus: 402 },
  { name: "Forbidden", httpStatus: 403 },
  { name: "NotFound", httpStatus: 404 },
  { name: "MethodNotAllowed", httpStatus: 405 },
  { name: "NotAcceptable", httpStatus: 406 },
  { name: "RequestTimeout", httpStatus: 408 },
  { name: "Conflict", httpStatus: 409 },
  { name: "Gone", httpStatus: 410 },
  { name: "LengthRequired", httpStatus: 411 },
  { name: "PreconditionFailed", httpStatus: 412 },
  { name: "PayloadTooLarge", httpStatus: 413 },
  { name: "URITooLong", httpStatus: 414 },
  { name: "UnsupportedMediaType", httpStatus: 415 },
  { name: "RangeNotSatisfiable", httpStatus: 416 },
  { name: "ExpectationFailed", httpStatus: 417 },
  { name: "ImATeapot", httpStatus: 418 },
  { name: "MisdirectedRequest", httpStatus: 421 },
  { name: "UnprocessableEntity", httpStatus: 422 },
  { name: "Locked", httpStatus: 423 },
  { name: "FailedDependency", httpStatus: 424 },
  { name: "UpgradeRequired", httpStatus: 426 },
  { name: "PreconditionRequired", httpStatus: 428 },
  { name: "TooManyRequests", httpStatus: 429 },
  { name: "RequestHeaderFieldsTooLarge", httpStatus: 431 },
  { name: "UnavailableForLegalReasons", httpStatus: 451 },
  { name: "InternalServerError", httpStatus: 500 },
  { name: "NotImplemented", httpStatus: 501 },
  { name: "BadGateway", httpStatus: 502 },
  { name: "ServiceUnavailable", httpStatus: 503 },
  { name: "GatewayTimeout", httpStatus: 504 },
];

export function generateStandardErrors(featuresDir?: string): GeneratedFilePatch[] {
  const file = featuresPath("internal/httperr/errors.go", featuresDir);
  const structs = standardErrors.map((s) => ({
    name: s.name,
    fields: [{ name: "Message", type: "string", jsonName: "message" }],
    httpStatus: s.httpStatus,
  }));
  const content = renderStandardErrors(structs);

  return [
    {
      path: file,
      regions: [
        {
          id: "standard.errors",
          stableHash: `errors:standard`,
          owner: "schemago",
          language: "go",
          content,
        },
      ],
    },
  ];
}

function renderStandardErrors(structs: ErrorStruct[]): string {
  return renderStandardErrorsAST(structs);
}

export function generateModuleErrors(
  moduleName: string,
  errors: ErrorDefinition[],
  featuresDir?: string,
): GeneratedFilePatch[] {
  if (errors.length === 0) return [];

  const file = featuresPath(`internal/${moduleName}/errors.go`, featuresDir);
  const structs = errors.map(definitionToStruct);
  const content = renderModuleErrors(moduleName, structs);

  return [
    {
      path: file,
      regions: [
        {
          id: `${moduleName}.errors`,
          stableHash: `errors:${moduleName}:${errors.length}`,
          owner: "schemago",
          language: "go",
          content,
        },
      ],
    },
  ];
}

export { collectModuleErrors } from "./errors-goast.js";

type ErrorStruct = {
  name: string;
  fields: { name: string; type: string; jsonName: string }[];
  httpStatus: number;
};

function definitionToStruct(def: ErrorDefinition): ErrorStruct {
  const fields: { name: string; type: string; jsonName: string }[] = [];

  if (def.fields) {
    const shape = (
      (def.fields as unknown as Record<string, unknown>)._def as Record<string, unknown>
    )?.shape as (() => Record<string, unknown>) | undefined;
    if (shape) {
      const rawShape = shape();
      for (const [key, fieldSchema] of Object.entries(rawShape)) {
        fields.push({
          name: pascalCase(key),
          type: schemaToGoSimpleType(fieldSchema as SchemaLike),
          jsonName: key,
        });
      }
    }
  }

  return {
    name: def.name,
    fields,
    httpStatus: def.httpStatus,
  };
}

function schemaToGoSimpleType(schema: SchemaLike): string {
  const def = (schema as unknown as Record<string, unknown>)._def as
    | Record<string, unknown>
    | undefined;
  const typeName = def?.typeName as string | undefined;
  switch (typeName) {
    case "ZodString":
      return "string";
    case "ZodNumber":
    case "ZodInt32":
      return "int32";
    case "ZodInt64":
      return "int64";
    case "ZodFloat32":
      return "float32";
    case "ZodBoolean":
      return "bool";
    case "ZodArray": {
      const element =
        (def?.type as SchemaLike | undefined) ?? (def?.element as SchemaLike | undefined);
      return `[]${schemaToGoSimpleType(element ?? schema)}`;
    }
    default:
      return "string";
  }
}

function renderModuleErrors(moduleName: string, structs: ErrorStruct[]): string {
  return renderModuleErrorsAST(moduleName, structs);
}
