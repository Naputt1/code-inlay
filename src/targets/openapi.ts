import type { CodeTarget, GeneratedRegion, SchemaLike } from "../types/index.js";
import { pascalCase } from "../utils/naming.js";
import { mergeEntityIntoWrapper } from "../schema/index.js";
import {
  isZodString,
  isZodNumber,
  isZodBoolean,
  isZodEnum,
  isZodArray,
  isZodObject,
  isZodOptional,
  isZodNullable,
} from "../schema/extras.js";

export const openapiTarget: CodeTarget = {
  name: "openapi",
  version: "0.1.0",
  apiVersion: "3",
  stage: "postTransform",
  generate(ctx) {
    const { ast, options } = ctx;
    const spec: {
      openapi: string;
      info: { title: string; version: string };
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    } = {
      openapi: (options.targetOptions?.["openapi"]?.specVersion as string) ?? "3.1.0",
      info: {
        title: (options.targetOptions?.["openapi"]?.title as string) ?? "API",
        version: (options.targetOptions?.["openapi"]?.version as string) ?? "1.0.0",
      },
      paths: {},
      components: {
        schemas: {},
      },
    };

    for (const module of ast.modules) {
      for (const route of module.routes) {
        const pathItem = getOrCreate(
          spec.paths as Record<string, unknown>,
          route.fullPath,
          {},
        ) as Record<string, unknown>;

        const method = route.method.toLowerCase();
        const operation: Record<string, unknown> = {
          operationId: `${module.name}.${route.id}`,
          summary: `${route.method} ${route.fullPath}`,
          tags: [module.name],
          responses: {},
        };

        if (route.body) {
          const reqName = `${pascalCase(route.id)}${pascalCase(module.name)}Body`;
          spec.components.schemas[reqName] = zodToJsonSchema(route.body);
          operation.requestBody = {
            content: {
              "application/json": {
                schema: { $ref: `#/components/schemas/${reqName}` },
              },
            },
          };
        }

        if (route.query) {
          const existing = (operation.parameters ?? []) as Array<Record<string, unknown>>;
          operation.parameters = existing.concat(zodToQueryParams(route.query));
        }

        const effectiveResponse = route.response
          ? route.responseFormat
            ? mergeEntityIntoWrapper(route.responseFormat.wrapper, route.response)
            : route.response
          : route.responseFormat
            ? route.responseFormat.wrapper
            : undefined;

        if (effectiveResponse) {
          const resName = `${pascalCase(route.id)}${pascalCase(module.name)}Response`;
          spec.components.schemas[resName] = zodToJsonSchema(effectiveResponse);
          operation.responses = {
            "200": {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: { $ref: `#/components/schemas/${resName}` },
                },
              },
            },
          };
        } else {
          operation.responses = {
            "200": { description: "Successful response" },
          };
        }

        pathItem[method] = operation;
      }
    }

    const content = JSON.stringify(spec, null, 2);
    const region: GeneratedRegion = {
      id: "openapi.spec",
      stableHash: `openapi:spec:${spec.info.version}`,
      owner: "openapi",
      language: "json",
      content,
    };

    const outputDir = (options.targetOptions?.["openapi"]?.outputDir as string) ?? "docs";
    return [
      {
        path: `${outputDir}/openapi.json`,
        regions: [region],
      },
    ];
  },
};

function getOrCreate(obj: Record<string, unknown>, key: string, fallback: unknown): unknown {
  if (!(key in obj)) {
    obj[key] = fallback;
  }
  return obj[key];
}

function zodToJsonSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== "object") return {};
  const s = schema as SchemaLike;
  if (isZodString(s)) return { type: "string" };
  if (isZodNumber(s)) return { type: "number" };
  if (isZodBoolean(s)) return { type: "boolean" };
  if (isZodEnum(s)) {
    const values = (s._def as { values?: string[] }).values;
    return { type: "string", enum: values ?? [] };
  }
  if (isZodArray(s)) {
    return { type: "array", items: zodToJsonSchema(s.element) };
  }
  if (isZodObject(s)) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries(s.shape)) {
      const field = val as SchemaLike;
      properties[key] = zodToJsonSchema(field);
      if (!isZodOptional(field)) required.push(key);
    }
    return {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }
  if (isZodOptional(s)) {
    return zodToJsonSchema(s.unwrap());
  }
  if (isZodNullable(s)) {
    const base = zodToJsonSchema(s.unwrap());
    return { ...base, nullable: true };
  }
  return {};
}

function zodToQueryParams(schema: unknown): Array<Record<string, unknown>> {
  if (!schema || typeof schema !== "object") return [];
  const s = schema as SchemaLike;
  if (!isZodObject(s)) return [];

  const params: Array<Record<string, unknown>> = [];
  for (const [key, val] of Object.entries(s.shape)) {
    const field = val as SchemaLike;
    params.push({
      name: key,
      in: "query",
      required: !isZodOptional(field),
      schema: zodToJsonSchema(field),
    });
  }
  return params;
}
