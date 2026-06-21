import type {
  CodeTarget,
  GeneratedFilePatch,
  GeneratedRegion,
  ModuleAst,
  RouteAst,
} from "../types.js";
import { extractPathParams, pascalCase } from "../naming.js";
import { contentHash } from "../hash.js";

export const tsClientTarget: CodeTarget = {
  name: "ts-client",
  version: "0.1.0",
  apiVersion: "3",
  stage: "postTransform",
  generate(ctx) {
    const patches: GeneratedFilePatch[] = [];
    const { ast, options } = ctx;

    const clientDir = (options.targetOptions?.["ts-client"]?.outputDir as string) ?? "clients";

    const typesRegions: GeneratedRegion[] = [];

    for (const module of ast.modules) {
      for (const route of module.routes) {
        const typeRegions = generateTypesForRoute(route, module.name);
        typesRegions.push(...typeRegions);
      }
    }

    patches.push({
      path: `${clientDir}/types.ts`,
      regions: typesRegions,
    });

    const baseContent = generateBaseClientContent();
    patches.push({
      path: `${clientDir}/base.ts`,
      regions: [
        {
          id: "client.base",
          stableHash: `ts-client:base:${contentHash(baseContent)}`,
          owner: "ts-client",
          language: "typescript",
          content: baseContent,
        },
      ],
    });

    const indexModules: { name: string; className: string }[] = [];

    for (const module of ast.modules) {
      if (module.routes.length === 0) continue;

      const moduleContent = generateModuleClient(module);
      if (!moduleContent) continue;

      indexModules.push({
        name: module.name,
        className: `${pascalCase(module.name)}Client`,
      });

      patches.push({
        path: `${clientDir}/${module.name}.ts`,
        regions: [
          {
            id: `client.${module.name}`,
            stableHash: `ts-client:${module.name}:${contentHash(moduleContent)}`,
            owner: "ts-client",
            language: "typescript",
            content: moduleContent,
          },
        ],
      });
    }

    const indexContent = generateIndexContent(indexModules);
    patches.push({
      path: `${clientDir}/index.ts`,
      regions: [
        {
          id: "client.index",
          stableHash: `ts-client:index:${contentHash(indexContent)}`,
          owner: "ts-client",
          language: "typescript",
          content: indexContent,
        },
      ],
    });

    return patches;
  },
};

function routeTypeName(route: RouteAst, suffix: string): string {
  return `${pascalCase(route.id)}${pascalCase(route.moduleName)}${suffix}`;
}

function zodToTypeScript(schema: unknown): string {
  if (!schema || typeof schema !== "object") return "unknown";
  const def = (schema as Record<string, unknown>)._def as Record<string, unknown> | undefined;
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
      const element = ((def as Record<string, unknown>).type as unknown) ?? undefined;
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
      const inner = ((def as Record<string, unknown>).innerType as unknown) ?? undefined;
      return `${zodToTypeScript(inner)} | undefined`;
    }
    case "ZodNullable": {
      const inner2 = ((def as Record<string, unknown>).innerType as unknown) ?? undefined;
      return `${zodToTypeScript(inner2)} | null`;
    }
    default:
      return "unknown";
  }
}

function generateObjectInterface(name: string, schema: unknown): string {
  if (!schema || typeof schema !== "object") return `export type ${name} = unknown;`;
  const def = (schema as Record<string, unknown>)._def as Record<string, unknown> | undefined;
  if (!def) return `export type ${name} = unknown;`;
  const shapeFn = def.shape as (() => Record<string, unknown>) | undefined;
  if (!shapeFn) return `export type ${name} = Record<string, unknown>;`;
  const shape = shapeFn();
  const fields = Object.entries(shape).map(([key, val]) => {
    const fieldDef = (val as Record<string, unknown>)._def as Record<string, unknown> | undefined;
    const isOptional = fieldDef?.typeName === "ZodOptional";
    return `  ${key}${isOptional ? "?" : ""}: ${zodToTypeScript(val)};`;
  });
  return `export interface ${name} {\n${fields.join("\n")}\n}`;
}

