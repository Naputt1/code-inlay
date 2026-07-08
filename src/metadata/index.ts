import type { AppAst, GeneratedFilePatch } from "../types/index.js";
import { stableHash } from "../utils/hash.js";
import { generateRegistryGo, generateSchemaReflection } from "./metadata-goast.js";

export function generateMetadata(ast: AppAst): GeneratedFilePatch[] {
  if (!ast.options.metadata?.enabled) return [];

  const patches: GeneratedFilePatch[] = [];

  const registryContent = generateRegistryGo(ast);
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
        if (route.kind === "Route" && (route.query || route.body || route.response)) {
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
