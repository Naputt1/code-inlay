import type { CodeTarget, GeneratedRegion } from "../types.js";
import { pascalCase } from "../naming.js";

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

        if (route.input) {
          const reqName = `${pascalCase(route.id)}${pascalCase(module.name)}Request`;
          spec.components.schemas[reqName] = zodToJsonSchema(route.input);

          if (route.method === "GET" || route.method === "DELETE") {
            operation.parameters = zodToQueryParams(route.input);
          } else {
            operation.requestBody = {
              content: {
                "application/json": {
                  schema: { $ref: `#/components/schemas/${reqName}` },
                },
              },
            };
          }
        }

        if (route.response) {
          const resName = `${pascalCase(route.id)}${pascalCase(module.name)}Response`;
          spec.components.schemas[resName] = zodToJsonSchema(route.response);
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
  const def = (schema as Record<string, unknown>)._def as Record<string, unknown> | undefined;
  if (!def) return {};
  const typeName = def.typeName as string | undefined;

  switch (typeName) {
    case "ZodString":
      return { type: "string" };
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodEnum": {
      const values = def.values as string[] | undefined;
      return { type: "string", enum: values ?? [] };
    }
    case "ZodArray": {
      const element = ((def as Record<string, unknown>).type as unknown) ?? undefined;
      return { type: "array", items: zodToJsonSchema(element) };
    }
    case "ZodObject": {
      const shapeFn = def.shape as (() => Record<string, unknown>) | undefined;
      if (!shapeFn) return { type: "object" };
      const shape = shapeFn();
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, val] of Object.entries(shape)) {
        const fieldDef = (val as Record<string, unknown>)._def as
          | Record<string, unknown>
          | undefined;
        const isOptional = fieldDef?.typeName === "ZodOptional";
        properties[key] = zodToJsonSchema(val);
        if (!isOptional) required.push(key);
      }
      return {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
      };
    }
    case "ZodOptional": {
      const inner = ((def as Record<string, unknown>).innerType as unknown) ?? undefined;
      return zodToJsonSchema(inner);
    }
    case "ZodNullable": {
      const inner2 = ((def as Record<string, unknown>).innerType as unknown) ?? undefined;
      const base = zodToJsonSchema(inner2);
      return { ...base, nullable: true };
    }
    default:
      return {};
  }
}

function zodToQueryParams(schema: unknown): Array<Record<string, unknown>> {
  if (!schema || typeof schema !== "object") return [];
  const def = (schema as Record<string, unknown>)._def as Record<string, unknown> | undefined;
  if (!def) return [];
  const shapeFn = def.shape as (() => Record<string, unknown>) | undefined;
  if (!shapeFn) return [];

  const params: Array<Record<string, unknown>> = [];
  for (const [key, val] of Object.entries(shapeFn())) {
    const fieldDef = (val as Record<string, unknown>)._def as Record<string, unknown> | undefined;
    const isOptional = fieldDef?.typeName === "ZodOptional";
    const jsonSchema = zodToJsonSchema(val);
    params.push({
      name: key,
      in: "query",
      required: !isOptional,
      schema: jsonSchema,
    });
  }
  return params;
}