function generateTypesForRoute(route: RouteAst, moduleName: string): GeneratedRegion[] {
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

function collectQueryFields(route: RouteAst, pathParams: string[]): string[] {
  if (!route.input) return [];
  const def = (route.input as unknown as Record<string, unknown>)._def as
    | Record<string, unknown>
    | undefined;
  const shapeFn = def?.shape as (() => Record<string, unknown>) | undefined;
  if (!shapeFn) return [];
  return Object.keys(shapeFn()).filter((k) => !pathParams.includes(k));
}

function generateClientMethod(route: RouteAst): string {
  const fnName = pascalCase(route.id);
  const resType = route.response ? routeTypeName(route, "Response") : "void";
  const hasBody = route.method === "POST" || route.method === "PUT" || route.method === "PATCH";

  const pathParams = extractPathParams(route.fullPath);
  const pathTemplate = route.fullPath.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, "${params.$1}");

  const body: string[] = [];

  if (route.input) {
    const reqType = routeTypeName(route, "Request");
    body.push(`async ${fnName}(params: ${reqType}, options?: RequestInit): Promise<${resType}> {`);
    if (hasBody) {
      body.push(`  return this.request<${resType}>(\`${pathTemplate}\`, {`);
      body.push(`    method: "${route.method}",`);
      body.push(`    body: JSON.stringify(params),`);
      body.push(`    ...options,`);
      body.push(`  });`);
    } else {
      const queryFields = collectQueryFields(route, pathParams);
      if (queryFields.length > 0) {
        body.push(`  const query = Object.entries(params)`);
        body.push(`    .filter(([k]) => ${JSON.stringify(queryFields)}.includes(k))`);
        body.push(
          `    .map(([k, v]) => \`\${encodeURIComponent(k)}=\${encodeURIComponent(String(v))}\`)`,
        );
        body.push(`    .join("&");`);
        body.push(`  const url = query ? \`${pathTemplate}?\${query}\` : \`${pathTemplate}\`;`);
      } else {
        body.push(`  const url = \`${pathTemplate}\`;`);
      }
      body.push(
        `  return this.request<${resType}>(url, { method: "${route.method}", ...options });`,
      );
    }
  } else if (pathParams.length > 0) {
    body.push(
      `async ${fnName}(params: { ${pathParams.map((p) => `${p}: string`).join("; ")} }, options?: RequestInit): Promise<${resType}> {`,
    );
    body.push(`  const url = \`${pathTemplate}\`;`);
    body.push(`  return this.request<${resType}>(url, { method: "${route.method}", ...options });`);
  } else {
    body.push(`async ${fnName}(options?: RequestInit): Promise<${resType}> {`);
    body.push(`  const url = \`${pathTemplate}\`;`);
    body.push(`  return this.request<${resType}>(url, { method: "${route.method}", ...options });`);
  }

  body.push(`}`);

  return body.join("\n");
}

function generateBaseClientContent(): string {
  return [
    `export class ApiError extends Error {`,
    `  constructor(public status: number, body: string) {`,
    `    super(\`API error \${status}: \${body}\`);`,
    `  }`,
    `}`,
    ``,
    `export class BaseApiClient {`,
    `  constructor(protected baseUrl: string, protected headers?: Record<string, string>) {}`,
    ``,
    `  protected async request<T>(path: string, options?: RequestInit): Promise<T> {`,
    `    const res = await fetch(\`\${this.baseUrl}\${path}\`, {`,
    `      ...options,`,
    `      headers: { "Content-Type": "application/json", ...this.headers, ...options?.headers },`,
    `    });`,
    `    if (!res.ok) {`,
    `      const body = await res.text();`,
    `      throw new ApiError(res.status, body);`,
    `    }`,
    `    return res.json() as Promise<T>;`,
    `  }`,
    `}`,
  ].join("\n");
}

function generateModuleClient(module: ModuleAst): string {
  const imports = new Set<string>();
  const methods: string[] = [];

  for (const route of module.routes) {
    if (route.input) imports.add(routeTypeName(route, "Request"));
    if (route.response) imports.add(routeTypeName(route, "Response"));

    const method = generateClientMethod(route);
    methods.push(method);
  }

  if (methods.length === 0) return "";

  const lines: string[] = [];

  if (imports.size > 0) {
    lines.push(`import type {`);
    for (const imp of [...imports].sort()) {
      lines.push(`  ${imp},`);
    }
    lines.push(`} from "./types.js";`);
    lines.push(``);
  }

  lines.push(`import { BaseApiClient } from "./base.js";`);
  lines.push(``);

  const className = `${pascalCase(module.name)}Client`;
  lines.push(`export class ${className} extends BaseApiClient {`);

  for (const method of methods) {
    for (const line of method.split("\n")) {
      lines.push(`  ${line}`);
    }
    lines.push(``);
  }

  lines.push(`}`);

  return lines.join("\n");
}

function generateIndexContent(modules: { name: string; className: string }[]): string {
  if (modules.length === 0) {
    return [
      `export { BaseApiClient } from "./base.js";`,
      `export { ApiError } from "./base.js";`,
    ].join("\n");
  }

  const lines: string[] = [];

  for (const mod of modules) {
    lines.push(`export { ${mod.className} } from "./${mod.name}.js";`);
  }
  lines.push(`export { BaseApiClient } from "./base.js";`);
  lines.push(`export { ApiError } from "./base.js";`);

  return lines.join("\n") + "\n";
}
