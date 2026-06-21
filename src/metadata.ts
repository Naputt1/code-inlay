import type { AppAst, ArchitectureAst, Diagnostic, GeneratedFilePatch, RouteAst } from "./types.js";
import { pascalCase } from "./naming.js";
import { stableHash } from "./hash.js";

export function generateMetadata(
  ast: AppAst,
  architecture: ArchitectureAst,
  diagnostics: Diagnostic[],
): GeneratedFilePatch[] {
  if (!ast.options.metadata?.enabled) return [];

  const patches: GeneratedFilePatch[] = [];

  const routeInfos: string[] = [];
  const moduleInfos: Map<string, string[]> = new Map();

  for (const module of ast.modules) {
    const moduleRoutes: string[] = [];

    for (const route of module.routes) {
      const routeInfo = generateRouteInfo(route);
      routeInfos.push(routeInfo);
      moduleRoutes.push(routeInfo);
    }

    moduleInfos.set(module.name, moduleRoutes);
  }

  const registryContent = generateRegistryGo(ast, moduleInfos);
  patches.push({
    path: "internal/metadata/registry.go",
    regions: [
      {
        id: "metadata.registry",
        stableHash: `metadata:registry:${stableHash(ast, 12)}`,
        owner: "metadata",
        language: "go",
        content: registryContent,
      },
    ],
  });

  if (ast.options.metadata?.schemaReflection) {
    for (const module of ast.modules) {
      for (const route of module.routes) {
        if (route.input || route.response) {
          patches.push({
            path: `internal/metadata/schemas.go`,
            regions: [
              {
                id: `metadata.schema.${module.name}.${route.id}`,
                stableHash: `metadata:schema:${module.name}:${route.id}`,
                owner: "metadata",
                language: "go",
                content: generateSchemaReflection(route),
              },
            ],
          });
        }
      }
    }
  }

  return patches;
}

function generateRouteInfo(route: RouteAst): string {
  return `{ID: "${route.id}", Method: "${route.method}", Path: "${route.fullPath}", Handler: "${route.handlerName}", Module: "${route.moduleName}"${route.input ? `, Input: "${pascalCase(route.id)}${pascalCase(route.moduleName)}Request"` : ""}${route.response ? `, Response: "${pascalCase(route.id)}${pascalCase(route.moduleName)}Response"` : ""}}`;
}

function generateRegistryGo(ast: AppAst, moduleInfos: Map<string, string[]>): string {
  const lines: string[] = [];

  lines.push(`package metadata`);
  lines.push(``);
  lines.push(`type RouteInfo struct {`);
  lines.push(`\tID      string \`json:"id"\``);
  lines.push(`\tMethod  string \`json:"method"\``);
  lines.push(`\tPath    string \`json:"path"\``);
  lines.push(`\tHandler string \`json:"handler"\``);
  lines.push(`\tModule  string \`json:"module"\``);
  lines.push(`\tInput   string \`json:"input,omitempty"\``);
  lines.push(`\tResponse string \`json:"response,omitempty"\``);
  lines.push(`}`);
  lines.push(``);
  lines.push(`type ModuleInfo struct {`);
  lines.push(`\tName   string      \`json:"name"\``);
  lines.push(`\tRoutes []RouteInfo \`json:"routes"\``);
  lines.push(`}`);
  lines.push(``);
  lines.push(`var Registry = struct {`);
  lines.push(`\tModules    []ModuleInfo \`json:"modules"\``);
  lines.push(`\tVersion    string       \`json:"version"\``);
  lines.push(`\tGeneratedAt string      \`json:"generatedAt"\``);
  lines.push(`}{`);
  lines.push(
    `\tVersion: "${(ast.options.targetOptions?.["metadata"]?.version as string) ?? "1.0.0"}",`,
  );
  lines.push(`\tGeneratedAt: "${new Date().toISOString()}",`);
  lines.push(`\tModules: []ModuleInfo{`);
  for (const [name, routes] of moduleInfos) {
    lines.push(`\t\t{Name: "${name}", Routes: []RouteInfo{`);
    for (const route of routes) {
      lines.push(`\t\t\t${route},`);
    }
    lines.push(`\t\t}},`);
  }
  lines.push(`\t},`);
  lines.push(`}`);

  return lines.join("\n");
}

function generateSchemaReflection(route: RouteAst): string {
  const lines: string[] = [];

  if (route.input) {
    const reqName = `${pascalCase(route.id)}${pascalCase(route.moduleName)}Request`;
    lines.push(`func (${reqName}) SchemaReflection() map[string]any {`);
    lines.push(`\treturn ${generateSchemaMap(route.input)}`);
    lines.push(`}`);
    lines.push(``);
  }

  if (route.response) {
    const resName = `${pascalCase(route.id)}${pascalCase(route.moduleName)}Response`;
    lines.push(`func (${resName}) SchemaReflection() map[string]any {`);
    lines.push(`\treturn ${generateSchemaMap(route.response)}`);
    lines.push(`}`);
    lines.push(``);
  }

  return lines.join("\n");
}

function generateSchemaMap(schema: unknown): string {
  if (!schema || typeof schema !== "object") return "map[string]any{}";

  const def = (schema as Record<string, unknown>)._def as Record<string, unknown> | undefined;
  if (!def) return "map[string]any{}";

  const typeName = def.typeName as string | undefined;

  switch (typeName) {
    case "ZodString":
      return `map[string]any{"type": "string"}`;
    case "ZodNumber":
      return `map[string]any{"type": "number"}`;
    case "ZodBoolean":
      return `map[string]any{"type": "boolean"}`;
    case "ZodObject": {
      const shapeFn = def.shape as (() => Record<string, unknown>) | undefined;
      if (!shapeFn) return `map[string]any{"type": "object"}`;
      const shape = shapeFn();
      const props = Object.entries(shape).map(([key, val]) => {
        return `"${key}": ${generateSchemaMap(val)}`;
      });
      return `map[string]any{"type": "object", "properties": map[string]any{${props.join(", ")}}}`;
    }
    case "ZodArray": {
      const element = ((def as Record<string, unknown>).type as unknown) ?? undefined;
      return `map[string]any{"type": "array", "items": ${generateSchemaMap(element)}}`;
    }
    default:
      return `map[string]any{"type": "unknown"}`;
  }
}
