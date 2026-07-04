import type { CodeTarget, GeneratedRegion, SchemaLike } from "../types/index.js";
import { pascalCase } from "../utils/naming.js";
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

export const asyncapiTarget: CodeTarget = {
  name: "asyncapi",
  version: "0.1.0",
  apiVersion: "3",
  stage: "postTransform",
  generate(ctx) {
    const { ast, options } = ctx;
    const spec: {
      asyncapi: string;
      info: { title: string; version: string };
      servers: Record<string, unknown>;
      channels: Record<string, unknown>;
      components: {
        schemas: Record<string, unknown>;
        messages: Record<string, unknown>;
      };
    } = {
      asyncapi: "2.6.0",
      info: {
        title: (options.targetOptions?.["asyncapi"]?.title as string) ?? "Event API",
        version: (options.targetOptions?.["asyncapi"]?.version as string) ?? "1.0.0",
      },
      servers: {},
      channels: {},
      components: {
        schemas: {},
        messages: {},
      },
    };

    const serverKey = "default";
    spec.servers[serverKey] = {
      url: (options.targetOptions?.["asyncapi"]?.serverUrl as string) ?? "localhost:8080",
      protocol: "ws",
      description: "Default server",
    };

    for (const module of ast.modules) {
      for (const route of module.routes) {
        if (route.kind === "SSE") {
          const eventsSchema = route.events;
          const messageName = `${pascalCase(route.handlerName)}${pascalCase(route.moduleName)}Event`;
          const schemaName = `${messageName}Payload`;

          spec.components.schemas[schemaName] = zodToJsonSchema(eventsSchema);
          spec.components.messages[messageName] = {
            name: messageName,
            title: `${route.handlerName} event`,
            payload: { $ref: `#/components/schemas/${schemaName}` },
          };

          const channelKey = route.fullPath;
          const existing = spec.channels[channelKey] as Record<string, unknown> | undefined;
          spec.channels[channelKey] = {
            ...(existing ?? {}),
            description: `SSE event stream at ${route.fullPath}`,
            subscribe: {
              summary: `Subscribe to ${route.handlerName} events`,
              message: { $ref: `#/components/messages/${messageName}` },
            },
          };
        }

        if (route.kind === "WS") {
          const messageSchemaName = `${pascalCase(route.handlerName)}${pascalCase(route.moduleName)}Message`;
          spec.components.schemas[messageSchemaName] = zodToJsonSchema(route.message);
          spec.components.messages[messageSchemaName] = {
            name: messageSchemaName,
            title: `${route.handlerName} message`,
            payload: { $ref: `#/components/schemas/${messageSchemaName}` },
          };

          const channelKey = route.fullPath;
          const channel: Record<string, unknown> = {
            description: `WebSocket endpoint at ${route.fullPath}`,
            publish: {
              summary: `Send ${route.handlerName} message`,
              message: { $ref: `#/components/messages/${messageSchemaName}` },
            },
          };

          if (route.events) {
            const eventSchemaName = `${pascalCase(route.handlerName)}${pascalCase(route.moduleName)}Event`;
            spec.components.schemas[eventSchemaName] = zodToJsonSchema(route.events);
            spec.components.messages[eventSchemaName] = {
              name: eventSchemaName,
              title: `${route.handlerName} event`,
              payload: { $ref: `#/components/schemas/${eventSchemaName}` },
            };
            channel.subscribe = {
              summary: `Receive ${route.handlerName} events`,
              message: { $ref: `#/components/messages/${eventSchemaName}` },
            };
          }

          spec.channels[channelKey] = channel;
        }
      }
    }

    const content = JSON.stringify(spec, null, 2);
    const region: GeneratedRegion = {
      id: "asyncapi.spec",
      stableHash: `asyncapi:spec:${spec.info.version}`,
      owner: "asyncapi",
      language: "json",
      content,
    };

    const outputDir = (options.targetOptions?.["asyncapi"]?.outputDir as string) ?? "docs";
    return [
      {
        path: `${outputDir}/asyncapi.json`,
        regions: [region],
      },
    ];
  },
};

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
