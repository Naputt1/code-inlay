import type {
  AppAst,
  ArchitectureAst,
  DependencyGraph,
  DependencyNode,
  GenerationAst,
  GeneratedFilePatch,
} from "../types/index.js";
import { stableHash } from "../utils/hash.js";

export function buildDependencyGraph(
  ast: AppAst,
  architecture: ArchitectureAst,
  generation: GenerationAst,
): DependencyGraph {
  const nodes: Record<string, DependencyNode> = {};
  const edges: Array<{ from: string; to: string; reason: string }> = [];

  const addNode = (id: string, kind: DependencyNode["kind"], hash: string) => {
    nodes[id] = { id, kind, hash };
  };

  const addEdge = (from: string, to: string, reason: string) => {
    edges.push({ from, to, reason });
  };

  addNode(ast.stableId, "app", stableHash(ast, 16));

  for (const module of ast.modules) {
    addNode(module.stableId, "module", stableHash(module, 16));
    addEdge(ast.stableId, module.stableId, "contains");

    for (const route of module.routes) {
      addNode(route.stableId, "route", stableHash(route, 16));
      addEdge(module.stableId, route.stableId, "contains");

      if (route.query) {
        const schemaId = `${route.stableId}:query`;
        addNode(schemaId, "schema", stableHash(route.query, 16));
        addEdge(route.stableId, schemaId, "has-query-schema");
      }
      if (route.body) {
        const schemaId = `${route.stableId}:body`;
        addNode(schemaId, "schema", stableHash(route.body, 16));
        addEdge(route.stableId, schemaId, "has-body-schema");
      }
      if (route.response) {
        const schemaId = `${route.stableId}:response`;
        addNode(schemaId, "schema", stableHash(route.response, 16));
        addEdge(route.stableId, schemaId, "has-response-schema");
      }
    }
  }

  for (const expansion of architecture.routes) {
    for (const layer of expansion.layers) {
      if (layer.stableId) {
        addNode(layer.stableId, "architecture-layer", stableHash(layer, 16));
        addEdge(expansion.route.stableId, layer.stableId, `has-layer:${layer.kind}`);
        addEdge(layer.stableId, layer.file, "maps-to-file");
      }
    }
  }

  for (const file of generation.files) {
    const fileId = `file:${file.path}`;
    addNode(fileId, "file", stableHash(file, 16));

    for (const region of file.regions) {
      const regionId = region.stableHash ?? `region:${region.id}`;
      addNode(regionId, "generated-region", region.contentHash ?? stableHash(region.content, 16));
      addEdge(fileId, regionId, "contains-region");

      if (region.symbolName) {
        const symbolId = `symbol:${region.stableHash ?? region.id}`;
        addNode(symbolId, "generated-symbol", region.contentHash ?? stableHash(region.content, 16));
        addEdge(regionId, symbolId, "defines-symbol");
      }
    }
  }

  for (const file of generation.files) {
    for (const region of file.regions) {
      const regionStableId = region.stableHash ?? `region:${region.id}`;
      const owner = region.owner;
      if (owner) {
        const adapterNodeId = `adapter:${owner}`;
        if (!nodes[adapterNodeId]) {
          addNode(adapterNodeId, "adapter-target", stableHash(owner, 16));
        }
        addEdge(adapterNodeId, regionStableId, "generates");
      }

      for (const expansion of architecture.routes) {
        for (const layer of expansion.layers) {
          if (layer.regionId === region.id && layer.stableId) {
            addEdge(layer.stableId, regionStableId, "codegen-result");
          }
        }
      }
    }
  }

  return { nodes, edges };
}

export type GraphFormat = "tree" | "mermaid" | "json";

export function renderGraph(
  ast: AppAst,
  architecture: ArchitectureAst,
  generation: { files: GeneratedFilePatch[] },
  format: GraphFormat = "tree",
): string {
  const graph = buildDependencyGraph(ast, architecture, generation);

  switch (format) {
    case "json":
      return renderJsonGraph(graph);
    case "mermaid":
      return renderMermaidGraph(ast, architecture);
    case "tree":
      return renderTreeGraph(ast, architecture);
  }
}

