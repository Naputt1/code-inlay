import type { ArchitectureAst } from "../types/index.js";
import { featuresPath, pascalCase } from "../utils/naming.js";
import * as go from "@schemago/go-ast";

export type HandlerStructOutput = {
  file: string;
  regionId: string;
  content: string;
};

function toGoType(typeStr: string): go.Type {
  if (typeStr.startsWith("[]")) return go.sliceType(toGoType(typeStr.slice(2)));
  if (typeStr.startsWith("*")) return go.star(toGoType(typeStr.slice(1)));
  if (typeStr.startsWith("map[")) {
    const rest = typeStr.slice(4);
    const bracketIdx = rest.indexOf("]");
    if (bracketIdx !== -1) return go.mapType(toGoType(rest.slice(0, bracketIdx)), toGoType(rest.slice(bracketIdx + 1)));
  }
  if (typeStr.includes(".")) { const p = typeStr.split("."); return go.qual(p[0], p[1]); }
  return go.id(typeStr);
}

export function generateHandlerStructs(
  architecture: ArchitectureAst,
  featuresDir?: string,
): HandlerStructOutput[] {
  const moduleFields = new Map<string, string[]>();

  for (const expansion of architecture.routes) {
    const route = expansion.route;
    const layers = new Set(expansion.layers.map((l) => l.kind));
    if (!layers.has("handler") && !layers.has("usecase")) continue;

    const fields = moduleFields.get(route.moduleName) ?? [];
    fields.push(`${route.handlerName}Usecase ${route.handlerName}Usecase`);
    moduleFields.set(route.moduleName, fields);
  }

  const result: HandlerStructOutput[] = [];
  for (const [moduleName, fields] of moduleFields) {
    const typeName = `${pascalCase(moduleName)}Handler`;

    const structFields = fields.map(f => {
      const parts = f.split(" ");
      return go.field([parts[0]], toGoType(parts[1]));
    });

    const structType = go.structType(...structFields);
    const spec = go.typeSpec(typeName, structType);
    const decl = go.genDecl("type", spec);
    const sb = new go.StringBuilder();
    go.printDeclaration(sb, decl, 0);
    const content = sb.toString().trimEnd();

    result.push({
      file: featuresPath(`internal/${moduleName}/handler.go`, featuresDir),
      regionId: `${moduleName}.0handler.struct`,
      content,
    });
  }

  return result;
}
