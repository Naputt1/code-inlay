import type { AppAst, ArchitectureAst, RouteAst } from "./types.js";
import { pascalCase } from "./naming.js";

export type DocFormat = "markdown" | "mermaid";

export function generateApiDocs(
  ast: AppAst,
  architecture: ArchitectureAst,
  format: DocFormat = "markdown",
): string {
  switch (format) {
    case "markdown":
      return generateMarkdownDocs(ast);
    case "mermaid":
      return generateMermaidDoc(ast, architecture);
  }
}

function generateMarkdownDocs(ast: AppAst): string {
  const lines: string[] = [];

  lines.push(`# API Reference`);
  lines.push(``);
  lines.push(`> Auto-generated documentation`);
  lines.push(``);
  lines.push(`## Modules`);
  lines.push(``);

  for (const module of ast.modules) {
    lines.push(`### ${pascalCase(module.name)}`);
    lines.push(``);
    lines.push(`| Method | Path | Handler | Input | Response |`);
    lines.push(`|--------|------|---------|-------|----------|`);

    for (const route of module.routes) {
      const inputType = route.input
        ? `\`${routeTypeName(route, "Request")}\``
        : "-";
      const responseType = route.response
        ? `\`${routeTypeName(route, "Response")}\``
        : "-";
      lines.push(
        `| ${route.method} | \`${route.fullPath}\` | \`${route.handlerName}\` | ${inputType} | ${responseType} |`,
      );
    }

    lines.push(``);
  }

  lines.push(`## Route Details`);
  lines.push(``);

  for (const module of ast.modules) {
    for (const route of module.routes) {
      lines.push(`### ${route.method} \`${route.fullPath}\``);
      lines.push(``);
      lines.push(`- **ID:** \`${module.name}.${route.id}\``);
      lines.push(`- **Handler:** \`${route.handlerName}\``);

      if (route.input) {
        lines.push(``);
        lines.push(`#### Request Body`);
        lines.push(``);
        lines.push("```json");
        lines.push(JSON.stringify(zodToJsonSchemaSample(route.input), null, 2));
        lines.push("```");
      }

      if (route.response) {
        lines.push(``);
        lines.push(`#### Response Body`);
        lines.push(``);
        lines.push("```json");
        lines.push(
          JSON.stringify(zodToJsonSchemaSample(route.response), null, 2),
        );
        lines.push("```");
      }

      lines.push(``);
      lines.push(`---`);
      lines.push(``);
    }
  }

  return lines.join("\n");
}

function generateMermaidDoc(
  ast: AppAst,
  architecture: ArchitectureAst,
): string {
  const lines: string[] = [];

  lines.push("```mermaid");
  lines.push("graph LR");
  lines.push(`  Client["Client"]`);

  for (const module of ast.modules) {
    const moduleId = `Mod${pascalCase(module.name)}`;
    lines.push(`  ${moduleId}["${pascalCase(module.name)} Module"]`);
    lines.push(`  Client --> ${moduleId}`);

    for (const route of module.routes) {
      const routeId = `Route${pascalCase(module.name)}${pascalCase(route.id)}`;
      const label = `${route.method}\\n${route.fullPath}`;
      lines.push(`  ${routeId}("${label}")`);
      lines.push(`  ${moduleId} --> ${routeId}`);

      const expansion = architecture.routes.find(
        (e) => e.route.id === route.id && e.route.moduleName === module.name,
      );

      if (expansion) {
        for (const layer of expansion.layers) {
          const layerId = `Layer${pascalCase(layer.regionId.replace(/[^a-zA-Z0-9]/g, "_"))}`;
          const fileShort = layer.file.split("/").pop() ?? layer.file;
          lines.push(`  ${layerId}["${layer.kind}: ${fileShort}"]`);
          lines.push(`  ${routeId} -.-> ${layerId}`);
        }
      }
    }
  }

  lines.push("```");
  return lines.join("\n");
}

function routeTypeName(route: RouteAst, suffix: string): string {
  return `${pascalCase(route.id)}${pascalCase(route.moduleName)}${suffix}`;
}

function zodToJsonSchemaSample(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return null;
  const def = (schema as Record<string, unknown>)._def as
    | Record<string, unknown>
    | undefined;
  if (!def) return null;
  const typeName = def.typeName as string | undefined;

  switch (typeName) {
    case "ZodString":
      return "string";
    case "ZodNumber":
      return 0;
    case "ZodBoolean":
      return true;
    case "ZodEnum": {
      const values = def.values as string[] | undefined;
      return values?.[0] ?? "string";
    }
    case "ZodArray":
      return [];
    case "ZodObject": {
      const shapeFn = def.shape as (() => Record<string, unknown>) | undefined;
      if (!shapeFn) return {};
      const result: Record<string, unknown> = {};
      for (const [key] of Object.entries(shapeFn())) {
        result[key] = "value";
      }
      return result;
    }
    default:
      return null;
  }
}
