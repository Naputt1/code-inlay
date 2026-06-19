import type {
  CodeTarget,
  GeneratedFilePatch,
  GeneratedRegion,
  RouteAst,
} from "../types.js";
import { pascalCase } from "../naming.js";
import { contentHash } from "../hash.js";

export const tsClientTarget: CodeTarget = {
  name: "ts-client",
  version: "0.1.0",
  apiVersion: "3",
  stage: "postTransform",
  generate(ctx) {
    const patches: GeneratedFilePatch[] = [];
    const { ast, options } = ctx;

    const clientDir =
      (options.targetOptions?.["ts-client"]?.outputDir as string) ?? "clients";

    const typesRegions: GeneratedRegion[] = [];
    const apiRegions: GeneratedRegion[] = [];
    const imports = new Set<string>();

    for (const module of ast.modules) {
      for (const route of module.routes) {
        const typeRegions = generateTypesForRoute(route, module.name);
        typesRegions.push(...typeRegions);

        const handlerRegion = generateClientFunction(route, module.name);
        apiRegions.push(handlerRegion);

        if (route.input) imports.add(routeTypeName(route, "Request"));
        if (route.response) imports.add(routeTypeName(route, "Response"));
      }
    }

    patches.push({
      path: `${clientDir}/types.ts`,
      regions: typesRegions,
    });

    const apiContent: string[] = [];
    apiContent.push(`import type {`);
    for (const imp of [...imports].sort()) {
      apiContent.push(`  ${imp},`);
    }
    apiContent.push(`} from "./types.js";`);
    apiContent.push(``);
    apiContent.push(`export class ApiClient {`);
    apiContent.push(
      `  constructor(private baseUrl: string, private headers?: Record<string, string>) {}`,
    );
    apiContent.push(``);
    apiContent.push(
      `  private async request<T>(path: string, options?: RequestInit): Promise<T> {`,
    );
    apiContent.push(
      `    const res = await fetch(\`\${this.baseUrl}\${path}\`, {`,
    );
    apiContent.push(`      ...options,`);
    apiContent.push(
      `      headers: { "Content-Type": "application/json", ...this.headers, ...options?.headers },`,
    );
    apiContent.push(`    });`);
    apiContent.push(`    if (!res.ok) {`);
    apiContent.push(`      const body = await res.text();`);
    apiContent.push(`      throw new ApiError(res.status, body);`);
    apiContent.push(`    }`);
    apiContent.push(`    return res.json() as Promise<T>;`);
    apiContent.push(`  }`);
    apiContent.push(`}`);

    patches.push({
      path: `${clientDir}/api.ts`,
      regions: [
        {
          id: "client.api.class",
          stableHash: `ts-client:api-class:${contentHash(apiContent.join("\n"))}`,
          owner: "ts-client",
          language: "typescript",
          content: apiContent.join("\n"),
        },
        ...apiRegions,
      ],
    });

    const errorRegion: GeneratedRegion = {
      id: "client.api.error-class",
      stableHash: "ts-client:api-error-class",
      owner: "ts-client",
      language: "typescript",
      content: [
        `export class ApiError extends Error {`,
        `  constructor(public status: number, body: string) {`,
        `    super(\`API error \${status}: \${body}\`);`,
        `  }`,
        `}`,
      ].join("\n"),
    };

    patches.push({
      path: `${clientDir}/api.ts`,
      regions: [errorRegion],
    });

    return patches;
  },
};

function routeTypeName(route: RouteAst, suffix: string): string {
  return `${pascalCase(route.id)}${pascalCase(route.moduleName)}${suffix}`;
}

function zodToTypeScript(schema: unknown): string {
  if (!schema || typeof schema !== "object") return "unknown";
  const def = (schema as Record<string, unknown>)._def as
    | Record<string, unknown>
    | undefined;
  if (!def) return "unknown";
  const typeName = def.typeName as string | undefined;

  switch (typeName) {
    case "ZodString":
      return "string";
    case "ZodNumber":
      return "number";
    case "ZodBoolean":
      return "boolean";
    case "ZodEnum": {
      const values = def.values as string[] | undefined;
      if (values) return values.map((v) => `"${v}"`).join(" | ");
      return "string";
    }
    case "ZodArray": {
      const element =
        ((def as Record<string, unknown>).type as unknown) ?? undefined;
      return `${zodToTypeScript(element)}[]`;
    }
    case "ZodObject": {
      const shapeFn = def.shape as (() => Record<string, unknown>) | undefined;
      const shape = shapeFn?.() as Record<string, unknown> | undefined;
      if (!shape) return "Record<string, unknown>";
      const fields = Object.entries(shape).map(([key, val]) => {
        const v = val as Record<string, unknown>;
        const def2 = v._def as Record<string, unknown> | undefined;
        const isOptional = def2?.typeName === "ZodOptional";
        return `  ${key}${isOptional ? "?" : ""}: ${zodToTypeScript(val)}`;
      });
      return `{\n${fields.join(";\n")}\n}`;
    }
    case "ZodOptional": {
      const inner =
        ((def as Record<string, unknown>).innerType as unknown) ?? undefined;
      return `${zodToTypeScript(inner)} | undefined`;
    }
    case "ZodNullable": {
      const inner2 =
        ((def as Record<string, unknown>).innerType as unknown) ?? undefined;
      return `${zodToTypeScript(inner2)} | null`;
    }
    default:
      return "unknown";
  }
}

