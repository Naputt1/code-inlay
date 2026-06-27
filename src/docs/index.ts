import type { AppAst, ArchitectureAst, SchemaLike } from "../types/index.js";
import { pascalCase, routeTypeName } from "../utils/naming.js";
import {
  isZodString,
  isZodNumber,
  isZodBoolean,
  isZodEnum,
  isZodArray,
  isZodObject,
} from "../schema/extras.js";

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
      const inputType = route.query || route.body ? `\`${routeTypeName(route, "Request")}\`` : "-";
      const responseType = route.response ? `\`${routeTypeName(route, "Response")}\`` : "-";
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

      if (route.body) {
        lines.push(``);
        lines.push(`#### Request Body`);
        lines.push(``);
        lines.push("```json");
        lines.push(JSON.stringify(zodToJsonSchemaSample(route.body), null, 2));
        lines.push("```");
      }
      if (route.query) {
        lines.push(``);
        lines.push(`#### Query Parameters`);
        lines.push(``);
        lines.push("```json");
        lines.push(JSON.stringify(zodToJsonSchemaSample(route.query), null, 2));
        lines.push("```");
      }

      if (route.response) {
        lines.push(``);
        lines.push(`#### Response Body`);
        lines.push(``);
        lines.push("```json");
        lines.push(JSON.stringify(zodToJsonSchemaSample(route.response), null, 2));
        lines.push("```");
      }

      lines.push(``);
      lines.push(`---`);
      lines.push(``);
    }
  }

  return lines.join("\n");
}

function generateMermaidDoc(ast: AppAst, architecture: ArchitectureAst): string {
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

function zodToJsonSchemaSample(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return null;
  const s = schema as SchemaLike;
  if (isZodString(s)) return "string";
  if (isZodNumber(s)) return 0;
  if (isZodBoolean(s)) return true;
  if (isZodEnum(s)) {
    const values = (s._def as { values?: string[] }).values;
    return values?.[0] ?? "string";
  }
  if (isZodArray(s)) return [];
  if (isZodObject(s)) {
    const result: Record<string, unknown> = {};
    for (const [key] of Object.entries(s.shape)) {
      result[key] = "value";
    }
    return result;
  }
  return null;
}