function renderJsonGraph(graph: DependencyGraph): string {
  return JSON.stringify(graph, null, 2);
}

function renderMermaidGraph(ast: AppAst, architecture: ArchitectureAst): string {
  const lines: string[] = [];
  lines.push("graph TD");

  for (const module of ast.modules) {
    const moduleId = sanitizeMermaidId(`mod_${module.name}`);
    lines.push(`  ${moduleId}["Module: ${module.name}"]`);
    lines.push(`  APP["App"] --> ${moduleId}`);

    for (const route of module.routes) {
      const routeId = sanitizeMermaidId(`route_${module.name}_${route.id}`);
      lines.push(`  ${routeId}["${route.method} ${route.fullPath}"]`);
      lines.push(`  ${moduleId} --> ${routeId}`);
    }
  }

  for (const expansion of architecture.routes) {
    for (const layer of expansion.layers) {
      const layerId = sanitizeMermaidId(`layer_${layer.regionId}`);
      const fileLabel = layer.file.split("/").pop() ?? layer.file;
      lines.push(`  ${layerId}["${layer.kind} (${fileLabel})"]`);
      const routeId = sanitizeMermaidId(
        `route_${expansion.route.moduleName}_${expansion.route.id}`,
      );
      lines.push(`  ${routeId} -.-> ${layerId}`);
    }
  }

  return lines.join("\n");
}

function renderTreeGraph(ast: AppAst, architecture: ArchitectureAst): string {
  const lines: string[] = [];
  lines.push(`App: ${ast.id}`);

  for (const module of ast.modules) {
    lines.push(`├── Module: ${module.name}`);
    lines.push(
      `│   ├── Adapter: ${typeof ast.router.adapter === "string" ? ast.router.adapter : ast.router.adapter.name}`,
    );
    lines.push(`│   └── Prefix: ${ast.router.prefix || "/"}`);

    for (const route of module.routes) {
      lines.push(`│   │`);
      lines.push(`│   ├── Route: ${route.method} ${route.fullPath}`);
      if (route.query) lines.push(`│   │   ├── Query: ${route.stableId}`);
      if (route.body) lines.push(`│   │   ├── Body: ${route.stableId}`);
      if (route.response) lines.push(`│   │   ├── Response: ${route.stableId}`);

      const expansion = architecture.routes.find(
        (e) => e.route.id === route.id && e.route.moduleName === module.name,
      );
      if (expansion && expansion.layers.length > 0) {
        lines.push(`│   │   └── Architecture Layers:`);
        for (const layer of expansion.layers) {
          lines.push(
            `│   │       ├── ${layer.kind} (file: ${layer.file}, region: ${layer.regionId})`,
          );
        }
      }
    }
  }

  lines.push(`│`);
  lines.push(`└── Plugins [${ast.plugins.length}]`);
  for (const plugin of ast.plugins) {
    lines.push(`    ├── ${plugin.name}@${plugin.version}`);
  }

  return lines.join("\n");
}

function sanitizeMermaidId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

import type { PluginRegistry } from "../plugins/registry.js";

export function renderPluginExecutionOrder(registry: PluginRegistry): string {
  const lines: string[] = [];
  lines.push("Plugin Execution Order:");
  lines.push("");

  const stages: string[] = [
    "preTransform",
    "architecture",
    "adapter",
    "codegen",
    "postTransform",
    "target",
    "validate",
  ];

  for (const stage of stages) {
    const hooksInStage = registry.transformers
      .flatMap((t) => (t.hooks ?? []).map((h) => ({ transformer: t, hook: h })))
      .filter((entry) => entry.hook.stage === stage)
      .sort(
        (a, b) =>
          (a.hook.order ?? 0) - (b.hook.order ?? 0) ||
          a.transformer.name.localeCompare(b.transformer.name),
      );

    lines.push(`Stage: ${stage}`);
    if (hooksInStage.length === 0) {
      lines.push(`  (no hooks)`);
    } else {
      for (const { transformer, hook } of hooksInStage) {
        lines.push(`  ${transformer.name} (order: ${hook.order ?? 0})`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
