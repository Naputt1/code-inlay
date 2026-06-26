import type { ArchitectureAst } from "../types/index.js";
import { featuresPath, pascalCase } from "../utils/naming.js";

export type HandlerStructOutput = {
  file: string;
  regionId: string;
  content: string;
};

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
    fields.push(`\t${route.handlerName}Usecase ${route.handlerName}Usecase`);
    moduleFields.set(route.moduleName, fields);
  }

  const result: HandlerStructOutput[] = [];
  for (const [moduleName, fields] of moduleFields) {
    const typeName = `${pascalCase(moduleName)}Handler`;
    result.push({
      file: featuresPath(`internal/${moduleName}/handler.go`, featuresDir),
      regionId: `${moduleName}.0handler.struct`,
      content: `type ${typeName} struct {\n${fields.join("\n")}\n}`,
    });
  }

  return result;
}