function generateObjectInterface(name: string, schema: unknown): string {
  if (!schema || typeof schema !== "object")
    return `export type ${name} = unknown;`;
  const def = (schema as Record<string, unknown>)._def as
    | Record<string, unknown>
    | undefined;
  if (!def) return `export type ${name} = unknown;`;
  const shapeFn = def.shape as (() => Record<string, unknown>) | undefined;
  if (!shapeFn) return `export type ${name} = Record<string, unknown>;`;
  const shape = shapeFn();
  const fields = Object.entries(shape).map(([key, val]) => {
    const fieldDef = (val as Record<string, unknown>)._def as
      | Record<string, unknown>
      | undefined;
    const isOptional = fieldDef?.typeName === "ZodOptional";
    return `  ${key}${isOptional ? "?" : ""}: ${zodToTypeScript(val)};`;
  });
  return `export interface ${name} {\n${fields.join("\n")}\n}`;
}

function generateTypesForRoute(
  route: RouteAst,
  moduleName: string,
): GeneratedRegion[] {
  const regions: GeneratedRegion[] = [];

  if (route.input) {
    const name = routeTypeName(route, "Request");
    const interfaceStr = generateObjectInterface(name, route.input);
    regions.push({
      id: `client.types.${moduleName}.${route.id}.request`,
      stableHash: `ts-client:types:${moduleName}:${route.id}:request`,
      owner: "ts-client",
      language: "typescript",
      content: interfaceStr,
    });
  }

  if (route.response) {
    const name = routeTypeName(route, "Response");
    const interfaceStr = generateObjectInterface(name, route.response);
    regions.push({
      id: `client.types.${moduleName}.${route.id}.response`,
      stableHash: `ts-client:types:${moduleName}:${route.id}:response`,
      owner: "ts-client",
      language: "typescript",
      content: interfaceStr,
    });
  }

  return regions;
}

function generateClientFunction(
  route: RouteAst,
  moduleName: string,
): GeneratedRegion {
  const fnName = pascalCase(route.id);
  const reqType = route.input ? routeTypeName(route, "Request") : "undefined";
  const resType = route.response ? routeTypeName(route, "Response") : "void";
  const hasBody =
    route.method === "POST" ||
    route.method === "PUT" ||
    route.method === "PATCH";

  const pathTemplate = route.fullPath.replace(
    /:([a-zA-Z_][a-zA-Z0-9_]*)/g,
    "${params.$1}",
  );
  const paramsAnnotation =
    route.method === "GET" || route.method === "DELETE"
      ? `params${route.input ? `: ${reqType}` : "?"}: Record<string, string>`
      : `params${route.input ? `: ${reqType}` : "?"}: ${reqType}`;

  const body: string[] = [];
  body.push(`async ${fnName}(`);
  body.push(`  ${paramsAnnotation},`);
  body.push(`  options?: RequestInit,`);
  body.push(`): Promise<${resType}> {`);
  if (hasBody) {
    body.push(`  return this.request<${resType}>(\`${pathTemplate}\`, {`);
    body.push(`    method: "${route.method}",`);
    body.push(`    body: JSON.stringify(params),`);
    body.push(`    ...options,`);
    body.push(`  });`);
  } else if (route.method === "GET") {
    body.push(
      `  const searchParams = params ? new URLSearchParams(params as Record<string, string>).toString() : "";`,
    );
    body.push(
      `  const url = searchParams ? \`${pathTemplate}?\${searchParams}\` : \`${pathTemplate}\`;`,
    );
    body.push(
      `  return this.request<${resType}>(url, { method: "${route.method}", ...options });`,
    );
  } else {
    body.push(
      `  return this.request<${resType}>(\`${pathTemplate}\`, { method: "${route.method}", ...options });`,
    );
  }
  body.push(`}`);

  return {
    id: `client.api.${moduleName}.${route.id}`,
    stableHash: `ts-client:api:${moduleName}:${route.id}`,
    owner: "ts-client",
    language: "typescript",
    content: body.join("\n"),
  };
}
